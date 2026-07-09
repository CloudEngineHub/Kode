import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  getCwd,
  getOriginalCwd,
  setCwd,
  setOriginalCwd,
} from '@kode/core/utils/state'
import type { Tool } from '@kode/core/tooling/Tool'

import { SessionRegistry } from '../sessionRegistry'
import { DaemonTurnGate } from '../turnGate'
import { createWebSocketHandlers } from './connection'
import { waitForPermissionDecision } from './permissionRequests'
import type { DaemonSession } from './types'

type CapturedEvent = Record<string, unknown>

function createSocket(session: DaemonSession, replayHistory = true) {
  const events: CapturedEvent[] = []
  const socket = {
    data: { session, replayHistory },
    send(data: string) {
      events.push(JSON.parse(data) as CapturedEvent)
    },
  }
  return { events, socket }
}

function createHandlers(
  sessionRegistry: SessionRegistry,
  echoDelayMs = 0,
  overrides: Partial<Parameters<typeof createWebSocketHandlers>[0]> = {},
) {
  return createWebSocketHandlers({
    sessionRegistry,
    turnGate: new DaemonTurnGate(),
    toolNames: [],
    slashCommands: [],
    commands: [],
    tools: [],
    echo: true,
    echoDelayMs,
    mcpClients: [],
    ...overrides,
  })
}

