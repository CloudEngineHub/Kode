import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
} from 'fs'
import { dirname, join } from 'path'
import type { MessageParam } from '@anthropic-ai/sdk/resources/index.mjs'

import type {
  CommandFileRecord,
  CommandSource,
  CustomCommandFrontmatter,
  CustomCommandWithScope,
} from './types'
import {
  extractDescriptionFromMarkdown,
  parseAllowedTools,
  parseMaxThinkingTokens,
  toBoolean,
} from './frontmatter'
import { isSkillMarkdownFile, nameForCommandFile, sourceLabel } from './naming'
import { parseFrontmatter } from './frontmatter'
import { debug as debugLogger } from '#core/utils/debugLogger'
import { getEffectiveSessionId } from '#core/utils/sessionId'

const MAX_SKILL_FRONTMATTER_BYTES = 64 * 1024

function readFrontmatterOnlyFromFile(
  filePath: string,
): CustomCommandFrontmatter | null {
  let fd: number
  try {
    fd = openSync(filePath, 'r')
  } catch {
    return null
  }

  try {
    const buffer = Buffer.alloc(MAX_SKILL_FRONTMATTER_BYTES)
    const bytesRead = readSync(fd, buffer, 0, buffer.byteLength, 0)
    const head = buffer.subarray(0, Math.max(0, bytesRead)).toString('utf8')
    const normalized = head.replace(/^\uFEFF/, '')

    const match = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(normalized)
    if (!match) return null

    const { frontmatter } = parseFrontmatter(match[0])
    return frontmatter
  } catch {
    return null
  } finally {
    try {
      closeSync(fd)
    } catch {
      // ignore
    }
  }
}

export function listMarkdownFilesRecursively(
  baseDir: string,
  signal: AbortSignal,
): string[] {
  const results: string[] = []
  const queue: string[] = [baseDir]
  while (queue.length > 0) {
    if (signal.aborted) break
    const currentDir = queue.pop()!
    let entries
    try {
      entries = readdirSync(currentDir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (signal.aborted) break
      const fullPath = join(currentDir, entry.name)
      if (entry.isDirectory()) {
        queue.push(fullPath)
        continue
      }
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        results.push(fullPath)
      }
    }
  }
  return results
}

export function loadCommandMarkdownFilesFromBaseDir(
  baseDir: string,
  source: CommandSource,
  scope: 'user' | 'project',
  signal: AbortSignal,
): CommandFileRecord[] {
  if (!existsSync(baseDir)) return []
  const files = listMarkdownFilesRecursively(baseDir, signal)
  const records: CommandFileRecord[] = []
  for (const filePath of files) {
    if (signal.aborted) break
    try {
      const raw = readFileSync(filePath, 'utf8')
      const { frontmatter, content } = parseFrontmatter(raw)
      records.push({ baseDir, filePath, frontmatter, content, source, scope })
    } catch {
      // ignore
    }
  }
  return records
}

export function applySkillFilePreference(
  files: CommandFileRecord[],
): CommandFileRecord[] {
  const grouped = new Map<string, CommandFileRecord[]>()
  for (const file of files) {
    const key = dirname(file.filePath)
    const existing = grouped.get(key) ?? []
    existing.push(file)
    grouped.set(key, existing)
  }

  const result: CommandFileRecord[] = []
  for (const group of grouped.values()) {
    const skillFiles = group.filter(f => isSkillMarkdownFile(f.filePath))
    if (skillFiles.length > 0) {
      result.push(skillFiles[0]!)
      continue
    }
    result.push(...group)
  }
  return result
}

export function createPromptCommandFromFile(
  record: CommandFileRecord,
): CustomCommandWithScope | null {
  const isSkill = isSkillMarkdownFile(record.filePath)
  const name = nameForCommandFile(record.filePath, record.baseDir)
  if (!name) return null

  const descriptionText =
    record.frontmatter.description ??
    extractDescriptionFromMarkdown(
      record.content,
      isSkill ? 'Skill' : 'Custom command',
    )

  const allowedTools = parseAllowedTools(record.frontmatter['allowed-tools'])
  const maxThinkingTokens = parseMaxThinkingTokens(record.frontmatter)
  const argumentHint = record.frontmatter['argument-hint']
  const whenToUse = record.frontmatter.when_to_use
  const version = record.frontmatter.version
  const disableModelInvocation = toBoolean(
    record.frontmatter['disable-model-invocation'],
  )
  const model =
    record.frontmatter.model === 'inherit'
      ? undefined
      : record.frontmatter.model
  const context =
    typeof record.frontmatter.context === 'string' &&
    record.frontmatter.context.trim() === 'fork'
      ? ('fork' as const)
      : undefined
  const agent =
    typeof record.frontmatter.agent === 'string' &&
    record.frontmatter.agent.trim()
      ? record.frontmatter.agent.trim()
      : undefined

  const description = `${descriptionText} (${sourceLabel(record.source)})`
  const progressMessage = isSkill ? 'loading' : 'running'
  const skillBaseDir = isSkill ? dirname(record.filePath) : undefined

  return {
    type: 'prompt',
    name,
    description,
    isEnabled: true,
    isHidden: false,
    filePath: record.filePath,
    aliases: [],
    progressMessage,
    allowedTools,
    maxThinkingTokens,
    argumentHint,
    whenToUse,
    version,
    model,
    context,
    agent,
    isSkill,
    disableModelInvocation,
    hasUserSpecifiedDescription: !!record.frontmatter.description,
    source: record.source,
    scope: record.scope,
    userFacingName() {
      return name
    },
    async getPromptForCommand(args: string): Promise<MessageParam[]> {
      let prompt = record.content
      if (isSkill && skillBaseDir) {
        prompt = `Base directory for this skill: ${skillBaseDir}\n\n${prompt}`
      }
      const trimmedArgs = args.trim()
      if (trimmedArgs) {
        if (prompt.includes('$ARGUMENTS')) {
          prompt = prompt.replaceAll('$ARGUMENTS', trimmedArgs)
        } else {
          prompt = `${prompt}\n\nARGUMENTS: ${trimmedArgs}`
        }
      }
      prompt = prompt.replace(
        /\$\{(?:CLAUDE|KODE)_SESSION_ID\}/g,
        getEffectiveSessionId(),
      )
      return [{ role: 'user', content: prompt }]
    },
  }
}

