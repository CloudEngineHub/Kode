import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import type { DaemonProcessController } from './daemonSupervisor'

export type DaemonEntrypoint = {
  path: string
  kind: 'compiled' | 'source'
}

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

function findPackageRoot(
  startPath: string,
  exists: (path: string) => boolean,
): string {
  let current = resolve(startPath)
  for (let depth = 0; depth < 25; depth += 1) {
    if (exists(join(current, 'package.json'))) return current
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return resolve(startPath)
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
    : findPackageRoot(dirname(invocationPath || process.cwd()), exists)
  const compiled = join(packageRoot, 'dist', 'entrypoints', 'daemon.js')
  if (exists(compiled)) return { path: compiled, kind: 'compiled' }

  const source = join(
    packageRoot,
    'apps',
    'cli',
    'src',
    'entrypoints',
    'daemon.ts',
  )
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

export function redactDaemonUrl(value: string): string {
  const url = new URL(value)
  url.searchParams.delete('token')
  return url.toString()
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
      const candidates = stdout.match(/https?:\/\/[^\s]+/g) ?? []
      for (const candidate of candidates) {
        try {
          const url = new URL(candidate)
          if (url.protocol !== 'http:' && url.protocol !== 'https:') continue
          succeed(redactDaemonUrl(url.toString()))
          return
        } catch {
          // Continue until the daemon prints a complete URL.
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
      fail(new Error('Timed out waiting for daemon startup URL.'))
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
        [entrypoint.path, '--cwd', args.cwd, '--token', args.token],
        {
          cwd: args.cwd,
          detached: true,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            ...process.env,
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
        const target = new URL('/api/health', args.url)
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
