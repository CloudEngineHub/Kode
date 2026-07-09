import { afterEach, describe, expect, test } from 'bun:test'
import { Box, Text, render } from 'ink'
import React from 'react'
import { PassThrough } from 'node:stream'
import stripAnsi from 'strip-ansi'
import PromptInput from '#ui-ink/components/PromptInput'
import type { PromptMode } from '#ui-ink/components/PromptInput/types'
import { KeypressProvider } from '#ui-ink/contexts/KeypressContext'
import { REPLView } from './REPLView'
import type { TranscriptItem } from './useTranscriptItems'

type TestHarness = {
  unmount: () => void
  rerender: (element: React.ReactElement) => void
  clearOutput: () => void
  getOutput: () => string
  wait: (ms: number) => Promise<void>
}

const mounted: TestHarness[] = []

afterEach(async () => {
  while (mounted.length > 0) {
    mounted.pop()?.unmount()
  }
})

function makeStaticItem(key: string, label = key): TranscriptItem {
  return {
    key,
    jsx: (
      <Box key={key}>
        <Text>{label}</Text>
      </Box>
    ),
  }
}

function renderReplView(args: {
  staticOutputEpoch: number
  staticItems: TranscriptItem[]
  isLoading?: boolean
  shouldShowPromptInput?: boolean
  promptInputProps?: React.ComponentProps<typeof PromptInput>
}) {
  return (
    <REPLView
      conversationKey="test-log:0"
      safeMode={false}
      debug={false}
      staticOutputEpoch={args.staticOutputEpoch}
      staticItems={args.staticItems}
      transientItems={[]}
      toolJSX={null}
      toolUseConfirm={null}
      setToolUseConfirm={() => {}}
      toast={null}
      binaryFeedbackContext={null}
      setBinaryFeedbackContext={() => {}}
      isLoading={args.isLoading ?? false}
      verbose={false}
      normalizedMessages={[]}
      tools={[]}
      erroredToolUseIDs={new Set()}
      inProgressToolUseIDs={new Set()}
      unresolvedToolUseIDs={new Set()}
      showingCostDialog={false}
      onCostDialogDone={() => {}}
      shouldShowPromptInput={args.shouldShowPromptInput ?? false}
      isMessageSelectorVisible={false}
      promptInputProps={args.promptInputProps ?? makePromptInputProps()}
      messageSelectorMessages={[]}
      onMessageSelectorSelect={() => {}}
      onMessageSelectorEscape={() => {}}
    />
  )
}

function makePromptInputProps(
  overrides: Partial<React.ComponentProps<typeof PromptInput>> = {},
): React.ComponentProps<typeof PromptInput> {
  return {
    commands: [],
    forkNumber: 0,
    messageLogName: 'tui',
    isDisabled: false,
    isLoading: false,
    onQuery: async () => {},
    debug: false,
    verbose: false,
    messages: [],
    setToolJSX: () => {},
    tools: [],
    input: '',
    onInputChange: () => {},
    mode: 'prompt' as PromptMode,
    onModeChange: () => {},
    submitCount: 0,
    onSubmitCountChange: () => {},
    setIsLoading: () => {},
    setAbortController: () => {},
    onShowMessageSelector: () => {},
    setForkConvoWithMessagesOnTheNextRender: () => {},
    readFileTimestamps: {},
    abortController: null,
    ...overrides,
  }
}

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
  stdout.columns = 100
  stdout.rows = 30

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
    rerender: next => instance.rerender(next),
    clearOutput: () => {
      rawOutput = ''
    },
    getOutput: () => stripAnsi(rawOutput),
    wait: async ms => new Promise(resolve => setTimeout(resolve, ms)),
  }
  mounted.push(harness)
  return harness
}

describe('REPLView Static output epoch', () => {
  test('keeps Static mounted during ordinary rerenders and resets it only when epoch changes', async () => {
    const staticItems = [makeStaticItem('static-a')]
    const harness = createHarness(
      renderReplView({ staticOutputEpoch: 0, staticItems }),
    )

    await harness.wait(20)
    expect(harness.getOutput()).toContain('static-a')

    harness.clearOutput()
    harness.rerender(renderReplView({ staticOutputEpoch: 0, staticItems }))
    await harness.wait(20)
    expect(harness.getOutput()).not.toContain('static-a')

    harness.clearOutput()
    harness.rerender(renderReplView({ staticOutputEpoch: 1, staticItems }))
    await harness.wait(20)
    expect(harness.getOutput()).toContain('static-a')
  })

  test('does not reserve an empty transient viewport before controls', async () => {
    const staticItems = [makeStaticItem('static-a')]
    const harness = createHarness(
      renderReplView({ staticOutputEpoch: 0, staticItems, isLoading: true }),
    )

    await harness.wait(20)

    expect(harness.getOutput()).toContain('static-a')
    expect(harness.getOutput()).not.toMatch(/(?:\n\s*){4,}/)
  })

  test('does not insert a large blank gap between startup output and prompt controls', async () => {
    const staticItems = [makeStaticItem('welcome', 'Welcome')]
    const harness = createHarness(
      <KeypressProvider>
        {renderReplView({
          staticOutputEpoch: 0,
          staticItems,
          shouldShowPromptInput: true,
          promptInputProps: makePromptInputProps(),
        })}
      </KeypressProvider>,
    )

    await harness.wait(80)

    const output = harness.getOutput()
    expect(output).toContain('Welcome')
    expect(output).toContain('Input:')
    expect(output).not.toMatch(/Welcome[\s\S]*?(?:\n\s*){6,}[\s\S]*?Input:/)
  })
})
