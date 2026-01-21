import { z } from 'zod'
import {
  getSessionPlugins,
  type SessionPlugin,
} from '#core/utils/sessionPlugins'
import { LEGACY_ENV } from '#core/compat/legacyEnv'
import { KODE_HOOK_ENV } from '#core/compat/hookEnv'
import { existsSync, readFileSync } from 'node:fs'
import {
  basename,
  delimiter,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { accessSync, constants, statSync } from 'node:fs'

export type LspServerSource =
  | {
      kind: 'plugin'
      pluginName: string
      pluginRoot: string
      configPath?: string
    }
  | { kind: 'unknown' }

export type ResolvedLspServerConfig = LspServerConfig & {
  name: string
  source: LspServerSource
}

type LspServerIndexEntry = {
  serverName: string
  languageId: string
}

export type LspServerIndex = Map<string, LspServerIndexEntry>

const nodeModulesBinCache = new Map<string, string[]>()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function listNodeModulesBinDirs(startDir: string): string[] {
  const key = resolve(startDir)
  const cached = nodeModulesBinCache.get(key)
  if (cached) return cached

  const out: string[] = []
  let current = key
  for (let i = 0; i < 50; i++) {
    const candidate = join(current, 'node_modules', '.bin')
    if (existsSync(candidate)) out.push(candidate)

    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }

  nodeModulesBinCache.set(key, out)
  return out
}

function mergePathList(
  prepend: string[],
  basePath: string | undefined,
): string {
  const seen = new Set<string>()
  const out: string[] = []

  for (const dir of prepend) {
    const value = String(dir ?? '').trim()
    if (!value) continue
    if (seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }

  const base = String(basePath ?? '')
  for (const dir of base.split(delimiter)) {
    const value = String(dir ?? '').trim()
    if (!value) continue
    if (seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }

  return out.join(delimiter)
}

export function buildLspServerProcessEnv(args: {
  cwd: string
  env?: Record<string, string>
}): Record<string, string> {
  const mergedEnv = { ...process.env, ...(args.env ?? {}) } as Record<
    string,
    string
  >

  const toolDir = dirname(fileURLToPath(import.meta.url))
  const prepend = [
    ...listNodeModulesBinDirs(args.cwd),
    ...listNodeModulesBinDirs(toolDir),
    dirname(process.execPath),
  ]

  mergedEnv.PATH = mergePathList(prepend, mergedEnv.PATH ?? process.env.PATH)
  return mergedEnv
}

function stripJsonComments(input: string): string {
  let out = ''
  let inString = false
  let escaped = false
  let inLineComment = false
  let inBlockComment = false

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!
    const next = i + 1 < input.length ? input[i + 1]! : ''

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false
        out += ch
      }
      continue
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false
        i++
      }
      continue
    }

    if (inString) {
      out += ch
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === '"') inString = false
      continue
    }

    if (ch === '"') {
      inString = true
      out += ch
      continue
    }

    if (ch === '/' && next === '/') {
      inLineComment = true
      i++
      continue
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true
      i++
      continue
    }

    out += ch
  }

  return out
}

function parseJsonOrJsonc(text: string): unknown {
  const raw = String(text ?? '')
  if (!raw.trim()) return null
  try {
    return JSON.parse(raw)
  } catch {
    try {
      return JSON.parse(stripJsonComments(raw))
    } catch {
      return null
    }
  }
}

function expandTemplateString(
  value: string,
  pluginRoot: string | null,
  missingVars?: string[],
): string {
  return value.replace(/\$\{([^}]+)\}/g, (match, rawKey) => {
    const raw = String(rawKey ?? '')
    const [keyPart, defaultValue] = raw.split(':-', 2)
    const k = String(keyPart ?? '').trim()
    if (!k) return match
    if (
      pluginRoot &&
      (k === KODE_HOOK_ENV.pluginRoot || k === LEGACY_ENV.pluginRoot)
    )
      return pluginRoot
    const env = process.env[k]
    if (env !== undefined) return env
    if (defaultValue !== undefined) return defaultValue
    missingVars?.push(k)
    return match
  })
}

