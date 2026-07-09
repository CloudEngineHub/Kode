import { describe, expect, test } from 'bun:test'
import {
  createAssistantMessage,
  createProgressMessage,
  createUserMessage,
} from '#core/utils/messages'
import type { Message } from '#core/query'
import { appendMessagesForReplState } from './useReplQuery'

function makeProgress(toolUseID: string, text: string): Message {
  return createProgressMessage(
    toolUseID,
    new Set([toolUseID]),
    createAssistantMessage(`<tool-progress>${text}</tool-progress>`),
    [],
    [],
  )
}

describe('appendMessagesForReplState', () => {
  test('replaces prior progress for the same tool use', () => {
    const user = createUserMessage('hello')
    const first = makeProgress('tool-1', 'Waiting...')
    const next = makeProgress('tool-1', 'Running...')

    const result = appendMessagesForReplState([user, first], [next])

    expect(result).toHaveLength(2)
    expect(result[0]).toBe(user)
    expect(result[1]).toBe(next)
  })

  test('keeps progress for different tool uses', () => {
    const first = makeProgress('tool-1', 'Running 1')
    const second = makeProgress('tool-2', 'Running 2')

    const result = appendMessagesForReplState([first], [second])

    expect(result).toEqual([first, second])
  })

  test('appends ordinary messages without cloning an empty update', () => {
    const user = createUserMessage('hello')
    const assistant = createAssistantMessage('done')
    const original = [user]

    expect(appendMessagesForReplState(original, [])).toBe(original)
    expect(appendMessagesForReplState(original, [assistant])).toEqual([
      user,
      assistant,
    ])
  })
})
