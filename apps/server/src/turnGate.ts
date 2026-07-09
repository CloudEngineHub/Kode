import type { DaemonSession } from './ws/types'

export type TurnLease = {
  release: () => void
}

export class DaemonTurnGate {
  private activeLease: symbol | null = null
  private readonly startupWaiters: Array<(lease: TurnLease) => void> = []

  tryAcquire(session: DaemonSession): TurnLease | null {
    if (
      this.activeLease ||
      this.startupWaiters.length > 0 ||
      session.turnInFlight
    ) {
      return null
    }

    return this.createLease(session)
  }

  async runStartupExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const lease = await this.acquireStartupLease()
    try {
      return await operation()
    } finally {
      lease.release()
    }
  }

  private acquireStartupLease(): Promise<TurnLease> {
    return new Promise(resolve => {
      this.startupWaiters.push(resolve)
      this.grantNextStartup()
    })
  }

  private createLease(session: DaemonSession | null): TurnLease {
    if (this.activeLease) {
      throw new Error('Daemon runtime lease is already active')
    }

    const lease = Symbol(session?.sessionId ?? 'daemon-startup')
    this.activeLease = lease
    if (session) session.turnInFlight = true

    let released = false
    return {
      release: () => {
        if (released) return
        released = true
        if (session) session.turnInFlight = false
        if (this.activeLease === lease) this.activeLease = null
        this.grantNextStartup()
      },
    }
  }

  private grantNextStartup(): void {
    if (this.activeLease || this.startupWaiters.length === 0) return
    const resolve = this.startupWaiters.shift()
    if (!resolve) return
    resolve(this.createLease(null))
  }
}

/**
 * Coordinates every daemon instance in this process because core cwd/session
 * state is process-global. Tests that construct DaemonTurnGate directly remain
 * isolated; production daemons all receive this shared coordinator.
 */
export const processDaemonRuntimeCoordinator = new DaemonTurnGate()
