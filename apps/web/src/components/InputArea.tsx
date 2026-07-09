import React from 'react'
import { Send } from 'lucide-react'

import { Button } from './ui/button'
import { Spinner } from './ui/spinner'
import { Textarea } from './ui/textarea'

export function InputArea(props: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  disabled?: boolean
  isSending?: boolean
}) {
  const isBusy = props.isSending === true
  const isSubmitDisabled = props.disabled || isBusy || !props.value.trim()

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter') return
    if (e.shiftKey) return
    e.preventDefault()
    if (isSubmitDisabled) return
    props.onSubmit()
  }

  return (
    <div className="flex gap-2 rounded-lg border border-border bg-background p-2 shadow-sm shadow-black/5">
      <Textarea
        value={props.value}
        onChange={e => props.onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Message Kode"
        className="min-h-[48px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
        disabled={props.disabled || isBusy}
      />
      <Button
        className="h-12 w-12 rounded-md"
        size="icon"
        onClick={props.onSubmit}
        disabled={isSubmitDisabled}
        aria-label={isBusy ? 'Sending' : 'Send'}
        aria-busy={isBusy}
      >
        {props.isSending ? (
          <Spinner
            size={16}
            className="h-4 w-4 text-current"
            aria-hidden="true"
          />
        ) : (
          <Send className="h-4 w-4" />
        )}
      </Button>
    </div>
  )
}
