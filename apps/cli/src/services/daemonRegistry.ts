import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join, posix, resolve, win32 } from 'node:path'

import { getKodeRoot } from '#config/dataRoots'

/**
 * The registry is deliberately a small local persistence primitive. Starting,
 * probing, and stopping daemon processes remain separate responsibilities.
 */
export const DAEMON_REGISTRY_SCHEMA_VERSION = 1 as const

export type DaemonRegistryEntry = {
  schemaVersion: typeof DAEMON_REGISTRY_SCHEMA_VERSION
  workspaceKey: string
  workspacePath: string
  pid: number
  url: string
  token: string
  versionSignature: string
  startedAt: number
  updatedAt: number
}

export type DaemonRegistryLookup =
  | { state: 'missing' }
  | { state: 'live'; entry: DaemonRegistryEntry }
  | { state: 'stale'; entry: DaemonRegistryEntry }
  | { state: 'corrupt' }

export type DaemonRegistryOptions = {
  /** Override only for tests or an explicitly isolated runtime. */
  registryPath?: string
  platform?: NodeJS.Platform
  now?: () => number
  isProcessAlive?: (pid: number) => boolean
}

type DaemonRegistryFile = {
  schemaVersion: typeof DAEMON_REGISTRY_SCHEMA_VERSION
  entries: Record<string, DaemonRegistryEntry>
}

type UpsertDaemonRegistryInput = {
  workspacePath: string
  pid: number
  url: string
  token: string
  versionSignature: string
  startedAt?: number
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isNonEmptyString(value: unknown, maxLength = 16_384): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= maxLength
  )
}

function parseRegistryEntry(value: unknown): DaemonRegistryEntry | null {
  if (!isRecord(value)) return null
  if (value.schemaVersion !== DAEMON_REGISTRY_SCHEMA_VERSION) return null
  if (
    !isNonEmptyString(value.workspaceKey) ||
    !isNonEmptyString(value.workspacePath) ||
    !isPositiveInteger(value.pid) ||
    !isNonEmptyString(value.url, 2_048) ||
    !isNonEmptyString(value.token, 4_096) ||
    !isNonEmptyString(value.versionSignature, 512) ||
    !isTimestamp(value.startedAt) ||
    !isTimestamp(value.updatedAt)
  ) {
    return null
  }

  try {
    const parsed = new URL(value.url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  } catch {
    return null
  }

  return {
    schemaVersion: DAEMON_REGISTRY_SCHEMA_VERSION,
    workspaceKey: value.workspaceKey,
    workspacePath: value.workspacePath,
    pid: value.pid,
    url: value.url,
    token: value.token,
    versionSignature: value.versionSignature,
    startedAt: value.startedAt,
    updatedAt: value.updatedAt,
  }
}

function parseRegistryFile(
  value: unknown,
  platform: NodeJS.Platform,
): DaemonRegistryFile | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== DAEMON_REGISTRY_SCHEMA_VERSION
  )
    return null
  if (!isRecord(value.entries)) return null

  const entries: Record<string, DaemonRegistryEntry> = {}
  for (const [key, entry] of Object.entries(value.entries)) {
    const parsed = parseRegistryEntry(entry)
    if (
      !parsed ||
      parsed.workspaceKey !== key ||
      parsed.workspaceKey !==
        normalizeDaemonWorkspaceKey(parsed.workspacePath, platform)
    ) {
      return null
    }
    entries[key] = parsed
  }

  return {
    schemaVersion: DAEMON_REGISTRY_SCHEMA_VERSION,
    entries,
  }
}

function emptyRegistry(): DaemonRegistryFile {
  return { schemaVersion: DAEMON_REGISTRY_SCHEMA_VERSION, entries: {} }
}

function safeUnlink(path: string): void {
  try {
    unlinkSync(path)
  } catch {
    // Cleanup must not hide the original registry persistence failure.
  }
}

function writeRegistryAtomically(
  path: string,
  value: DaemonRegistryFile,
): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  try {
    chmodSync(dirname(path), 0o700)
  } catch {
    // Windows does not provide POSIX owner bits. The registry file itself is
    // still created with restrictive permissions below.
  }
  const temporaryPath = `${path}.tmp.${process.pid}.${randomUUID()}`
  const content = `${JSON.stringify(value, null, 2)}\n`

  writeFileSync(temporaryPath, content, { encoding: 'utf8', mode: 0o600 })
  try {
    chmodSync(temporaryPath, 0o600)
  } catch {
    // Windows does not provide POSIX owner bits. The restrictive create mode
    // remains the best portable request and the caller retains the file ACL.
  }

  try {
    renameSync(temporaryPath, path)
    try {
      chmodSync(path, 0o600)
    } catch {
      // See the Windows note above.
    }
  } catch (error) {
    safeUnlink(temporaryPath)
    throw error
  }
}

function defaultProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code
    // EPERM still proves that a process with this PID exists.
    return code === 'EPERM'
  }
}

