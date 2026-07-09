import { describe, expect, test } from 'bun:test'

import { createDaemonSession } from './sessionRegistry'
import { DaemonTurnGate } from './turnGate'

describe('DaemonTurnGate runtime coordination', () => {
  test('queues startup behind an active turn and blocks later turns', async () => {
    const gate = new DaemonTurnGate()
    const firstSession = createDaemonSession({ cwd: process.cwd() })
    const secondSession = createDaemonSession({ cwd: process.cwd() })
    const firstLease = gate.tryAcquire(firstSession)
    if (!firstLease) throw new Error('expected first turn lease')

    let enterStartup: (() => void) | undefined
    const startupEntered = new Promise<void>(resolve => {
      enterStartup = resolve
    })
    let finishStartup: (() => void) | undefined
    const startupCanFinish = new Promise<void>(resolve => {
      finishStartup = resolve
    })
    const startup = gate.runStartupExclusive(async () => {
      enterStartup?.()
      await startupCanFinish
    })

    await Promise.resolve()
    expect(firstSession.turnInFlight).toBe(true)
    expect(gate.tryAcquire(secondSession)).toBeNull()

    firstLease.release()
    await startupEntered
    expect(firstSession.turnInFlight).toBe(false)
    expect(gate.tryAcquire(secondSession)).toBeNull()

    finishStartup?.()
    await startup
    const secondLease = gate.tryAcquire(secondSession)
    expect(secondLease).not.toBeNull()
    secondLease?.release()
  })

  test('serializes startups and releases the runtime after errors', async () => {
    const gate = new DaemonTurnGate()
    const order: string[] = []
    let finishFirst: (() => void) | undefined
    const firstCanFinish = new Promise<void>(resolve => {
      finishFirst = resolve
    })

    const first = gate.runStartupExclusive(async () => {
      order.push('first:start')
      await firstCanFinish
      order.push('first:end')
    })
    const second = gate.runStartupExclusive(async () => {
      order.push('second')
    })

    await Promise.resolve()
    expect(order).toEqual(['first:start'])
    finishFirst?.()
    await Promise.all([first, second])
    expect(order).toEqual(['first:start', 'first:end', 'second'])

    await expect(
      gate.runStartupExclusive(async () => {
        throw new Error('startup failed')
      }),
    ).rejects.toThrow('startup failed')

    const session = createDaemonSession({ cwd: process.cwd() })
    const lease = gate.tryAcquire(session)
    expect(lease).not.toBeNull()
    lease?.release()
  })
})
