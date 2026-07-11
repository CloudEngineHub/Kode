import { describe, expect, test } from 'bun:test'

import { parseCodexLoginStatus } from './codexLogin'

describe('parseCodexLoginStatus', () => {
  test('recognizes an authenticated ChatGPT session', () => {
    expect(
      parseCodexLoginStatus({
        exitCode: 0,
        stdout: 'Logged in using ChatGPT',
        stderr: '',
      }),
    ).toEqual({ kind: 'authenticated' })
  })

  test('does not treat a negative status as authenticated', () => {
    expect(
      parseCodexLoginStatus({
        exitCode: 1,
        stdout: 'Not logged in',
        stderr: '',
      }),
    ).toEqual({ kind: 'unauthenticated' })
  })

  test('reports an unrecognized command result as unavailable', () => {
    expect(
      parseCodexLoginStatus({
        exitCode: 1,
        stdout: '',
        stderr: 'command failed',
      }),
    ).toEqual({ kind: 'unavailable' })
  })
})
