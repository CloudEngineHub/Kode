import { describe, expect, test } from 'bun:test'

import { createDisabledBrowserAdapter, createMcpBrowserAdapter } from './index'

describe('browser adapter boundary', () => {
  test('disabled adapter never attempts a transport call', async () => {
    const adapter = createDisabledBrowserAdapter()
    const result = await adapter.execute({
      action: 'navigate',
      approved: true,
      url: 'https://example.test',
    })
    expect(adapter.isAvailable).toBe(false)
    expect(result).toMatchObject({ ok: false, code: 'disabled' })
  })

  test('MCP adapter is approval- and origin-gated before invoking a tool', async () => {
    const calls: Array<{ toolName: string; input: Record<string, unknown> }> =
      []
    const adapter = createMcpBrowserAdapter({
      allowedOrigins: ['https://app.example.test'],
      invoke: async ({ toolName, input }) => {
        calls.push({ toolName, input })
        return { finalUrl: 'https://app.example.test/dashboard' }
      },
    })

    expect(
      await adapter.execute({
        action: 'navigate',
        url: 'https://app.example.test/dashboard',
      }),
    ).toMatchObject({ ok: false, code: 'approval_required' })
    expect(calls).toEqual([])

    expect(
      await adapter.execute({
        action: 'navigate',
        approved: true,
        url: 'file:///etc/passwd',
      }),
    ).toMatchObject({ ok: false, code: 'invalid_request' })
    expect(
      await adapter.execute({
        action: 'navigate',
        approved: true,
        url: 'https://outside.example.test',
      }),
    ).toMatchObject({ ok: false, code: 'origin_not_allowlisted' })
    expect(calls).toEqual([])
  })

  test('MCP adapter maps approved actions but blocks secret typing by default', async () => {
    const calls: Array<{ toolName: string; input: Record<string, unknown> }> =
      []
    const adapter = createMcpBrowserAdapter({
      allowedOrigins: ['https://app.example.test'],
      toolNames: { click: 'custom_click' },
      invoke: async ({ toolName, input }) => {
        calls.push({ toolName, input })
        return {
          artifactId: 'artifact-1',
          pageUrl: 'https://app.example.test/dashboard',
        }
      },
    })

    expect(
      await adapter.execute({
        action: 'click',
        approved: true,
        selector: '#submit',
      }),
    ).toMatchObject({ ok: false, code: 'navigation_required' })

    await adapter.execute({
      action: 'navigate',
      approved: true,
      url: 'https://app.example.test/dashboard',
    })
    expect(
      await adapter.execute({
        action: 'click',
        approved: true,
        selector: '#submit',
      }),
    ).toMatchObject({ ok: true, action: 'click' })
    expect(calls[1]).toEqual({
      toolName: 'custom_click',
      input: { selector: '#submit' },
    })

    expect(
      await adapter.execute({
        action: 'type',
        approved: true,
        selector: '#token',
        text: 'sk-super-secret-value-0123456789',
      }),
    ).toMatchObject({ ok: false, code: 'sensitive_input_not_allowed' })
    expect(calls).toHaveLength(2)
  })

  test('fails closed when navigation or an interaction lands outside the allowlist', async () => {
    const calls: string[] = []
    const adapter = createMcpBrowserAdapter({
      allowedOrigins: ['https://app.example.test'],
      invoke: async ({ toolName }) => {
        calls.push(toolName)
        return toolName === 'browser_navigate'
          ? { finalUrl: 'https://app.example.test/dashboard' }
          : { finalUrl: 'https://outside.example.test/redirected' }
      },
    })

    expect(
      await adapter.execute({
        action: 'navigate',
        approved: true,
        url: 'https://app.example.test/dashboard',
      }),
    ).toMatchObject({ ok: true })
    expect(
      await adapter.execute({
        action: 'click',
        approved: true,
        selector: '#continue',
      }),
    ).toMatchObject({ ok: false, code: 'origin_not_allowlisted' })
    expect(
      await adapter.execute({ action: 'snapshot', approved: true }),
    ).toMatchObject({ ok: false, code: 'navigation_required' })
    expect(calls).toEqual(['browser_navigate', 'browser_click'])
  })

  test('does not trust a requested URL when the MCP transport omits the actual page URL', async () => {
    const adapter = createMcpBrowserAdapter({
      allowedOrigins: ['https://app.example.test'],
      invoke: async () => ({ ok: true }),
    })

    expect(
      await adapter.execute({
        action: 'navigate',
        approved: true,
        url: 'https://app.example.test/dashboard',
      }),
    ).toMatchObject({ ok: false, code: 'navigation_unverified' })
  })
})