function canonicalWorkspacePath(
  value: string,
  platform: NodeJS.Platform,
): string {
  const raw = value.trim()
  if (!raw) throw new Error('Workspace path is required.')
  return platform === 'win32' ? win32.resolve(raw) : posix.resolve(raw)
}

/**
 * Produces a stable map key without exposing an implementation-specific file
 * name. Windows keys are case-insensitive and separator-normalized.
 */
export function normalizeDaemonWorkspaceKey(
  workspacePath: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const resolved = canonicalWorkspacePath(workspacePath, platform)
  if (platform === 'win32') {
    return win32.normalize(resolved).replace(/\\/g, '/').toLowerCase()
  }
  return posix.normalize(resolved)
}

export function getDaemonRegistryPath(rootDir: string = getKodeRoot()): string {
  return join(resolve(rootDir), 'daemon', 'registry.v1.json')
}

/**
 * Versioned registry keyed by a canonical workspace identity. It is intentionally
 * unaware of process spawning so `status` can remain side-effect free.
 */
export class DaemonRegistry {
  private readonly registryPath: string
  private readonly platform: NodeJS.Platform
  private readonly now: () => number
  private readonly isProcessAlive: (pid: number) => boolean

  constructor(options: DaemonRegistryOptions = {}) {
    this.registryPath = resolve(options.registryPath ?? getDaemonRegistryPath())
    this.platform = options.platform ?? process.platform
    this.now = options.now ?? (() => Date.now())
    this.isProcessAlive = options.isProcessAlive ?? defaultProcessAlive
  }

  get path(): string {
    return this.registryPath
  }

  lookup(workspacePath: string): DaemonRegistryLookup {
    const registry = this.read()
    if (registry === null) return { state: 'corrupt' }

    const key = normalizeDaemonWorkspaceKey(workspacePath, this.platform)
    const entry = registry.entries[key]
    if (!entry) return { state: 'missing' }

    const copy = clone(entry)
    return this.isProcessAlive(copy.pid)
      ? { state: 'live', entry: copy }
      : { state: 'stale', entry: copy }
  }

  upsert(input: UpsertDaemonRegistryInput): DaemonRegistryEntry {
    const registry = this.readForMutation()
    const workspacePath = canonicalWorkspacePath(
      input.workspacePath,
      this.platform,
    )
    const workspaceKey = normalizeDaemonWorkspaceKey(
      workspacePath,
      this.platform,
    )
    const now = this.now()
    const entry = this.createEntry({
      ...input,
      workspacePath,
      workspaceKey,
      updatedAt: now,
    })

    registry.entries[workspaceKey] = entry
    writeRegistryAtomically(this.registryPath, registry)
    return clone(entry)
  }

  remove(workspacePath: string): boolean {
    const registry = this.readForMutation()
    const key = normalizeDaemonWorkspaceKey(workspacePath, this.platform)
    if (!registry.entries[key]) return false
    delete registry.entries[key]
    writeRegistryAtomically(this.registryPath, registry)
    return true
  }

  private read(): DaemonRegistryFile | null {
    if (!existsSync(this.registryPath)) return emptyRegistry()
    try {
      return parseRegistryFile(
        JSON.parse(readFileSync(this.registryPath, 'utf8')),
        this.platform,
      )
    } catch {
      return null
    }
  }

  private readForMutation(): DaemonRegistryFile {
    const registry = this.read()
    if (registry === null) {
      throw new Error(
        `Daemon registry is corrupt and must be repaired before it can be changed: ${this.registryPath}`,
      )
    }
    return registry
  }

  private createEntry(
    args: UpsertDaemonRegistryInput & {
      workspacePath: string
      workspaceKey: string
      updatedAt: number
    },
  ): DaemonRegistryEntry {
    if (!isPositiveInteger(args.pid)) {
      throw new Error('Daemon pid must be a positive integer.')
    }
    if (!isNonEmptyString(args.token, 4_096)) {
      throw new Error('Daemon token is required.')
    }
    if (!isNonEmptyString(args.versionSignature, 512)) {
      throw new Error('Daemon version signature is required.')
    }
    if (!isTimestamp(args.updatedAt)) {
      throw new Error('Daemon registry clock returned an invalid timestamp.')
    }
    try {
      const parsed = new URL(args.url)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('unsupported protocol')
      }
    } catch {
      throw new Error('Daemon url must be an HTTP(S) URL.')
    }

    const startedAt = args.startedAt ?? args.updatedAt
    if (!isTimestamp(startedAt)) {
      throw new Error('Daemon startedAt must be a non-negative integer.')
    }

    return {
      schemaVersion: DAEMON_REGISTRY_SCHEMA_VERSION,
      workspaceKey: args.workspaceKey,
      workspacePath: args.workspacePath,
      pid: args.pid,
      url: args.url.trim(),
      token: args.token.trim(),
      versionSignature: args.versionSignature.trim(),
      startedAt,
      updatedAt: args.updatedAt,
    }
  }
}
