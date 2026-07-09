import { afterEach, describe, expect, test } from 'bun:test'
import React from 'react'

import { ConsoleOAuthFlow } from '#ui-ink/components/ConsoleOAuthFlow'
import { KeypressProvider } from '#ui-ink/contexts/KeypressContext'
import { createInkHarnessManager, createInkTestHarness } from './inkTestHarness'

const harnessManager = createInkHarnessManager()

afterEach(async () => {
  await harnessManager.cleanup()
})

function renderOAuthFlow(
  props: Partial<React.ComponentProps<typeof ConsoleOAuthFlow>>,
) {
  const h = createInkTestHarness(
    <KeypressProvider>
      <ConsoleOAuthFlow onDone={() => {}} {...props} />
    </KeypressProvider>,
  )
  harnessManager.track(h)
  return h
}

describe('TUI E2E regression (Ink render): OAuth flow', () => {
  test('renders the manual login URL as one copyable string without Static', async () => {
    const url =
      'https://auth.shareai-lab.local/oauth/authorize?' +
      new URLSearchParams({
        client_id: 'kode-cli',
        redirect_uri: 'https://console.shareai-lab.local/manual',
        response_type: 'code',
        scope: 'read write offline_access',
        state: 'state-' + 'x'.repeat(80),
        code_challenge: 'challenge-' + 'y'.repeat(80),
        code_challenge_method: 'S256',
      }).toString()

    const h = renderOAuthFlow({
      pastePromptDelayMs: 0,
      createOAuthService: () => ({
        async startOAuthFlow(authURLHandler) {
          await authURLHandler(url)
          return new Promise<{ accessToken: string }>(() => {})
        },
        processCallback() {},
      }),
    })

    h.stdin.write('\r')
    await h.wait(80)

    const output = h.getOutput()
    expect(output).toContain("Browser didn't open?")
    expect(output).toContain(url)
    expect(output).not.toContain('TestErrorBoundary')
  })

  test('retries a manual-code error without clearing or remounting the flow', async () => {
    const url = 'https://auth.shareai-lab.local/manual?state=retry-state'

    const h = renderOAuthFlow({
      pastePromptDelayMs: 0,
      retryDelayMs: 0,
      createOAuthService: () => ({
        async startOAuthFlow(authURLHandler) {
          await authURLHandler(url)
          return new Promise<{ accessToken: string }>(() => {})
        },
        processCallback() {},
      }),
    })

    h.stdin.write('\r')
    await h.wait(80)

    h.stdin.write('invalid-code\r')
    await h.wait(50)
    expect(h.getOutput()).toContain('OAuth error: Invalid code')

    h.stdin.write('\r')
    await h.wait(80)

    const output = h.getOutput()
    expect(output).toContain('Retrying')
    expect(output).toContain(url)
    expect(output).toContain('Paste code here if prompted >')
    expect(output).not.toContain('TestErrorBoundary')
  })

  test('successful login finishes on Enter without terminal clearing', async () => {
    let done = false
    let notified = false

    const h = renderOAuthFlow({
      onDone: () => {
        done = true
      },
      pastePromptDelayMs: 0,
      createOAuthService: () => ({
        async startOAuthFlow(authURLHandler) {
          await authURLHandler('https://auth.shareai-lab.local/manual')
          return { accessToken: 'oauth-token' }
        },
        processCallback() {},
      }),
      createApiKey: async accessToken => {
        expect(accessToken).toBe('oauth-token')
        return 'sk-test'
      },
      notify: async () => {
        notified = true
      },
    })

    h.stdin.write('\r')
    await h.wait(120)
    expect(h.getOutput()).toContain('Login successful')
    expect(notified).toBe(true)

    h.stdin.write('\r')
    await h.wait(40)
    expect(done).toBe(true)
  })
})
