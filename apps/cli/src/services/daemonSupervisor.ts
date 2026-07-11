import { randomUUID } from 'node:crypto'

import {
  DaemonRegistry,
  type DaemonRegistryEntry,
  type DaemonRegistryLookup,
} from './daemonRegistry'

export type DaemonSupervisorAction = 'start' | 'stop' | 'remove_stale'

export type DaemonSupervisorStatus = {
  state: 'missing' | 'live' | 'stale' | 'unhealthy' | 'corrupt'
  entry: DaemonRegistryEntry | null
  availableActions: DaemonSupervisorAction[]
}

export type DaemonProcessController = {
  launch: (args: {
    cwd: string
    token: string
    versionSignature: string
  }) => Promise<{ pid: number; url: string }>
  probe: (args: { url: string; token: string }) => Promise<boolean>
  stop: (args: { pid: number }) => Promise<boolean>
}

export type DaemonSupervisorOptions = {
  registry: DaemonRegistry
  controller: DaemonProcessController
  tokenFactory?: () => string
  healthProbeAttempts?: number
  healthProbeIntervalMs?: number
  sleep?: (milliseconds: number) => Promise<void>
}

export type StartDaemonResult =
  | { state: 'started'; entry: DaemonRegistryEntry }
  | { state: 'reused'; entry: DaemonRegistryEntry }
  | {
      state: 'version_mismatch'
      entry: DaemonRegistryEntry
      requestedVersionSignature: string
    }
  | { state: 'unhealthy'; entry: DaemonRegistryEntry }

export type StopDaemonResult =
  | { state: 'missing'; removed: false }
  | { state: 'stale'; removed: true }
  | { state: 'stopped'; removed: true; entry: DaemonRegistryEntry }

function newToken(): string {
  return randomUUID().replace(/-/g, '')
}

function actionsForLookup(
  lookup: DaemonRegistryLookup,
): DaemonSupervisorAction[] {
  switch (lookup.state) {
    case 'missing':
      return ['start']
    case 'stale':
      return ['start', 'remove_stale']
    case 'live':
      return ['stop']
    case 'corrupt':
      return []
  }
}

/**
 * Coordinates registry state with a caller-provided process adapter. It does
 * not know how the CLI launches a daemon, so the same state machine remains
 * usable by packaged, source, and test entrypoints.
 */
export class DaemonSupervisor {
  private readonly registry: DaemonRegistry
  private readonly controller: DaemonProcessController
  private readonly tokenFactory: () => string
  private readonly healthProbeAttempts: number
  private readonly healthProbeIntervalMs: number
  private readonly sleep: (milliseconds: number) => Promise<void>

  constructor(options: DaemonSupervisorOptions) {
    this.registry = options.registry
    this.controller = options.controller
    this.tokenFactory = options.tokenFactory ?? newToken
    this.healthProbeAttempts = Math.max(
      1,
      Math.floor(options.healthProbeAttempts ?? 25),
    )
    this.healthProbeIntervalMs = Math.max(
      0,
      Math.floor(options.healthProbeIntervalMs ?? 100),
    )
    this.sleep =
      options.sleep ??
      (milliseconds =>
        new Promise(resolve => {
          setTimeout(resolve, milliseconds)
        }))
  }

  async status(workspacePath: string): Promise<DaemonSupervisorStatus> {
    const lookup = this.registry.lookup(workspacePath)
    if (lookup.state !== 'live') {
      return {
        state: lookup.state,
        entry: lookup.state === 'stale' ? lookup.entry : null,
        availableActions: actionsForLookup(lookup),
      }
    }

    const healthy = await this.isHealthy(lookup.entry)
    if (healthy) {
      return {
        state: 'live',
        entry: lookup.entry,
        availableActions: ['stop'],
      }
    }

    // A running-but-unhealthy daemon must not be silently replaced. The
    // caller decides whether to stop it so a debugging process is not lost.
    return {
      state: 'unhealthy',
      entry: lookup.entry,
      availableActions: ['stop'],
    }
  }

  async start(args: {
    workspacePath: string
    versionSignature: string
  }): Promise<StartDaemonResult> {
    const requestedVersionSignature = args.versionSignature.trim()
    if (!requestedVersionSignature) {
      throw new Error('Daemon version signature is required.')
    }

    const current = await this.status(args.workspacePath)
    if (current.state === 'live' && current.entry) {
      if (current.entry.versionSignature === requestedVersionSignature) {
        return { state: 'reused', entry: current.entry }
      }
      return {
        state: 'version_mismatch',
        entry: current.entry,
        requestedVersionSignature,
      }
    }
    if (current.state === 'unhealthy' && current.entry) {
      return { state: 'unhealthy', entry: current.entry }
    }
    if (current.state === 'corrupt') {
      throw new Error(
        'Daemon registry is corrupt. Repair or remove it before starting a daemon.',
      )
    }
    if (current.state === 'stale') {
      this.registry.remove(args.workspacePath)
    }

    const token = this.tokenFactory().trim()
    if (!token) throw new Error('Daemon token factory returned an empty token.')

    const launched = await this.controller.launch({
      cwd: args.workspacePath,
      token,
      versionSignature: requestedVersionSignature,
    })

    const launchEntry = {
      pid: launched.pid,
      url: launched.url,
      token,
      versionSignature: requestedVersionSignature,
    }

    if (!(await this.waitUntilHealthy(launchEntry))) {
      await this.stopAfterFailedStart(launched.pid)
      throw new Error('Daemon did not pass its health probe after launch.')
    }

    try {
      const entry = this.registry.upsert({
        workspacePath: args.workspacePath,
        ...launchEntry,
      })
      return { state: 'started', entry }
    } catch (error) {
      await this.stopAfterFailedStart(launched.pid)
      throw error
    }
  }

  async stop(workspacePath: string): Promise<StopDaemonResult> {
    const lookup = this.registry.lookup(workspacePath)
    if (lookup.state === 'missing') return { state: 'missing', removed: false }
    if (lookup.state === 'corrupt') {
      throw new Error(
        'Daemon registry is corrupt. Repair or remove it before stopping a daemon.',
      )
    }
    if (lookup.state === 'stale') {
      this.registry.remove(workspacePath)
      return { state: 'stale', removed: true }
    }

    const stopped = await this.controller.stop({ pid: lookup.entry.pid })
    if (!stopped) {
      throw new Error(
        `Daemon process ${lookup.entry.pid} did not stop; registry was retained.`,
      )
    }

    this.registry.remove(workspacePath)
    return { state: 'stopped', removed: true, entry: lookup.entry }
  }

  private async isHealthy(args: {
    url: string
    token: string
  }): Promise<boolean> {
    try {
      return await this.controller.probe(args)
    } catch {
      return false
    }
  }

  private async waitUntilHealthy(args: {
    url: string
    token: string
  }): Promise<boolean> {
    for (let attempt = 0; attempt < this.healthProbeAttempts; attempt += 1) {
      if (await this.isHealthy(args)) return true
      if (attempt + 1 < this.healthProbeAttempts) {
        await this.sleep(this.healthProbeIntervalMs)
      }
    }
    return false
  }

  private async stopAfterFailedStart(pid: number): Promise<void> {
    try {
      await this.controller.stop({ pid })
    } catch {
      // The launch failure remains the actionable error. A process adapter may
      // still emit its own cleanup diagnostics for an unsuccessful stop.
    }
  }
}
