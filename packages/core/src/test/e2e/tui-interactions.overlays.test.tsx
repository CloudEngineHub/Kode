import { afterEach, describe, expect, test, mock } from 'bun:test'
import React from 'react'
import { KeypressProvider } from '#ui-ink/contexts/KeypressContext'
import { ModelPickerScreen } from '#ui-ink/screens/overlays/ModelPickerScreen'
import { ThinkingToggleScreen } from '#ui-ink/screens/overlays/ThinkingToggleScreen'
import { TodosScreen } from '#ui-ink/screens/overlays/TodosScreen'
import { TranscriptScreen } from '#ui-ink/screens/overlays/TranscriptScreen'
import { createInkHarnessManager, createInkTestHarness } from './inkTestHarness'

const harnessManager = createInkHarnessManager()

afterEach(async () => {
  await harnessManager.cleanup()
})

describe('TUI E2E regression (Ink render): Overlays', () => {
  test('TranscriptScreen: Ctrl+C closes', async () => {
    let closed = false
    const h = createInkTestHarness(
      <KeypressProvider>
        <TranscriptScreen
          label="test"
          onDone={() => {
            closed = true
          }}
        />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await h.wait(25)
    h.stdin.write('\x03')
    await h.wait(25)

    expect(closed).toBe(true)
  })

  test('TodosScreen: Ctrl+T closes', async () => {
    let closed = false
    const h = createInkTestHarness(
      <KeypressProvider>
        <TodosScreen
          agentId="main"
          onDone={() => {
            closed = true
          }}
        />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await h.wait(25)
    h.stdin.write('\x14')
    await h.wait(25)

    expect(closed).toBe(true)
  })

  test('ModelPickerScreen: Alt+P closes', async () => {
    let closed = false
    const h = createInkTestHarness(
      <KeypressProvider>
        <ModelPickerScreen
          onDone={() => {
            closed = true
          }}
          onSelectModel={() => {}}
        />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await h.wait(25)
    h.stdin.write('\x1bp')
    await h.wait(25)

    expect(closed).toBe(true)
  })

  test('ThinkingToggleScreen: Alt+T closes', async () => {
    let closed = false
    const h = createInkTestHarness(
      <KeypressProvider>
        <ThinkingToggleScreen
          currentValue={false}
          isMidConversation={false}
          onSelect={() => {}}
          onDone={() => {
            closed = true
          }}
        />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await h.wait(25)
    h.stdin.write('\x1bt')
    await h.wait(25)

    expect(closed).toBe(true)
  })

  test('HistorySearchScreen: Enter triggers execute', async () => {
    try {
      mock.module('#core/history', () => {
        return {
          getGlobalHistoryWithPastes: () => [
            { display: 'hello', pastedTexts: [] },
            { display: '!ls', pastedTexts: [] },
          ],
        }
      })

      const { HistorySearchScreen } =
        await import('#ui-ink/screens/overlays/HistorySearchScreen')

      let result: any = null
      const h = createInkTestHarness(
        <KeypressProvider>
          <HistorySearchScreen onDone={r => (result = r)} />
        </KeypressProvider>,
      )
      harnessManager.track(h)

      await h.wait(25)
      h.stdin.write('\r')
      await h.wait(25)

      expect(result).toEqual({
        action: 'execute',
        value: 'hello',
        pastedTexts: [],
      })
    } finally {
      mock.restore()
    }
  })
})
