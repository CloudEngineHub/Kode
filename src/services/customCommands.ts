import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { basename, dirname, join, relative, resolve, sep } from 'path'
import { homedir } from 'os'
import { memoize } from 'lodash-es'
import type { MessageParam } from '@anthropic-ai/sdk/resources/index.mjs'
import type { Command } from '@commands'
import { getCwd } from '@utils/state'
import { getSessionPlugins } from '@utils/sessionPlugins'
import { getKodeBaseDir } from '@utils/env'
import { debug as debugLogger } from '@utils/debugLogger'
import { logError } from '@utils/log'
import { execFile } from 'child_process'
import { promisify } from 'util'
import matter from 'gray-matter'
import yaml from 'js-yaml'

const execFileAsync = promisify(execFile)

/**
 * Execute bash commands found in custom command content using !`command` syntax
 *
 * This function processes dynamic command execution within custom commands,
 * following the same security model as the main BashTool but with restricted scope.
 * Commands are executed in the current working directory with a timeout.
 *
 * @param content - The custom command content to process
 * @returns Promise<string> - Content with bash commands replaced by their output
 */
export async function executeBashCommands(content: string): Promise<string> {
  // Match patterns like !`git status` or !`command here`
  const bashCommandRegex = /!\`([^`]+)\`/g
  const matches = [...content.matchAll(bashCommandRegex)]

  if (matches.length === 0) {
    return content
  }

  let result = content

  for (const match of matches) {
    const fullMatch = match[0]
    const command = match[1].trim()

    try {
      // Parse command and args using simple shell parsing
      // This mirrors the approach used in the main BashTool but with stricter limits
      const parts = command.split(/\s+/)
      const cmd = parts[0]
      const args = parts.slice(1)

      // Execute with conservative timeout (5s vs BashTool's 2min default)
      const { stdout, stderr } = await execFileAsync(cmd, args, {
        timeout: 5000,
        encoding: 'utf8',
        cwd: getCwd(), // Use current working directory for consistency
      })

      // Replace the bash command with its output, preferring stdout
      const output = stdout.trim() || stderr.trim() || '(no output)'
      result = result.replace(fullMatch, output)
    } catch (error) {
      logError(error)
      debugLogger.warn('CUSTOM_COMMAND_BASH_EXEC_FAILED', {
        command,
        error: error instanceof Error ? error.message : String(error),
      })
      result = result.replace(fullMatch, `(error executing: ${command})`)
    }
  }

  return result
}

/**
 * Resolve file references using @filepath syntax within custom commands.
 */
export async function resolveFileReferences(content: string): Promise<string> {
  // Match patterns like @src/file.js or @path/to/file.txt
  // Use consistent file mention pattern from mentionProcessor
  // Exclude agent and ask-model patterns to avoid conflicts
  const fileRefRegex = /@([a-zA-Z0-9/._-]+(?:\.[a-zA-Z0-9]+)?)/g
  const matches = [...content.matchAll(fileRefRegex)]

  if (matches.length === 0) {
    return content
  }

  let result = content

  for (const match of matches) {
    const fullMatch = match[0]
    const filePath = match[1]

    // Skip agent mentions - these are handled by the mention processor
    if (filePath.startsWith('agent-')) {
      continue
    }

    try {
      // Resolve relative to current working directory
      // This maintains consistency with how other file operations work
      const fullPath = join(getCwd(), filePath)

      if (existsSync(fullPath)) {
        const fileContent = readFileSync(fullPath, { encoding: 'utf-8' })

        // Format file content with filename header for clarity
        // This matches the format used by FileReadTool for consistency
        const formattedContent = `\n\n## File: ${filePath}\n\`\`\`\n${fileContent}\n\`\`\`\n`
        result = result.replace(fullMatch, formattedContent)
      } else {
        result = result.replace(fullMatch, `(file not found: ${filePath})`)
      }
    } catch (error) {
      logError(error)
      debugLogger.warn('CUSTOM_COMMAND_FILE_READ_FAILED', {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      })
      result = result.replace(fullMatch, `(error reading: ${filePath})`)
    }
  }

  return result
}

/**
 * Frontmatter configuration for custom commands and skills.
 */