export function loadSkillDirectoryCommandsFromBaseDir(
  skillsDir: string,
  source: CommandSource,
  scope: 'user' | 'project',
): CustomCommandWithScope[] {
  if (!existsSync(skillsDir)) return []

  const out: CustomCommandWithScope[] = []
  let entries
  try {
    entries = readdirSync(skillsDir, { withFileTypes: true })
  } catch {
    return []
  }

  const strictMode = toBoolean(process.env.KODE_SKILLS_STRICT)
  const validateName = (skillName: string): boolean => {
    if (skillName.length < 1 || skillName.length > 64) return false
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skillName)
  }

  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    const skillDir = join(skillsDir, entry.name)
    const skillFileCandidates = [
      join(skillDir, 'SKILL.md'),
      join(skillDir, 'skill.md'),
    ]
    const skillFile = skillFileCandidates.find(p => existsSync(p))
    if (!skillFile) continue

    try {
      const frontmatter = readFrontmatterOnlyFromFile(skillFile)
      if (!frontmatter) continue

      const dirName = entry.name
      const declaredName =
        typeof frontmatter.name === 'string' ? frontmatter.name.trim() : ''
      const effectiveDeclaredName =
        declaredName && declaredName === dirName ? declaredName : ''
      if (declaredName && declaredName !== dirName) {
        if (strictMode) continue
        debugLogger.warn('CUSTOM_COMMAND_SKILL_NAME_MISMATCH', {
          dirName,
          declaredName,
          skillFile,
        })
      }
      const name = dirName
      if (!validateName(name)) {
        if (strictMode) continue
        debugLogger.warn('CUSTOM_COMMAND_SKILL_DIR_INVALID', {
          name,
          skillFile,
        })
      }

      const descriptionText =
        typeof frontmatter.description === 'string'
          ? frontmatter.description.trim()
          : ''
      if (strictMode) {
        if (!descriptionText || descriptionText.length > 1024) continue
      }
      if (!descriptionText) {
        // Progressive disclosure: do not read the body to synthesize a description.
        // Skills must declare a description in frontmatter.
        if (!strictMode) {
          debugLogger.warn('CUSTOM_COMMAND_SKILL_DESCRIPTION_MISSING', {
            skillFile,
          })
        }
        continue
      }

      const allowedTools = parseAllowedTools(frontmatter['allowed-tools'])
      const maxThinkingTokens = parseMaxThinkingTokens(frontmatter)
      const argumentHint = frontmatter['argument-hint']
      const whenToUse = frontmatter.when_to_use
      const version = frontmatter.version
      const disableModelInvocation = toBoolean(
        frontmatter['disable-model-invocation'],
      )
      const model =
        frontmatter.model === 'inherit' ? undefined : frontmatter.model
      const context =
        typeof frontmatter.context === 'string' &&
        frontmatter.context.trim() === 'fork'
          ? ('fork' as const)
          : undefined
      const agent =
        typeof frontmatter.agent === 'string' && frontmatter.agent.trim()
          ? frontmatter.agent.trim()
          : undefined

      out.push({
        type: 'prompt',
        name,
        description: `${descriptionText} (${sourceLabel(source)})`,
        isEnabled: true,
        isHidden: true,
        aliases: [],
        filePath: skillFile,
        progressMessage: 'loading',
        allowedTools,
        maxThinkingTokens,
        argumentHint,
        whenToUse,
        version,
        model,
        context,
        agent,
        isSkill: true,
        disableModelInvocation,
        hasUserSpecifiedDescription: !!frontmatter.description,
        source,
        scope,
        userFacingName() {
          return effectiveDeclaredName || name
        },
        async getPromptForCommand(argsText: string): Promise<MessageParam[]> {
          let raw: string
          try {
            raw = readFileSync(skillFile, 'utf8')
          } catch {
            throw new Error(`Skill file not found: ${skillFile}`)
          }

          const { content } = parseFrontmatter(raw)
          let prompt = `Base directory for this skill: ${skillDir}\n\n${content}`
          const trimmedArgs = argsText.trim()
          if (trimmedArgs) {
            if (prompt.includes('$ARGUMENTS')) {
              prompt = prompt.replaceAll('$ARGUMENTS', trimmedArgs)
            } else {
              prompt = `${prompt}\n\nARGUMENTS: ${trimmedArgs}`
            }
          }
          prompt = prompt.replace(
            /\$\{(?:CLAUDE|KODE)_SESSION_ID\}/g,
            getEffectiveSessionId(),
          )
          return [{ role: 'user', content: prompt }]
        },
      })
    } catch {
      // ignore
    }
  }

  return out
}
