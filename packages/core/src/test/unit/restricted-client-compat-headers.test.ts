import { describe, expect, test } from 'bun:test'
import {
  buildCompatHeaders,
  buildCompatUserAgent,
} from '#core/ai/llm/restrictedClientCompat'

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

describe('restricted client compatibility headers', () => {
  test('buildCompatUserAgent uses CLAUDE_CODE_ENTRYPOINT when set', async () => {
    await withEnv(
      {
        KODE_ENTRYPOINT: undefined,
        CLAUDE_CODE_ENTRYPOINT: 'cli',
        CLAUDE_AGENT_SDK_VERSION: undefined,
      },
      () => {
        expect(buildCompatUserAgent()).toBe('claude-cli/2.1.2 (external, cli)')
      },
    )
  })

  test('buildCompatUserAgent prefers KODE_ENTRYPOINT when set', async () => {
    await withEnv(
      {
        KODE_ENTRYPOINT: 'sdk-cli',
        CLAUDE_CODE_ENTRYPOINT: 'cli',
        KODE_AGENT_SDK_VERSION: '1.2.3',
        CLAUDE_AGENT_SDK_VERSION: '0.0.1',
      },
      () => {
        expect(buildCompatUserAgent()).toBe(
          'claude-cli/2.1.2 (external, sdk-cli, agent-sdk/1.2.3)',
        )
      },
    )
  })

  test('buildCompatHeaders includes expected fingerprint fields', async () => {
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
        const headers = buildCompatHeaders()
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

  test('buildCompatHeaders accepts Kode-prefixed aliases for remote metadata', async () => {
    await withEnv(
      {
        KODE_REMOTE_CONTAINER_ID: 'kode-container-1',
        KODE_REMOTE_SESSION_ID: 'kode-session-1',
        KODE_ADDITIONAL_PROTECTION: 'true',
        CLAUDE_CODE_CONTAINER_ID: 'container-123',
        CLAUDE_CODE_REMOTE_SESSION_ID: 'session-abc',
        CLAUDE_CODE_ADDITIONAL_PROTECTION: '0',
      },
      () => {
        const headers = buildCompatHeaders({ includeAuthToken: false })
        expect(headers['x-claude-remote-container-id']).toBe('kode-container-1')
        expect(headers['x-claude-remote-session-id']).toBe('kode-session-1')
        expect(headers['x-anthropic-additional-protection']).toBe('true')
      },
    )
  })

  test('buildCompatHeaders can suppress ANTHROPIC_AUTH_TOKEN', async () => {
    await withEnv(
      {
        CLAUDE_CODE_ENTRYPOINT: 'cli',
        ANTHROPIC_AUTH_TOKEN: 'token-xyz',
        ANTHROPIC_CUSTOM_HEADERS: undefined,
      },
      () => {
        const headers = buildCompatHeaders({ includeAuthToken: false })
        expect(headers.Authorization).toBeUndefined()
      },
    )
  })
})