export interface CustomCommandFrontmatter {
  description?: string
  'allowed-tools'?: string[]
  'argument-hint'?: string
  when_to_use?: string
  version?: string
  model?: string
  maxThinkingTokens?: number | string
  max_thinking_tokens?: number | string
  'max-thinking-tokens'?: number | string
  name?: string
  'disable-model-invocation'?: boolean | string
}

/**
 * Compatibility metadata attached to prompt commands.
 */
export interface CustomCommandWithScope {
  type: 'prompt'
  name: string
  description: string
  isEnabled: boolean
  isHidden: boolean
  aliases?: string[]
  progressMessage: string
  userFacingName(): string
  getPromptForCommand(args: string): Promise<MessageParam[]>
  allowedTools?: string[]
  maxThinkingTokens?: number
  argumentHint?: string
  whenToUse?: string
  version?: string
  model?: string
  isSkill?: boolean
  disableModelInvocation?: boolean
  hasUserSpecifiedDescription?: boolean
  source?: 'localSettings' | 'userSettings' | 'pluginDir'
  scope?: 'user' | 'project'
  filePath?: string
}

/**
 * Parsed custom command file representation
 *
 * This interface represents a fully parsed custom command file with
 * separated frontmatter and content sections.
 */
export interface CustomCommandFile {
  /** Parsed frontmatter configuration */
  frontmatter: CustomCommandFrontmatter
  /** Markdown content (without frontmatter) */
  content: string
  /** Absolute path to the source file */
  filePath: string
}

/**
 * Parse YAML frontmatter from markdown content
 *
 * This function extracts and parses YAML frontmatter from markdown files,
 * supporting the same syntax as Jekyll and other static site generators.
 * It handles basic YAML constructs including strings, booleans, and arrays.
 *
 * The parser is intentionally simple and focused on the specific needs of
 * custom commands rather than being a full YAML parser. Complex YAML features
 * like nested objects, multi-line strings, and advanced syntax are not supported.
 *
 * @param content - Raw markdown content with optional frontmatter
 * @returns Object containing parsed frontmatter and remaining content
 */
export function parseFrontmatter(content: string): {
  frontmatter: CustomCommandFrontmatter
  content: string
} {
  const yamlSchema = (yaml as any).JSON_SCHEMA
  const parsed = matter(content, {
    engines: {
      yaml: {
        parse: (input: string) =>
          yaml.load(input, yamlSchema ? { schema: yamlSchema } : undefined) ??
          {},
      },
    },
  })
  return {
    frontmatter: (parsed.data ?? {}) as CustomCommandFrontmatter,
    content: parsed.content ?? '',
  }
}

type CommandSource = 'localSettings' | 'userSettings' | 'pluginDir'

function isSkillMarkdownFile(filePath: string): boolean {
  return /^skill\.md$/i.test(basename(filePath))
}

function getUserKodeBaseDir(): string {
  return getKodeBaseDir()
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  }
  return false
}

function parseAllowedTools(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(v => String(v).trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    // Agent Skills spec: space-delimited list (e.g. `Bash(git:*) Bash(jq:*) Read`)
    return trimmed
      .split(/\s+/)
      .map(v => v.trim())
      .filter(Boolean)
  }
  return []
}

function parseMaxThinkingTokens(
  frontmatter: CustomCommandFrontmatter,
): number | undefined {
  const raw =
    (frontmatter as any).maxThinkingTokens ??
    (frontmatter as any).max_thinking_tokens ??
    (frontmatter as any)['max-thinking-tokens'] ??
    (frontmatter as any)['max_thinking_tokens']
  if (raw === undefined || raw === null) return undefined
  const value = typeof raw === 'number' ? raw : Number(String(raw).trim())
  if (!Number.isFinite(value) || value < 0) return undefined
  return Math.floor(value)
}

function sourceLabel(source: CommandSource): string {
  if (source === 'localSettings') return 'project'
  if (source === 'userSettings') return 'user'
  if (source === 'pluginDir') return 'plugin'
  return 'unknown'
}

function extractDescriptionFromMarkdown(
  markdown: string,
  fallback: string,
): string {
  const lines = markdown.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const heading = trimmed.match(/^#{1,6}\s+(.*)$/)
    if (heading?.[1]) return heading[1].trim()
    return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed
  }
  return fallback
}

