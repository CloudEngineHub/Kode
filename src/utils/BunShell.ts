import { existsSync } from 'fs'
import { isAbsolute, resolve } from 'path'
import { logError } from './log'

type ExecResult = {
  stdout: string
  stderr: string
  code: number
  interrupted: boolean
}

/**
 * BunShell - Modern shell implementation using Bun's native shell
 *
 * Advantages over PersistentShell:
 * - Cross-platform (auto-detects sh/cmd)
 * - Simpler implementation (~150 lines vs 550 lines)
 * - No temporary file IPC overhead
 * - Faster execution (no shell startup cost per command)
 */
export class BunShell {
  private cwd: string
  private isAlive: boolean = true
  private commandInterrupted: boolean = false
  private abortController: AbortController | null = null

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

  /**
   * Get shell command for current platform
   */
  private getShellCommand(command: string): string[] {
    if (process.platform === 'win32') {
      return ['cmd', '/c', command]
    }
    return ['sh', '-c', command]
  }

  /**
   * Execute a command in the current working directory
   *
   * @param command - The shell command to execute
   * @param abortSignal - Optional AbortSignal for cancellation
   * @param timeout - Optional timeout in milliseconds (default: 30 minutes)
   */
  async exec(
    command: string,
    abortSignal?: AbortSignal,
    timeout?: number,
  ): Promise<ExecResult> {
    const DEFAULT_TIMEOUT = 30 * 60 * 1000 // 30 minutes
    const commandTimeout = timeout || DEFAULT_TIMEOUT

    // Reset interrupted state for new command
    this.commandInterrupted = false

    // Create a new AbortController that combines timeout and external signal
    this.abortController = new AbortController()

    // Handle external abort signal
    const handleAbort = () => {
      this.commandInterrupted = true
      this.abortController?.abort()
    }

    if (abortSignal) {
      abortSignal.addEventListener('abort', handleAbort)
    }

    // Set up timeout
    const timeoutId = setTimeout(() => {
      this.commandInterrupted = true
      this.abortController?.abort()
    }, commandTimeout)

    // Track interval for cleanup
    let checkInterval: ReturnType<typeof setInterval> | null = null

    try {
      // Cross-platform shell command
      const shellCmd = this.getShellCommand(command)
      const proc = Bun.spawn({
        cmd: shellCmd,
        cwd: this.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      const commandPromise = proc.exited.then(
        async () => {
          // Clear interval when command completes normally
          if (checkInterval) {
            clearInterval(checkInterval)
            checkInterval = null
          }

          const stdout = await Bun.readableStreamToText(proc.stdout)
          const stderr = await Bun.readableStreamToText(proc.stderr)

          return {
            stdout: stdout || '',
            stderr: this.commandInterrupted
              ? `${stderr}\nCommand execution timed out or was interrupted`
              : stderr || '',
            code: proc.exitCode || 0,
            interrupted: this.commandInterrupted,
          }
        },
      )

      // Wait for either the command or timeout
      const result = await Promise.race([
        commandPromise,
        new Promise<ExecResult>((resolve) => {
          checkInterval = setInterval(() => {
            if (this.commandInterrupted) {
              if (checkInterval) {
                clearInterval(checkInterval)
                checkInterval = null
              }
              proc.kill()
              resolve({
                stdout: '',
                stderr: 'Command was interrupted',
                code: 143,
                interrupted: true,
              })
            }
          }, 100)
        }),
      ])

      clearTimeout(timeoutId)
      // Ensure interval is cleaned up
      if (checkInterval) {
        clearInterval(checkInterval)
        checkInterval = null
      }
      return result
    } catch (error) {
      clearTimeout(timeoutId)
      // Ensure interval is cleaned up on error
      if (checkInterval) {
        clearInterval(checkInterval)
        checkInterval = null
      }

      // Handle syntax errors and other execution failures
      const errorStr = error instanceof Error
        ? error.message
        : String(error || 'Unknown error')

      logError(`Shell execution error: ${errorStr}`)

      return {
        stdout: '',
        stderr: errorStr,
        code: 2, // Standard error exit code
        interrupted: this.commandInterrupted,
      }
    } finally {
      if (abortSignal) {
        abortSignal.removeEventListener('abort', handleAbort)
      }
      this.abortController = null
    }
  }

  /**
   * Get current working directory
   */
  pwd(): string {
    return this.cwd
  }

  /**
   * Change working directory
   *
   * @param cwd - Absolute or relative path to new directory
   */
  async setCwd(cwd: string) {
    const resolved = isAbsolute(cwd) ? cwd : resolve(this.cwd, cwd)

    if (!existsSync(resolved)) {
      throw new Error(`Path "${resolved}" does not exist`)
    }

    this.cwd = resolved
  }

  /**
   * Interrupt currently running command
   */
  killChildren() {
    this.commandInterrupted = true
    this.abortController?.abort()
  }

  /**
   * Close shell instance
   */
  close(): void {
    this.isAlive = false
    this.abortController?.abort()
  }
}
