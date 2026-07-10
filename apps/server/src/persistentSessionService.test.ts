import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import {
  createAssistantMessage,
  createUserMessage,
} from '@kode/core/utils/messages'

import { PersistentSessionService } from './persistentSessionService'
import { SessionRegistry } from './sessionRegistry'

const temporaryDirectories: string[] = []
const originalConfigDir = process.env.KODE_CONFIG_DIR

function createFixture(): {
  cwd: string
  otherCwd: string
  service: PersistentSessionService
  registry: SessionRegistry
} {
  const root = mkdtempSync(join(tmpdir(), 'kode-persistent-session-'))
  const cwd = join(root, 'project')
  const otherCwd = join(root, 'other-project')
  temporaryDirectories.push(root)
  process.env.KODE_CONFIG_DIR = join(root, 'config')
  const registry = new SessionRegistry()
  return {
    cwd,
    otherCwd,
    registry,
    service: new PersistentSessionService(registry),
  }
}

function createSourceSession(args: {
  registry: SessionRegistry
  cwd: string
  sessionId?: string
}) {
  const user = createUserMessage('persisted source prompt')
  user.uuid = '22222222-2222-4222-8222-222222222222' as typeof user.uuid
  const assistant = createAssistantMessage('persisted source reply')
  assistant.uuid =
    '33333333-3333-4333-8333-333333333333' as typeof assistant.uuid
  return args.registry.createFromMessages({
    cwd: args.cwd,
    sessionId: args.sessionId ?? '11111111-1111-4111-8111-111111111111',
    messages: [user, assistant],
  })
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
  if (originalConfigDir === undefined) delete process.env.KODE_CONFIG_DIR
  else process.env.KODE_CONFIG_DIR = originalConfigDir
})

describe('persistent session service', () => {
  test('lists a live runtime session before it has a durable transcript', () => {
    const { cwd, registry, service } = createFixture()
    const source = createSourceSession({ registry, cwd })

    const listed = service.list({ cwd })
    const detail = service.resolve({ cwd, sessionId: source.sessionId })

    expect(listed.map(session => session.sessionId)).toContain(source.sessionId)
    expect(detail.ok).toBe(true)
    if (detail.ok === false) throw new Error(detail.reason)
    expect(detail.detail.messages).toHaveLength(2)
    expect(detail.detail.runtime).toBe(source)
  })

  test('forks a live session into an isolated durable child with metadata', () => {
    const { cwd, otherCwd, registry, service } = createFixture()
    const source = createSourceSession({ registry, cwd })
    const childId = '44444444-4444-4444-8444-444444444444'

    const forked = service.fork({
      cwd,
      sessionId: source.sessionId,
      newSessionId: childId,
      customTitle: 'Child session',
      tag: 'fork',
      summary: 'Durable fork summary',
    })
    expect(forked.ok).toBe(true)
    if (forked.ok === false) throw new Error(forked.reason)
    expect(forked.detail.session.forkedFromSessionId).toBe(source.sessionId)
    expect(forked.detail.session.forkRootSessionId).toBe(source.sessionId)
    expect(forked.detail.messages).toHaveLength(2)

    const restarted = new PersistentSessionService(
      new SessionRegistry(),
    ).resolve({
      cwd,
      sessionId: childId,
    })
    expect(restarted.ok).toBe(true)
    if (restarted.ok === false) throw new Error(restarted.reason)
    expect(restarted.detail.messages).toHaveLength(2)
    expect(restarted.detail.session.customTitle).toBe('Child session')
    expect(restarted.detail.session.tag).toBe('fork')
    expect(restarted.detail.session.summary).toBe('Durable fork summary')
    expect(restarted.detail.session.forkedFromSessionId).toBe(source.sessionId)
    expect(restarted.detail.session.forkRootSessionId).toBe(source.sessionId)
    expect(
      new PersistentSessionService(new SessionRegistry()).resolve({
        cwd: otherCwd,
        sessionId: childId,
      }),
    ).toEqual({ ok: false, reason: 'not_found' })
  })

  test('keeps immediate tool results when an assistant is the fork cutoff', () => {
    const { cwd, registry, service } = createFixture()
    const source = createSourceSession({ registry, cwd })
    const toolResult = createUserMessage([
      {
        type: 'tool_result',
        tool_use_id: 'toolu_persistent_fork',
        is_error: false,
        content: 'tool completed',
      },
    ])
    toolResult.uuid =
      '55555555-5555-4555-8555-555555555555' as typeof toolResult.uuid
    const laterUser = createUserMessage('must not be copied')
    laterUser.uuid =
      '66666666-6666-4666-8666-666666666666' as typeof laterUser.uuid
    source.messages.push(toolResult, laterUser)

    const forked = service.fork({
      cwd,
      sessionId: source.sessionId,
      newSessionId: '44444444-4444-4444-8444-444444444444',
      beforeUuid: '33333333-3333-4333-8333-333333333333',
      includeUuid: true,
    })

    expect(forked.ok).toBe(true)
    if (forked.ok === false) throw new Error(forked.reason)
    expect(forked.detail.messages.map(message => message.uuid)).toEqual([
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      '55555555-5555-4555-8555-555555555555',
    ])
  })

  test('normalizes metadata validation and persistence failures', () => {
    const { cwd, registry, service } = createFixture()
    const source = createSourceSession({ registry, cwd })

    expect(
      service.updateMetadata({
        cwd,
        sessionId: source.sessionId,
        patch: { summary: 'x'.repeat(12_001) },
      }),
    ).toEqual({ ok: false, reason: 'invalid_metadata' })

    const blockedConfigPath = join(dirname(cwd), 'metadata-root-file')
    writeFileSync(blockedConfigPath, 'not a directory', 'utf8')
    process.env.KODE_CONFIG_DIR = blockedConfigPath
    expect(
      service.updateMetadata({
        cwd,
        sessionId: source.sessionId,
        patch: { tag: 'persistence-check' },
      }),
    ).toEqual({ ok: false, reason: 'persistence_failed' })
  })

  test('keeps workspace identity isolated and archives only idle sessions', () => {
    const { cwd, otherCwd, registry, service } = createFixture()
    const source = createSourceSession({ registry, cwd })
    source.clients.add({ send: () => {} })

    expect(
      service.resolve({ cwd: otherCwd, sessionId: source.sessionId }),
    ).toEqual({ ok: false, reason: 'cwd_mismatch' })
    expect(service.archive({ cwd, sessionId: source.sessionId })).toEqual({
      ok: false,
      reason: 'active',
    })

    source.clients.clear()
    const archived = service.archive({ cwd, sessionId: source.sessionId })
    expect(archived.ok).toBe(true)
    expect(service.list({ cwd })).toEqual([])
    expect(
      new PersistentSessionService(new SessionRegistry()).resolve({
        cwd,
        sessionId: source.sessionId,
      }),
    ).toEqual({ ok: false, reason: 'archived' })
  })
})
