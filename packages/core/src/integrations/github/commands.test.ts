import { describe, expect, test } from 'bun:test'

import {
  createPullRequestChecksWatchCommand,
  createPullRequestReviewsWatchCommand,
  createPullRequestWatchCommand,
  createPullRequestWatcherCommands,
  createWorkflowRunWatchCommand,
  isReadOnlyGhCommand,
} from './index'

describe('GitHub watcher command factory', () => {
  const pr = { owner: 'shareAI-lab', repo: 'Kode-CLI', number: 42 }

  test('emits gh-only, read-only PR and CI probes', () => {
    const commands = createPullRequestWatcherCommands(pr)
    expect(commands).toHaveLength(3)
    for (const command of commands) {
      expect(command.command).toBe('gh')
      expect(command.readOnly).toBe(true)
      expect(isReadOnlyGhCommand(command)).toBe(true)
      expect(command.args.join(' ')).not.toMatch(
        /\b(?:merge|create|edit|delete)\b/i,
      )
    }

    expect(createPullRequestWatchCommand(pr).args.join(' ')).toContain(
      'statusCheckRollup',
    )
    expect(createPullRequestChecksWatchCommand(pr).args.slice(0, 2)).toEqual([
      'pr',
      'checks',
    ])
    expect(createPullRequestReviewsWatchCommand(pr).args).toContain('GET')
  })

  test('validates untrusted repository identifiers and IDs before constructing argv', () => {
    expect(() =>
      createPullRequestWatchCommand({ ...pr, owner: 'owner; rm -rf /' }),
    ).toThrow('Invalid GitHub owner')
    expect(() => createPullRequestWatchCommand({ ...pr, number: 0 })).toThrow(
      'positive integer',
    )
    expect(() =>
      createWorkflowRunWatchCommand({
        owner: 'shareAI-lab',
        repo: 'Kode-CLI',
        runId: Number.NaN,
      }),
    ).toThrow('positive integer')
  })

  test('does not classify mutating or ambiguous gh commands as read-only', () => {
    expect(
      isReadOnlyGhCommand({ command: 'gh', args: ['pr', 'merge', '42'] }),
    ).toBe(false)
    expect(
      isReadOnlyGhCommand({
        command: 'gh',
        args: ['api', '--method', 'POST', '/repos/a/b/issues'],
      }),
    ).toBe(false)
    expect(
      isReadOnlyGhCommand({
        command: 'gh',
        args: ['api', '/repos/a/b/issues'],
      }),
    ).toBe(false)
  })
})
