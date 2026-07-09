import { describe, expect, test } from 'bun:test'

import {
  compactId,
  compactSessionId,
  getRuntimePhase,
  phaseLabel,
  phaseTone,
  runtimeStatusCompactLabel,
  runtimeStatusDetail,
  runtimeStatusTitle,
} from './runtimePresentation'

describe('runtime presentation helpers', () => {
  test('uses compact stable ids for runtime chrome', () => {
    expect(compactId(null)).toBe('none')
    expect(compactSessionId(null)).toBe('new')
    expect(compactSessionId('abc')).toBe('abc')
    expect(compactSessionId('12345678-1234-1234-1234-123456789abc')).toBe(
      '12345678',
    )
  })

  test('prioritizes runtime phase by user actionability', () => {
    expect(
      getRuntimePhase({
        runtimeAttached: false,
        running: true,
        permissionPending: true,
      }),
    ).toBe('detached')
    expect(
      getRuntimePhase({
        runtimeAttached: true,
        running: true,
        permissionPending: true,
      }),
    ).toBe('permission')
    expect(
      getRuntimePhase({
        runtimeAttached: true,
        running: true,
        permissionPending: false,
      }),
    ).toBe('running')
    expect(phaseLabel('running')).toBe('Running')
    expect(phaseTone('attached')).toBe('success')
  })

  test('summarizes daemon status with ascii separators', () => {
    expect(runtimeStatusTitle(null)).toBe('Daemon checking')
    expect(runtimeStatusCompactLabel(null)).toBe('daemon checking')
    expect(runtimeStatusDetail(null)).toBe(
      'Waiting for the daemon health check.',
    )

    const online = {
      ok: true,
      transport: 'daemon' as const,
      pid: 123,
      version: '2.2.1',
      activeSessions: 2,
    }
    expect(runtimeStatusTitle(online)).toBe('Daemon online')
    expect(runtimeStatusCompactLabel(online)).toBe('daemon online')
    expect(runtimeStatusDetail(online)).toBe(
      'pid 123 | 2 live sessions | v2.2.1',
    )

    const offline = {
      ok: false,
      transport: 'daemon' as const,
      pid: null,
      version: null,
      activeSessions: null,
    }
    expect(runtimeStatusTitle(offline)).toBe('Daemon unavailable')
    expect(runtimeStatusCompactLabel(offline)).toBe('daemon offline')
    expect(runtimeStatusDetail(offline)).toBe(
      'History remains visible when the live runtime is down.',
    )
  })
})
