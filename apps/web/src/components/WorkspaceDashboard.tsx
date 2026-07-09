import React from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  GitBranch,
  History,
  Plug,
  MessageSquareText,
  ShieldQuestion,
  Server,
  Terminal,
  Unplug,
} from 'lucide-react'

import type { RuntimeStatus } from '@kode/client'
import type {
  AgentEvent,
  PermissionRequestEvent,
  Session,
} from '@kode/protocol'

import type { WorkspaceInfo } from '../lib/workspaces'
import { cn } from '../lib/utils'
import { Badge } from './ui/badge'
import { ScrollArea } from './ui/scroll-area'

type RuntimePhase = 'detached' | 'permission' | 'running' | 'attached'

type EventSummary = {
  messages: number
  tools: number
  errors: number
  results: number
}

type ActivityTone = 'default' | 'success' | 'warning' | 'danger' | 'muted'

type ActivityItem = {
  key: string
  label: string
  detail: string
  tone: ActivityTone
}

function sessionTitle(session: Session | null): string {
  if (!session) return 'New session'
  return (
    session.customTitle?.trim() ||
    session.slug?.trim() ||
    session.summary?.trim() ||
    session.sessionId
  )
}

function shortId(value: string | null | undefined): string {
  if (!value) return 'none'
  return value.length > 8 ? value.slice(0, 8) : value
}

