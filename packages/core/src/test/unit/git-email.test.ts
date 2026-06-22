import { beforeEach, describe, expect, mock, test } from 'bun:test'

type ExecResult = { stdout: string; stderr: string; code: number }
type ExecArgs = [string, string[], AbortSignal?, number?, boolean?]

let execResult: ExecResult = { stdout: '', stderr: '', code: 0 }
let execCalls: ExecArgs[] = []
let logErrorCalls: unknown[] = []
let execImpl: (...args: ExecArgs) => Promise<ExecResult> = async () =>
  execResult

mock.module('#core/utils/execFileNoThrow', () => ({
  execFileNoThrow: async (...args: ExecArgs): Promise<ExecResult> => {
    execCalls.push(args)
    return execImpl(...args)
  },
}))

mock.module('#core/utils/log', () => ({
  SESSION_ID: 'test-session',
  logError: (error: unknown) => {
    logErrorCalls.push(error)
  },
}))

const { getGitEmail } = await import('#core/utils/user')
const { getGitStatus } = await import('#core/context')
const { getIsGit } = await import('#core/utils/git')

describe('getGitEmail', () => {
  beforeEach(() => {
    execResult = { stdout: '', stderr: '', code: 0 }
    execCalls = []
    logErrorCalls = []
    execImpl = async () => execResult
    ;(getGitEmail as any).cache?.clear?.()
    ;(getGitStatus as any).cache?.clear?.()
    ;(getIsGit as any).cache?.clear?.()
  })

  test('returns trimmed configured git email', async () => {
    execResult = {
      stdout: 'alice@example.com\n',
      stderr: '',
      code: 0,
    }

    await expect(getGitEmail()).resolves.toBe('alice@example.com')
    expect(execCalls[0]?.[0]).toBe('git')
    expect(execCalls[0]?.[1]).toEqual(['config', '--get', 'user.email'])
    expect(logErrorCalls).toEqual([])
  })

  test('treats missing git email as optional configuration', async () => {
    execResult = {
      stdout: '',
      stderr: '',
      code: 1,
    }

    await expect(getGitEmail()).resolves.toBeUndefined()
    expect(logErrorCalls).toEqual([])
  })

  test('logs real git config failures', async () => {
    execResult = {
      stdout: '',
      stderr: 'fatal: not in a git directory',
      code: 128,
    }

    await expect(getGitEmail()).resolves.toBeUndefined()
    expect(logErrorCalls).toHaveLength(1)
    expect(String(logErrorCalls[0])).toContain('Failed to get git email')
    expect(String(logErrorCalls[0])).toContain('fatal: not in a git directory')
  })

  test('git status skips author log when git email is unset', async () => {
    execImpl = async (_file, args) => {
      const command = args.join(' ')
      if (command === 'rev-parse --is-inside-work-tree') {
        return { stdout: 'true\n', stderr: '', code: 0 }
      }
      if (command === 'config --get user.email') {
        return { stdout: '', stderr: '', code: 1 }
      }
      if (command === 'branch --show-current') {
        return { stdout: 'main\n', stderr: '', code: 0 }
      }
      if (command === 'rev-parse --abbrev-ref origin/HEAD') {
        return { stdout: 'origin/main\n', stderr: '', code: 0 }
      }
      if (command === 'status --short') {
        return { stdout: '', stderr: '', code: 0 }
      }
      if (command === 'log --oneline -n 5') {
        return { stdout: 'abc123 latest commit\n', stderr: '', code: 0 }
      }
      return {
        stdout: '',
        stderr: `unexpected git args: ${command}`,
        code: 128,
      }
    }

    const originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    try {
      const status = await getGitStatus()

      expect(status).toContain('Your recent commits:\n(no recent commits)')
      expect(execCalls.some(([, args]) => args.includes('--author'))).toBe(
        false,
      )
      expect(logErrorCalls).toEqual([])
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = originalNodeEnv
    }
  })
})
