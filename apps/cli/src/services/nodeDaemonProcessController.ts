import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { DaemonProcessController } from './daemonSupervisor'

export type DaemonEntrypoint = {
  path: string
  kind: 'compiled' | 'source'
}

const COMPILED_DAEMON_SUFFIX = join('dist', 'entrypoints', 'daemon.js')
const SOURCE_DAEMON_SUFFIX = join(
  'apps',
  'cli',
  'src',
  'entrypoints',
  'daemon.ts',
)

export type NodeDaemonProcessControllerOptions = {
  daemonEntrypoint?: string
  runtimePath?: string
  packageRoot?: string
  startTimeoutMs?: number
  probeTimeoutMs?: number
  stopTimeoutMs?: number
  pollIntervalMs?: number
  spawnProcess?: typeof spawn
  fetchImpl?: typeof fetch
  sleep?: (milliseconds: number) => Promise<void>
}

type ResolveDaemonEntrypointOptions = {
  daemonEntrypoint?: string
  packageRoot?: string
  invocationPath?: string
  isBunRuntime?: boolean
  exists?: (path: string) => boolean
}

function isBunRuntime(): boolean {
  return typeof process.versions.bun === 'string'
}

function findDaemonPackageRoot(
  startPath: string,
  exists: (path: string) => boolean,
): string | null {
  let current = resolve(startPath)
  for (let depth = 0; depth < 25; depth += 1) {
    if (
      exists(join(current, 'dist', 'entrypoints', 'daemon.js')) ||
      exists(join(current, 'apps', 'cli', 'src', 'entrypoints', 'daemon.ts'))
    ) {
      return current
    }
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return null
}

/**
 * Resolves a launchable daemon entrypoint without trusting the caller's CWD.
 * Packaged installations use dist; source entrypoints require a Bun runtime.
 */
export function resolveDaemonEntrypoint(
  options: ResolveDaemonEntrypointOptions = {},
): DaemonEntrypoint {
  const exists = options.exists ?? existsSync
  const explicit = options.daemonEntrypoint?.trim()
  if (explicit) {
    const path = resolve(explicit)
    if (!exists(path)) {
      throw new Error(`Configured daemon entrypoint does not exist: ${path}`)
    }
    const kind = path.endsWith('.ts') ? 'source' : 'compiled'
    if (kind === 'source' && !(options.isBunRuntime ?? isBunRuntime())) {
      throw new Error(
        'The source daemon entrypoint requires Bun. Build the package before using kode daemon.',
      )
    }
    return { path, kind }
  }

  const invocationPath = options.invocationPath ?? process.argv[1]
  const packageRoot = options.packageRoot
    ? resolve(options.packageRoot)
    : [
        invocationPath ? dirname(invocationPath) : null,
        dirname(fileURLToPath(import.meta.url)),
        process.cwd(),
      ]
        .filter((candidate): candidate is string => Boolean(candidate))
        .map(candidate => findDaemonPackageRoot(candidate, exists))
        .find((candidate): candidate is string => candidate !== null)
  if (!packageRoot) {
    throw new Error('Unable to locate a daemon package root.')
  }
  const source = join(
    packageRoot,
    'apps',
    'cli',
    'src',
    'entrypoints',
    'daemon.ts',
  )
  const invokedFromSource = Boolean(
    !options.packageRoot && invocationPath?.toLowerCase().endsWith('.ts'),
  )
  if (invokedFromSource && exists(source)) {
    if (!(options.isBunRuntime ?? isBunRuntime())) {
      throw new Error(
        'The source daemon entrypoint requires Bun. Build the package before using kode daemon.',
      )
    }
    return { path: source, kind: 'source' }
  }

  const compiled = join(packageRoot, 'dist', 'entrypoints', 'daemon.js')
  if (exists(compiled)) return { path: compiled, kind: 'compiled' }

  if (exists(source)) {
    if (!(options.isBunRuntime ?? isBunRuntime())) {
      throw new Error(
        'The source daemon entrypoint requires Bun. Build the package before using kode daemon.',
      )
    }
    return { path: source, kind: 'source' }
  }

  throw new Error(
    `Unable to locate a daemon entrypoint under package root: ${packageRoot}`,
  )
}

/**
 * Source entrypoints rely on the package's import aliases, so they must not
 * inherit the target workspace as their process CWD. The daemon receives the
 * target workspace explicitly through `--cwd` instead.
 */
export function daemonEntrypointWorkingDirectory(
  entrypoint: DaemonEntrypoint,
): string {
  const normalizedPath = resolve(entrypoint.path)
  const suffix =
    entrypoint.kind === 'compiled'
      ? COMPILED_DAEMON_SUFFIX
      : SOURCE_DAEMON_SUFFIX
  const comparablePath =
    process.platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath
  const comparableSuffix =
    process.platform === 'win32' ? suffix.toLowerCase() : suffix
  if (comparablePath.endsWith(comparableSuffix)) {
    return resolve(normalizedPath.slice(0, -suffix.length))
  }
  return dirname(normalizedPath)
}

export function redactDaemonUrl(value: string): string {
  const url = new URL(value)
  url.searchParams.delete('token')
  return url.toString()
}

const DAEMON_READY_PREFIX = 'KODE_DAEMON_READY '

function normalizeLoopbackDaemonUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (
      url.protocol !== 'http:' ||
      url.hostname !== '127.0.0.1' ||
      !url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== '' && url.pathname !== '/')
    ) {
      return null
    }
    return url.toString()
  } catch {
    return null
  }
}

