import { afterEach, describe, expect, test } from 'bun:test'
import { Text, render } from 'ink'
import React from 'react'
import { PassThrough } from 'node:stream'
import type { CanUseToolFn } from '#core/permissions/canUseTool'
import type { BinaryFeedbackResult, Message } from '#core/query'
import type { WrappedClient } from '#core/mcp/client'
import type { ToolUseContext } from '#core/tooling/Tool'
import { useReplQuery } from './useReplQuery'

type OnQuery = ReturnType<typeof useReplQuery>

type Harness = {
  rerender: (element: React.ReactElement) => void
  unmount: () => void
  wait: (ms: number) => Promise<void>
}

const mounted: Harness[] = []

afterEach(() => {
  while (mounted.length > 0) {
    mounted.pop()?.unmount()
  }
})

function createHarness(element: React.ReactElement): Harness {
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
  stdout.resume()

  const instance = render(element, {
    stdin: stdin as unknown as NodeJS.ReadStream,
    stdout: stdout as unknown as NodeJS.WriteStream,
    exitOnCtrlC: false,
  })

  const harness: Harness = {
    rerender: next => instance.rerender(next),
    unmount: () => instance.unmount(),
    wait: async ms => new Promise(resolve => setTimeout(resolve, ms)),
  }
  mounted.push(harness)
  return harness
}

const messages: Message[] = []
const commands = []
const tools = []
const mcpClients: WrappedClient[] = []
const readFileTimestamps: Record<string, number> = {}
const setMessages: React.Dispatch<React.SetStateAction<Message[]>> = () => {}
const setToolJSX = () => {}
const requestToolUsePermission: NonNullable<
  ToolUseContext['options']
>['requestToolUsePermission'] = async () => ({
  result: true,
  type: 'temporary',
})
const canUseTool: CanUseToolFn = async () => ({ result: true })
const getBinaryFeedbackResponse = async (): Promise<BinaryFeedbackResult> => ({
  message: null,
  shouldSkipPermissionCheck: false,
})
const setAbortController = (_controller: AbortController | null) => {}
const setIsLoading = (_isLoading: boolean) => {}

function Probe({
  label,
  onRender,
}: {
  label: string
  onRender: (onQuery: OnQuery) => void
}) {
  const onQuery = useReplQuery({
    disableSlashCommands: false,
    systemPromptOverride: undefined,
    appendSystemPrompt: undefined,
    messages,
    setMessages,
    commands,
    forkNumber: 0,
    messageLogName: 'test-log',
    thinkingMode: 'auto',
    tools,
    mcpClients,
    verbose: false,
    safeMode: false,
    checkPendingForkAndSuppressAppend: undefined,
    requestToolUsePermission,
    canUseTool,
    readFileTimestamps,
    setToolJSX,
    getBinaryFeedbackResponse,
    setAbortController,
    setIsLoading,
  })
  onRender(onQuery)
  return <Text>{label}</Text>
}

describe('useReplQuery identity', () => {
  test('does not recreate onQuery when only the caller rerenders', async () => {
    const callbacks: OnQuery[] = []
    const onRender = (onQuery: OnQuery) => {
      callbacks.push(onQuery)
    }

    const harness = createHarness(<Probe label="one" onRender={onRender} />)
    await harness.wait(20)
    harness.rerender(<Probe label="two" onRender={onRender} />)
    await harness.wait(20)

    expect(callbacks.length).toBeGreaterThanOrEqual(2)
    expect(callbacks[callbacks.length - 1]).toBe(callbacks[0])
  })
})
