import { existsSync } from 'fs'
import { randomUUID } from 'crypto'
import { isAbsolute, resolve } from 'path'
import { logError } from './log'

type ExecResult = {
  stdout: string
  stderr: string
  code: number
  interrupted: boolean
}

type BackgroundProcess = {
  id: string
  command: string
  stdout: string
  stderr: string
  stdoutCursor: number
  stderrCursor: number
  code: number | null
  interrupted: boolean
  killed: boolean
  timedOut: boolean
  startedAt: number
  timeoutAt: number
  process: ReturnType<typeof Bun.spawn>
  abortController: AbortController
  timeoutHandle: ReturnType<typeof setTimeout> | null
  cwd: string
}

/**
 * BunShell - Cross-platform shell using Bun.spawn with proper timeout support
 *
 * Uses Bun.spawn for:
 * - Cross-platform compatibility (auto-detects sh/cmd)
 * - AbortSignal support for timeout/cancellation
 * - Proper process termination
 */
export class BunShell {
  private cwd: string
  private isAlive: boolean = true
  private currentProcess: ReturnType<typeof Bun.spawn> | null = null
  private abortController: AbortController | null = null
  private backgroundProcesses: Map<string, BackgroundProcess> = new Map()

  constructor(cwd: string) {
    this.cwd = cwd
  }

  private static instance: BunShell | null = null

  static restart() {
    if (BunShell.instance) {
      BunShell.instance.close()
      BunShell.instance = null
    }
  }

  static getInstance(): BunShell {
    if (!BunShell.instance || !BunShell.instance.isAlive) {
      BunShell.instance = new BunShell(process.cwd())
    }
    return BunShell.instance
  }

  private getShellCmd(command: string): string[] {
    return process.platform === 'win32'
      ? ['cmd', '/c', command]
      : ['sh', '-c', command]
  }

