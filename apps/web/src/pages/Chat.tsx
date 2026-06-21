import React from 'react'

import type { AgentEvent } from '@kode/protocol'

import { ScrollArea } from '../components/ui/scroll-area'
import { MessageBubble } from '../components/MessageBubble'
import { InputArea } from '../components/InputArea'
import { cn } from '../lib/utils'

export function ChatPage(props: {
  events: AgentEvent[]
  input: string
  onInputChange: (v: string) => void
  onSend: () => void
  disabled?: boolean
  sending?: boolean
}) {
  const bottomRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [props.events.length])

  const chatEvents = props.events.filter(
    e =>
      e.type === 'user' ||
      e.type === 'assistant' ||
      e.type === 'result' ||
      e.type === 'log',
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea className="flex-1">
        <div
          className={cn(
            'mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6',
          )}
        >
          {chatEvents.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Start a new conversation.
            </div>
          ) : (
            chatEvents.map((event, idx) => (
              <MessageBubble key={`${event.type}-${idx}`} event={event} />
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="border-t border-border bg-background/80 p-4 backdrop-blur">
        <div className="mx-auto w-full max-w-5xl">
          <InputArea
            value={props.input}
            onChange={props.onInputChange}
            onSubmit={props.onSend}
            disabled={props.disabled}
            isSending={props.sending}
          />
          <div className="mt-2 text-center text-xs text-muted-foreground">
            Press Enter to send · Shift+Enter for new line
          </div>
        </div>
      </div>
    </div>
  )
}
