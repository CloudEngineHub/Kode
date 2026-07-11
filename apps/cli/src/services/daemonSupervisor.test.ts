import { afterEach, describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

import { DaemonRegistry } from './daemonRegistry'
import { DaemonSupervisor } from './daemonSupervisor'

const temporaryDirectories: string[] = []

function createHarness(
  args: {
    healthy?: boolean
    alive?: (pid: number) => boolean
  } = {},
) {
  const root = mkdtempSync(join(tmpdir(), 'kode-daemon-supervisor-'))
  temporaryDirectories.push(root)
  const launches: Array<{
    cwd: string
    token: string
    versionSignature: string
  }> = []
  const stoppedPids: number[] = []
  let healthy = args.healthy ?? true
  let nextPid = 4000
  const registry = new DaemonRegistry({
    registryPath: join(root, 'registry.v1.json'),
    now: () => 1_700_000_000_000,
    isProcessAlive: args.alive ?? (() => true),
  })
  const supervisor = new DaemonSupervisor({
    registry,
    tokenFactory: () => 'test-token',
    healthProbeAttempts: 1,
    controller: {
      launch: async input => {
        launches.push(input)
        nextPid += 1
        return { pid: nextPid, url: `http://127.0.0.1:${nextPid}` }
      },
      probe: async () => healthy,
      stop: async ({ pid }) => {
        stoppedPids.push(pid)
        return true
      },
    },
  })

  return {
    root,
    registry,
    supervisor,
    launches,
    stoppedPids,
    setHealthy: (value: boolean) => {
      healthy = value
    },
  }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('DaemonSupervisor', () => {
  test('starts a healthy daemon once and reuses its matching registry entry', async () => {
    const harness = createHarness()
    const workspacePath = join(harness.root, 'workspace')

    const first = await harness.supervisor.start({
      workspacePath,
      versionSignature: '2.2.1+abc',
    })
    expect(first.state).toBe('started')
    expect(harness.launches).toHaveLength(1)
    expect(harness.launches[0]).toEqual({
      cwd: workspacePath,
      token: 'test-token',
      versionSignature: '2.2.1+abc',
    })

    const second = await harness.supervisor.start({
      workspacePath,
      versionSignature: '2.2.1+abc',
    })
    expect(second).toEqual({ state: 'reused', entry: first.entry })
    expect(harness.launches).toHaveLength(1)
  })

  test('does not silently replace a live daemon with a different version', async () => {
    const harness = createHarness()
    const workspacePath = join(harness.root, 'workspace')
    await harness.supervisor.start({ workspacePath, versionSignature: 'v1' })

    const result = await harness.supervisor.start({
      workspacePath,
      versionSignature: 'v2',
    })

    expect(result.state).toBe('version_mismatch')
    expect(harness.launches).toHaveLength(1)
    expect(harness.stoppedPids).toHaveLength(0)
  })

  test('cleans a stale registry record before launching a replacement', async () => {
    const harness = createHarness({ alive: pid => pid !== 10 })
    const workspacePath = join(harness.root, 'workspace')
    harness.registry.upsert({
      workspacePath,
      pid: 10,
      url: 'http://127.0.0.1:10',
      token: 'old-token',
      versionSignature: 'v1',
    })

    const result = await harness.supervisor.start({
      workspacePath,
      versionSignature: 'v2',
    })

    expect(result.state).toBe('started')
    expect(harness.launches).toHaveLength(1)
    expect(result.entry.pid).toBe(4001)
  })

  test('does not replace a running daemon whose health probe fails', async () => {
    const harness = createHarness({ healthy: false })
    const workspacePath = join(harness.root, 'workspace')
    harness.registry.upsert({
      workspacePath,
      pid: 20,
      url: 'http://127.0.0.1:20',
      token: 'existing-token',
      versionSignature: 'v1',
    })

    expect(await harness.supervisor.status(workspacePath)).toMatchObject({
      state: 'unhealthy',
      availableActions: ['force_stop'],
    })
    expect(
      await harness.supervisor.start({ workspacePath, versionSignature: 'v2' }),
    ).toMatchObject({ state: 'unhealthy' })
    expect(harness.launches).toHaveLength(0)
  })

  test('refuses to stop an unverified PID unless force is explicit', async () => {
    const harness = createHarness({ healthy: false })
    const workspacePath = join(harness.root, 'workspace')
    harness.registry.upsert({
      workspacePath,
      pid: 20,
      url: 'http://127.0.0.1:20',
      token: 'existing-token',
      versionSignature: 'v1',
    })

    await expect(harness.supervisor.stop(workspacePath)).rejects.toThrow(
      'refusing to terminate an unverified PID',
    )
    expect(harness.stoppedPids).toHaveLength(0)

    expect(
      await harness.supervisor.stop(workspacePath, { force: true }),
    ).toMatchObject({
      state: 'stopped',
      removed: true,
    })
    expect(harness.stoppedPids).toEqual([20])
  })

  test('stops an unregistered launch when its health check fails', async () => {
    const harness = createHarness({ healthy: false })
    const workspacePath = join(harness.root, 'workspace')

    await expect(
      harness.supervisor.start({ workspacePath, versionSignature: 'v1' }),
    ).rejects.toThrow('did not pass its health probe')
    expect(harness.stoppedPids).toEqual([4001])
    expect(harness.registry.lookup(workspacePath)).toEqual({ state: 'missing' })
  })

  test('waits for a bounded health retry before registering a launch', async () => {
    const harness = createHarness()
    const workspacePath = join(harness.root, 'workspace')
    let probeCount = 0
    const delays: number[] = []
    const supervisor = new DaemonSupervisor({
      registry: harness.registry,
      tokenFactory: () => 'test-token',
      healthProbeAttempts: 3,
      healthProbeIntervalMs: 25,
      sleep: async milliseconds => {
        delays.push(milliseconds)
      },
      controller: {
        launch: async () => ({ pid: 41, url: 'http://127.0.0.1:41' }),
        probe: async () => {
          probeCount += 1
          return probeCount === 2
        },
        stop: async () => true,
      },
    })

    expect(
      await supervisor.start({ workspacePath, versionSignature: 'v1' }),
    ).toMatchObject({ state: 'started' })
    expect(probeCount).toBe(2)
    expect(delays).toEqual([25])
  })

  test('retains a live registry entry when process stop reports failure', async () => {
    const harness = createHarness()
    const workspacePath = join(harness.root, 'workspace')
    const started = await harness.supervisor.start({
      workspacePath,
      versionSignature: 'v1',
    })
    const supervisor = new DaemonSupervisor({
      registry: harness.registry,
      controller: {
        launch: async () => {
          throw new Error('not used')
        },
        probe: async () => true,
        stop: async () => false,
      },
    })

    await expect(supervisor.stop(workspacePath)).rejects.toThrow('did not stop')
    expect(harness.registry.lookup(workspacePath)).toEqual({
      state: 'live',
      entry: started.entry,
    })
  })

  test('removes a stale registry entry when stop is explicitly requested', async () => {
    const harness = createHarness({ alive: () => false })
    const workspacePath = join(harness.root, 'workspace')
    harness.registry.upsert({
      workspacePath,
      pid: 10,
      url: 'http://127.0.0.1:10',
      token: 'old-token',
      versionSignature: 'v1',
    })

    expect(await harness.supervisor.stop(workspacePath)).toEqual({
      state: 'stale',
      removed: true,
    })
    expect(harness.registry.lookup(workspacePath)).toEqual({ state: 'missing' })
  })
})
