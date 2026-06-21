import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import type { AgentEvent, SdkContentBlock } from '@kode/protocol'

import { cn } from '../lib/utils'
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

type BubbleMessage = {
  role: Role
  text: string
  blocks?: SdkContentBlock[]
}

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

function toBubbleMessage(event: AgentEvent): BubbleMessage | null {
  if (event.type === 'log') {
    const level = event.log.level
    const message = event.log.message
    return { role: 'assistant', text: `\`[${level}]\` ${message}` }
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

    return { role: 'assistant', text: `${header}\n${details}${resultText}` }
  }

  if (event.type === 'user') {
    const content = event.message.content
    if (typeof content === 'string') return { role: 'user', text: content }
    if (isSdkBlockArray(content)) {
      return {
        role: 'user',
        text: extractTextFromBlocks(content),
        blocks: content,
      }
    }
    return { role: 'user', text: '' }
  }

  if (event.type === 'assistant') {
    const content = event.message.content
    if (typeof content === 'string') return { role: 'assistant', text: content }
    if (!isSdkBlockArray(content)) {
      return { role: 'assistant', text: '' }
    }
    return {
      role: 'assistant',
      text: extractTextFromBlocks(content),
      blocks: content,
    }
  }

  return null
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
        ? `Tool Result`
        : `Block: ${type}`

  return (
    <Card className="border-muted/60">
      <CardHeader className="py-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Badge variant="secondary">{type}</Badge>
          <span className="truncate">{title}</span>
          {id ? (
            <span className="ml-auto text-xs text-muted-foreground">{id}</span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4 pt-0 text-xs">
        <pre className="max-h-64 overflow-auto rounded-md bg-muted/40 p-3 leading-relaxed">
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
            <AccordionTrigger className="py-2 text-sm">
              <span className="flex items-center gap-2">
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

export function MessageBubble(props: { event: AgentEvent }) {
  const msg = toBubbleMessage(props.event)
  if (!msg) return null

  const isUser = msg.role === 'user'
  const bubbleClass = cn(
    'max-w-[min(740px,100%)] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm',
    isUser
      ? 'bg-primary text-primary-foreground'
      : 'bg-card text-foreground border border-border',
  )

  return (
    <div
      className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}
    >
      <div className="flex w-full max-w-[min(820px,100%)] flex-col gap-2">
        <div className={bubbleClass}>
          {msg.text ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {msg.text}
            </ReactMarkdown>
          ) : (
            <div className="flex flex-col gap-2">
              {isUser ? (
                <span className="text-muted-foreground">…</span>
              ) : (
                <>
                  <Skeleton className="h-4 w-40 bg-muted/60" />
                  <Skeleton className="h-4 w-56 bg-muted/60" />
                </>
              )}
            </div>
          )}
        </div>
        {renderBlocks(msg.blocks)}
      </div>
    </div>
  )
}
