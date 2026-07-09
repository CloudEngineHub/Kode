import React from 'react'
import { SendHorizontal } from 'lucide-react'

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
    <form
      className="flex items-end gap-2 border border-[hsl(var(--kode-terminal-border))] bg-[hsl(var(--kode-terminal-panel))] p-2 font-mono shadow-sm shadow-black/20"
      onSubmit={event => {
        event.preventDefault()
        if (isSubmitDisabled) return
        props.onSubmit()
      }}
    >
      <div className="flex min-h-12 shrink-0 items-start gap-2 px-1 py-2 text-[13px]">
        <span className="text-[hsl(var(--kode-terminal-muted))]">chat</span>
        <span className="text-[hsl(var(--kode-terminal-prompt))]">$</span>
      </div>
      <Textarea
        value={props.value}
        onChange={e => props.onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={isBusy ? 'compose next prompt...' : 'type prompt...'}
        className="max-h-40 min-h-[48px] resize-none border-0 bg-transparent px-1 py-2 font-mono text-[13px] leading-6 text-[hsl(var(--kode-terminal-text))] shadow-none placeholder:text-[hsl(var(--kode-terminal-muted))] focus-visible:ring-0"
        disabled={props.disabled}
      />
      <Button
        type="submit"
        className="h-12 w-12 rounded-md border border-[hsl(var(--kode-terminal-border))] bg-[hsl(var(--kode-terminal-elevated))] text-[hsl(var(--kode-terminal-text))] hover:bg-[hsl(var(--kode-terminal-border))]"
        size="icon"
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
          <SendHorizontal className="h-4 w-4" />
        )}
      </Button>
    </form>
  )
}
