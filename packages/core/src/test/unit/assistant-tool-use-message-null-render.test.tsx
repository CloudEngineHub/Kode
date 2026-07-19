import { describe, expect, test } from 'bun:test'
import { Box, render } from 'ink'
import React from 'react'
import { PassThrough } from 'stream'
import stripAnsi from 'strip-ansi'
import { z } from 'zod'
import { AssistantToolUseMessage } from '#ui-ink/components/messages/AssistantToolUseMessage'
import type { Tool } from '#core/tooling/Tool'
import { TaskTool } from '#tools/tools/ai/TaskTool/TaskTool'

async function renderToText(element: React.ReactElement): Promise<string> {
  const stdin = new PassThrough() as PassThrough & {
    isTTY?: boolean
    isRaw?: boolean
    setRawMode?: (enabled: boolean) => void
  }
  stdin.isTTY = true
  stdin.isRaw = true
  stdin.setRawMode = () => {}
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

  const instance = render(<Box>{element}</Box>, {
    stdin: stdin as unknown as NodeJS.ReadStream,
    stdout: stdout as unknown as NodeJS.WriteStream,
    exitOnCtrlC: false,
  })

  // Let Ink flush at least once.
  await new Promise(resolve => setTimeout(resolve, 0))

  instance.unmount()
  return stripAnsi(rawOutput)
}

describe('AssistantToolUseMessage (null tool-use message parity)', () => {
  test('hides tool-use line when userFacingName is empty and renderToolUseMessage returns null', async () => {
    const inputSchema = z.strictObject({ foo: z.string() })

    const hiddenTool: Tool<typeof inputSchema, unknown> = {
      name: 'HiddenTool',
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
      userFacingName() {
        return ''
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
    }

    const out = await renderToText(
      <AssistantToolUseMessage
        param={{
          type: 'tool_use',
          id: 't1',
          name: 'HiddenTool',
          input: { foo: 'bar' },
        }}
        costUSD={0}
        durationMs={0}
        addMargin={false}
        tools={[hiddenTool]}
        debug={false}
        verbose={false}
        erroredToolUseIDs={new Set()}
        inProgressToolUseIDs={new Set(['t1'])}
        unresolvedToolUseIDs={new Set(['t1'])}
        shouldAnimate={false}
        shouldShowDot={false}
      />,
    )

    expect(out.trim()).toBe('')
  })

  test('still renders standard ToolName(params)… for normal tools', async () => {
    const inputSchema = z.strictObject({ file_path: z.string() })

    const readTool: Tool<typeof inputSchema, unknown> = {
      name: 'Read',
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
      userFacingName() {
        return 'Read'
      },
      renderResultForAssistant() {
        return ''
      },
      renderToolUseMessage({ file_path }) {
        return `file_path: ${JSON.stringify(file_path)}`
      },
      async *call() {
        yield { type: 'result', data: {} }
      },
    }

    const out = await renderToText(
      <AssistantToolUseMessage
        param={{
          type: 'tool_use',
          id: 't2',
          name: 'Read',
          input: { file_path: '/tmp/a.txt' },
        }}
        costUSD={0}
        durationMs={0}
        addMargin={false}
        tools={[readTool]}
        debug={false}
        verbose={false}
        erroredToolUseIDs={new Set()}
        inProgressToolUseIDs={new Set(['t2'])}
        unresolvedToolUseIDs={new Set(['t2'])}
        shouldAnimate={false}
        shouldShowDot={false}
      />,
    )

    expect(out).toContain('Read(file_path:')
    expect(out).toContain('…')
  })

  test('renders Task tool execution state labels', async () => {
    const baseParam = {
      type: 'tool_use' as const,
      id: 'task_1',
      name: TaskTool.name,
      input: {
        description: 'Refactor auth.ts',
        prompt: 'Refactor auth.ts',
        subagent_type: 'general-purpose',
      },
    }

    const running = await renderToText(
      <AssistantToolUseMessage
        param={baseParam}
        costUSD={0}
        durationMs={0}
        addMargin={false}
        tools={[TaskTool]}
        debug={false}
        verbose={false}
        erroredToolUseIDs={new Set()}
        inProgressToolUseIDs={new Set(['task_1'])}
        unresolvedToolUseIDs={new Set(['task_1'])}
        shouldAnimate={false}
        shouldShowDot={false}
      />,
    )

    const queued = await renderToText(
      <AssistantToolUseMessage
        param={{ ...baseParam, id: 'task_2' }}
        costUSD={0}
        durationMs={0}
        addMargin={false}
        tools={[TaskTool]}
        debug={false}
        verbose={false}
        erroredToolUseIDs={new Set()}
        inProgressToolUseIDs={new Set()}
        unresolvedToolUseIDs={new Set(['task_2'])}
        shouldAnimate={false}
        shouldShowDot={false}
      />,
    )

    const failed = await renderToText(
      <AssistantToolUseMessage
        param={{ ...baseParam, id: 'task_3' }}
        costUSD={0}
        durationMs={0}
        addMargin={false}
        tools={[TaskTool]}
        debug={false}
        verbose={false}
        erroredToolUseIDs={new Set(['task_3'])}
        inProgressToolUseIDs={new Set()}
        unresolvedToolUseIDs={new Set()}
        shouldAnimate={false}
        shouldShowDot={false}
      />,
    )

    expect(running).toContain('Task [running]')
    expect(running).toContain('Refactor auth.ts')
    expect(queued).toContain('Task [queued]')
    expect(failed).toContain('Task [failed]')
  })
})
