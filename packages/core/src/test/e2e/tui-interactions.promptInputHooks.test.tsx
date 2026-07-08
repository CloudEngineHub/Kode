import { afterEach, describe, expect, mock, test } from 'bun:test'
import React, { useEffect, useMemo, useRef } from 'react'
import { Text } from 'ink'
import { createInkHarnessManager, createInkTestHarness } from './inkTestHarness'

const harnessManager = createInkHarnessManager()

afterEach(async () => {
  await harnessManager.cleanup()
  mock.restore()
})

describe('TUI E2E regression (Ink render): PromptInput hooks', () => {
  test('quick model switch clears dismiss timeout on unmount', async () => {
    mock.module('#core/utils/tokens', () => ({
      estimateTokens: () => 0,
    }))
    mock.module('#core/utils/model', () => ({
      getModelManager: () => ({
        getModelSwitchingDebugInfo: () => ({
          activeModels: 2,
          availableModels: [],
          totalModels: 2,
        }),
        switchToNextModel: () => ({
          success: true,
          modelName: 'next-model',
          message: 'Switched to next-model',
        }),
      }),
    }))

    const { useQuickModelSwitch } = await import(
      '#ui-ink/components/PromptInput/useQuickModelSwitch'
    )

    const messages: Array<{ show: boolean; text?: string }> = []
    let submitCount = 0

    function QuickModelSwitchHarness(): React.ReactNode {
      const modelMessages = useMemo(() => [], [])
      const switchModel = useQuickModelSwitch({
        messages: modelMessages,
        onSubmitCountChange: updater => {
          submitCount = updater(submitCount)
        },
        setModelSwitchMessage: message => {
          messages.push(message)
        },
      })

      useEffect(() => {
        switchModel()
      }, [switchModel])

      return <Text>quick-model-switch</Text>
    }

    const h = createInkTestHarness(<QuickModelSwitchHarness />)
    harnessManager.track(h)

    await h.wait(50)
    expect(messages).toEqual([
      { show: true, text: 'Switched to next-model' },
    ])
    expect(submitCount).toBe(1)

    h.unmount()
    await h.wait(3200)

    expect(messages).toEqual([
      { show: true, text: 'Switched to next-model' },
    ])
  })

  test('external edit ignores editor result after unmount', async () => {
    let resolveEditor:
      | ((value: { text: string | null; editorLabel?: string }) => void)
      | null = null
    let terminalRestoreCount = 0

    mock.module('#cli-utils/externalEditor', () => ({
      launchExternalEditor: () =>
        new Promise<{ text: string | null; editorLabel?: string }>(resolve => {
          resolveEditor = resolve
        }),
    }))
    mock.module('#ui-ink/utils/terminalCapabilityManager', () => ({
      terminalCapabilityManager: {
        enableSupportedModes: () => {
          terminalRestoreCount += 1
        },
      },
    }))

    const { useExternalEdit } = await import(
      '#ui-ink/components/PromptInput/useExternalEdit'
    )

    const messages: Array<{ show: boolean; text?: string }> = []
    const inputs: string[] = []
    const offsets: number[] = []

    function ExternalEditHarness(): React.ReactNode {
      const didStartRef = useRef(false)
      const { handleExternalEdit } = useExternalEdit({
        input: 'draft',
        isDisabled: false,
        isLoading: false,
        onInputChange: text => {
          inputs.push(text)
        },
        setCursorOffset: offset => {
          offsets.push(offset)
        },
        setMessage: message => {
          messages.push(message)
        },
      })

      useEffect(() => {
        if (didStartRef.current) return
        didStartRef.current = true
        void handleExternalEdit()
      }, [handleExternalEdit])

      return <Text>external-edit</Text>
    }

    const h = createInkTestHarness(<ExternalEditHarness />)
    harnessManager.track(h)

    await h.wait(50)
    expect(messages).toEqual([
      { show: true, text: 'Opening external editor...' },
    ])

    h.unmount()
    resolveEditor?.({ text: 'edited text', editorLabel: 'test-editor' })
    await h.wait(50)

    expect(terminalRestoreCount).toBe(1)
    expect(inputs).toEqual([])
    expect(offsets).toEqual([])
    expect(messages).toEqual([
      { show: true, text: 'Opening external editor...' },
    ])
  })
})
