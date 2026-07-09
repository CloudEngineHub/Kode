import React from 'react'

import type { AgentEvent } from '@kode/protocol'

import { ScrollArea } from '../components/ui/scroll-area'
import { MessageBubble } from '../components/MessageBubble'
import { InputArea } from '../components/InputArea'
import { TerminalFrame } from '../components/TerminalFrame'
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
    <TerminalFrame
      title="kode"
      context={props.sessionTitle ?? 'new-session'}
      detail={props.workspacePath ?? '~'}
      runtimeAttached={props.runtimeAttached}
      footer={
        <div className="mx-auto w-full max-w-6xl">
          <InputArea
            value={props.input}
            onChange={props.onInputChange}
            onSubmit={props.onSend}
            disabled={props.disabled}
            isSending={props.sending}
          />
        </div>
      }
    >
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
    </TerminalFrame>
  )
}

export const __chatPageForTests = {
  getChatEventsForRender,
  getEventKey,
}
