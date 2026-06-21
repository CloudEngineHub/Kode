import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { dirname, join } from 'path'
import type { MessageParam } from '@anthropic-ai/sdk/resources/index.mjs'

import { debug as debugLogger } from '#core/utils/debugLogger'
import { getKodeAgentSessionId } from '#protocol/utils/kodeAgentSessionId'

import type { CustomCommandFrontmatter, CustomCommandWithScope } from './types'
import {
  extractDescriptionFromMarkdown,
  parseAllowedTools,
  parseFrontmatter,
  parseMaxThinkingTokens,
  toBoolean,
} from './frontmatter'
import {
  buildPluginQualifiedName,
  nameForPluginCommandFile,
  sourceLabel,
} from './naming'
import { listMarkdownFilesRecursively } from './discovery'

function createPluginPromptCommandFromFile(record: {
  pluginName: string
  commandsDir: string
  filePath: string
  frontmatter: CustomCommandFrontmatter
  content: string
}): CustomCommandWithScope | null {
  const name = nameForPluginCommandFile(
    record.filePath,
    record.commandsDir,
    record.pluginName,
  )
  if (!name) return null

  const descriptionText =
    record.frontmatter.description ??
    extractDescriptionFromMarkdown(record.content, 'Custom command')

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

  return {
    type: 'prompt',
    name,
    description: `${descriptionText} (${sourceLabel('pluginDir')})`,
    isEnabled: true,
    isHidden: false,
    filePath: record.filePath,
    aliases: [],
    progressMessage: 'running',
    allowedTools,
    maxThinkingTokens,
    argumentHint,
    whenToUse,
    version,
    model,
    context,
    agent,
    isSkill: false,
    disableModelInvocation,
    hasUserSpecifiedDescription: !!record.frontmatter.description,
    source: 'pluginDir',
    scope: 'project',
    userFacingName() {
      return name
    },
    async getPromptForCommand(args: string): Promise<MessageParam[]> {
      let prompt = record.content
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
        getKodeAgentSessionId(),
      )
      return [{ role: 'user', content: prompt }]
    },
  }
}

export function loadPluginCommandsFromDir(args: {
  pluginName: string
  commandsDir: string
  signal: AbortSignal
}): CustomCommandWithScope[] {
  let commandsBaseDir = args.commandsDir
  let files: string[] = []
  try {
    const st = statSync(args.commandsDir)
    if (st.isFile()) {
      if (!args.commandsDir.toLowerCase().endsWith('.md')) return []
      files = [args.commandsDir]
      commandsBaseDir = dirname(args.commandsDir)
    } else if (st.isDirectory()) {
      files = listMarkdownFilesRecursively(args.commandsDir, args.signal)
    } else {
      return []
    }
  } catch {
    return []
  }

  const out: CustomCommandWithScope[] = []
  for (const filePath of files) {
    if (args.signal.aborted) break
    try {
      const raw = readFileSync(filePath, 'utf8')
      const { frontmatter, content } = parseFrontmatter(raw)
      const cmd = createPluginPromptCommandFromFile({
        pluginName: args.pluginName,
        commandsDir: commandsBaseDir,
        filePath,
        frontmatter,
        content,
      })
      if (cmd) out.push(cmd)
    } catch {
      // ignore
    }
  }
  return out
}

export function loadPluginSkillDirectoryCommandsFromBaseDir(args: {
  pluginName: string
  skillsDir: string
}): CustomCommandWithScope[] {
  if (!existsSync(args.skillsDir)) return []

  const out: CustomCommandWithScope[] = []
  let entries
  try {
    entries = readdirSync(args.skillsDir, { withFileTypes: true })
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
    const skillDir = join(args.skillsDir, entry.name)
    const skillFileCandidates = [
      join(skillDir, 'SKILL.md'),
      join(skillDir, 'skill.md'),
    ]
    const skillFile = skillFileCandidates.find(p => existsSync(p))
    if (!skillFile) continue

    try {
      const raw = readFileSync(skillFile, 'utf8')
      const { frontmatter, content } = parseFrontmatter(raw)

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

      const name = buildPluginQualifiedName(args.pluginName, dirName)
      if (!validateName(dirName)) {
        if (strictMode) continue
        debugLogger.warn('CUSTOM_COMMAND_SKILL_DIR_INVALID', {
          dirName,
          skillFile,
        })
      }

      const descriptionText =
        frontmatter.description ??
        extractDescriptionFromMarkdown(content, 'Skill')
      if (strictMode) {
        const d =
          typeof frontmatter.description === 'string'
            ? frontmatter.description.trim()
            : ''
        if (!d || d.length > 1024) continue
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
        description: `${descriptionText} (${sourceLabel('pluginDir')})`,
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
        source: 'pluginDir',
        scope: 'project',
        userFacingName() {
          return effectiveDeclaredName
            ? buildPluginQualifiedName(args.pluginName, effectiveDeclaredName)
            : name
        },
        async getPromptForCommand(argsText: string): Promise<MessageParam[]> {
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
            getKodeAgentSessionId(),
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
