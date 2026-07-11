import { afterEach, describe, expect, test } from 'bun:test'
import React from 'react'

import { LoginScreen } from '#ui-ink/components/LoginScreen'
import { KeypressProvider } from '#ui-ink/contexts/KeypressContext'
import { createInkHarnessManager, createInkTestHarness } from './inkTestHarness'

const harnessManager = createInkHarnessManager()

afterEach(async () => {
  await harnessManager.cleanup()
})

describe('TUI E2E regression (Ink render): login selector', () => {
  test('starts the supported Codex browser login and detects completion', async () => {
    let loginStarted = false
    let done = false

    const h = createInkTestHarness(
      <KeypressProvider>
        <LoginScreen
          onDone={() => {
            done = true
          }}
          pollIntervalMs={10}
          codexAuth={{
            getStatus: async () =>
              loginStarted
                ? { kind: 'authenticated' as const }
                : { kind: 'unauthenticated' as const },
            startLogin: async () => {
              loginStarted = true
            },
          }}
        />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await h.wait(30)
    expect(h.getOutput()).toContain('Codex / ChatGPT')
    expect(h.getOutput()).toContain('OpenAI API key (GPT-5-Codex)')

    h.stdin.write('\r')
    await h.wait(80)

    expect(loginStarted).toBe(true)
    expect(h.getOutput()).toContain('Codex is signed in.')

    h.stdin.write('\r')
    await h.wait(20)
    expect(done).toBe(true)
  })

  test('opens the OpenAI API-key setup directly from the login selector', async () => {
    const h = createInkTestHarness(
      <KeypressProvider>
        <LoginScreen
          onDone={() => {}}
          codexAuth={{
            getStatus: async () => ({ kind: 'authenticated' as const }),
            startLogin: async () => {},
          }}
        />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await h.wait(30)
    h.stdin.write('j')
    await h.wait(20)
    h.stdin.write('\r')
    await h.wait(50)

    const output = h.getOutput()
    expect(output).toContain('API Key Setup')
    expect(output).toContain('Enter your OpenAI API key')
  })
})
