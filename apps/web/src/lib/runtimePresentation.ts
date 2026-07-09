import type { RuntimeStatus } from '@kode/client'

export type RuntimePhase = 'detached' | 'permission' | 'running' | 'attached'
export type RuntimeTone = 'default' | 'success' | 'warning' | 'muted'

export function compactId(
  value: string | null | undefined,
  fallback = 'none',
): string {
  const trimmed = value?.trim()
  if (!trimmed) return fallback
  return trimmed.length > 8 ? trimmed.slice(0, 8) : trimmed
}

export function compactSessionId(sessionId: string | null | undefined): string {
  return compactId(sessionId, 'new')
}

export function getRuntimePhase(args: {
  runtimeAttached: boolean
  running: boolean
  permissionPending: boolean
}): RuntimePhase {
  if (!args.runtimeAttached) return 'detached'
  if (args.permissionPending) return 'permission'
  if (args.running) return 'running'
  return 'attached'
}

export function phaseLabel(phase: RuntimePhase): string {
  if (phase === 'detached') return 'Detached'
  if (phase === 'permission') return 'Needs approval'
  if (phase === 'running') return 'Running'
  return 'Attached'
}

export function phaseTone(phase: RuntimePhase): RuntimeTone {
  if (phase === 'detached') return 'muted'
  if (phase === 'permission') return 'warning'
  if (phase === 'running') return 'default'
  return 'success'
}

export function runtimeStatusTitle(status: RuntimeStatus | null): string {
  if (!status) return 'Daemon checking'
  return status.ok ? 'Daemon online' : 'Daemon unavailable'
}

export function runtimeStatusCompactLabel(
  status: RuntimeStatus | null,
): string {
  if (!status) return 'daemon checking'
  return status.ok ? 'daemon online' : 'daemon offline'
}

export function runtimeStatusDetail(status: RuntimeStatus | null): string {
  if (!status) return 'Waiting for the daemon health check.'
  if (!status.ok) {
    return 'History remains visible when the live runtime is down.'
  }

  const details = [
    status.pid === null ? null : `pid ${status.pid}`,
    status.activeSessions === null
      ? null
      : `${status.activeSessions} live session${
          status.activeSessions === 1 ? '' : 's'
        }`,
    status.version ? `v${status.version}` : null,
  ].filter(Boolean)

  return details.length > 0 ? details.join(' | ') : 'Daemon runtime is ready.'
}
