import { afterEach, describe, expect, test } from 'bun:test'
import { setMessagesSetter } from '#core/messages'
import { createAssistantMessage } from '#core/utils/messages'
import { updateAutoCompactedMessages } from '#core/utils/autoCompactCore'

afterEach(() => {
  setMessagesSetter(() => {})
})

describe('auto compaction transcript updates', () => {
  test('preserves the terminal transcript while replacing model context', () => {
    const compactedMessages = [createAssistantMessage('compacted context')]
    let receivedMessages: unknown
    let preserveTranscript = false
    setMessagesSetter((messages, options) => {
      receivedMessages = messages
      preserveTranscript = options?.preserveTranscript === true
    })

    updateAutoCompactedMessages(compactedMessages)

    expect(receivedMessages).toBe(compactedMessages)
    expect(preserveTranscript).toBe(true)
  })
})