function expandTemplateDeep(
  value: unknown,
  pluginRoot: string | null,
  missingVars?: string[],
): unknown {
  if (typeof value === 'string')
    return expandTemplateString(value, pluginRoot, missingVars)
  if (Array.isArray(value))
    return value.map(v => expandTemplateDeep(v, pluginRoot, missingVars))
  if (isRecord(value)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = expandTemplateDeep(v, pluginRoot, missingVars)
    }
    return out
  }
  return value
}

function isAbsoluteLikePath(value: string): boolean {
  if (isAbsolute(value)) return true
  return /^[A-Za-z]:[\\/]/.test(value)
}

function isExecutableFile(filePath: string): boolean {
  try {
    const stat = statSync(filePath)
    if (!stat.isFile()) return false
    if (process.platform === 'win32') return true
    accessSync(filePath, constants.X_OK)
    return true
  } catch {
    return false
  }
}

export function resolveExecutableFromEnv(args: {
  command: string
  cwd: string
  env?: Record<string, string>
}): string | null {
  const command = String(args.command ?? '').trim()
  if (!command) return null

  // If a path is provided, resolve relative paths against the server cwd.
  if (
    command.includes('/') ||
    command.includes('\\') ||
    isAbsoluteLikePath(command)
  ) {
    const abs = isAbsoluteLikePath(command)
      ? command
      : resolve(args.cwd, command)
    return isExecutableFile(abs) ? abs : null
  }

  const pathValue = args.env?.PATH ?? process.env.PATH ?? ''
  const searchDirs = pathValue.split(delimiter).filter(Boolean)

  const isWin = process.platform === 'win32'
  const hasExtension = /\.[A-Za-z0-9]+$/.test(command)

  const pathextRaw = args.env?.PATHEXT ?? process.env.PATHEXT ?? ''
  const pathext = isWin
    ? pathextRaw
        .split(';')
        .map(s => s.trim())
        .filter(Boolean)
    : []

  const extensionsToTry =
    isWin && !hasExtension
      ? pathext.length > 0
        ? pathext
        : ['.EXE', '.CMD', '.BAT', '.COM']
      : ['']

  for (const dir of searchDirs) {
    for (const ext of extensionsToTry) {
      const candidate = join(dir, `${command}${ext}`)
      if (isExecutableFile(candidate)) return candidate
    }
  }

  return null
}

export function isLspServerRunnable(
  server: Pick<ResolvedLspServerConfig, 'command' | 'env' | 'workspaceFolder'>,
): boolean {
  const cwd =
    typeof server.workspaceFolder === 'string' && server.workspaceFolder.trim()
      ? resolve(server.workspaceFolder.trim())
      : process.cwd()
  const mergedEnv = buildLspServerProcessEnv({ cwd, env: server.env })
  return resolveExecutableFromEnv({
    command: server.command,
    cwd,
    env: mergedEnv,
  })
    ? true
    : false
}

export async function listRunnableLspServers(): Promise<
  ResolvedLspServerConfig[]
> {
  const servers = await listResolvedLspServers()
  return servers.filter(s => isLspServerRunnable(s))
}

const ExtensionKeySchema = z
  .string()
  .min(2)
  .refine(v => v.startsWith('.'), {
    message: 'File extensions must start with dot (e.g., ".ts", not "ts")',
  })

export const LspServerConfigSchema = z.strictObject({
  command: z
    .string()
    .min(1)
    .refine(
      cmd => {
        if (/\s/.test(cmd) && !isAbsoluteLikePath(cmd)) return false
        return true
      },
      {
        message:
          'Command should not contain spaces. Use args array for arguments.',
      },
    )
    .describe(
      'Command to execute the LSP server (e.g., "typescript-language-server")',
    ),
  args: z.array(z.string().min(1)).optional(),
  extensionToLanguage: z
    .record(ExtensionKeySchema, z.string().min(1))
    .refine(map => Object.keys(map).length > 0, {
      message: 'extensionToLanguage must have at least one mapping',
    }),
  transport: z.enum(['stdio', 'socket']).default('stdio'),
  env: z.record(z.string(), z.string()).optional(),
  initializationOptions: z.unknown().optional(),
  settings: z.unknown().optional(),
  workspaceFolder: z.string().optional(),
  startupTimeout: z.number().int().positive().optional(),
  shutdownTimeout: z.number().int().positive().optional(),
  restartOnCrash: z.boolean().optional(),
  maxRestarts: z.number().int().nonnegative().optional(),
})

