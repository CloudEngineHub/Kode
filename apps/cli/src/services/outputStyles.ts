import figures from 'figures'
import { memoize } from 'lodash-es'
import { statSync } from 'node:fs'
import { basename, join } from 'path'
import { getSessionPlugins } from '#core/utils/sessionPlugins'
import { readLocalSettings, updateLocalSettings } from '#config'
import { getCwd } from '#core/utils/state'
import { isSettingSourceEnabled } from '#config'
import { LEGACY_CONFIG_SUBDIRS } from '#core/compat/legacyPaths'
import {
  findProjectSubdirs,
  getPolicyBaseDirs,
  getUserConfigRoots,
  inodeKeyForPath,
  listMarkdownFilesRecursively,
  markdownFirstLineOrHeading,
  normalizeString,
  readMarkdownFile,
} from './outputStyles/filesystem'

export type OutputStyleSource =
  | 'built-in'
  | 'plugin'
  | 'userSettings'
  | 'projectSettings'
  | 'policySettings'

export type OutputStyleDefinition = {
  name: string
  description: string
  prompt: string
  source: OutputStyleSource
  keepCodingInstructions?: boolean
}

export type OutputStyleMap = Record<string, OutputStyleDefinition | null>

export const DEFAULT_OUTPUT_STYLE = 'default'

const INSIGHTS_SECTION = `
## Insights
In order to encourage learning, before and after writing code, always provide brief educational explanations about implementation choices using (with backticks):
"\`${figures.star} Insight ─────────────────────────────────────\`
[2-3 key educational points]
\`─────────────────────────────────────────────────\`"

These insights should be included in the conversation, not in the codebase. You should generally focus on interesting insights that are specific to the codebase or the code you just wrote, rather than general programming concepts.`

function getBuiltInOutputStyles(): OutputStyleMap {
  return {
    [DEFAULT_OUTPUT_STYLE]: null,
    Explanatory: {
      name: 'Explanatory',
      source: 'built-in',
      description: 'Explains implementation choices and codebase patterns',
      keepCodingInstructions: true,
      prompt: `You are an interactive CLI tool that helps users with software engineering tasks. In addition to software engineering tasks, you should provide educational insights about the codebase along the way.

You should be clear and educational, providing helpful explanations while remaining focused on the task. Balance educational content with task completion. When providing insights, you may exceed typical length constraints, but remain focused and relevant.

# Explanatory Style Active
${INSIGHTS_SECTION}`,
    },
    Learning: {
      name: 'Learning',
      source: 'built-in',
      description:
        'Pauses and asks for small hands-on contributions for practice',
      keepCodingInstructions: true,
      prompt: `You are an interactive CLI tool that helps users with software engineering tasks. In addition to software engineering tasks, you should help users learn more about the codebase through hands-on practice and educational insights.

You should be collaborative and encouraging. Balance task completion with learning by requesting user input for meaningful design decisions while handling routine implementation yourself.   

# Learning Style Active
## Requesting Human Contributions
In order to encourage learning, ask the human to contribute 2-10 line code pieces when generating 20+ lines involving:
- Design decisions (error handling, data structures)
- Business logic with multiple valid approaches  
- Key algorithms or interface definitions

**Task List Integration**: If using the shared Task list (via TaskCreate/TaskUpdate), include a specific task like "Request human input on [specific decision]" when planning to request human input. This ensures proper progress tracking. Note: A Task list is not required for all work.

Example Task flow:
   ✓ "Set up component structure with placeholder for logic"
   ✓ "Request human collaboration on decision logic implementation"
   ✓ "Integrate contribution and complete feature"

### Request Format
\`\`\`
${figures.bullet} **Learn by Doing**
**Context:** [what's built and why this decision matters]
**Your Task:** [specific function/section in file, mention file and TODO(human) but do not include line numbers]
**Guidance:** [trade-offs and constraints to consider]
\`\`\`

### Key Guidelines
- Frame contributions as valuable design decisions, not busy work
- You must first add a TODO(human) section into the codebase with your editing tools before making the Learn by Doing request      
- Make sure there is one and only one TODO(human) section in the code
- Don't take any action or output anything after the Learn by Doing request. Wait for human implementation before proceeding.

### Example Requests

**Whole Function Example:**
\`\`\`
${figures.bullet} **Learn by Doing**

**Context:** I've set up the hint feature UI with a button that triggers the hint system. The infrastructure is ready: when clicked, it calls selectHintCell() to determine which cell to hint, then highlights that cell with a yellow background and shows possible values. The hint system needs to decide which empty cell would be most helpful to reveal to the user.

**Your Task:** In sudoku.js, implement the selectHintCell(board) function. Look for TODO(human). This function should analyze the board and return {row, col} for the best cell to hint, or null if the puzzle is complete.

**Guidance:** Consider multiple strategies: prioritize cells with only one possible value (naked singles), or cells that appear in rows/columns/boxes with many filled cells. You could also consider a balanced approach that helps without making it too easy. The board parameter is a 9x9 array where 0 represents empty cells.
\`\`\`

**Partial Function Example:**
\`\`\`
${figures.bullet} **Learn by Doing**

**Context:** I've built a file upload component that validates files before accepting them. The main validation logic is complete, but it needs specific handling for different file type categories in the switch statement.

**Your Task:** In upload.js, inside the validateFile() function's switch statement, implement the 'case "document":' branch. Look for TODO(human). This should validate document files (pdf, doc, docx).

**Guidance:** Consider checking file size limits (maybe 10MB for documents?), validating the file extension matches the MIME type, and returning {valid: boolean, error?: string}. The file object has properties: name, size, type.
\`\`\`

**Debugging Example:**
\`\`\`
${figures.bullet} **Learn by Doing**

**Context:** The user reported that number inputs aren't working correctly in the calculator. I've identified the handleInput() function as the likely source, but need to understand what values are being processed.

**Your Task:** In calculator.js, inside the handleInput() function, add 2-3 console.log statements after the TODO(human) comment to help debug why number inputs fail.

**Guidance:** Consider logging: the raw input value, the parsed result, and any validation state. This will help us understand where the conversion breaks.
\`\`\`

### After Contributions
Share one insight connecting their code to broader patterns or system effects. Avoid praise or repetition.

## Insights
${INSIGHTS_SECTION}`,
    },
  }
}