function namespaceFromDirPath(dirPath: string, baseDir: string): string {
  const relPath = relative(baseDir, dirPath)
  if (!relPath || relPath === '.' || relPath.startsWith('..')) return ''
  return relPath.split(sep).join(':')
}

function nameForCommandFile(filePath: string, baseDir: string): string {
  if (isSkillMarkdownFile(filePath)) {
    const skillDir = dirname(filePath)
    const parentDir = dirname(skillDir)
    const skillName = basename(skillDir)
    const namespace = namespaceFromDirPath(parentDir, baseDir)
    return namespace ? `${namespace}:${skillName}` : skillName
  }

  const dir = dirname(filePath)
  const namespace = namespaceFromDirPath(dir, baseDir)
  const fileName = basename(filePath).replace(/\.md$/i, '')
  return namespace ? `${namespace}:${fileName}` : fileName
}

type CommandFileRecord = {
  baseDir: string
  filePath: string
  frontmatter: CustomCommandFrontmatter
  content: string
  source: CommandSource
  scope: 'user' | 'project'
}

function buildPluginQualifiedName(
  pluginName: string,
  localName: string,
): string {
  const p = pluginName.trim()
  const l = localName.trim()
  if (!p) return l
  if (!l || l === p) return p
  return `${p}:${l}`
}

function nameForPluginCommandFile(
  filePath: string,
  commandsDir: string,
  pluginName: string,
): string {
  const rel = relative(commandsDir, filePath)
  const noExt = rel.replace(/\.md$/i, '')
  const localName = noExt.split(sep).filter(Boolean).join(':')
  return buildPluginQualifiedName(pluginName, localName)
}

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
      return [{ role: 'user', content: prompt }]
    },
  }
}

function loadPluginCommandsFromDir(args: {
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

function loadPluginSkillDirectoryCommandsFromBaseDir(args: {
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
        typeof (frontmatter as any).name === 'string'
          ? String((frontmatter as any).name).trim()
          : ''
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
        debugLogger.warn('CUSTOM_COMMAND_SKILL_DIR_INVALID', { dirName, skillFile })
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
      const maxThinkingTokens = parseMaxThinkingTokens(frontmatter as any)
      const argumentHint = frontmatter['argument-hint']
      const whenToUse = frontmatter.when_to_use
      const version = frontmatter.version
      const disableModelInvocation = toBoolean(
        frontmatter['disable-model-invocation'],
      )
      const model =
        frontmatter.model === 'inherit' ? undefined : frontmatter.model

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
          return [{ role: 'user', content: prompt }]
        },
      })
    } catch {
      // ignore
    }
  }

  return out
}

function applySkillFilePreference(
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

function createPromptCommandFromFile(
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
      return [{ role: 'user', content: prompt }]
    },
  }
}

function listMarkdownFilesRecursively(
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

function loadCommandMarkdownFilesFromBaseDir(
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

function loadSkillDirectoryCommandsFromBaseDir(
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
      const raw = readFileSync(skillFile, 'utf8')
      const { frontmatter, content } = parseFrontmatter(raw)

      const dirName = entry.name
      const declaredName =
        typeof (frontmatter as any).name === 'string'
          ? String((frontmatter as any).name).trim()
          : ''
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
        debugLogger.warn('CUSTOM_COMMAND_SKILL_DIR_INVALID', { name, skillFile })
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
      const maxThinkingTokens = parseMaxThinkingTokens(frontmatter as any)
      const argumentHint = frontmatter['argument-hint']
      const whenToUse = frontmatter.when_to_use
      const version = frontmatter.version
      const disableModelInvocation = toBoolean(
        frontmatter['disable-model-invocation'],
      )
      const model =
        frontmatter.model === 'inherit' ? undefined : frontmatter.model

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
        isSkill: true,
        disableModelInvocation,
        hasUserSpecifiedDescription: !!frontmatter.description,
        source,
        scope,
        userFacingName() {
          return effectiveDeclaredName || name
        },
        async getPromptForCommand(args: string): Promise<MessageParam[]> {
          let prompt = `Base directory for this skill: ${skillDir}\n\n${content}`
          const trimmedArgs = args.trim()
          if (trimmedArgs) {
            if (prompt.includes('$ARGUMENTS')) {
              prompt = prompt.replaceAll('$ARGUMENTS', trimmedArgs)
            } else {
              prompt = `${prompt}\n\nARGUMENTS: ${trimmedArgs}`
            }
          }
          return [{ role: 'user', content: prompt }]
        },
      })
    } catch {
      // ignore
    }
  }

  return out
}