export type LspServerConfig = z.infer<typeof LspServerConfigSchema>

function safeResolveWithin(rootDir: string, relPath: string): string | null {
  const trimmed = String(relPath ?? '').trim()
  if (!trimmed) return null
  if (isAbsolute(trimmed)) return null

  const normalized = trimmed.replace(/\\/g, '/')
  if (normalized.split('/').includes('..')) return null

  const abs = resolve(rootDir, trimmed)
  const rel = relative(rootDir, abs)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null
  return abs
}

function coerceLspServersRecord(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw)) return null
  const nested = raw['lspServers']
  if (isRecord(nested)) return nested
  return raw
}

function requireRecordTopLevel(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw)) return null
  return raw
}

const warnedMissingEnvVarKeys = new Set<string>()

function parseLspServersFromUnknown(
  raw: unknown,
  {
    pluginRoot,
    warnKeyPrefix,
  }: { pluginRoot: string | null; warnKeyPrefix: string },
): Record<string, LspServerConfig> {
  const rawServers = coerceLspServersRecord(raw)
  if (!rawServers) return {}

  const missingVars: string[] = []
  const out: Record<string, LspServerConfig> = {}
  for (const [name, cfg] of Object.entries(rawServers)) {
    const expanded = expandTemplateDeep(cfg, pluginRoot, missingVars)
    const parsedCfg = LspServerConfigSchema.safeParse(expanded)
    if (!parsedCfg.success) continue
    out[name] = parsedCfg.data
  }

  if (missingVars.length > 0) {
    const unique = Array.from(new Set(missingVars)).join(', ')
    const warnKey = `${warnKeyPrefix}:${unique}`
    if (!warnedMissingEnvVarKeys.has(warnKey)) {
      warnedMissingEnvVarKeys.add(warnKey)
      console.warn(
        `Missing environment variables in plugin LSP config: ${unique}`,
      )
    }
  }
  return out
}

function parseLspServersFromTopLevelRecord(
  rawServers: Record<string, unknown>,
  args: { pluginRoot: string | null; warnKeyPrefix: string },
): Record<string, LspServerConfig> {
  const missingVars: string[] = []
  const out: Record<string, LspServerConfig> = {}

  for (const [name, cfg] of Object.entries(rawServers)) {
    const expanded = expandTemplateDeep(cfg, args.pluginRoot, missingVars)
    const parsedCfg = LspServerConfigSchema.safeParse(expanded)
    if (!parsedCfg.success) continue
    out[name] = parsedCfg.data
  }

  if (missingVars.length > 0) {
    const unique = Array.from(new Set(missingVars)).join(', ')
    const warnKey = `${args.warnKeyPrefix}:${unique}`
    if (!warnedMissingEnvVarKeys.has(warnKey)) {
      warnedMissingEnvVarKeys.add(warnKey)
      console.warn(
        `Missing environment variables in plugin LSP config: ${unique}`,
      )
    }
  }

  return out
}

function loadLspServersFromFile(
  filePath: string,
  pluginRoot: string | null,
): Record<string, LspServerConfig> {
  const rawText = readFileSync(filePath, 'utf8')
  const parsed = JSON.parse(rawText)
  const topLevel = requireRecordTopLevel(parsed)
  if (!topLevel) return {}
  return parseLspServersFromTopLevelRecord(topLevel, {
    pluginRoot,
    warnKeyPrefix: filePath,
  })
}

function loadPluginLspServersFromRootFile(pluginRoot: string): {
  servers: Record<string, LspServerConfig>
  configPath: string
} | null {
  const configPath = join(pluginRoot, '.lsp.json')
  if (!existsSync(configPath)) return null

  try {
    const servers = loadLspServersFromFile(configPath, pluginRoot)
    return {
      servers,
      configPath,
    }
  } catch {
    return null
  }
}

