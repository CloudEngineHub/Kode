import { afterEach, describe, expect, test } from 'bun:test'
import { render } from 'ink'
import React from 'react'
import { PassThrough } from 'node:stream'
import stripAnsi from 'strip-ansi'
import { getTheme } from '#core/utils/theme'
import { KeypressProvider } from '#ui-ink/contexts/KeypressContext'
import { PromptInputView } from './PromptInputView'

type TestHarness = {
  unmount: () => void
  getOutput: () => string
  wait: (ms: number) => Promise<void>
}

const mounted: TestHarness[] = []

afterEach(() => {
  while (mounted.length > 0) {
    mounted.pop()?.unmount()
  }
})

function createHarness(element: React.ReactElement): TestHarness {
  const stdin = new PassThrough() as PassThrough & {
    isTTY?: boolean
    isRaw?: boolean
    setRawMode?: (enabled: boolean) => void
    ref?: () => void
    unref?: () => void
  }
  stdin.isTTY = true
  stdin.isRaw = true
  stdin.setRawMode = () => {}
  stdin.ref = () => {}
  stdin.unref = () => {}
  stdin.setEncoding('utf8')
  stdin.resume()

  const stdout = new PassThrough() as PassThrough & {
    isTTY?: boolean
    columns?: number
    rows?: number
  }
  stdout.isTTY = true
  stdout.columns = 120
  stdout.rows = 24

  let rawOutput = ''
  stdout.on('data', chunk => {
    rawOutput += chunk.toString('utf8')
  })

  const instance = render(element, {
    stdin: stdin as unknown as NodeJS.ReadStream,
    stdout: stdout as unknown as NodeJS.WriteStream,
    exitOnCtrlC: false,
  })

  const harness: TestHarness = {
    unmount: () => instance.unmount(),
    getOutput: () => stripAnsi(rawOutput),
    wait: async ms => new Promise(resolve => setTimeout(resolve, ms)),
  }
  mounted.push(harness)
  return harness
}

function renderPromptInputView(args: {
  customStatusLineActive: boolean
  statusLine: string
}) {
  return (
    <KeypressProvider>
      <PromptInputView
        mode="prompt"
        theme={getTheme()}
        currentPwd="C:/repo"
        modelInfo={{
          provider: 'custom-openai',
          name: 'mimo-v2.5-pro',
          contextLength: 1_048_576,
          currentTokens: 0,
        }}
        input=""
        cursorOffset={0}
        setCursorOffset={() => {}}
        onSubmit={() => {}}
        onChange={() => {}}
        isEditingExternally={false}
        isDisabled={false}
        isLoading={false}
        pendingPrompts={[]}
        queuedPrompts={[]}
        completionActive={false}
        historyIndex={0}
        suggestions={[]}
        selectedIndex={0}
        emptyDirMessage=""
        handleHistoryUp={() => {}}
        handleHistoryDown={() => {}}
        resetHistory={() => {}}
        placeholder=""
        submitCount={0}
        onExit={() => {
          throw new Error('exit')
        }}
        onExitMessage={() => {}}
        onMessage={() => {}}
        onImagePaste={() => {}}
        onTextPaste={() => {}}
        onSpecialKey={() => false}
        exitMessage={{ show: false }}
        message={{ show: false }}
        clearInputPending={false}
        rewindPending={false}
        modelSwitchMessage={{ show: false }}
        toastMessage={{ show: false }}
        statusLine={args.statusLine}
        customStatusLineActive={args.customStatusLineActive}
        statusLinePadding={0}
        currentMode="default"
        modeCycleShortcutText="shift+tab"
        showQuickModelSwitchShortcut={false}
        tokenUsage={0}
        textInputColumns={80}
        textInputMaxHeight={1}
        completionReservedRows={4}
        isInFastBrowseMode={() => false}
      />
    </KeypressProvider>
  )
}

describe('PromptInputView status line layout', () => {
  test('renders built-in model info when using the default status line', async () => {
    const harness = createHarness(
      renderPromptInputView({
        customStatusLineActive: false,
        statusLine: 'Input: Chat',
      }),
    )

    await harness.wait(20)
    const output = harness.getOutput()

    expect(output).toContain('[custom-openai] mimo-v2.5-pro: 0 / 1.0M')
    expect(output).toContain('Input: Chat')
  })

  test('does not duplicate model info when a custom status line is active', async () => {
    const harness = createHarness(
      renderPromptInputView({
        customStatusLineActive: true,
        statusLine: '[custom-openai] mimo-v2.5-pro: 0 / 1.0',
      }),
    )

    await harness.wait(20)
    const output = harness.getOutput()

    expect(output).toContain('[custom-openai] mimo-v2.5-pro: 0 / 1.0')
    expect(output).not.toContain('0 / 1.0M')
  })

  test('hides built-in model info while a configured status line is pending', async () => {
    const harness = createHarness(
      renderPromptInputView({
        customStatusLineActive: true,
        statusLine: 'Input: Chat',
      }),
    )

    await harness.wait(20)
    const output = harness.getOutput()

    expect(output).toContain('Input: Chat')
    expect(output).not.toContain('[custom-openai] mimo-v2.5-pro')
    expect(output).not.toContain('0 / 1.0M')
  })
})
