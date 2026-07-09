import React from 'react'
import { Activity, CircleDot, History, Wifi, WifiOff } from 'lucide-react'

import { cn } from '../lib/utils'

function shortSessionId(sessionId: string | null): string {
  if (!sessionId) return 'new'
  const trimmed = sessionId.trim()
  if (trimmed.length <= 8) return trimmed || 'new'
  return trimmed.slice(0, 8)
}

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
  connected: boolean
  running: boolean
  selectedSessionId: string | null
  eventCount: number
}) {
  return (
    <div className="hidden min-w-0 items-center gap-2 xl:flex">
      <StatusPill
        tone={props.connected ? 'success' : 'warn'}
        icon={
          props.connected ? (
            <Wifi className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 shrink-0" />
          )
        }
        label={props.connected ? 'online' : 'offline'}
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
        label={`session ${shortSessionId(props.selectedSessionId)}`}
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
  shortSessionId,
}
