import { describe, expect, test } from 'bun:test'
import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { Box, Text, render } from 'ink'
import React from 'react'
import { PassThrough } from 'stream'
import stripAnsi from 'strip-ansi'
import { z } from 'zod'
import { PermissionProvider } from '#ui-ink/contexts/PermissionContext'
import { UserToolResultMessage } from '#ui-ink/components/messages/UserToolResultMessage/UserToolResultMessage'
import type { Message, UserMessage } from '#core/query'
import type { Tool } from '#core/tooling/Tool'
import {
  createAssistantMessage,
  createUserMessage,
  REJECT_MESSAGE,
} from '#core/utils/messages'

async function renderToText(element: React.ReactElement): Promise<string> {
  const stdin = new PassThrough()
  ;(stdin as any).isTTY = true
  ;(stdin as any).isRaw = true
  ;(stdin as any).setRawMode = () => {}
  stdin.setEncoding('utf8')
  stdin.resume()

  const stdout = new PassThrough()
  ;(stdout as any).isTTY = true
  ;(stdout as any).columns = 100
  ;(stdout as any).rows = 30

  let rawOutput = ''
  stdout.on('data', chunk => {
    rawOutput += chunk.toString('utf8')
  })

  const instance = render(
    <PermissionProvider conversationKey="tool-result-test">
      <Box>{element}</Box>
    </PermissionProvider>,
    {
      stdin: stdin as any,
      stdout: stdout as any,
      exitOnCtrlC: false,
    },
  )

  await new Promise(resolve => setTimeout(resolve, 0))

  instance.unmount()
  return stripAnsi(rawOutput)
}

function makeToolResultParam(
  toolUseID: string,
  content: ToolResultBlockParam['content'],
  isError = false,
): ToolResultBlockParam {
  return {
    type: 'tool_result',
    tool_use_id: toolUseID,
    content,
    is_error: isError,
  }
}

function makeToolResultMessage(
  param: ToolResultBlockParam,
  data?: unknown,
): UserMessage {
  return createUserMessage(
    [param] as any,
    data === undefined
      ? undefined
      : {
          data,
          resultForAssistant: param.content,
        },
  )
}

function makeToolUseMessage(
  toolUseID: string,
  name: string,
  input: unknown = {},
): Message {
  const message = createAssistantMessage('ignored') as any
  message.message.content = [
    {
      type: 'tool_use',
      id: toolUseID,
      name,
      input,
    },
  ]
  return message
}

const inputSchema = z.object({}).passthrough()

function makeTool(overrides: Partial<Tool<typeof inputSchema, unknown>> = {}) {
  return {
    name: 'FakeTool',
    inputSchema,
    async prompt() {
      return ''
    },
    async isEnabled() {
      return true
    },
    isReadOnly() {
      return true
    },
    isConcurrencySafe() {
      return true
    },
    needsPermissions() {
      return false
    },
    renderResultForAssistant() {
      return ''
    },
    renderToolUseMessage() {
      return null
    },
    async *call() {
      yield { type: 'result', data: {} }
    },
    ...overrides,
  } satisfies Tool<typeof inputSchema, unknown>
}

function renderToolResult(args: {
  param: ToolResultBlockParam
  message: UserMessage
  messages: Message[]
  tools?: Tool[]
  verbose?: boolean
}) {
  return renderToText(
    <UserToolResultMessage
      param={args.param}
      message={args.message}
      messages={args.messages}
      tools={args.tools ?? []}
      verbose={args.verbose ?? false}
      width={80}
    />,
  )
}

describe('UserToolResultMessage orphaned fallback', () => {
  test('renders orphaned successful tool_result without throwing', async () => {
    const param = makeToolResultParam('missing-tool-use', 'first\nsecond')
    const message = makeToolResultMessage(param)

    const out = await renderToolResult({
      param,
      message,
      messages: [message],
    })

    expect(out).toContain('Tool result unavailable')
    expect(out).toContain('first')
    expect(out).toContain('second')
    expect(out).not.toContain('Tool use not found')
  })

  test('renders orphaned rejected tool_result with existing rejection fallback', async () => {
    const param = makeToolResultParam('missing-tool-use', REJECT_MESSAGE, true)
    const message = makeToolResultMessage(param)

    const out = await renderToolResult({
      param,
      message,
      messages: [message],
    })

    expect(out).toContain('No (tell')
    expect(out).not.toContain('Tool use not found')
  })

  test('uses the matched tool renderer when the tool_use and tool exist', async () => {
    const param = makeToolResultParam('tool-use-1', 'assistant content')
    const message = makeToolResultMessage(param, { value: 'from data' })
    const toolUse = makeToolUseMessage('tool-use-1', 'FakeTool')
    let rendered = false
    const tool = makeTool({
      renderToolResultMessage(output) {
        rendered = true
        return <Text>custom result: {(output as any).value}</Text>
      },
    })

    const out = await renderToolResult({
      param,
      message,
      messages: [toolUse, message],
      tools: [tool],
    })

    expect(rendered).toBe(true)
    expect(out).toContain('custom result: from data')
    expect(out).not.toContain('Tool result unavailable')
  })

  test('falls back when the tool_use exists but the tool is unavailable', async () => {
    const param = makeToolResultParam('tool-use-2', 'raw content')
    const message = makeToolResultMessage(param, { value: 'from data' })
    const toolUse = makeToolUseMessage('tool-use-2', 'MissingTool')

    const out = await renderToolResult({
      param,
      message,
      messages: [toolUse, message],
      tools: [],
    })

    expect(out).toContain('Tool result unavailable')
    expect(out).toContain('raw content')
    expect(out).not.toContain('Tool not found')
  })

  test('truncates fallback string content only outside verbose mode', async () => {
    const content = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join(
      '\n',
    )
    const param = makeToolResultParam('missing-tool-use', content)
    const message = makeToolResultMessage(param)

    const terse = await renderToolResult({
      param,
      message,
      messages: [message],
      verbose: false,
    })
    const verbose = await renderToolResult({
      param,
      message,
      messages: [message],
      verbose: true,
    })

    expect(terse).toContain('line 9')
    expect(terse).toContain('...')
    expect(terse).not.toContain('line 10')
    expect(verbose).toContain('line 12')
  })
})