function parseKeepCodingInstructions(value: unknown): boolean | undefined {
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

function parseCustomOutputStyleFile(options: {
  filePath: string
  source: Exclude<OutputStyleSource, 'built-in' | 'plugin'>
}): OutputStyleDefinition | null {
  const parsed = readMarkdownFile(options.filePath)
  if (!parsed) return null

  const base = basename(options.filePath, '.md')
  const name = normalizeString(parsed.frontmatter?.name) ?? base
  const description =
    normalizeString(parsed.frontmatter?.description) ??
    markdownFirstLineOrHeading(parsed.content, `Custom ${base} output style`)
  const keepCodingInstructions = parseKeepCodingInstructions(
    parsed.frontmatter?.['keep-coding-instructions'],
  )
  const prompt = parsed.content.trim()

  return {
    name,
    description,
    prompt,
    source: options.source,
    ...(keepCodingInstructions !== undefined ? { keepCodingInstructions } : {}),
  }
}

function parsePluginOutputStyleFile(options: {
  filePath: string
  pluginName: string
  seen: Set<string>
}): OutputStyleDefinition | null {
  const inodeKey = inodeKeyForPath(options.filePath)
  const dedupeKey = inodeKey ? `inode:${inodeKey}` : `path:${options.filePath}`
  if (options.seen.has(dedupeKey)) return null
  options.seen.add(dedupeKey)

  const parsed = readMarkdownFile(options.filePath)
  if (!parsed) return null

  const base = basename(options.filePath, '.md')
  const styleName = normalizeString(parsed.frontmatter?.name) ?? base
  const fullName = `${options.pluginName}:${styleName}`
  const description =
    normalizeString(parsed.frontmatter?.description) ??
    markdownFirstLineOrHeading(
      parsed.content,
      `Output style from ${options.pluginName} plugin`,
    )
  const prompt = parsed.content.trim()

  return {
    name: fullName,
    description,
    prompt,
    source: 'plugin',
  }
}

function loadPluginOutputStyles(): OutputStyleDefinition[] {
  const out: OutputStyleDefinition[] = []
  const plugins = getSessionPlugins()
  for (const plugin of plugins) {
    const pluginName = plugin.name
    const seen = new Set<string>()
    for (const dir of plugin.outputStylesDirs ?? []) {
      let st: ReturnType<typeof statSync>
      try {
        st = statSync(dir)
      } catch {
        continue
      }
      if (st.isFile()) {
        if (!dir.endsWith('.md')) continue
        const style = parsePluginOutputStyleFile({
          filePath: dir,
          pluginName,
          seen,
        })
        if (style) out.push(style)
        continue
      }

      if (st.isDirectory()) {
        const files = listMarkdownFilesRecursively(dir)
        for (const filePath of files) {
          const style = parsePluginOutputStyleFile({
            filePath,
            pluginName,
            seen,
          })
          if (style) out.push(style)
        }
      }
    }
  }
  return out
}

function loadCustomOutputStyles(options: {
  cwd: string
}): OutputStyleDefinition[] {
  const out: OutputStyleDefinition[] = []
  const seen = new Set<string>()

  for (const baseDir of getPolicyBaseDirs()) {
    for (const policyDir of [
      // Legacy format scanned first so Kode wins at the same level.
      join(baseDir, LEGACY_CONFIG_SUBDIRS.outputStyles),
      join(baseDir, '.kode', 'output-styles'),
    ]) {
      for (const filePath of listMarkdownFilesRecursively(policyDir)) {
        const inodeKey = inodeKeyForPath(filePath)
        const dedupeKey = inodeKey ? `inode:${inodeKey}` : `path:${filePath}`
        if (seen.has(dedupeKey)) continue
        seen.add(dedupeKey)
        const style = parseCustomOutputStyleFile({
          filePath,
          source: 'policySettings',
        })
        if (style) out.push(style)
      }
    }
  }

  if (isSettingSourceEnabled('userSettings')) {
    for (const userBaseDir of getUserConfigRoots()) {
      const dirPath = join(userBaseDir, 'output-styles')
      for (const filePath of listMarkdownFilesRecursively(dirPath)) {
        const inodeKey = inodeKeyForPath(filePath)
        const dedupeKey = inodeKey ? `inode:${inodeKey}` : `path:${filePath}`
        if (seen.has(dedupeKey)) continue
        seen.add(dedupeKey)
        const style = parseCustomOutputStyleFile({
          filePath,
          source: 'userSettings',
        })
        if (style) out.push(style)
      }
    }
  }

  if (isSettingSourceEnabled('projectSettings')) {
    for (const dirPath of findProjectSubdirs('output-styles', options.cwd)) {
      for (const filePath of listMarkdownFilesRecursively(dirPath)) {
        const inodeKey = inodeKeyForPath(filePath)
        const dedupeKey = inodeKey ? `inode:${inodeKey}` : `path:${filePath}`
        if (seen.has(dedupeKey)) continue
        seen.add(dedupeKey)
        const style = parseCustomOutputStyleFile({
          filePath,
          source: 'projectSettings',
        })
        if (style) out.push(style)
      }
    }
  }

  return out
}

export const getAvailableOutputStyles = memoize((): OutputStyleMap => {
  const cwd = getCwd()
  const builtIn = getBuiltInOutputStyles()
  const merged: OutputStyleMap = { ...builtIn }

  for (const style of loadPluginOutputStyles()) {
    merged[style.name] = style
  }

  const custom = loadCustomOutputStyles({ cwd })
  const user = custom.filter(s => s.source === 'userSettings')
  const project = custom.filter(s => s.source === 'projectSettings')
  const policy = custom.filter(s => s.source === 'policySettings')

  for (const style of user) merged[style.name] = style
  for (const style of project) merged[style.name] = style
  for (const style of policy) merged[style.name] = style

  return merged
})

export function clearOutputStyleCache(): void {
  getAvailableOutputStyles.cache.clear?.()
}

export function getCurrentOutputStyle(): string {
  if (!isSettingSourceEnabled('localSettings')) return DEFAULT_OUTPUT_STYLE

  const settings = readLocalSettings()
  const candidate = normalizeString(settings.outputStyle)
  return candidate ?? DEFAULT_OUTPUT_STYLE
}

export function setCurrentOutputStyle(styleName: string): void {
  updateLocalSettings({ outputStyle: styleName })
}

export function resolveOutputStyleName(input: string): string | null {
  const raw = normalizeString(input)
  if (!raw) return null
  const styles = getAvailableOutputStyles()
  if (raw in styles) return raw
  const lower = raw.toLowerCase()
  for (const name of Object.keys(styles)) {
    if (name.toLowerCase() === lower) return name
  }
  return null
}

export function getCurrentOutputStyleDefinition(): OutputStyleDefinition | null {
  const current = getCurrentOutputStyle()
  const styles = getAvailableOutputStyles()
  return styles[current] ?? null
}

export function getOutputStyleSystemPromptAdditions(): string[] {
  const style = getCurrentOutputStyleDefinition()
  if (!style) return []
  const prompt = style.prompt.trim()
  if (!prompt) return []
  return [`\n# Output Style: ${style.name}\n${prompt}\n`]
}
