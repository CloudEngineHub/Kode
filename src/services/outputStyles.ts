import { memoize } from 'lodash-es'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { basename, join } from 'path'
import matter from 'gray-matter'
import { getSessionPlugins } from '@utils/sessionPlugins'
import { readLocalSettings, updateLocalSettings } from '@utils/localSettings'

export type OutputStyleDefinition = {
  name: string
  description: string
  prompt: string
  source: 'builtin' | 'plugin'
}

export const DEFAULT_OUTPUT_STYLE = 'default'

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function readOutputStyleFile(options: {
  filePath: string
  pluginName: string
}): OutputStyleDefinition | null {
  const raw = readFileSync(options.filePath, 'utf8')
  const parsed = matter(raw)
  const base = basename(options.filePath, '.md')
  const styleName = normalizeString((parsed.data as any)?.name) ?? base
  const fullName = `${options.pluginName}:${styleName}`
  const description =
    normalizeString((parsed.data as any)?.description) ??
    `Output style from ${options.pluginName} plugin`
  const prompt = String(parsed.content ?? '').trim()
  return {
    name: fullName,
    description,
    prompt,
    source: 'plugin',
  }
}

function scanOutputStyleDir(options: {
  dirPath: string
  pluginName: string
  seen: Set<string>
  out: OutputStyleDefinition[]
}): void {
  if (!existsSync(options.dirPath)) return
  let entries: Array<{
    name: string
    isDirectory(): boolean
    isFile(): boolean
  }>
  try {
    entries = readdirSync(options.dirPath, {
      withFileTypes: true,
      encoding: 'utf8',
    }) as any
  } catch {
    return
  }

  for (const entry of entries) {
    const name = String(entry.name ?? '')
    const fullPath = join(options.dirPath, name)
    if (entry.isDirectory()) {
      scanOutputStyleDir({
        ...options,
        dirPath: fullPath,
      })
      continue
    }
    if (!entry.isFile()) continue
    if (!name.endsWith('.md')) continue
    if (options.seen.has(fullPath)) continue
    options.seen.add(fullPath)
    try {
      const style = readOutputStyleFile({
        filePath: fullPath,
        pluginName: options.pluginName,
      })
      if (style) options.out.push(style)
    } catch {
      continue
    }
  }
}

export const getAvailableOutputStyles = memoize(
  (): Record<string, OutputStyleDefinition> => {
    const out: Record<string, OutputStyleDefinition> = {
      [DEFAULT_OUTPUT_STYLE]: {
        name: DEFAULT_OUTPUT_STYLE,
        description: 'Default output style',
        prompt: '',
        source: 'builtin',
      },
    }

    const plugins = getSessionPlugins()
    for (const plugin of plugins) {
      const pluginName = plugin.name
      const styles: OutputStyleDefinition[] = []
      const seen = new Set<string>()
      for (const dir of plugin.outputStylesDirs ?? []) {
        try {
          const st = statSync(dir)
          if (!st.isDirectory()) continue
        } catch {
          continue
        }
        scanOutputStyleDir({ dirPath: dir, pluginName, seen, out: styles })
      }
      for (const style of styles) {
        out[style.name] = style
      }
    }

    return out
  },
)

export function clearOutputStyleCache(): void {
  ;(getAvailableOutputStyles as any).cache?.clear?.()
}

export function getCurrentOutputStyle(): string {
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

export function getOutputStyleSystemPromptAdditions(): string[] {
  const current = getCurrentOutputStyle()
  const styles = getAvailableOutputStyles()
  const resolved = resolveOutputStyleName(current) ?? DEFAULT_OUTPUT_STYLE
  if (resolved === DEFAULT_OUTPUT_STYLE) return []

  const prompt = styles[resolved]?.prompt?.trim()
  if (!prompt) return []

  return [`\n# Output style: ${resolved}\n${prompt}\n`]
}