function readPluginLspServers(plugin: SessionPlugin): Array<{
  name: string
  config: LspServerConfig
  source: LspServerSource
}> {
  const pluginRoot = plugin.rootDir

  const merged: Array<{
    name: string
    config: LspServerConfig
    source: LspServerSource
  }> = []

  const rootFile = loadPluginLspServersFromRootFile(pluginRoot)
  if (rootFile) {
    for (const [name, cfg] of Object.entries(rootFile.servers)) {
      merged.push({
        name,
        config: cfg,
        source: {
          kind: 'plugin',
          pluginName: plugin.name,
          pluginRoot,
          configPath: rootFile.configPath,
        },
      })
    }
  }

  if (isRecord(plugin.manifest) && plugin.manifest['lspServers']) {
    const manifestValue = plugin.manifest['lspServers']
    const sources = Array.isArray(manifestValue)
      ? manifestValue
      : [manifestValue]

    for (const entry of sources) {
      if (typeof entry === 'string') {
        const abs = safeResolveWithin(pluginRoot, entry)
        if (!abs) continue
        if (!existsSync(abs)) continue
        try {
          const servers = loadLspServersFromFile(abs, pluginRoot)
          for (const [name, cfg] of Object.entries(servers)) {
            merged.push({
              name,
              config: cfg,
              source: {
                kind: 'plugin',
                pluginName: plugin.name,
                pluginRoot,
                configPath: abs,
              },
            })
          }
        } catch {
          continue
        }
        continue
      }

      const inline = requireRecordTopLevel(entry)
      if (!inline) continue

      const servers = parseLspServersFromTopLevelRecord(inline, {
        pluginRoot,
        warnKeyPrefix: `plugin:${plugin.name}:manifest:lspServers`,
      })
      for (const [name, cfg] of Object.entries(servers)) {
        merged.push({
          name,
          config: cfg,
          source: {
            kind: 'plugin',
            pluginName: plugin.name,
            pluginRoot,
          },
        })
      }
    }
  }

  return merged
}

export async function listResolvedLspServers(): Promise<
  ResolvedLspServerConfig[]
> {
  const merged = new Map<
    string,
    { config: LspServerConfig; source: LspServerSource }
  >()

  for (const plugin of getSessionPlugins()) {
    for (const entry of readPluginLspServers(plugin)) {
      merged.set(entry.name, { config: entry.config, source: entry.source })
    }
  }

  const out: ResolvedLspServerConfig[] = []
  for (const [name, { config, source }] of merged.entries()) {
    const parsed = LspServerConfigSchema.safeParse(config)
    if (!parsed.success) continue

    const pluginRoot =
      source.kind === 'plugin' ? source.pluginRoot : (process.cwd() as string)
    const env = {
      [KODE_HOOK_ENV.pluginRoot]: pluginRoot,
      [LEGACY_ENV.pluginRoot]: pluginRoot,
      ...(parsed.data.env ?? {}),
    }

    out.push({
      name,
      ...parsed.data,
      env,
      source,
    })
  }

  return out
}

export function buildLspServerIndexFromServers(
  servers: ResolvedLspServerConfig[],
): LspServerIndex {
  const index = new Map<string, LspServerIndexEntry>()

  for (const server of servers) {
    const mapping = server.extensionToLanguage ?? {}
    for (const [ext, languageId] of Object.entries(mapping)) {
      if (!ext || !languageId) continue
      // Preserve the first matching server for a given extension.
      if (!index.has(ext))
        index.set(ext, { serverName: server.name, languageId })
    }
  }

  return index
}

export function lspServerForPath(
  serverIndex: LspServerIndex,
  filePath: string,
): LspServerIndexEntry | null {
  const ext = extname(filePath)
  if (!ext) return null
  return serverIndex.get(ext) ?? null
}

export function lspWorkspaceFolderForServer(
  server: ResolvedLspServerConfig,
): string {
  const configured =
    typeof server.workspaceFolder === 'string'
      ? server.workspaceFolder.trim()
      : ''
  const folder = configured ? configured : process.cwd()
  return resolve(folder)
}

export function lspRootUriForServer(server: ResolvedLspServerConfig): string {
  const folder = lspWorkspaceFolderForServer(server)
  return pathToFileURL(folder).href
}

export function lspWorkspaceFoldersForServer(
  server: ResolvedLspServerConfig,
): Array<{ uri: string; name: string }> {
  const folder = lspWorkspaceFolderForServer(server)
  return [{ uri: pathToFileURL(folder).href, name: basename(folder) }]
}
