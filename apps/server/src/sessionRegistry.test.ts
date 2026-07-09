import { describe, expect, test } from 'bun:test'

import { createDaemonSession, SessionRegistry } from './sessionRegistry'

describe('SessionRegistry idle retention', () => {
  test('keeps only the configured number of idle sessions', () => {
    const registry = new SessionRegistry(new Map(), { maxIdleSessions: 2 })

    const first = registry.create(process.cwd())
    const second = registry.create(process.cwd())
    const third = registry.create(process.cwd())

    expect(registry.size).toBe(2)
    expect(registry.get(first.sessionId)).toBeNull()
    expect(registry.get(second.sessionId)).toBe(second)
    expect(registry.get(third.sessionId)).toBe(third)
  })

  test('never evicts sessions with clients, turns, controllers, or permissions', () => {
    const withClient = createDaemonSession({ cwd: process.cwd() })
    withClient.clients.add({ send: () => {} })

    const withTurn = createDaemonSession({ cwd: process.cwd() })
    withTurn.turnInFlight = true

    const withController = createDaemonSession({ cwd: process.cwd() })
    withController.activeAbortController = new AbortController()

    const withPermission = createDaemonSession({ cwd: process.cwd() })
    withPermission.inflightPermissionRequests.set('permission', {
      owner: null,
      resolve: () => {},
    })

    const oldestIdle = createDaemonSession({ cwd: process.cwd() })
    const newestIdle = createDaemonSession({ cwd: process.cwd() })
    const sessions = new Map(
      [
        withClient,
        withTurn,
        withController,
        withPermission,
        oldestIdle,
        newestIdle,
      ].map(session => [session.sessionId, session]),
    )
    const registry = new SessionRegistry(sessions, { maxIdleSessions: 1 })

    expect(registry.evictIdleSessions()).toBe(1)
    expect(registry.get(withClient.sessionId)).toBe(withClient)
    expect(registry.get(withTurn.sessionId)).toBe(withTurn)
    expect(registry.get(withController.sessionId)).toBe(withController)
    expect(registry.get(withPermission.sessionId)).toBe(withPermission)
    expect(registry.get(oldestIdle.sessionId)).toBeNull()
    expect(registry.get(newestIdle.sessionId)).toBe(newestIdle)
  })

  test('deleteIfIdle refuses a session while it owns live state', () => {
    const registry = new SessionRegistry()
    const session = registry.create(process.cwd())
    session.turnInFlight = true

    expect(registry.deleteIfIdle(session)).toBe(false)
    expect(registry.get(session.sessionId)).toBe(session)

    session.turnInFlight = false
    expect(registry.deleteIfIdle(session)).toBe(true)
    expect(registry.get(session.sessionId)).toBeNull()
  })

  test('cancelActiveWork aborts controllers and denies pending permissions', () => {
    const registry = new SessionRegistry()
    const session = registry.create(process.cwd())
    const controller = new AbortController()
    session.activeAbortController = controller
    let permissionDecision: unknown = null
    session.inflightPermissionRequests.set('permission', {
      owner: null,
      resolve: decision => {
        permissionDecision = decision
      },
    })

    registry.cancelActiveWork('Daemon stopped')
    registry.cancelActiveWork('Daemon stopped')

    expect(controller.signal.aborted).toBe(true)
    expect(permissionDecision).toEqual({
      decision: 'deny',
      rejectionMessage: 'Daemon stopped',
      updatedInput: null,
    })
    expect(session.inflightPermissionRequests.size).toBe(0)
  })
})
