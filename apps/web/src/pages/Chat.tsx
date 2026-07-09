import React from 'react'
import { ArrowDownToLine } from 'lucide-react'

import type { RuntimeStatus } from '@kode/client'
import type {
  AgentEvent,
  PermissionRequestEvent,
  SdkContentBlock,
} from '@kode/protocol'

import { ScrollArea } from '../components/ui/scroll-area'
import { MessageBubble } from '../components/MessageBubble'
import { InputArea } from '../components/InputArea'
import { Button } from '../components/ui/button'
import {
  TerminalFrame,
  TerminalStatusLine,
  type TerminalStatusHint,
  type TerminalStatusSegment,
} from '../components/TerminalFrame'
import { useTerminalViewportSize } from '../hooks/useTerminalViewportSize'
import {
  getRuntimePhase,
  phaseLabel,
  runtimeStatusCompactLabel,
} from '../lib/runtimePresentation'
import { cn } from '../lib/utils'

function isChatEvent(event: AgentEvent): boolean {
  return (
    event.type === 'user' ||
    event.type === 'assistant' ||
    event.type === 'system' ||
    event.type === 'result' ||
    event.type === 'log' ||
    event.type === 'stream_event' ||
    event.type === 'permission_request'
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

function appendPermissionRequestEvent(
  events: AgentEvent[],
  request?: PermissionRequestEvent | null,
): AgentEvent[] {
  if (!request) return events
  const alreadyRendered = events.some(
    event =>
      event.type === 'permission_request' &&
      event.request_id === request.request_id,
  )
  return alreadyRendered ? events : [...events, request]
}

function getEventKey(event: AgentEvent, index: number): string {
  const mcpProgressKey = getMcpProgressEventKey(event)
  if (mcpProgressKey) return `stream_event-mcp_progress-${mcpProgressKey}`

  if (event.type === 'permission_request') {
    return `permission_request-${event.request_id}`
  }

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

const AUTO_FOLLOW_BOTTOM_THRESHOLD_PX = 72

const CHAT_TERMINAL_HINTS: readonly TerminalStatusHint[] = [
  { key: 'Enter', label: 'send' },
  { key: 'Shift+Enter', label: 'newline' },
  { key: 'Up/Down', label: 'history' },
  { key: '/help', label: 'commands' },
  { key: '@file', label: 'attach' },
  { key: 'Scroll', label: 'review output' },
]

type PromptHistoryDirection = 'previous' | 'next'

type PromptHistoryNavigationArgs = {
  history: readonly string[]
  currentValue: string
  cursor: number | null
  draftValue: string
  direction: PromptHistoryDirection
}

type PromptHistoryNavigationResult = {
  cursor: number | null
  value: string
  draftValue: string
}

type ScrollMetrics = {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

function isNearScrollBottom(
  metrics: ScrollMetrics,
  thresholdPx = AUTO_FOLLOW_BOTTOM_THRESHOLD_PX,
): boolean {
  return (
    metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <=
    thresholdPx
  )
}

function extractTextFromContentBlocks(blocks: SdkContentBlock[]): string {
  return blocks
    .filter(block => block.type === 'text')
    .map(block => (typeof block.text === 'string' ? block.text : ''))
    .filter(Boolean)
    .join('\n\n')
}

function extractUserPromptHistory(events: readonly AgentEvent[]): string[] {
  const prompts: string[] = []

  for (const event of events) {
    if (event.type !== 'user') continue
    const content = event.message.content
    const text =
      typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? extractTextFromContentBlocks(content)
          : ''
    const trimmed = text.trim()
    if (trimmed && prompts[prompts.length - 1] !== trimmed) {
      prompts.push(trimmed)
    }
  }

  return prompts.slice(-100)
}

function resolvePromptHistoryNavigation(
  args: PromptHistoryNavigationArgs,
): PromptHistoryNavigationResult | null {
  if (args.history.length === 0) return null

  if (args.direction === 'previous') {
    const cursor =
      args.cursor === null
        ? args.history.length - 1
        : Math.max(0, args.cursor - 1)
    return {
      cursor,
      value: args.history[cursor] ?? args.currentValue,
      draftValue: args.cursor === null ? args.currentValue : args.draftValue,
    }
  }

  if (args.cursor === null) return null

  const cursor = args.cursor + 1
  if (cursor >= args.history.length) {
    return {
      cursor: null,
      value: args.draftValue,
      draftValue: '',
    }
  }

  return {
    cursor,
    value: args.history[cursor] ?? args.currentValue,
    draftValue: args.draftValue,
  }
}

function isInteractiveTranscriptTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(
      target.closest(
        'a,button,input,textarea,select,summary,[role="button"],pre,code',
      ),
    )
  )
}

function TerminalEmptyState(props: { workspacePath?: string | null }) {
  return (
    <div className="grid gap-1 text-[hsl(var(--kode-terminal-muted))]">
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3">
        <span className="text-right text-[11px] uppercase">boot</span>
        <span className="min-w-0 break-words">
          <span className="text-[hsl(var(--kode-terminal-prompt))]">$</span>
          <span className="pl-3 text-[hsl(var(--kode-terminal-text))]">
            kode web
          </span>
        </span>
      </div>
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3">
        <span className="text-right text-[11px] uppercase">cwd</span>
        <span className="min-w-0 break-words">
          <span>~</span>
          <span className="pl-3">{props.workspacePath ?? '~'}</span>
        </span>
      </div>
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3">
        <span className="text-right text-[11px] uppercase">ready</span>
        <span className="min-w-0 break-words">
          <span className="text-[hsl(var(--kode-terminal-prompt))]">&gt;</span>
          <span className="pl-3 text-[hsl(var(--kode-terminal-text))]">
            new session
          </span>
        </span>
      </div>
    </div>
  )
}

function ThinkingLine() {
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 rounded-md px-2 py-1 font-mono text-[13px] leading-6">
      <span className="text-right text-[11px] uppercase tracking-normal text-[hsl(var(--kode-terminal-assistant))]">
        kode
      </span>
      <span className="min-w-0 text-[hsl(var(--kode-terminal-muted))]">
        <span className="text-[hsl(var(--kode-terminal-assistant))]">&gt;</span>
        <span className="pl-3">thinking</span>
        <span className="kode-terminal-caret ml-1 inline-block h-4 w-2 translate-y-0.5 bg-[hsl(var(--kode-terminal-assistant))]" />
      </span>
    </div>
  )
}

export function ChatPage(props: {
  events: AgentEvent[]
  input: string
  onInputChange: (v: string) => void
  onSend: () => void
  disabled?: boolean
  sending?: boolean
  permissionRequest?: PermissionRequestEvent | null
  runtimeAttached?: boolean
  runtimeStatus?: RuntimeStatus | null
  sessionTitle?: string
  workspacePath?: string | null
}) {
  const transcriptId = React.useId()
  const inputRef = React.useRef<HTMLTextAreaElement | null>(null)
  const bottomRef = React.useRef<HTMLDivElement | null>(null)
  const scrollViewportRef = React.useRef<HTMLDivElement | null>(null)
  const shouldAutoFollowRef = React.useRef(true)
  const draftBeforeHistoryRef = React.useRef('')
  const [historyCursor, setHistoryCursor] = React.useState<number | null>(null)
  const [isFollowingOutput, setIsFollowingOutput] = React.useState(true)
  const [hasNewOutputWhileDetached, setHasNewOutputWhileDetached] =
    React.useState(false)
  const terminalViewportSize = useTerminalViewportSize(scrollViewportRef)

  const chatEvents = React.useMemo(
    () => getChatEventsForRender(props.events),
    [props.events],
  )
  const visibleEvents = React.useMemo(
    () => appendPermissionRequestEvent(chatEvents, props.permissionRequest),
    [chatEvents, props.permissionRequest],
  )
  const runtimePhase = getRuntimePhase({
    runtimeAttached: props.runtimeAttached === true,
    running: props.sending === true,
    permissionPending: Boolean(props.permissionRequest),
  })
  const terminalStatusSegments = React.useMemo<TerminalStatusSegment[]>(
    () => [
      {
        key: 'daemon',
        label: runtimeStatusCompactLabel(props.runtimeStatus ?? null),
      },
      {
        key: 'agent',
        label: `agent ${phaseLabel(runtimePhase).toLowerCase()}`,
      },
      {
        key: 'events',
        label: `${visibleEvents.length} event${
          visibleEvents.length === 1 ? '' : 's'
        }`,
      },
    ],
    [props.runtimeStatus, runtimePhase, visibleEvents.length],
  )
  const lastEventKey =
    visibleEvents.length > 0
      ? getEventKey(
          visibleEvents[visibleEvents.length - 1]!,
          visibleEvents.length - 1,
        )
      : 'empty'
  const promptHistory = React.useMemo(
    () => extractUserPromptHistory(props.events),
    [props.events],
  )

  React.useEffect(() => {
    shouldAutoFollowRef.current = true
    setIsFollowingOutput(true)
    setHasNewOutputWhileDetached(false)
    setHistoryCursor(null)
    draftBeforeHistoryRef.current = ''
    inputRef.current?.focus()
  }, [props.sessionTitle, props.workspacePath])

  React.useEffect(() => {
    if (!props.disabled && !props.sending) inputRef.current?.focus()
  }, [props.disabled, props.sending])

  const handleViewportScroll = React.useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const nearBottom = isNearScrollBottom(event.currentTarget)
      shouldAutoFollowRef.current = nearBottom
      setIsFollowingOutput(nearBottom)
      if (nearBottom) setHasNewOutputWhileDetached(false)
    },
    [],
  )

  const scrollToLatest = React.useCallback((behavior: ScrollBehavior) => {
    bottomRef.current?.scrollIntoView({
      block: 'end',
      behavior,
    })
    shouldAutoFollowRef.current = true
    setIsFollowingOutput(true)
    setHasNewOutputWhileDetached(false)
  }, [])

  React.useEffect(() => {
    if (!props.sending && !shouldAutoFollowRef.current) {
      setHasNewOutputWhileDetached(true)
      return
    }

    scrollToLatest(props.sending ? 'auto' : 'smooth')
  }, [
    lastEventKey,
    props.events.length,
    props.sending,
    scrollToLatest,
    visibleEvents.length,
  ])

  const handlePromptChange = React.useCallback(
    (value: string) => {
      setHistoryCursor(null)
      draftBeforeHistoryRef.current = ''
      props.onInputChange(value)
    },
    [props.onInputChange],
  )

  const handlePromptSubmit = React.useCallback(() => {
    setHistoryCursor(null)
    draftBeforeHistoryRef.current = ''
    props.onSend()
  }, [props.onSend])

  const navigatePromptHistory = React.useCallback(
    (direction: PromptHistoryDirection) => {
      setHistoryCursor(currentCursor => {
        const next = resolvePromptHistoryNavigation({
          history: promptHistory,
          currentValue: props.input,
          cursor: currentCursor,
          draftValue: draftBeforeHistoryRef.current,
          direction,
        })
        if (!next) return currentCursor
        draftBeforeHistoryRef.current = next.draftValue
        props.onInputChange(next.value)
        return next.cursor
      })
    },
    [promptHistory, props.input, props.onInputChange],
  )

  const handleTranscriptClick = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (isInteractiveTranscriptTarget(event.target)) return
      inputRef.current?.focus()
    },
    [],
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
            onChange={handlePromptChange}
            onSubmit={handlePromptSubmit}
            onHistoryPrevious={() => navigatePromptHistory('previous')}
            onHistoryNext={() => navigatePromptHistory('next')}
            disabled={props.disabled}
            isSending={props.sending}
            controlsId={transcriptId}
            textareaRef={inputRef}
          />
        </div>
      }
      footerClassName="p-2 md:p-3"
      statusLine={
        <TerminalStatusLine
          hints={CHAT_TERMINAL_HINTS}
          leading={phaseLabel(runtimePhase).toLowerCase()}
          segments={terminalStatusSegments}
          viewportSize={terminalViewportSize}
        />
      }
    >
      <div className="relative flex min-h-0 flex-1">
        <ScrollArea
          className="kode-terminal-scroll h-full flex-1"
          viewportClassName="kode-terminal-viewport"
          viewportRef={scrollViewportRef}
          onViewportScroll={handleViewportScroll}
        >
          <div
            id={transcriptId}
            className={cn(
              'mx-auto flex min-h-full w-full max-w-6xl flex-col justify-end gap-2 px-3 py-4 font-mono text-[13px] leading-6 md:px-5',
            )}
            aria-live="polite"
            aria-label="Kode terminal transcript"
            aria-relevant="additions text"
            onClick={handleTranscriptClick}
            role="log"
          >
            {visibleEvents.length === 0 ? (
              <div className="flex flex-1 items-end pb-2">
                <TerminalEmptyState workspacePath={props.workspacePath} />
              </div>
            ) : (
              visibleEvents.map((event, idx) => (
                <MessageBubble key={getEventKey(event, idx)} event={event} />
              ))
            )}
            {props.sending ? <ThinkingLine /> : null}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>
        {hasNewOutputWhileDetached && !isFollowingOutput ? (
          <Button
            type="button"
            size="sm"
            className="absolute bottom-3 right-3 rounded-md border border-[hsl(var(--kode-terminal-border))] bg-[hsl(var(--kode-terminal-elevated))] font-mono text-xs text-[hsl(var(--kode-terminal-text))] shadow-lg shadow-black/30 hover:bg-[hsl(var(--kode-terminal-border))]"
            onClick={() => scrollToLatest('smooth')}
          >
            <ArrowDownToLine className="h-3.5 w-3.5" />
            Latest output
          </Button>
        ) : null}
      </div>
    </TerminalFrame>
  )
}

export const __chatPageForTests = {
  getChatEventsForRender,
  appendPermissionRequestEvent,
  extractUserPromptHistory,
  getEventKey,
  isNearScrollBottom,
  resolvePromptHistoryNavigation,
  chatTerminalHints: CHAT_TERMINAL_HINTS,
}
