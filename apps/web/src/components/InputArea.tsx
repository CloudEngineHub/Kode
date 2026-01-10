import React from 'react'
import { Send } from 'lucide-react'

import { Button } from './ui/button'
import { Textarea } from './ui/textarea'

export function InputArea(props: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  disabled?: boolean
}) {
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter') return
    if (e.shiftKey) return
    e.preventDefault()
    props.onSubmit()
  }

  return (
    <div className="flex gap-2 rounded-xl border border-border bg-background p-2 shadow-sm">
      <Textarea
        value={props.value}
        onChange={e => props.onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Ask Kode to help with your code… (@ to reference files)"
        className="min-h-[48px] resize-none border-0 shadow-none focus-visible:ring-0"
        disabled={props.disabled}
      />
      <Button
        className="h-[48px] w-[48px] rounded-lg"
        size="icon"
        onClick={props.onSubmit}
        disabled={props.disabled || !props.value.trim()}
        aria-label="Send"
      >
        <Send className="h-4 w-4" />
      </Button>
    </div>
  )
}