/**
 * Load custom commands from user/project command directories.
 *
 * This function scans both user-level and project-level command directories
 * for markdown files and processes them into Command objects. It follows the
 * same discovery pattern as compatible CLIs, with additional performance
 * optimizations and error handling. `.kode/*` is primary; legacy `.claude/*` is supported.
 *
 * Directory structure:
 * - User commands: ~/.kode/commands/ (legacy: ~/.claude/commands/)
 * - Project commands: {project}/.kode/commands/ (legacy: {project}/.claude/commands/)
 *
 * The function is memoized for performance but includes cache invalidation
 * based on directory contents and timestamps.
 *
 * @returns Promise<CustomCommandWithScope[]> - Array of loaded and enabled commands
 */
export const loadCustomCommands = memoize(
  async (): Promise<CustomCommandWithScope[]> => {
    const cwd = getCwd()
    const userKodeBaseDir = getUserKodeBaseDir()
    const sessionPlugins = getSessionPlugins()

    // File-based commands (legacy compatible)
    const projectLegacyCommandsDir = join(cwd, '.claude', 'commands')
    const userLegacyCommandsDir = join(homedir(), '.claude', 'commands')
    const projectKodeCommandsDir = join(cwd, '.kode', 'commands')
    const userKodeCommandsDir = join(userKodeBaseDir, 'commands')

    // Directory-based skills (legacy compatible)
    const projectLegacySkillsDir = join(cwd, '.claude', 'skills')
    const userLegacySkillsDir = join(homedir(), '.claude', 'skills')
    const projectKodeSkillsDir = join(cwd, '.kode', 'skills')
    const userKodeSkillsDir = join(userKodeBaseDir, 'skills')

    // Set up abort controller for timeout handling
    const abortController = new AbortController()
    const timeout = setTimeout(() => abortController.abort(), 3000)

    try {
      const commandFiles = applySkillFilePreference([
        ...loadCommandMarkdownFilesFromBaseDir(
          projectLegacyCommandsDir,
          'localSettings',
          'project',
          abortController.signal,
        ),
        ...loadCommandMarkdownFilesFromBaseDir(
          projectKodeCommandsDir,
          'localSettings',
          'project',
          abortController.signal,
        ),
        ...loadCommandMarkdownFilesFromBaseDir(
          userLegacyCommandsDir,
          'userSettings',
          'user',
          abortController.signal,
        ),
        ...loadCommandMarkdownFilesFromBaseDir(
          userKodeCommandsDir,
          'userSettings',
          'user',
          abortController.signal,
        ),
      ])

      const fileCommands = commandFiles
        .map(createPromptCommandFromFile)
        .filter((cmd): cmd is CustomCommandWithScope => cmd !== null)

      const skillDirCommands: CustomCommandWithScope[] = [
        ...loadSkillDirectoryCommandsFromBaseDir(
          projectLegacySkillsDir,
          'localSettings',
          'project',
        ),
        ...loadSkillDirectoryCommandsFromBaseDir(
          projectKodeSkillsDir,
          'localSettings',
          'project',
        ),
        ...loadSkillDirectoryCommandsFromBaseDir(
          userLegacySkillsDir,
          'userSettings',
          'user',
        ),
        ...loadSkillDirectoryCommandsFromBaseDir(
          userKodeSkillsDir,
          'userSettings',
          'user',
        ),
      ]

      const pluginCommands: CustomCommandWithScope[] = []
      if (sessionPlugins.length > 0) {
        for (const plugin of sessionPlugins) {
          for (const commandsDir of plugin.commandsDirs) {
            pluginCommands.push(
              ...loadPluginCommandsFromDir({
                pluginName: plugin.name,
                commandsDir,
                signal: abortController.signal,
              }),
            )
          }
          for (const skillsDir of plugin.skillsDirs) {
            pluginCommands.push(
              ...loadPluginSkillDirectoryCommandsFromBaseDir({
                pluginName: plugin.name,
                skillsDir,
              }),
            )
          }
        }
      }

      const ordered = [
        ...fileCommands,
        ...skillDirCommands,
        ...pluginCommands,
      ].filter(cmd => cmd.isEnabled)

      const seen = new Set<string>()
      const unique: CustomCommandWithScope[] = []
      for (const cmd of ordered) {
        const key = cmd.userFacingName()
        if (seen.has(key)) continue
        seen.add(key)
        unique.push(cmd)
      }

      return unique
    } catch (error) {
      logError(error)
      debugLogger.warn('CUSTOM_COMMANDS_LOAD_FAILED', {
        error: error instanceof Error ? error.message : String(error),
      })
      return []
    } finally {
      clearTimeout(timeout)
    }
  },
  // Memoization resolver based on current working directory and directory state
  // This ensures cache invalidation when directories change
  () => {
    const cwd = getCwd()
    const userKodeBaseDir = getUserKodeBaseDir()
    const dirs = [
      join(homedir(), '.claude', 'commands'),
      join(cwd, '.claude', 'commands'),
      join(userKodeBaseDir, 'commands'),
      join(cwd, '.kode', 'commands'),
      join(homedir(), '.claude', 'skills'),
      join(cwd, '.claude', 'skills'),
      join(userKodeBaseDir, 'skills'),
      join(cwd, '.kode', 'skills'),
    ]
    const exists = dirs.map(d => (existsSync(d) ? '1' : '0')).join('')
    return `${cwd}:${exists}:${Math.floor(Date.now() / 60000)}`
  },
)