/**
 * The child daemon emits a single structured readiness line. Restricting it
 * to an explicit loopback endpoint prevents child stdout from steering a
 * bearer-token health probe to an arbitrary host.
 */
export function parseDaemonReadyUrl(value: string): string | null {
  const line = value.trim()
  if (!line.startsWith(DAEMON_READY_PREFIX)) return null

  try {
    const payload: unknown = JSON.parse(line.slice(DAEMON_READY_PREFIX.length))
    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload) ||
      (payload as { type?: unknown }).type !== 'kode-daemon-ready' ||
      typeof (payload as { url?: unknown }).url !== 'string'
    ) {
      return null
    }
    return normalizeLoopbackDaemonUrl((payload as { url: string }).url)
  } catch {
    return null
  }
}

function redactDaemonOutput(value: string): string {
  return value.replace(/([?&]token=)[^&\s]+/gi, '$1[redacted]')
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException | undefined)?.code === 'EPERM'
  }
}

function waitForDaemonUrl(args: {
  child: ChildProcess
  timeoutMs: number
}): Promise<string> {
  return new Promise((resolveUrl, reject) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    const maxOutput = 32_768
    let timer: ReturnType<typeof setTimeout> | null = null

    const cleanup = () => {
      if (timer) clearTimeout(timer)
      args.child.stdout?.removeListener('data', onStdout)
      args.child.stderr?.removeListener('data', onStderr)
      args.child.removeListener('error', onError)
      args.child.removeListener('exit', onExit)
    }

    const fail = (error: Error) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }

    const succeed = (url: string) => {
      if (settled) return
      settled = true
      cleanup()
      resolveUrl(url)
    }

    const tryReadUrl = () => {
      for (const line of stdout.split(/\r?\n/)) {
        const url = parseDaemonReadyUrl(line)
        if (url) {
          succeed(url)
          return
        }
      }
    }

    const onStdout = (chunk: Buffer | string) => {
      stdout = `${stdout}${String(chunk)}`.slice(-maxOutput)
      tryReadUrl()
    }
    const onStderr = (chunk: Buffer | string) => {
      stderr = `${stderr}${String(chunk)}`.slice(-maxOutput)
    }
    const onError = (error: Error) => fail(error)
    const onExit = (code: number | null) => {
      const detail = stderr.trim()
        ? `: ${redactDaemonOutput(stderr.trim())}`
        : ''
      fail(
        new Error(
          `Daemon exited before becoming healthy (${code ?? 'unknown'})${detail}`,
        ),
      )
    }

    args.child.stdout?.on('data', onStdout)
    args.child.stderr?.on('data', onStderr)
    args.child.once('error', onError)
    args.child.once('exit', onExit)
    timer = setTimeout(() => {
      fail(new Error('Timed out waiting for daemon readiness record.'))
    }, args.timeoutMs)
  })
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function fetchWithTimeout(args: {
  fetchImpl: typeof fetch
  url: URL
  timeoutMs: number
  headers: Record<string, string>
}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), args.timeoutMs)
  try {
    return await args.fetchImpl(args.url, {
      headers: args.headers,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Production adapter for a locally installed Node/Bun daemon entrypoint. The
 * supervisor keeps lifecycle policy; this adapter owns only spawn/probe/kill.
 */
export function createNodeDaemonProcessController(
  options: NodeDaemonProcessControllerOptions = {},
): DaemonProcessController {
  const spawnProcess = options.spawnProcess ?? spawn
  const fetchImpl = options.fetchImpl ?? fetch
  const sleep = options.sleep ?? defaultSleep
  const entrypoint = resolveDaemonEntrypoint({
    daemonEntrypoint:
      options.daemonEntrypoint ?? process.env.KODE_DAEMON_ENTRYPOINT,
    packageRoot: options.packageRoot,
  })
  const runtimePath = options.runtimePath ?? process.execPath
  const startTimeoutMs = Math.max(1_000, options.startTimeoutMs ?? 15_000)
  const probeTimeoutMs = Math.max(100, options.probeTimeoutMs ?? 2_000)
  const stopTimeoutMs = Math.max(100, options.stopTimeoutMs ?? 5_000)
  const pollIntervalMs = Math.max(20, options.pollIntervalMs ?? 100)

  return {
    async launch(args) {
      const child = spawnProcess(
        runtimePath,
        [entrypoint.path, '--host', '127.0.0.1', '--cwd', args.cwd],
        {
          cwd: daemonEntrypointWorkingDirectory(entrypoint),
          detached: true,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            ...process.env,
            KODE_DAEMON_TOKEN: args.token,
            KODE_DAEMON_VERSION_SIGNATURE: args.versionSignature,
          },
        },
      )
      if (!child.pid) {
        throw new Error('Daemon process did not provide a PID.')
      }

      try {
        const url = await waitForDaemonUrl({
          child,
          timeoutMs: startTimeoutMs,
        })
        child.stdout?.destroy()
        child.stderr?.destroy()
        child.unref()
        return { pid: child.pid, url }
      } catch (error) {
        try {
          child.kill()
        } catch {
          // A failed startup must still surface its original diagnostic.
        }
        throw error
      }
    },

    async probe(args) {
      try {
        const trustedUrl = normalizeLoopbackDaemonUrl(args.url)
        if (!trustedUrl) return false
        const target = new URL('/api/health', trustedUrl)
        target.search = ''
        const response = await fetchWithTimeout({
          fetchImpl,
          url: target,
          timeoutMs: probeTimeoutMs,
          headers: { authorization: `Bearer ${args.token}` },
        })
        if (!response.ok) return false
        const body: unknown = await response.json().catch(() => null)
        return Boolean(
          body &&
          typeof body === 'object' &&
          (body as { ok?: unknown }).ok === true,
        )
      } catch {
        return false
      }
    },

    async stop(args) {
      if (!isPidAlive(args.pid)) return true
      try {
        process.kill(args.pid, 'SIGTERM')
      } catch (error) {
        if ((error as NodeJS.ErrnoException | undefined)?.code === 'ESRCH') {
          return true
        }
        return false
      }

      const deadline = Date.now() + stopTimeoutMs
      while (Date.now() < deadline) {
        if (!isPidAlive(args.pid)) return true
        await sleep(pollIntervalMs)
      }

      try {
        process.kill(args.pid, 'SIGKILL')
      } catch (error) {
        if ((error as NodeJS.ErrnoException | undefined)?.code === 'ESRCH') {
          return true
        }
        return false
      }

      const forceDeadline = Date.now() + stopTimeoutMs
      while (Date.now() < forceDeadline) {
        if (!isPidAlive(args.pid)) return true
        await sleep(pollIntervalMs)
      }
      return !isPidAlive(args.pid)
    },
  }
}
