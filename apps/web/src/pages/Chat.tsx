import React from 'react'
import { CircleDot, Terminal } from 'lucide-react'

import type { AgentEvent } from '@kode/protocol'

import { ScrollArea } from '../components/ui/scroll-area'
import { MessageBubble } from '../components/MessageBubble'
import { InputArea } from '../components/InputArea'
import { cn } from '../lib/utils'

function isChatEvent(event: AgentEvent): boolean {
  return (
    event.type === 'user' ||
    event.type === 'assistant' ||
    event.type === 'result' ||
    event.type === 'log' ||
    event.type === 'stream_event'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getMcpProgressEventKey(event: AgentEvent): string | null {
  if (event.type !== 'stream_event') return null
  const streamEvent = event.event
  if (!isRecord(streamEvent) || streamEvent.type !== 'mcp_progress') {
    return null
  }

  const parentToolUseId =
    typeof event.parent_tool_use_id === 'string' ? event.parent_tool_use_id : ''
  const toolUseId =
    typeof streamEvent.toolUseId === 'string' ? streamEvent.toolUseId : ''
  const server =
    typeof streamEvent.server === 'string' ? streamEvent.server : 'unknown'
  const tool = typeof streamEvent.tool === 'string' ? streamEvent.tool : 'tool'

  return parentToolUseId || toolUseId || `${server}:${tool}`
}

function getChatEventsForRender(events: AgentEvent[]): AgentEvent[] {
  const out: AgentEvent[] = []
  const mcpProgressIndexes = new Map<string, number>()

  for (const event of events) {
    if (!isChatEvent(event)) continue

    const progressKey = getMcpProgressEventKey(event)
    if (!progressKey) {
      out.push(event)
      continue
    }

    const existingIndex = mcpProgressIndexes.get(progressKey)
    if (existingIndex === undefined) {
      mcpProgressIndexes.set(progressKey, out.length)
      out.push(event)
      continue
    }

    out[existingIndex] = event
  }

  return out
}

function getEventKey(event: AgentEvent, index: number): string {
  const mcpProgressKey = getMcpProgressEventKey(event)
  if (mcpProgressKey) return `stream_event-mcp_progress-${mcpProgressKey}`

  const record = event as Record<string, unknown>
  const uuid = typeof record.uuid === 'string' ? record.uuid : ''
  if (uuid) return `${event.type}-${uuid}`

  const sessionId =
    typeof record.session_id === 'string'
      ? record.session_id
      : typeof record.sessionId === 'string'
        ? record.sessionId
        : ''
  if (sessionId) return `${event.type}-${sessionId}-${index}`

  return `${event.type}-${index}`
}

export function ChatPage(props: {
  events: AgentEvent[]
  input: string
  onInputChange: (v: string) => void
  onSend: () => void
  disabled?: boolean
  sending?: boolean
  runtimeAttached?: boolean
  sessionTitle?: string
  workspacePath?: string | null
}) {
  const bottomRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({
      block: 'end',
      behavior: props.sending ? 'auto' : 'smooth',
    })
  }, [props.events.length, props.sending])

  const chatEvents = React.useMemo(
    () => getChatEventsForRender(props.events),
    [props.events],
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-[hsl(var(--kode-terminal-bg))] text-[hsl(var(--kode-terminal-text))]">
      <div className="flex min-h-10 items-center gap-3 border-b border-[hsl(var(--kode-terminal-border))] bg-[hsl(var(--kode-terminal-elevated))] px-3 font-mono text-xs">
        <div className="flex shrink-0 items-center gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400/90" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300/90" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/90" />
        </div>
        <Terminal className="h-4 w-4 shrink-0 text-[hsl(var(--kode-terminal-prompt))]" />
        <div className="min-w-0 flex-1 truncate">
          <span className="text-[hsl(var(--kode-terminal-text))]">kode</span>
          <span className="px-2 text-[hsl(var(--kode-terminal-muted))]">/</span>
          <span className="text-[hsl(var(--kode-terminal-muted))]">
            {props.sessionTitle ?? 'new-session'}
          </span>
        </div>
        <div className="hidden min-w-0 max-w-[38%] truncate text-[hsl(var(--kode-terminal-muted))] lg:block">
          {props.workspacePath ?? '~'}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-[hsl(var(--kode-terminal-muted))]">
          <CircleDot
            className={cn(
              'h-3.5 w-3.5',
              props.runtimeAttached && 'text-[hsl(var(--kode-terminal-user))]',
            )}
          />
          {props.runtimeAttached ? 'attached' : 'detached'}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div
          className={cn(
            'mx-auto flex min-h-full w-full max-w-6xl flex-col justify-end gap-3 px-3 py-4 font-mono text-[13px] leading-6 md:px-5',
          )}
          aria-live="polite"
        >
          {chatEvents.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              New session
            </div>
          ) : (
            chatEvents.map((event, idx) => (
              <MessageBubble key={getEventKey(event, idx)} event={event} />
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="border-t border-[hsl(var(--kode-terminal-border))] bg-[hsl(var(--kode-terminal-bg))] p-3 md:p-4">
        <div className="mx-auto w-full max-w-6xl">
          <InputArea
            value={props.input}
            onChange={props.onInputChange}
            onSubmit={props.onSend}
            disabled={props.disabled}
            isSending={props.sending}
          />
        </div>
      </div>
    </div>
  )
}

export const __chatPageForTests = {
  getChatEventsForRender,
  getEventKey,
}
