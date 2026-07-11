import { spawn } from 'node:child_process'

export type CodexLoginStatus =
  | { kind: 'authenticated' }
  | { kind: 'unauthenticated' }
  | { kind: 'unavailable' }

export type CodexAuthService = {
  getStatus(): Promise<CodexLoginStatus>
  startLogin(): Promise<void>
}

type CodexCommandResult = {
  exitCode: number | null
  stdout: string
  stderr: string
}

const STATUS_TIMEOUT_MS = 10_000

function getCodexCommand(): string {
  return process.platform === 'win32' ? 'codex.cmd' : 'codex'
}

function usesWindowsShell(): boolean {
  return process.platform === 'win32'
}

function runCodexStatus(): Promise<CodexCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(getCodexCommand(), ['login', 'status'], {
      shell: usesWindowsShell(),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      child.kill()
    }, STATUS_TIMEOUT_MS)

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', chunk => {
      stdout += chunk
    })
    child.stderr?.on('data', chunk => {
      stderr += chunk
    })
    child.once('error', error => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once('close', exitCode => {
      clearTimeout(timeout)
      if (timedOut) {
        reject(new Error('Timed out while checking Codex login status'))
        return
      }
      resolve({ exitCode, stdout, stderr })
    })
  })
}

export function parseCodexLoginStatus(
  result: CodexCommandResult,
): CodexLoginStatus {
  const output = `${result.stdout}\n${result.stderr}`.toLowerCase()

  if (
    output.includes('not logged in') ||
    output.includes('not authenticated') ||
    output.includes('no login')
  ) {
    return { kind: 'unauthenticated' }
  }

  if (result.exitCode === 0 && output.includes('logged in')) {
    return { kind: 'authenticated' }
  }

  return { kind: 'unavailable' }
}

export async function getCodexLoginStatus(): Promise<CodexLoginStatus> {
  try {
    return parseCodexLoginStatus(await runCodexStatus())
  } catch {
    return { kind: 'unavailable' }
  }
}

/**
 * Start the official Codex browser login without reading or copying its
 * credential cache. The detached process owns the browser callback and writes
 * credentials only through the Codex CLI's normal storage mechanism.
 */
export function startCodexLogin(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(getCodexCommand(), ['login'], {
      detached: true,
      shell: usesWindowsShell(),
      stdio: 'ignore',
      windowsHide: true,
    })

    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}

export const codexAuthService: CodexAuthService = {
  getStatus: getCodexLoginStatus,
  startLogin: startCodexLogin,
}
