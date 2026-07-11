import { afterEach, describe, expect, test } from 'bun:test'

import watch, { __setGhWatchExecutorForTests, parseWatchTarget } from './watch'
import { isReadOnlyGhCommand } from '#core/integrations/github'

function context(): { abortController: AbortController } {
  return { abortController: new AbortController() }
}

afterEach(() => {
  __setGhWatchExecutorForTests(null)
})

describe('/watch command', () => {
  test('executes only factory-produced read-only gh PR probes and limits output', async () => {
    const commands: unknown[] = []
    __setGhWatchExecutorForTests(async command => {
      commands.push(command)
      return {
        stdout: JSON.stringify({
          state: 'OPEN',
          token: 'sk-super-secret-value-0123456789',
        }),
        stderr: '',
        exitCode: 0,
      }
    })

    const output = await watch.call('pr shareAI-lab/Kode-CLI#42', context())
    expect(commands).toHaveLength(3)
    expect(commands.every(command => isReadOnlyGhCommand(command as any))).toBe(
      true,
    )
    expect(output).toContain(
      'Read-only GitHub watch: PR shareAI-lab/Kode-CLI#42',
    )
    expect(output).toContain('[REDACTED]')
    expect(output).not.toContain('sk-super-secret')
    expect(output.length).toBeLessThanOrEqual(7_260)
  })

  test('uses one read-only workflow run probe and rejects malformed targets before execution', async () => {
    let calls = 0
    __setGhWatchExecutorForTests(async command => {
      calls += 1
      return { stdout: command.purpose, stderr: '', exitCode: 0 }
    })

    expect(
      await watch.call('run shareAI-lab/Kode-CLI#99', context()),
    ).toContain('Workflow run (ok)')
    expect(calls).toBe(1)
    expect(await watch.call('pr owner/repo#1;whoami', context())).toContain(
      'Target must be owner/repo#positive-number',
    )
    expect(calls).toBe(1)
  })

  test('parses only the documented two-token target form', () => {
    expect(parseWatchTarget('pr owner/repo#12')).toEqual({
      kind: 'pr',
      owner: 'owner',
      repo: 'repo',
      number: 12,
    })
    expect(parseWatchTarget('pr owner/repo#12 extra')).toHaveProperty('error')
  })
})
