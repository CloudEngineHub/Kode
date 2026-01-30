import { afterEach, describe, expect, test, mock } from 'bun:test'
import React from 'react'
import { KeypressProvider } from '#ui-ink/contexts/KeypressContext'
import { ModelPickerScreen } from '#ui-ink/screens/overlays/ModelPickerScreen'
import { ThinkingToggleScreen } from '#ui-ink/screens/overlays/ThinkingToggleScreen'
import { WorkTasksScreen } from '#ui-ink/screens/overlays/WorkTasksScreen'
import { TranscriptScreen } from '#ui-ink/screens/overlays/TranscriptScreen'
import { createInkHarnessManager, createInkTestHarness } from './inkTestHarness'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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

  test('WorkTasksScreen: Ctrl+T closes', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'kode-worktasks-overlay-'))
    const previousConfigDir = process.env.KODE_CONFIG_DIR
    const previousTaskListId = process.env.KODE_TASK_LIST_ID
    process.env.KODE_CONFIG_DIR = tmpRoot
    process.env.KODE_TASK_LIST_ID = 'overlay-test'

    let closed = false
    try {
      const h = createInkTestHarness(
        <KeypressProvider>
          <WorkTasksScreen
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
    } finally {
      if (previousConfigDir === undefined) delete process.env.KODE_CONFIG_DIR
      else process.env.KODE_CONFIG_DIR = previousConfigDir

      if (previousTaskListId === undefined) delete process.env.KODE_TASK_LIST_ID
      else process.env.KODE_TASK_LIST_ID = previousTaskListId

      rmSync(tmpRoot, { recursive: true, force: true })
    }
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

  test('HistorySearchScreen: Enter triggers accept', async () => {
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
        action: 'accept',
        value: 'hello',
        pastedTexts: [],
      })
    } finally {
      mock.restore()
    }
  })
})
