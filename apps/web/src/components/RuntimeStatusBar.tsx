import React from 'react'
import {
  Activity,
  CircleDot,
  History,
  Plug,
  Server,
  Unplug,
} from 'lucide-react'

import type { RuntimeStatus } from '@kode/client'
import {
  compactSessionId,
  runtimeStatusCompactLabel,
} from '../lib/runtimePresentation'
import { cn } from '../lib/utils'

function StatusPill(props: {
  tone?: 'default' | 'success' | 'muted' | 'warn'
  icon: React.ReactNode
  label: string
}) {
  return (
    <div
      className={cn(
        'inline-flex h-7 min-w-0 items-center gap-1.5 rounded-[6px] border px-2 text-xs',
        props.tone === 'success' &&
          'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200',
        props.tone === 'warn' &&
          'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-200',
        props.tone === 'muted' &&
          'border-border bg-muted/45 text-muted-foreground',
        (!props.tone || props.tone === 'default') &&
          'border-border bg-background/70 text-foreground',
      )}
    >
      {props.icon}
      <span className="truncate">{props.label}</span>
    </div>
  )
}

export function RuntimeStatusBar(props: {
  runtimeStatus: RuntimeStatus | null
  runtimeAttached: boolean
  running: boolean
  selectedSessionId: string | null
  eventCount: number
}) {
  const daemonOnline = props.runtimeStatus?.ok === true

  return (
    <div className="hidden min-w-0 items-center gap-2 xl:flex">
      <StatusPill
        tone={
          props.runtimeStatus ? (daemonOnline ? 'success' : 'warn') : 'muted'
        }
        icon={<Server className="h-3.5 w-3.5 shrink-0" />}
        label={runtimeStatusCompactLabel(props.runtimeStatus)}
      />
      <StatusPill
        tone={props.runtimeAttached ? 'success' : 'muted'}
        icon={
          props.runtimeAttached ? (
            <Plug className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <Unplug className="h-3.5 w-3.5 shrink-0" />
          )
        }
        label={props.runtimeAttached ? 'attached' : 'detached'}
      />
      <StatusPill
        tone={props.running ? 'default' : 'muted'}
        icon={
          <Activity
            className={cn(
              'h-3.5 w-3.5 shrink-0',
              props.running && 'animate-pulse text-primary',
            )}
          />
        }
        label={props.running ? 'running' : 'idle'}
      />
      <StatusPill
        tone="muted"
        icon={<CircleDot className="h-3.5 w-3.5 shrink-0" />}
        label={`session ${compactSessionId(props.selectedSessionId)}`}
      />
      <StatusPill
        tone="muted"
        icon={<History className="h-3.5 w-3.5 shrink-0" />}
        label={`${props.eventCount} events`}
      />
    </div>
  )
}

export const __runtimeStatusBarForTests = {
  shortSessionId: compactSessionId,
}