  private startStreamReader(
    stream: ReadableStream | null,
    append: (chunk: string) => void,
  ): void {
    if (!stream) return
    const reader = (stream as ReadableStream).getReader()
    const decoder = new TextDecoder()
    ;(async () => {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value) {
            append(typeof value === 'string' ? value : decoder.decode(value))
          }
        }
      } catch (err) {
        logError(`Stream read error: ${err}`)
      }
    })()
  }

  async exec(
    command: string,
    abortSignal?: AbortSignal,
    timeout?: number,
  ): Promise<ExecResult> {
    const DEFAULT_TIMEOUT = 120_000
    const commandTimeout = timeout ?? DEFAULT_TIMEOUT

    this.abortController = new AbortController()

    // Link external abort signal
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        this.abortController?.abort()
        this.currentProcess?.kill()
      })
    }

    try {
      this.currentProcess = Bun.spawn({
        cmd: this.getShellCmd(command),
        cwd: this.cwd,
        stdout: 'pipe',
        stderr: 'pipe',
      })

      // Use Promise.race for real timeout - don't trust signal option alone
      const timeoutPromise = new Promise<'timeout'>((resolve) => {
        setTimeout(() => resolve('timeout'), commandTimeout)
      })

      const result = await Promise.race([
        this.currentProcess.exited.then(() => 'completed' as const),
        timeoutPromise,
      ])

      if (result === 'timeout') {
        // Actually kill the process
        this.currentProcess.kill()
        this.abortController.abort()
        return {
          stdout: '',
          stderr: 'Command timed out',
          code: 143,
          interrupted: true,
        }
      }

      // Process completed normally - stdout/stderr are ReadableStream when piped
      const stdout = await Bun.readableStreamToText(
        this.currentProcess.stdout as ReadableStream,
      )
      const stderr = await Bun.readableStreamToText(
        this.currentProcess.stderr as ReadableStream,
      )
      const exitCode = this.currentProcess.exitCode ?? 0

      return {
        stdout,
        stderr,
        code: exitCode,
        interrupted: false,
      }
    } catch (error) {
      // Handle external abort
      if (this.abortController.signal.aborted) {
        this.currentProcess?.kill()
        return {
          stdout: '',
          stderr: 'Command was interrupted',
          code: 143,
          interrupted: true,
        }
      }

      const errorStr = error instanceof Error ? error.message : String(error)
      logError(`Shell execution error: ${errorStr}`)

      return {
        stdout: '',
        stderr: errorStr,
        code: 2,
        interrupted: false,
      }
    } finally {
      this.currentProcess = null
      this.abortController = null
    }
  }

  execInBackground(command: string, timeout?: number): { bashId: string } {
    const DEFAULT_TIMEOUT = 120_000
    const commandTimeout = timeout ?? DEFAULT_TIMEOUT
    const abortController = new AbortController()
    const process = Bun.spawn({
      cmd: this.getShellCmd(command),
      cwd: this.cwd,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const bashId = randomUUID()
    const timeoutHandle = setTimeout(() => {
      abortController.abort()
      backgroundProcess.timedOut = true
      process.kill()
    }, commandTimeout)

    const backgroundProcess: BackgroundProcess = {
      id: bashId,
      command,
      stdout: '',
      stderr: '',
      stdoutCursor: 0,
      stderrCursor: 0,
      code: null,
      interrupted: false,
      killed: false,
      timedOut: false,
      startedAt: Date.now(),
      timeoutAt: Date.now() + commandTimeout,
      process,
      abortController,
      timeoutHandle,
      cwd: this.cwd,
    }

    this.startStreamReader(process.stdout as ReadableStream, chunk => {
      backgroundProcess.stdout += chunk
    })
    this.startStreamReader(process.stderr as ReadableStream, chunk => {
      backgroundProcess.stderr += chunk
    })

    process.exited.then(() => {
      backgroundProcess.code = process.exitCode ?? 0
      backgroundProcess.interrupted =
        backgroundProcess.interrupted || abortController.signal.aborted
      if (backgroundProcess.timeoutHandle) {
        clearTimeout(backgroundProcess.timeoutHandle)
        backgroundProcess.timeoutHandle = null
      }
    })

    this.backgroundProcesses.set(bashId, backgroundProcess)
    return { bashId }
  }

  /**
   * Return current buffered output for a background command WITHOUT consuming it.
   * Prefer `readBackgroundOutput()` for Claude-style "only new output" semantics.
   */
  getBackgroundOutput(shellId: string):
    | {
        stdout: string
        stderr: string
        code: number | null
        interrupted: boolean
        killed: boolean
        timedOut: boolean
        running: boolean
        command: string
        cwd: string
        startedAt: number
        timeoutAt: number
      }
    | null {
    const proc = this.backgroundProcesses.get(shellId)
    if (!proc) return null
    const running = proc.code === null && !proc.interrupted
    return {
      stdout: proc.stdout,
      stderr: proc.stderr,
      code: proc.code,
      interrupted: proc.interrupted,
      killed: proc.killed,
      timedOut: proc.timedOut,
      running,
      command: proc.command,
      cwd: proc.cwd,
      startedAt: proc.startedAt,
      timeoutAt: proc.timeoutAt,
    }
  }

  /**
   * Return ONLY new output since the last read and consume it.
   * If `filter` is provided, only matching lines are returned and non-matching
   * lines are discarded (not available for future reads).
   */
  readBackgroundOutput(
    bashId: string,
    options?: { filter?: string },
  ):
    | {
        shellId: string
        command: string
        cwd: string
        startedAt: number
        timeoutAt: number
        status: 'running' | 'completed' | 'failed' | 'killed'
        exitCode: number | null
        stdout: string
        stderr: string
        stdoutLines: number
        stderrLines: number
        filterPattern?: string
      }
    | null {
    const proc = this.backgroundProcesses.get(bashId)
    if (!proc) return null

    const stdoutDelta = proc.stdout.slice(proc.stdoutCursor)
    const stderrDelta = proc.stderr.slice(proc.stderrCursor)

    // Consume all new output (Claude semantics: only new output since last check)
    proc.stdoutCursor = proc.stdout.length
    proc.stderrCursor = proc.stderr.length

    const stdoutLines = stdoutDelta === '' ? 0 : stdoutDelta.split('\n').length
    const stderrLines = stderrDelta === '' ? 0 : stderrDelta.split('\n').length

    let stdoutToReturn = stdoutDelta
    let stderrToReturn = stderrDelta

    const filter = options?.filter?.trim()
    if (filter) {
      const regex = new RegExp(filter, 'i')
      stdoutToReturn = stdoutDelta
        .split('\n')
        .filter(line => regex.test(line))
        .join('\n')
      stderrToReturn = stderrDelta
        .split('\n')
        .filter(line => regex.test(line))
        .join('\n')
    }

    const status: 'running' | 'completed' | 'failed' | 'killed' = proc.killed
      ? 'killed'
      : proc.code === null
        ? 'running'
        : proc.code === 0
          ? 'completed'
          : 'failed'

    return {
      shellId: bashId,
      command: proc.command,
      cwd: proc.cwd,
      startedAt: proc.startedAt,
      timeoutAt: proc.timeoutAt,
      status,
      exitCode: proc.code,
      stdout: stdoutToReturn,
      stderr: stderrToReturn,
      stdoutLines,
      stderrLines,
      ...(filter ? { filterPattern: filter } : {}),
    }
  }

  killBackgroundShell(shellId: string): boolean {
    const proc = this.backgroundProcesses.get(shellId)
    if (!proc) return false
    try {
      proc.interrupted = true
      proc.killed = true
      proc.abortController.abort()
      proc.process.kill()
      if (proc.timeoutHandle) {
        clearTimeout(proc.timeoutHandle)
        proc.timeoutHandle = null
      }
      return true
    } catch {
      return false
    }
  }

  listBackgroundShells(): BackgroundProcess[] {
    return Array.from(this.backgroundProcesses.values())
  }

  pwd(): string {
    return this.cwd
  }

  async setCwd(cwd: string) {
    const resolved = isAbsolute(cwd) ? cwd : resolve(this.cwd, cwd)
    if (!existsSync(resolved)) {
      throw new Error(`Path "${resolved}" does not exist`)
    }
    this.cwd = resolved
  }

  killChildren() {
    this.abortController?.abort()
    this.currentProcess?.kill()
    for (const bg of Array.from(this.backgroundProcesses.keys())) {
      this.killBackgroundShell(bg)
    }
  }

  close(): void {
    this.isAlive = false
    this.killChildren()
  }
}
