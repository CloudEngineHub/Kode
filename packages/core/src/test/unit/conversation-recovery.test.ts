import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { loadMessagesFromLog } from '#core/utils/conversationRecovery'
import { loadLogList } from '#core/utils/log'

describe('conversation recovery (legacy json logs)', () => {
  test('recovers message prefix from a truncated JSON array log', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kode-conversation-recovery-'))
    try {
      const logPath = join(dir, '2025-01-01T00-00-00-000Z.json')
      const truncated = `[
  {
    "type": "user",
    "message": { "content": "hello" },
    "timestamp": "2025-01-01T00:00:00.000Z"
  },
  {
    "type": "assistant",
    "message": { "content": "hi" },
`
      writeFileSync(logPath, truncated, 'utf8')

      const messages = await loadMessagesFromLog(logPath, [] as any)
      expect(messages.length).toBe(1)
      expect(messages[0]?.type).toBe('user')
      expect(messages[0]?.message?.content).toBe('hello')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('loadLogList does not crash on a truncated JSON array log', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kode-loglist-recovery-'))
    try {
      const logPath = join(dir, '2025-01-01T00-00-00-000Z.json')
      const truncated = `[
  {
    "type": "user",
    "message": { "content": "hello" },
    "timestamp": "2025-01-01T00:00:00.000Z"
  },
  {
    "type": "assistant",
    "message": { "content": "hi" },
`
      writeFileSync(logPath, truncated, 'utf8')

      const logs = await loadLogList(dir)
      expect(logs.length).toBe(1)
      expect(logs[0]?.messageCount).toBe(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