/**
 * Clear the custom commands cache to force reload
 *
 * This function invalidates the memoized cache for custom commands,
 * forcing the next invocation to re-scan the filesystem. It's useful
 * when commands are added, removed, or modified during runtime.
 *
 * This follows the same pattern as other cache invalidation functions
 * in the project, such as getCommands.cache.clear().
 */
export const reloadCustomCommands = (): void => {
  loadCustomCommands.cache.clear()
}

/**
 * Get custom command directories for help and diagnostic purposes
 *
 * This function returns the standard directory paths where custom commands
 * are expected to be found. It's used by help systems and diagnostic tools
 * to inform users about the proper directory structure.
 *
 * @returns Object containing user and project command directory paths
 */
export function getCustomCommandDirectories(): {
  userClaudeCommands: string
  projectClaudeCommands: string
  userClaudeSkills: string
  projectClaudeSkills: string
  userKodeCommands: string
  projectKodeCommands: string
  userKodeSkills: string
  projectKodeSkills: string
} {
  const userKodeBaseDir = getUserKodeBaseDir()
  return {
    userClaudeCommands: join(homedir(), '.claude', 'commands'),
    projectClaudeCommands: join(getCwd(), '.claude', 'commands'),
    userClaudeSkills: join(homedir(), '.claude', 'skills'),
    projectClaudeSkills: join(getCwd(), '.claude', 'skills'),
    userKodeCommands: join(userKodeBaseDir, 'commands'),
    projectKodeCommands: join(getCwd(), '.kode', 'commands'),
    userKodeSkills: join(userKodeBaseDir, 'skills'),
    projectKodeSkills: join(getCwd(), '.kode', 'skills'),
  }
}

/**
 * Check if custom commands are available in either directory
 *
 * This function provides a quick way to determine if custom commands
 * are configured without actually loading them. It's useful for conditional
 * UI elements and feature detection.
 *
 * @returns boolean - True if at least one command directory exists
 */
export function hasCustomCommands(): boolean {
  const dirs = getCustomCommandDirectories()
  return (
    existsSync(dirs.userClaudeCommands) ||
    existsSync(dirs.projectClaudeCommands) ||
    existsSync(dirs.userClaudeSkills) ||
    existsSync(dirs.projectClaudeSkills) ||
    existsSync(dirs.userKodeCommands) ||
    existsSync(dirs.projectKodeCommands) ||
    existsSync(dirs.userKodeSkills) ||
    existsSync(dirs.projectKodeSkills)
  )
}
