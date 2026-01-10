import { describe, expect, test } from 'bun:test'
import {
  buildClaudeCodeHeaders,
  buildClaudeCodeUserAgent,
} from '#core/ai/llm/claudeCodeFallback'

async function withEnv<T>(
  updates: Record<string, string | undefined>,
  fn: () => Promise<T> | T,
): Promise<T> {
  const previous: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(updates)) {
    previous[k] = process.env[k]
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  try {
    return await fn()
  } finally {
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

describe('Claude compatibility headers', () => {
  test('buildClaudeCodeUserAgent uses CLAUDE_CODE_ENTRYPOINT when set', async () => {
    await withEnv(
      {
        CLAUDE_CODE_ENTRYPOINT: 'cli',
        CLAUDE_AGENT_SDK_VERSION: undefined,
      },
      () => {
        expect(buildClaudeCodeUserAgent()).toBe(
          'claude-cli/2.1.2 (external, cli)',
        )
      },
    )
  })

  test('buildClaudeCodeHeaders includes expected fingerprint fields', async () => {
    await withEnv(
      {
        CLAUDE_CODE_ENTRYPOINT: 'cli',
        CLAUDE_CODE_CONTAINER_ID: 'container-123',
        CLAUDE_CODE_REMOTE_SESSION_ID: 'session-abc',
        CLAUDE_CODE_ADDITIONAL_PROTECTION: '1',
        ANTHROPIC_AUTH_TOKEN: 'token-xyz',
        ANTHROPIC_CUSTOM_HEADERS: 'x-extra: yep\nx-other: ok',
      },
      () => {
        const headers = buildClaudeCodeHeaders()
        expect(headers['x-app']).toBe('cli')
        expect(headers['User-Agent']).toBe('claude-cli/2.1.2 (external, cli)')
        expect(headers['x-claude-remote-container-id']).toBe('container-123')
        expect(headers['x-claude-remote-session-id']).toBe('session-abc')
        expect(headers['x-anthropic-additional-protection']).toBe('true')
        expect(headers['x-extra']).toBe('yep')
        expect(headers['x-other']).toBe('ok')
        expect(headers.Authorization).toBe('Bearer token-xyz')
      },
    )
  })

  test('buildClaudeCodeHeaders can suppress ANTHROPIC_AUTH_TOKEN', async () => {
    await withEnv(
      {
        CLAUDE_CODE_ENTRYPOINT: 'cli',
        ANTHROPIC_AUTH_TOKEN: 'token-xyz',
        ANTHROPIC_CUSTOM_HEADERS: undefined,
      },
      () => {
        const headers = buildClaudeCodeHeaders({ includeAuthToken: false })
        expect(headers.Authorization).toBeUndefined()
      },
    )
  })
})

