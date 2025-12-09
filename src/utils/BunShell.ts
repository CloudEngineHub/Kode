import { existsSync } from 'fs'
import { isAbsolute, resolve } from 'path'
import { $ } from 'bun'
import { logError } from './log'

type ExecResult = {
  stdout: string
  stderr: string
  code: number
  interrupted: boolean
}

/**
 * BunShell - Modern shell implementation using Bun's native $ shell
 *
 * Uses Bun's built-in cross-platform shell:
 * - Automatically handles Windows/Unix differences
 * - No need for platform detection
 * - Simple template literal syntax
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
   * Execute a command in the current working directory
   * Uses Bun's native $ shell for cross-platform compatibility
   */
  async exec(
    command: string,
    abortSignal?: AbortSignal,
    timeout?: number,
  ): Promise<ExecResult> {
    const DEFAULT_TIMEOUT = 30 * 60 * 1000 // 30 minutes
    const commandTimeout = timeout || DEFAULT_TIMEOUT

    this.commandInterrupted = false
    this.abortController = new AbortController()

    const handleAbort = () => {
      this.commandInterrupted = true
      this.abortController?.abort()
    }

    if (abortSignal) {
      abortSignal.addEventListener('abort', handleAbort)
    }

    const timeoutId = setTimeout(() => {
      this.commandInterrupted = true
      this.abortController?.abort()
    }, commandTimeout)

    try {
      // Use Bun's native $ shell - cross-platform by design
      const result = await $`${{ raw: command }}`.cwd(this.cwd).nothrow().quiet()

      clearTimeout(timeoutId)

      return {
        stdout: result.stdout.toString(),
        stderr: this.commandInterrupted
          ? `${result.stderr.toString()}\nCommand execution timed out or was interrupted`
          : result.stderr.toString(),
        code: this.commandInterrupted ? 143 : result.exitCode,
        interrupted: this.commandInterrupted,
      }
    } catch (error) {
      clearTimeout(timeoutId)

      const errorStr = error instanceof Error
        ? error.message
        : String(error || 'Unknown error')

      logError(`Shell execution error: ${errorStr}`)

      return {
        stdout: '',
        stderr: errorStr,
        code: 2,
        interrupted: this.commandInterrupted,
      }
    } finally {
      if (abortSignal) {
        abortSignal.removeEventListener('abort', handleAbort)
      }
      this.abortController = null
    }
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
    this.commandInterrupted = true
    this.abortController?.abort()
  }

  close(): void {
    this.isAlive = false
    this.abortController?.abort()
  }
}
