import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import type { AgentEvent, SdkContentBlock } from '@kode/protocol'

import { cn } from '../lib/utils'
import {
  formatMcpProgressNumber,
  sanitizeMcpProgressLabel,
  sanitizeMcpProgressMessage,
} from '../lib/mcpProgress'
import { Badge } from './ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Skeleton } from './ui/skeleton'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from './ui/accordion'

type Role = 'user' | 'assistant'
type MessageKind =
  'user' | 'assistant' | 'system' | 'tool' | 'result' | 'error' | 'log'

type BubbleMessage = {
  role: Role
  kind: MessageKind
  text: string
  blocks?: SdkContentBlock[]
}

const MARKDOWN_PLUGINS = [remarkGfm]

function isSdkContentBlock(value: unknown): value is SdkContentBlock {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return typeof record.type === 'string' && record.type.trim().length > 0
}

function isSdkBlockArray(value: unknown): value is SdkContentBlock[] {
  return Array.isArray(value) && value.every(isSdkContentBlock)
}

function extractTextFromBlocks(blocks: SdkContentBlock[]): string {
  return blocks
    .filter(b => b.type === 'text')
    .map(b => (typeof b.text === 'string' ? b.text : ''))
    .filter(Boolean)
    .join('\n\n')
}

function formatStreamEvent(event: unknown): string | null {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return '**Stream event**: `event`'
  }
  const record = event as Record<string, unknown>
  if (record.type !== 'mcp_progress') {
    const type = sanitizeMcpProgressLabel(record.type, 'event')
    return `**Stream event**: \`${type}\``
  }

  const server = sanitizeMcpProgressLabel(record.server, 'MCP')
  const tool = sanitizeMcpProgressLabel(record.tool, 'tool')
  const progress =
    record.progress && typeof record.progress === 'object'
      ? (record.progress as Record<string, unknown>)
      : {}
  const message = sanitizeMcpProgressMessage(progress.message)
  const current = formatMcpProgressNumber(progress.progress)
  const total = formatMcpProgressNumber(progress.total)
  const amount =
    current !== null && total !== null
      ? ` (${current}/${total})`
      : current !== null
        ? ` (${current})`
        : ''

  return `**MCP progress**: \`${server}/${tool}\` ${message}${amount}`
}

function toBubbleMessage(event: AgentEvent): BubbleMessage | null {
  if (event.type === 'system') {
    const details = [
      event.cwd ? `- cwd: \`${event.cwd}\`` : null,
      event.model ? `- model: \`${event.model}\`` : null,
      event.tools?.length ? `- tools: ${event.tools.length}` : null,
      event.slash_commands?.length
        ? `- slash commands: ${event.slash_commands.length}`
        : null,
      event.status ? `- status: ${event.status}` : null,
    ]
      .filter(Boolean)
      .join('\n')
    return {
      role: 'assistant',
      kind: 'system',
      text: `**System**: ${event.subtype}${details ? `\n${details}` : ''}`,
    }
  }

  if (event.type === 'stream_event') {
    const text = formatStreamEvent(event.event)
    return text ? { role: 'assistant', kind: 'tool', text } : null
  }

  if (event.type === 'permission_request') {
    return {
      role: 'assistant',
      kind: 'tool',
      text: `**Permission pending**: \`${event.tool_name}\`\n${event.tool_description}`,
    }
  }

  if (event.type === 'log') {
    const level = event.log.level
    const message = event.log.message
    return {
      role: 'assistant',
      kind: level === 'error' ? 'error' : 'log',
      text: `\`[${level}]\` ${message}`,
    }
  }

  if (event.type === 'result') {
    const header = `**Run result**: ${event.subtype}`
    const details = [
      `- turns: ${event.num_turns}`,
      `- duration: ${Math.round(event.duration_ms / 100) / 10}s`,
      `- cost: $${event.total_cost_usd.toFixed(4)}`,
      `- error: ${event.is_error ? 'yes' : 'no'}`,
    ].join('\n')

    const resultText =
      typeof event.result === 'string' && event.result.trim().length > 0
        ? `\n\n${event.result.trim()}`
        : ''

    return {
      role: 'assistant',
      kind: event.is_error ? 'error' : 'result',
      text: `${header}\n${details}${resultText}`,
    }
  }

  if (event.type === 'user') {
    const content = event.message.content
    if (typeof content === 'string') {
      return { role: 'user', kind: 'user', text: content }
    }
    if (isSdkBlockArray(content)) {
      return {
        role: 'user',
        kind: 'user',
        text: extractTextFromBlocks(content),
        blocks: content,
      }
    }
    return { role: 'user', kind: 'user', text: '' }
  }

  if (event.type === 'assistant') {
    const content = event.message.content
    if (typeof content === 'string') {
      return { role: 'assistant', kind: 'assistant', text: content }
    }
    if (!isSdkBlockArray(content)) {
      return { role: 'assistant', kind: 'assistant', text: '' }
    }
    return {
      role: 'assistant',
      kind: 'assistant',
      text: extractTextFromBlocks(content),
      blocks: content,
    }
  }

  return null
}

