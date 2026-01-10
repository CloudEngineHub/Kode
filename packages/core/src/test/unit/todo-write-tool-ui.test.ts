import { describe, expect, test } from 'bun:test'
import { TodoWriteTool } from '#tools/tools/interaction/TodoWriteTool/TodoWriteTool'
import type { ToolUseContext } from '#core/tooling/Tool'

const makeContext = (): ToolUseContext => ({
  abortController: new AbortController(),
  messageId: 'test',
  readFileTimestamps: {},
})

describe('TodoWriteTool UI parity (Reference CLI)', () => {
  test('renderToolUseMessage returns null (suppressed tool-use line)', () => {
    const msg = TodoWriteTool.renderToolUseMessage(
      {
        todos: [
          {
            content: 'Task',
            status: 'pending',
            activeForm: 'Doing task',
          },
        ],
      },
      { verbose: false },
    )
    expect(msg).toBeNull()
  })

  test('renderToolResultMessage returns null (TodoWrite does not print todo list by default)', () => {
    const node = TodoWriteTool.renderToolResultMessage?.(
      {
        oldTodos: [],
        newTodos: [],
      },
      { verbose: false },
    )
    expect(node).toBeNull()
  })

  test('call throws on storage failures so query can emit tool_result.is_error=true', async () => {
    const tooManyTodos = Array.from({ length: 101 }, (_, i) => ({
      content: `Todo ${i}`,
      status: 'pending' as const,
      activeForm: `Doing todo ${i}`,
    }))

    const gen = TodoWriteTool.call({ todos: tooManyTodos }, makeContext())
    await expect(gen.next()).rejects.toThrow('Todo limit exceeded')
  })
})