function formatSessionTime(value: string | null | undefined): string {
  if (!value) return 'not saved'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'not saved'
  return date.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getRuntimePhase(args: {
  runtimeAttached: boolean
  running: boolean
  permissionRequest: PermissionRequestEvent | null
}): RuntimePhase {
  if (!args.runtimeAttached) return 'detached'
  if (args.permissionRequest) return 'permission'
  if (args.running) return 'running'
  return 'attached'
}

function summarizeAgentEvents(events: AgentEvent[]): EventSummary {
  return events.reduce<EventSummary>(
    (summary, event) => {
      if (event.type === 'user' || event.type === 'assistant') {
        summary.messages += 1
      } else if (event.type === 'stream_event') {
        summary.tools += 1
      } else if (event.type === 'result') {
        summary.results += 1
        if (event.is_error) summary.errors += 1
      } else if (event.type === 'log' && event.log.level === 'error') {
        summary.errors += 1
      } else if (event.type === 'permission_request') {
        summary.tools += 1
      }
      return summary
    },
    { messages: 0, tools: 0, errors: 0, results: 0 },
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function describeStreamEvent(event: AgentEvent): ActivityItem | null {
  if (event.type !== 'stream_event') return null
  const streamEvent = event.event
  if (!isRecord(streamEvent)) {
    return {
      key: event.uuid ?? `stream-${event.session_id}`,
      label: 'Stream event',
      detail: 'Agent emitted an update',
      tone: 'muted',
    }
  }

  if (streamEvent.type === 'mcp_progress') {
    const server =
      typeof streamEvent.server === 'string' ? streamEvent.server : 'mcp'
    const tool =
      typeof streamEvent.tool === 'string' ? streamEvent.tool : 'tool'
    const progress = isRecord(streamEvent.progress)
      ? streamEvent.progress
      : undefined
    const message =
      typeof progress?.message === 'string' && progress.message.trim()
        ? progress.message.trim()
        : 'running'
    return {
      key: event.uuid ?? `mcp-${server}-${tool}`,
      label: `${server}/${tool}`,
      detail: message,
      tone: 'default',
    }
  }

  const type = typeof streamEvent.type === 'string' ? streamEvent.type : 'event'
  return {
    key: event.uuid ?? `stream-${event.session_id}-${type}`,
    label: type,
    detail: 'Agent stream update',
    tone: 'muted',
  }
}

function describeEvent(event: AgentEvent, index: number): ActivityItem | null {
  const streamEvent = describeStreamEvent(event)
  if (streamEvent) return streamEvent

  if (event.type === 'user') {
    return {
      key: event.uuid ?? `user-${index}`,
      label: 'User message',
      detail: 'Prompt submitted',
      tone: 'muted',
    }
  }

  if (event.type === 'assistant') {
    return {
      key: event.uuid ?? `assistant-${index}`,
      label: 'Assistant message',
      detail: 'Response updated',
      tone: 'default',
    }
  }

  if (event.type === 'permission_request') {
    return {
      key: event.request_id,
      label: 'Permission needed',
      detail: event.tool_name,
      tone: 'warning',
    }
  }

  if (event.type === 'result') {
    return {
      key: event.uuid ?? `result-${index}`,
      label: event.is_error ? 'Turn failed' : 'Turn complete',
      detail: `${event.num_turns} turn${event.num_turns === 1 ? '' : 's'}`,
      tone: event.is_error ? 'danger' : 'success',
    }
  }

  if (event.type === 'log') {
    return {
      key: `log-${index}-${event.log.level}`,
      label: `${event.log.level.toUpperCase()} log`,
      detail: event.log.message,
      tone: event.log.level === 'error' ? 'danger' : 'muted',
    }
  }

  if (event.type === 'system') {
    return {
      key: event.uuid ?? `system-${index}`,
      label: 'System',
      detail: event.subtype,
      tone: 'muted',
    }
  }

  return null
}

function getRecentActivity(events: AgentEvent[], limit = 6): ActivityItem[] {
  return events
    .map((event, index) => describeEvent(event, index))
    .filter((item): item is ActivityItem => Boolean(item))
    .slice(-limit)
    .reverse()
}

function phaseLabel(phase: RuntimePhase): string {
  if (phase === 'detached') return 'Detached'
  if (phase === 'permission') return 'Needs approval'
  if (phase === 'running') return 'Running'
  return 'Attached'
}

function phaseTone(phase: RuntimePhase): ActivityTone {
  if (phase === 'detached') return 'muted'
  if (phase === 'permission') return 'warning'
  if (phase === 'running') return 'default'
  return 'success'
}

function phaseBadgeVariant(
  phase: RuntimePhase,
): React.ComponentProps<typeof Badge>['variant'] {
  if (phase === 'attached') return 'success'
  if (phase === 'detached') return 'secondary'
  return 'secondary'
}

function runtimeStatusTitle(status: RuntimeStatus | null): string {
  if (!status) return 'Daemon checking'
  return status.ok ? 'Daemon online' : 'Daemon unavailable'
}

function runtimeStatusDetail(status: RuntimeStatus | null): string {
  if (!status) return 'Waiting for the daemon health check.'
  if (!status.ok)
    return 'History remains visible when the live runtime is down.'

  const details = [
    status.pid === null ? null : `pid ${status.pid}`,
    status.activeSessions === null
      ? null
      : `${status.activeSessions} live session${
          status.activeSessions === 1 ? '' : 's'
        }`,
    status.version ? `v${status.version}` : null,
  ].filter(Boolean)

  return details.length > 0 ? details.join(' · ') : 'Daemon runtime is ready.'
}

function ToneDot(props: { tone: ActivityTone }) {
  return (
    <span
      className={cn(
        'mt-1 h-2 w-2 shrink-0 rounded-full',
        props.tone === 'success' && 'bg-emerald-500',
        props.tone === 'warning' && 'bg-amber-500',
        props.tone === 'danger' && 'bg-rose-500',
        props.tone === 'default' && 'bg-primary',
        props.tone === 'muted' && 'bg-muted-foreground/45',
      )}
    />
  )
}

function StatTile(props: {
  label: string
  value: string | number
  icon: React.ReactNode
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-background/65 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {props.icon}
        <span className="truncate">{props.label}</span>
      </div>
      <div className="mt-2 truncate text-lg font-semibold leading-none">
        {props.value}
      </div>
    </div>
  )
}

function Panel(props: {
  title: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-border bg-card/85 p-3 shadow-sm shadow-black/5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
          {props.title}
        </h2>
        {props.action}
      </div>
      {props.children}
    </section>
  )
}

export function WorkspaceDashboard(props: {
  runtimeStatus: RuntimeStatus | null
  runtimeAttached: boolean
  running: boolean
  workspace: WorkspaceInfo | null
  selectedSession: Session | null
  events: AgentEvent[]
  permissionRequest: PermissionRequestEvent | null
}) {
  const phase = getRuntimePhase({
    runtimeAttached: props.runtimeAttached,
    running: props.running,
    permissionRequest: props.permissionRequest,
  })
  const summary = React.useMemo(
    () => summarizeAgentEvents(props.events),
    [props.events],
  )
  const activity = React.useMemo(
    () => getRecentActivity(props.events),
    [props.events],
  )
  const session = props.selectedSession

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-border bg-muted/20">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">Runtime</div>
            <div className="truncate text-xs text-muted-foreground">
              {props.workspace?.title ?? 'Workspace'}
            </div>
          </div>
          <Badge variant={phaseBadgeVariant(phase)} className="shrink-0">
            {phaseLabel(phase)}
          </Badge>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-3 p-3">
          <Panel title="Agent backend">
            <div className="grid gap-2">
              <div className="flex items-start gap-3 rounded-lg bg-background/65 p-3">
                <Server
                  className={cn(
                    'mt-0.5 h-4 w-4 shrink-0',
                    props.runtimeStatus?.ok === true
                      ? 'text-emerald-600 dark:text-emerald-300'
                      : 'text-muted-foreground',
                  )}
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {runtimeStatusTitle(props.runtimeStatus)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {runtimeStatusDetail(props.runtimeStatus)}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-lg bg-background/65 p-3">
                {props.runtimeAttached ? (
                  <Plug className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
                ) : (
                  <Unplug className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {props.runtimeAttached
                      ? 'Runtime attached'
                      : 'Runtime detached'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {props.runtimeAttached
                      ? 'Web UI is receiving live session updates.'
                      : 'History can load without starting a live runtime.'}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <StatTile
                  label="Messages"
                  value={summary.messages}
                  icon={<MessageSquareText className="h-3.5 w-3.5" />}
                />
                <StatTile
                  label="Tool updates"
                  value={summary.tools}
                  icon={<Terminal className="h-3.5 w-3.5" />}
                />
                <StatTile
                  label="Results"
                  value={summary.results}
                  icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                />
                <StatTile
                  label="Errors"
                  value={summary.errors}
                  icon={<AlertTriangle className="h-3.5 w-3.5" />}
                />
              </div>
            </div>
          </Panel>

          <Panel
            title="Session"
            action={
              <span className="font-mono text-[11px] text-muted-foreground">
                {shortId(session?.sessionId)}
              </span>
            }
          >
            <div className="grid gap-3 text-sm">
              <div>
                <div className="truncate font-medium">
                  {sessionTitle(session)}
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground">
                  {session?.summary || session?.cwd || 'Draft session'}
                </div>
              </div>
              <div className="grid gap-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Clock3 className="h-3.5 w-3.5" />
                  <span>Modified {formatSessionTime(session?.modifiedAt)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <History className="h-3.5 w-3.5" />
                  <span>Created {formatSessionTime(session?.createdAt)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <GitBranch className="h-3.5 w-3.5" />
                  <span className="truncate">
                    {props.workspace?.branch ?? 'no branch'}
                  </span>
                </div>
              </div>
            </div>
          </Panel>

          {props.permissionRequest ? (
            <Panel title="Approval">
              <div className="flex items-start gap-3 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3">
                <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-200" />
                <div className="min-w-0 text-sm">
                  <div className="truncate font-medium">
                    {props.permissionRequest.tool_name}
                  </div>
                  <div className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                    {props.permissionRequest.tool_description}
                  </div>
                </div>
              </div>
            </Panel>
          ) : null}

          <Panel title="Activity">
            {activity.length === 0 ? (
              <div className="rounded-lg bg-background/65 p-3 text-sm text-muted-foreground">
                No activity yet
              </div>
            ) : (
              <div className="grid gap-3">
                {activity.map(item => (
                  <div key={item.key} className="flex min-w-0 gap-3">
                    <ToneDot tone={item.tone} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {item.label}
                      </div>
                      <div className="line-clamp-2 text-xs text-muted-foreground">
                        {item.detail}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Architecture">
            <div className="grid gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Activity
                  className={cn(
                    'h-3.5 w-3.5',
                    phaseTone(phase) === 'default' && 'text-primary',
                  )}
                />
                <span>Access: Web workbench client</span>
              </div>
              <div className="flex items-center gap-2">
                <Terminal className="h-3.5 w-3.5" />
                <span>Runtime: daemon agent process</span>
              </div>
              <div className="flex items-center gap-2">
                <History className="h-3.5 w-3.5" />
                <span>History: session event log over HTTP</span>
              </div>
            </div>
          </Panel>
        </div>
      </ScrollArea>
    </aside>
  )
}

export const __workspaceDashboardForTests = {
  getRecentActivity,
  getRuntimePhase,
  phaseBadgeVariant,
  phaseLabel,
  phaseTone,
  runtimeStatusDetail,
  runtimeStatusTitle,
  sessionTitle,
  shortId,
  summarizeAgentEvents,
}