function terminalKindMeta(kind: MessageKind): {
  label: string
  marker: string
  className: string
} {
  if (kind === 'user') {
    return {
      label: 'user',
      marker: '$',
      className: 'text-[hsl(var(--kode-terminal-user))]',
    }
  }
  if (kind === 'tool') {
    return {
      label: 'tool',
      marker: '>',
      className: 'text-[hsl(var(--kode-terminal-tool))]',
    }
  }
  if (kind === 'system') {
    return {
      label: 'system',
      marker: '*',
      className: 'text-[hsl(var(--kode-terminal-muted))]',
    }
  }
  if (kind === 'result') {
    return {
      label: 'result',
      marker: '=',
      className: 'text-[hsl(var(--kode-terminal-user))]',
    }
  }
  if (kind === 'error') {
    return {
      label: 'error',
      marker: '!',
      className: 'text-[hsl(var(--kode-terminal-error))]',
    }
  }
  if (kind === 'log') {
    return {
      label: 'log',
      marker: '#',
      className: 'text-[hsl(var(--kode-terminal-muted))]',
    }
  }
  return {
    label: 'kode',
    marker: '>',
    className: 'text-[hsl(var(--kode-terminal-assistant))]',
  }
}

function ToolBlockCard(props: { block: SdkContentBlock }) {
  const type = props.block.type
  const name = typeof props.block.name === 'string' ? props.block.name : ''
  const id = typeof props.block.id === 'string' ? props.block.id : ''
  const input = props.block.input

  const title =
    type === 'tool_use'
      ? `Tool Use: ${name || 'Unknown'}`
      : type === 'tool_result'
        ? 'Tool Result'
        : `Block: ${type}`

  return (
    <Card className="rounded-md border-[hsl(var(--kode-terminal-border))] bg-[hsl(var(--kode-terminal-panel))] text-[hsl(var(--kode-terminal-text))] shadow-none">
      <CardHeader className="py-2.5">
        <CardTitle className="flex items-center gap-2 font-mono text-sm font-medium">
          <Badge variant="secondary">{type}</Badge>
          <span className="truncate">{title}</span>
          {id ? (
            <span className="ml-auto text-xs text-[hsl(var(--kode-terminal-muted))]">
              {id}
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-3 pt-0 text-xs">
        <pre className="max-h-64 overflow-auto rounded-md border border-[hsl(var(--kode-terminal-border))] bg-[hsl(var(--kode-terminal-bg))] p-3 leading-relaxed text-[hsl(var(--kode-terminal-text))]">
          {JSON.stringify(input ?? props.block, null, 2)}
        </pre>
      </CardContent>
    </Card>
  )
}

function renderBlocks(blocks: SdkContentBlock[] | undefined) {
  if (!blocks?.length) return null

  const toolLike = blocks.filter(b =>
    ['tool_use', 'tool_result', 'server_tool_use', 'mcp_tool_use'].includes(
      b.type,
    ),
  )
  if (toolLike.length === 0) return null

  return (
    <Accordion type="multiple" className="w-full">
      {toolLike.map((block, idx) => {
        const id = typeof block.id === 'string' ? block.id : ''
        const key = id || `${block.type}-${idx}`
        return (
          <AccordionItem value={key} key={key} className="border-none">
            <AccordionTrigger className="py-2 font-mono text-sm text-[hsl(var(--kode-terminal-text))]">
              <span className="flex min-w-0 items-center gap-2">
                <Badge variant="outline">{block.type}</Badge>
                <span className="truncate">
                  {typeof block.name === 'string' ? block.name : 'Tool'}
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <ToolBlockCard block={block} />
            </AccordionContent>
          </AccordionItem>
        )
      })}
    </Accordion>
  )
}

function MarkdownBody(props: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={MARKDOWN_PLUGINS}
      components={{
        pre: ({ children }) => (
          <pre className="my-3 max-h-96 overflow-auto rounded-md border border-[hsl(var(--kode-terminal-border))] bg-[hsl(var(--kode-terminal-bg))] p-3 text-xs leading-relaxed text-[hsl(var(--kode-terminal-text))]">
            {children}
          </pre>
        ),
        code: ({ className, children, ...codeProps }) => (
          <code
            className={cn(
              'rounded bg-[hsl(var(--kode-terminal-elevated))] px-1 py-0.5 font-mono text-[0.92em] text-[hsl(var(--kode-terminal-text))]',
              className,
            )}
            {...codeProps}
          >
            {children}
          </code>
        ),
        table: ({ children }) => (
          <div className="my-3 max-w-full overflow-x-auto">
            <table className="w-full border-collapse text-sm">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-[hsl(var(--kode-terminal-border))] bg-[hsl(var(--kode-terminal-elevated))] px-2 py-1 text-left font-medium">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-[hsl(var(--kode-terminal-border))] px-2 py-1 align-top">
            {children}
          </td>
        ),
      }}
    >
      {props.text}
    </ReactMarkdown>
  )
}

export const MessageBubble = React.memo(function MessageBubble(props: {
  event: AgentEvent
}) {
  const msg = React.useMemo(() => toBubbleMessage(props.event), [props.event])
  const renderedBlocks = React.useMemo(
    () => renderBlocks(msg?.blocks),
    [msg?.blocks],
  )

  if (!msg) return null
  const meta = terminalKindMeta(msg.kind)

  return (
    <div
      className={cn(
        'grid w-full grid-cols-[4.5rem_minmax(0,1fr)] gap-3 border-l-2 border-l-transparent px-2 py-1.5',
        'hover:border-l-[hsl(var(--kode-terminal-border))] hover:bg-[hsl(var(--kode-terminal-panel))]/45',
      )}
    >
      <div
        className={cn(
          'select-none pt-0.5 text-right font-mono text-[11px] uppercase tracking-normal',
          meta.className,
        )}
      >
        {meta.label}
      </div>
      <div className="min-w-0">
        <div className="flex min-w-0 gap-3">
          <span
            className={cn(
              'mt-0.5 shrink-0 font-mono text-[13px]',
              meta.className,
            )}
          >
            {meta.marker}
          </span>
          <div className="kode-terminal-message min-w-0 flex-1 break-words text-[hsl(var(--kode-terminal-text))]">
            {msg.text ? (
              <div className="prose prose-sm prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-headings:my-2 prose-headings:text-[hsl(var(--kode-terminal-text))] prose-a:text-[hsl(var(--kode-terminal-assistant))] prose-strong:text-[hsl(var(--kode-terminal-text))] prose-code:break-words">
                <MarkdownBody text={msg.text} />
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {msg.role === 'user' ? (
                  <span className="text-[hsl(var(--kode-terminal-muted))]">
                    Empty message
                  </span>
                ) : (
                  <>
                    <Skeleton className="h-4 w-40 bg-[hsl(var(--kode-terminal-elevated))]" />
                    <Skeleton className="h-4 w-56 bg-[hsl(var(--kode-terminal-elevated))]" />
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        {renderedBlocks ? <div className="mt-2">{renderedBlocks}</div> : null}
      </div>
    </div>
  )
})

export const __messageBubbleForTests = {
  terminalKindMeta,
  toBubbleMessage,
}
