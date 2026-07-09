import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Message } from '@kode/core/query'
import { INTERRUPT_MESSAGE } from '@kode/core/utils/messages'
import {
  getCwd,
  getOriginalCwd,
  setCwd,
  setOriginalCwd,
} from '@kode/core/utils/state'

import { SessionRegistry } from '../sessionRegistry'
import { loadSessionMessages } from './session.handler'
import { handleChatPrompt } from './chat.handler'

function messageText(message: Message): string {
  if (message.type === 'progress') return ''
  const content = message.message.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter(
      block => block && typeof block === 'object' && block.type === 'text',
    )
    .map(block => String('text' in block ? block.text : ''))
    .join('')
}

function historyView(messages: Message[]) {
  return messages.map(message => ({
    type: message.type,
    text: messageText(message),
  }))
}

describe('daemon cancellation history', () => {
  test('keeps live and reloaded history identical after cancel and retry', async () => {
    const originalCwd = getCwd()
    const originalOriginalCwd = getOriginalCwd()
    const previousConfigDir = process.env.KODE_CONFIG_DIR
    const tempRoot = mkdtempSync(join(tmpdir(), 'kode-cancel-history-'))
    const projectDir = join(tempRoot, 'project')
    const configDir = join(tempRoot, 'config')
    mkdirSync(projectDir, { recursive: true })
    process.env.KODE_CONFIG_DIR = configDir

    const registry = new SessionRegistry()
    const session = registry.create(projectDir)
    const baseArgs = {
      session,
      echo: true,
      commands: [],
      tools: [],
      toolNames: [],
      slashCommands: [],
      mcpClients: [],
      persistSession: true,
    }

    try {
      await handleChatPrompt({
        ...baseArgs,
        prompt: 'cancelled turn',
        echoDelayMs: 1_000,
        wsSend(payload) {
          const event = payload as { type?: unknown }
          if (event.type === 'user') {
            queueMicrotask(() => session.activeAbortController?.abort())
          }
        },
      })

      await handleChatPrompt({
        ...baseArgs,
        prompt: 'retry turn',
        echoDelayMs: 0,
        wsSend: () => {},
      })

      const expected: ReturnType<typeof historyView> = [
        { type: 'user', text: 'cancelled turn' },
        { type: 'assistant', text: INTERRUPT_MESSAGE },
        { type: 'user', text: 'retry turn' },
        { type: 'assistant', text: 'retry turn' },
      ]
      expect(historyView(session.messages)).toEqual(expected)

      const fromDisk = loadSessionMessages({
        cwd: projectDir,
        sessionId: session.sessionId,
      })
      expect(historyView(fromDisk)).toEqual(expected)

      const restarted = new SessionRegistry().getOrLoad({
        cwd: projectDir,
        sessionId: session.sessionId,
      })
      if (restarted.ok === false) {
        throw new Error(`reload failed: ${restarted.reason}`)
      }
      expect(restarted.restored).toBe(true)
      expect(historyView(restarted.session.messages)).toEqual(expected)
    } finally {
      await setCwd(originalCwd)
      setOriginalCwd(originalOriginalCwd)
      if (previousConfigDir === undefined) delete process.env.KODE_CONFIG_DIR
      else process.env.KODE_CONFIG_DIR = previousConfigDir
      rmSync(tempRoot, { recursive: true, force: true })
    }
  }, 10_000)
})
