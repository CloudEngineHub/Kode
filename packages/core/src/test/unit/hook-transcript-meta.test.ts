import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { createAssistantMessage, createUserMessage } from '#core/utils/messages'
import {
  getHookTranscriptPath,
  updateHookTranscriptForMessages,
} from '@kode/hooks'

describe('hook transcript', () => {
  test('skips synthetic meta messages', () => {
    const toolUseContext = {}
    const meta = {
      ...createAssistantMessage('<thinking-only-retry />'),
      isMeta: true,
    }

    updateHookTranscriptForMessages(toolUseContext, [
      createUserMessage('hello'),
      meta,
      createAssistantMessage('visible response'),
    ])

    const transcriptPath = getHookTranscriptPath(toolUseContext)
    expect(transcriptPath).toBeString()

    const transcript = readFileSync(transcriptPath!, 'utf8')
    expect(transcript).toContain('user: hello')
    expect(transcript).toContain('assistant: visible response')
    expect(transcript).not.toContain('thinking-only-retry')
  })
})