describe('WebSocket turn state', () => {
  test('sends the authoritative state after init and history replay', () => {
    const sessionRegistry = new SessionRegistry()
    const session = sessionRegistry.create(process.cwd())
    session.turnInFlight = true
    const { events, socket } = createSocket(session)

    createHandlers(sessionRegistry).open(socket as never)

    expect(events.slice(0, 4).map(event => event.type)).toEqual([
      'system',
      'history_begin',
      'history_end',
      'turn_state',
    ])
    expect(events[3]).toEqual({
      type: 'turn_state',
      session_id: session.sessionId,
      state: 'running',
    })
  })

  test('broadcasts running after prompt acquire and idle after release', async () => {
    const sessionRegistry = new SessionRegistry()
    const session = sessionRegistry.create(process.cwd())
    const { events, socket } = createSocket(session, false)
    const observerEvents: CapturedEvent[] = []
    session.clients.add({
      send(data) {
        observerEvents.push(JSON.parse(data) as CapturedEvent)
      },
    })
    const handlers = createHandlers(sessionRegistry, 10)
    handlers.open(socket as never)
    events.length = 0

    const prompt = handlers.message(
      socket as never,
      Buffer.from(JSON.stringify({ type: 'prompt', prompt: 'hello' })),
    )

    expect(events[0]).toEqual({
      type: 'turn_state',
      session_id: session.sessionId,
      state: 'running',
    })

    await prompt

    const states = events.filter(event => event.type === 'turn_state')
    expect(states).toEqual([
      {
        type: 'turn_state',
        session_id: session.sessionId,
        state: 'running',
      },
      {
        type: 'turn_state',
        session_id: session.sessionId,
        state: 'idle',
      },
    ])
    expect(observerEvents.filter(event => event.type === 'turn_state')).toEqual(
      states,
    )
    expect(session.turnInFlight).toBe(false)
  })

  test('converts prompt handler failures into a terminal error result', async () => {
    const sessionRegistry = new SessionRegistry()
    const session = sessionRegistry.create(process.cwd())
    const { events, socket } = createSocket(session, false)
    const handlers = createHandlers(sessionRegistry, 0, {
      promptHandler: async () => {
        throw new Error('prompt setup failed')
      },
    })
    handlers.open(socket as never)
    events.length = 0

    await handlers.message(
      socket as never,
      Buffer.from(JSON.stringify({ type: 'prompt', prompt: 'hello' })),
    )

    expect(events.find(event => event.type === 'result')).toMatchObject({
      subtype: 'error_during_execution',
      result: 'prompt setup failed',
      is_error: true,
      session_id: session.sessionId,
    })
    expect(events.filter(event => event.type === 'turn_state')).toEqual([
      {
        type: 'turn_state',
        session_id: session.sessionId,
        state: 'running',
      },
      {
        type: 'turn_state',
        session_id: session.sessionId,
        state: 'idle',
      },
    ])
    expect(session.turnInFlight).toBe(false)
  })

  test('cleans the real prompt lifecycle when setup fails', async () => {
    const sessionRegistry = new SessionRegistry()
    const session = sessionRegistry.create(process.cwd())
    session.cwd = `${process.cwd()}-missing-${crypto.randomUUID()}`
    const { events, socket } = createSocket(session, false)
    const handlers = createHandlers(sessionRegistry)
    handlers.open(socket as never)
    events.length = 0

    await handlers.message(
      socket as never,
      Buffer.from(JSON.stringify({ type: 'prompt', prompt: 'hello' })),
    )

    const results = events.filter(event => event.type === 'result')
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      subtype: 'error_during_execution',
      is_error: true,
      session_id: session.sessionId,
    })
    expect(String(results[0]?.result)).toContain('does not exist')
    expect(session.activeAbortController).toBeNull()
    expect(session.turnInFlight).toBe(false)
  })

  test('rejects an owned permission when its socket disconnects', async () => {
    const sessionRegistry = new SessionRegistry()
    const session = sessionRegistry.create(process.cwd())
    const turnGate = new DaemonTurnGate()
    const handlers = createHandlers(sessionRegistry, 0, { turnGate })
    const first = createSocket(session, false)
    const second = createSocket(session, false)
    handlers.open(first.socket as never)
    handlers.open(second.socket as never)

    const lease = turnGate.tryAcquire(session)
    if (!lease) throw new Error('expected initial turn lease')
    const decision = waitForPermissionDecision({
      session,
      requestId: 'permission-owned-by-first',
      owner: first.socket,
      sendRequest: () => {},
    }).finally(() => lease.release())

    expect(session.clients.size).toBe(2)
    expect(session.inflightPermissionRequests.size).toBe(1)
    handlers.close(first.socket as never)

    await expect(decision).resolves.toMatchObject({
      decision: 'deny',
      rejectionMessage: 'Disconnected',
    })
    expect(session.clients.size).toBe(1)
    expect(session.inflightPermissionRequests.size).toBe(0)
    expect(session.turnInFlight).toBe(false)

    const retryLease = turnGate.tryAcquire(session)
    expect(retryLease).not.toBeNull()
    retryLease?.release()
  })

  test('does not register a permission after its owner already disconnected', async () => {
    const sessionRegistry = new SessionRegistry()
    const session = sessionRegistry.create(process.cwd())
    const owner = createSocket(session, false).socket
    let sent = false

    await expect(
      waitForPermissionDecision({
        session,
        requestId: 'permission-after-disconnect',
        owner,
        sendRequest: () => {
          sent = true
        },
      }),
    ).resolves.toMatchObject({
      decision: 'deny',
      rejectionMessage: 'Disconnected',
    })
    expect(sent).toBe(false)
    expect(session.inflightPermissionRequests.size).toBe(0)
  })

  test('does not register a permission after cancellation wins the race', async () => {
    const sessionRegistry = new SessionRegistry()
    const session = sessionRegistry.create(process.cwd())
    const owner = createSocket(session, false).socket
    session.clients.add(owner)
    const abortController = new AbortController()
    abortController.abort()
    let sent = false

    await expect(
      waitForPermissionDecision({
        session,
        requestId: 'permission-after-cancel',
        owner,
        signal: abortController.signal,
        sendRequest: () => {
          sent = true
        },
      }),
    ).resolves.toMatchObject({
      decision: 'deny',
      rejectionMessage: 'Cancelled',
    })
    expect(sent).toBe(false)
    expect(session.inflightPermissionRequests.size).toBe(0)
  })

  test('only lets the owner socket resolve an owned permission', async () => {
    const sessionRegistry = new SessionRegistry()
    const session = sessionRegistry.create(process.cwd())
    const handlers = createHandlers(sessionRegistry)
    const first = createSocket(session, false)
    const second = createSocket(session, false)
    handlers.open(first.socket as never)
    handlers.open(second.socket as never)

    const decision = waitForPermissionDecision({
      session,
      requestId: 'permission-owned-by-first',
      owner: first.socket,
      sendRequest: () => {},
    })

    await handlers.message(
      second.socket as never,
      Buffer.from(
        JSON.stringify({
          type: 'permission_response',
          request_id: 'permission-owned-by-first',
          decision: 'allow_once',
        }),
      ),
    )
    expect(session.inflightPermissionRequests.size).toBe(1)

    await handlers.message(
      first.socket as never,
      Buffer.from(
        JSON.stringify({
          type: 'permission_response',
          request_id: 'permission-owned-by-first',
          decision: 'allow_once',
        }),
      ),
    )
    await expect(decision).resolves.toMatchObject({ decision: 'allow_once' })
    expect(session.inflightPermissionRequests.size).toBe(0)
  })

  test('times out and cleans an unanswered permission request', async () => {
    const sessionRegistry = new SessionRegistry()
    const session = sessionRegistry.create(process.cwd())
    session.clients.add({ send: () => {} })
    const turnGate = new DaemonTurnGate()
    const lease = turnGate.tryAcquire(session)
    if (!lease) throw new Error('expected initial turn lease')

    const decision = waitForPermissionDecision({
      session,
      requestId: 'permission-timeout',
      owner: null,
      timeoutMs: 5,
      sendRequest: () => {},
    }).finally(() => lease.release())

    let watchdog: ReturnType<typeof setTimeout> | undefined
    try {
      await expect(
        Promise.race([
          decision,
          new Promise<never>((_, reject) => {
            watchdog = setTimeout(
              () => reject(new Error('permission timeout did not fire')),
              250,
            )
          }),
        ]),
      ).resolves.toMatchObject({
        decision: 'deny',
        rejectionMessage: 'Permission request timed out',
      })
    } finally {
      if (watchdog) clearTimeout(watchdog)
    }
    expect(session.inflightPermissionRequests.size).toBe(0)
    expect(session.turnInFlight).toBe(false)

    const retryLease = turnGate.tryAcquire(session)
    expect(retryLease).not.toBeNull()
    retryLease?.release()
  })

  test('cancels a workspace write before its side effect and releases the lease', async () => {
    const originalCwd = getCwd()
    const originalOriginalCwd = getOriginalCwd()
    const tempRoot = mkdtempSync(join(tmpdir(), 'kode-cancel-write-'))
    const target = join(tempRoot, 'cancelled.txt')
    const sessionRegistry = new SessionRegistry()
    const session = sessionRegistry.create(tempRoot)
    const { events, socket } = createSocket(session, false)
    const handlers = createHandlers(sessionRegistry)
    handlers.open(socket as never)
    events.length = 0

    try {
      const write = handlers.message(
        socket as never,
        Buffer.from(
          JSON.stringify({
            type: 'fs_write',
            path: 'cancelled.txt',
            content: 'must not be written',
          }),
        ),
      )
      expect(session.activeAbortController).not.toBeNull()

      await handlers.message(
        socket as never,
        Buffer.from(JSON.stringify({ type: 'cancel' })),
      )
      await write

      expect(existsSync(target)).toBe(false)
      expect(events).toContainEqual({
        type: 'fs_write_result',
        ok: false,
        path: 'cancelled.txt',
        message: 'Operation cancelled',
      })
      expect(session.activeAbortController).toBeNull()
      expect(session.turnInFlight).toBe(false)
    } finally {
      await setCwd(originalCwd)
      setOriginalCwd(originalOriginalCwd)
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  test('rejects an auto-allowed operation when cancellation wins permission preflight', async () => {
    const sessionRegistry = new SessionRegistry()
    const session = sessionRegistry.create(process.cwd())
    const { events, socket } = createSocket(session, false)
    let preflightReached = false
    const autoAllowedBash = {
      name: 'Bash',
      needsPermissions() {
        preflightReached = true
        session.activeAbortController?.abort()
        return false
      },
    } as Tool
    const handlers = createHandlers(sessionRegistry, 0, {
      tools: [autoAllowedBash],
    })
    handlers.open(socket as never)
    events.length = 0

    await handlers.message(
      socket as never,
      Buffer.from(
        JSON.stringify({
          type: 'git_stage',
          path: `missing-${crypto.randomUUID()}.txt`,
        }),
      ),
    )

    expect(preflightReached).toBe(true)
    expect(events).toContainEqual({
      type: 'git_action_result',
      ok: false,
      action: 'stage',
      message: 'Operation cancelled',
    })
    expect(session.inflightPermissionRequests.size).toBe(0)
    expect(session.activeAbortController).toBeNull()
    expect(session.turnInFlight).toBe(false)
  })

  test('sends the target state after new-session and resume history', async () => {
    const sessionRegistry = new SessionRegistry()
    const initial = sessionRegistry.create(process.cwd())
    const resumed = sessionRegistry.create(process.cwd())
    resumed.turnInFlight = true
    const { events, socket } = createSocket(initial, false)
    const handlers = createHandlers(sessionRegistry)
    handlers.open(socket as never)
    events.length = 0

    await handlers.message(
      socket as never,
      Buffer.from(JSON.stringify({ type: 'new_session' })),
    )

    const created = socket.data.session
    expect(events.slice(0, 4).map(event => event.type)).toEqual([
      'system',
      'history_begin',
      'history_end',
      'turn_state',
    ])
    expect(events[3]).toEqual({
      type: 'turn_state',
      session_id: created.sessionId,
      state: 'idle',
    })

    events.length = 0
    await handlers.message(
      socket as never,
      Buffer.from(
        JSON.stringify({ type: 'resume', session_id: resumed.sessionId }),
      ),
    )

    expect(events.slice(0, 4).map(event => event.type)).toEqual([
      'system',
      'history_begin',
      'history_end',
      'turn_state',
    ])
    expect(events[3]).toEqual({
      type: 'turn_state',
      session_id: resumed.sessionId,
      state: 'running',
    })
  })
})
