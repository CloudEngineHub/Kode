import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  findMostRecentKodeAgentSessionId,
  loadKodeAgentSessionLogData,
  loadKodeAgentSessionMessages,
  loadKodeAgentSessionMessagesForResume,
} from '#protocol/utils/kodeAgentSessionLoad'
import {
  getSessionLogFilePath,
  sanitizeProjectNameForSessionStore,
} from '#protocol/utils/kodeAgentSessionLog'
import { setKodeAgentSessionId } from '#protocol/utils/kodeAgentSessionId'

describe('session loader (projects/*.jsonl)', () => {
  const originalConfigDir = process.env.KODE_CONFIG_DIR

  let configDir: string
  let projectDir: string

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'kode-claude-load-config-'))
    projectDir = mkdtempSync(join(tmpdir(), 'kode-claude-load-project-'))
    process.env.KODE_CONFIG_DIR = configDir
    setKodeAgentSessionId('11111111-1111-4111-8111-111111111111')
  })

  afterEach(() => {
    if (originalConfigDir === undefined) {
      delete process.env.KODE_CONFIG_DIR
    } else {
      process.env.KODE_CONFIG_DIR = originalConfigDir
    }
    rmSync(configDir, { recursive: true, force: true })
    rmSync(projectDir, { recursive: true, force: true })
  })

  test('loads user/assistant messages from a session jsonl file', () => {
    const sessionId = '22222222-2222-4222-8222-222222222222'
    const path = getSessionLogFilePath({ cwd: projectDir, sessionId })
    mkdirSync(
      join(
        configDir,
        'projects',
        sanitizeProjectNameForSessionStore(projectDir),
      ),
      {
        recursive: true,
      },
    )

    const lines =
      [
        JSON.stringify({
          type: 'file-history-snapshot',
          messageId: 'm1',
          snapshot: {
            messageId: 'm1',
            trackedFileBackups: {},
            timestamp: new Date().toISOString(),
          },
          isSnapshotUpdate: false,
        }),
        JSON.stringify({
          type: 'user',
          sessionId,
          uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          message: { role: 'user', content: 'hello' },
        }),
        JSON.stringify({
          type: 'assistant',
          sessionId,
          uuid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          message: {
            id: 'msg1',
            model: 'x',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'hi' }],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 0 },
          },
        }),
      ].join('\n') + '\n'
    writeFileSync(path, lines, 'utf8')

    const messages = loadKodeAgentSessionMessages({
      cwd: projectDir,
      sessionId,
    })
    expect(messages.length).toBe(2)
    expect(messages[0].type).toBe('user')
    if (messages[0]?.type === 'user') {
      expect(messages[0].message.content).toBe('hello')
    }
    expect(messages[1].type).toBe('assistant')
    if (messages[1]?.type === 'assistant') {
      expect(messages[1].message.role).toBe('assistant')
    }
  })

  test('loads summary/custom-title/tag metadata from session log', () => {
    const sessionId = '55555555-5555-4555-8555-555555555555'
    const path = getSessionLogFilePath({ cwd: projectDir, sessionId })
    mkdirSync(
      join(
        configDir,
        'projects',
        sanitizeProjectNameForSessionStore(projectDir),
      ),
      {
        recursive: true,
      },
    )

    const assistantUuid = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    const lines =
      [
        JSON.stringify({
          type: 'file-history-snapshot',
          messageId: 'm1',
          snapshot: {
            messageId: 'm1',
            trackedFileBackups: {},
            timestamp: new Date().toISOString(),
          },
          isSnapshotUpdate: false,
        }),
        JSON.stringify({
          type: 'user',
          sessionId,
          uuid: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          message: { role: 'user', content: 'hello' },
        }),
        JSON.stringify({
          type: 'assistant',
          sessionId,
          uuid: assistantUuid,
          message: {
            id: 'msg1',
            model: 'x',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'hi' }],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 0 },
          },
        }),
        JSON.stringify({
          type: 'summary',
          summary: 'sum',
          leafUuid: assistantUuid,
        }),
        JSON.stringify({
          type: 'custom-title',
          sessionId,
          customTitle: 'My Session',
        }),
        JSON.stringify({ type: 'tag', sessionId, tag: 'pr' }),
      ].join('\n') + '\n'
    writeFileSync(path, lines, 'utf8')

    const data = loadKodeAgentSessionLogData({ cwd: projectDir, sessionId })
    expect(data.summaries.get(assistantUuid)).toBe('sum')
    expect(data.customTitles.get(sessionId)).toBe('My Session')
    expect(data.tags.get(sessionId)).toBe('pr')
    expect(data.fileHistorySnapshots.get('m1')?.type).toBe(
      'file-history-snapshot',
    )
    expect(data.lastSummaryLeafUuid).toBe(assistantUuid)
  })

  test('findMostRecentKodeAgentSessionId picks newest jsonl by mtime', () => {
    const projectRoot = join(
      configDir,
      'projects',
      sanitizeProjectNameForSessionStore(projectDir),
    )
    mkdirSync(projectRoot, { recursive: true })

    const older = join(
      projectRoot,
      '33333333-3333-4333-8333-333333333333.jsonl',
    )
    const newer = join(
      projectRoot,
      '44444444-4444-4444-8444-444444444444.jsonl',
    )
    writeFileSync(
      older,
      JSON.stringify({
        type: 'user',
        uuid: 'u',
        message: { role: 'user', content: 'old' },
      }) + '\n',
      'utf8',
    )
    writeFileSync(
      newer,
      JSON.stringify({
        type: 'user',
        uuid: 'u',
        message: { role: 'user', content: 'new' },
      }) + '\n',
      'utf8',
    )

    const now = Date.now() / 1000
    utimesSync(older, now - 10, now - 10)
    utimesSync(newer, now, now)

    expect(findMostRecentKodeAgentSessionId(projectDir)).toBe(
      '44444444-4444-4444-8444-444444444444',
    )
  })

  test('tolerates a truncated final JSONL line (recovers earlier messages)', () => {
    const sessionId = '66666666-6666-4666-8666-666666666666'
    const path = getSessionLogFilePath({ cwd: projectDir, sessionId })
    mkdirSync(
      join(
        configDir,
        'projects',
        sanitizeProjectNameForSessionStore(projectDir),
      ),
      {
        recursive: true,
      },
    )

    const lines =
      [
        JSON.stringify({
          type: 'file-history-snapshot',
          messageId: 'm1',
          snapshot: {
            messageId: 'm1',
            trackedFileBackups: {},
            timestamp: new Date().toISOString(),
          },
          isSnapshotUpdate: false,
        }),
        JSON.stringify({
          type: 'user',
          sessionId,
          uuid: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          message: { role: 'user', content: 'hello' },
        }),
        JSON.stringify({
          type: 'assistant',
          sessionId,
          uuid: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
          message: {
            id: 'msg1',
            model: 'x',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'hi' }],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 0 },
          },
        }),
        '{"type":"tag","sessionId":"broken',
      ].join('\n') + '\n'
    writeFileSync(path, lines, 'utf8')

    const messages = loadKodeAgentSessionMessages({
      cwd: projectDir,
      sessionId,
    })
    expect(messages.length).toBe(2)
    expect(messages[0]?.type).toBe('user')
    expect(messages[1]?.type).toBe('assistant')
  })

  test('loadKodeAgentSessionMessagesForResume trims to most recent summary boundary', () => {
    const sessionId = '88888888-8888-4888-8888-888888888888'
    const path = getSessionLogFilePath({ cwd: projectDir, sessionId })
    mkdirSync(
      join(
        configDir,
        'projects',
        sanitizeProjectNameForSessionStore(projectDir),
      ),
      {
        recursive: true,
      },
    )

    const preUserUuid = '01010101-0101-4101-8101-010101010101'
    const preAssistantUuid = '02020202-0202-4202-8202-020202020202'
    const compactUserUuid = '03030303-0303-4303-8303-030303030303'
    const compactAssistantUuid = '04040404-0404-4404-8404-040404040404'
    const postUserUuid = '05050505-0505-4505-8505-050505050505'
    const postAssistantUuid = '06060606-0606-4606-8606-060606060606'

    const lines =
      [
        JSON.stringify({
          type: 'file-history-snapshot',
          messageId: 'm1',
          snapshot: {
            messageId: 'm1',
            trackedFileBackups: {},
            timestamp: new Date().toISOString(),
          },
          isSnapshotUpdate: false,
        }),
        JSON.stringify({
          type: 'user',
          sessionId,
          uuid: preUserUuid,
          message: { role: 'user', content: 'hello' },
        }),
        JSON.stringify({
          type: 'assistant',
          sessionId,
          uuid: preAssistantUuid,
          message: {
            id: 'msg1',
            model: 'x',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'hi' }],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 0 },
          },
        }),
        JSON.stringify({
          type: 'user',
          sessionId,
          uuid: compactUserUuid,
          message: { role: 'user', content: 'Context has been compacted.' },
        }),
        JSON.stringify({
          type: 'assistant',
          sessionId,
          uuid: compactAssistantUuid,
          message: {
            id: 'msg2',
            model: 'x',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'summary' }],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 0 },
          },
        }),
        JSON.stringify({
          type: 'summary',
          summary: 'sum',
          leafUuid: compactAssistantUuid,
        }),
        JSON.stringify({
          type: 'user',
          sessionId,
          uuid: postUserUuid,
          message: { role: 'user', content: 'after' },
        }),
        JSON.stringify({
          type: 'assistant',
          sessionId,
          uuid: postAssistantUuid,
          message: {
            id: 'msg3',
            model: 'x',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'after hi' }],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 0 },
          },
        }),
      ].join('\n') + '\n'
    writeFileSync(path, lines, 'utf8')

    const allMessages = loadKodeAgentSessionMessages({
      cwd: projectDir,
      sessionId,
    })
    expect(allMessages.map(m => m.uuid)).toEqual([
      preUserUuid,
      preAssistantUuid,
      compactUserUuid,
      compactAssistantUuid,
      postUserUuid,
      postAssistantUuid,
    ])

    const trimmed = loadKodeAgentSessionMessagesForResume({
      cwd: projectDir,
      sessionId,
    })
    expect(trimmed.map(m => m.uuid)).toEqual([
      compactUserUuid,
      compactAssistantUuid,
      postUserUuid,
      postAssistantUuid,
    ])
  })

  test('loadKodeAgentSessionMessagesForResume keeps up to two preceding user messages', () => {
    const sessionId = '99999999-9999-4999-8999-999999999999'
    const path = getSessionLogFilePath({ cwd: projectDir, sessionId })
    mkdirSync(
      join(
        configDir,
        'projects',
        sanitizeProjectNameForSessionStore(projectDir),
      ),
      {
        recursive: true,
      },
    )

    const userPromptUuid = '07070707-0707-4707-8707-070707070707'
    const compactNoticeUuid = '08080808-0808-4808-8808-080808080808'
    const compactAssistantUuid = '09090909-0909-4909-8909-090909090909'

    const lines =
      [
        JSON.stringify({
          type: 'file-history-snapshot',
          messageId: 'm1',
          snapshot: {
            messageId: 'm1',
            trackedFileBackups: {},
            timestamp: new Date().toISOString(),
          },
          isSnapshotUpdate: false,
        }),
        JSON.stringify({
          type: 'user',
          sessionId,
          uuid: userPromptUuid,
          message: { role: 'user', content: 'prompt' },
        }),
        JSON.stringify({
          type: 'user',
          sessionId,
          uuid: compactNoticeUuid,
          message: { role: 'user', content: 'auto compact notice' },
        }),
        JSON.stringify({
          type: 'assistant',
          sessionId,
          uuid: compactAssistantUuid,
          message: {
            id: 'msg1',
            model: 'x',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'summary' }],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 0 },
          },
        }),
        JSON.stringify({
          type: 'summary',
          summary: 'sum',
          leafUuid: compactAssistantUuid,
        }),
      ].join('\n') + '\n'
    writeFileSync(path, lines, 'utf8')

    const trimmed = loadKodeAgentSessionMessagesForResume({
      cwd: projectDir,
      sessionId,
    })
    expect(trimmed.map(m => m.uuid)).toEqual([
      userPromptUuid,
      compactNoticeUuid,
      compactAssistantUuid,
    ])
  })

  test('throws a stable error for missing session IDs (not TypeError)', () => {
    expect(() =>
      loadKodeAgentSessionMessages({
        cwd: projectDir,
        sessionId: '77777777-7777-7777-7777-777777777777',
      }),
    ).toThrow('No conversation found with session ID')
  })
})
