import { describe, expect, test } from 'bun:test'

import type { Tool, ToolUseContext } from '@kode/tool-interface/Tool'
import { FileEditTool } from '#tools/tools/filesystem/FileEditTool/FileEditTool'
import { FileWriteTool } from '#tools/tools/filesystem/FileWriteTool/FileWriteTool'
import { createAssistantMessage } from '../messages/create'
import { checkPermissionsAndCallTool } from './tool-call'

async function runWindowsGoalWrite(tool: Tool, input: Record<string, unknown>) {
  let permissionCalls = 0
  const messages: unknown[] = []
  for await (const message of checkPermissionsAndCallTool(
    tool,
    'tool-use-1',
    new Set(),
    input,
    {
      agentId: 'main',
      abortController: new AbortController(),
      messageId: undefined,
      readFileTimestamps: {},
      options: {
        automationKind: 'goal',
        __sandboxPlatform: 'win32',
        safeMode: false,
      },
    } as ToolUseContext,
    (async () => {
      permissionCalls += 1
      return { result: true }
    }) as never,
    createAssistantMessage('assistant tool call'),
  )) {
    messages.push(message)
  }
  return { messages, permissionCalls }
}

function toolResultText(message: unknown): string {
  const content = (
    message as {
      type?: string
      message?: { content?: Array<{ content?: unknown }> }
    }
  ).message?.content
  if (!Array.isArray(content)) return ''
  return String(content[0]?.content ?? '')
}

describe('Windows automated write policy', () => {
  test('blocks Write even when the normal permission layer would allow it', async () => {
    const result = await runWindowsGoalWrite(FileWriteTool, {
      file_path: 'C:\\workspace\\created.txt',
      content: 'blocked',
    })

    expect(result.permissionCalls).toBe(0)
    expect(toolResultText(result.messages[0])).toContain(
      'Blocked by the Windows execution policy',
    )
  })

  test('blocks Edit through the same central policy', async () => {
    const result = await runWindowsGoalWrite(FileEditTool, {
      file_path: 'C:\\workspace\\existing.txt',
      old_string: 'before',
      new_string: 'after',
      replace_all: false,
    })

    expect(result.permissionCalls).toBe(0)
    expect(toolResultText(result.messages[0])).toContain(
      'remote_strongly_isolated_kernel',
    )
  })
})
