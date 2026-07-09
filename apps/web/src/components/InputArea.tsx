import React from 'react'
import { SendHorizontal, Square } from 'lucide-react'

import { Button } from './ui/button'
import { Spinner } from './ui/spinner'
import { Textarea } from './ui/textarea'
import { shouldFoldWebTextPaste } from '../lib/pastedText'

type PromptKeyEvent = {
  key: string
  shiftKey?: boolean
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  isComposing?: boolean
}

type PromptHistoryKeyArgs = PromptKeyEvent & {
  selectionStart: number | null
  selectionEnd: number | null
  valueLength: number
}

function hasPromptKeyModifier(event: PromptKeyEvent): boolean {
  return Boolean(
    event.shiftKey ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.isComposing,
  )
}

function shouldSubmitPromptKey(event: PromptKeyEvent): boolean {
  return event.key === 'Enter' && !hasPromptKeyModifier(event)
}

function getPromptHistoryDirection(
  args: PromptHistoryKeyArgs,
): 'previous' | 'next' | null {
  if (hasPromptKeyModifier(args)) return null
  if (args.key === 'ArrowUp' && args.selectionStart === 0) return 'previous'
  if (args.key === 'ArrowDown' && args.selectionEnd === args.valueLength) {
    return 'next'
  }
  return null
}

export function InputArea(props: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onCancel?: () => void
  onPasteText?: (args: {
    text: string
    selectionStart: number | null
    selectionEnd: number | null
  }) => { cursorOffset: number } | null
  onHistoryPrevious?: () => void
  onHistoryNext?: () => void
  disabled?: boolean
  isSending?: boolean
  controlsId?: string
  textareaRef?: React.Ref<HTMLTextAreaElement>
}) {
  const inputId = React.useId()
  const hintId = React.useId()
  const isBusy = props.isSending === true
  const isSubmitDisabled =
    props.disabled || (isBusy ? !props.onCancel : !props.value.trim())

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const historyDirection = getPromptHistoryDirection({
      key: e.key,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      isComposing: e.nativeEvent.isComposing,
      selectionStart: e.currentTarget.selectionStart,
      selectionEnd: e.currentTarget.selectionEnd,
      valueLength: e.currentTarget.value.length,
    })

    if (historyDirection === 'previous' && props.onHistoryPrevious) {
      e.preventDefault()
      props.onHistoryPrevious()
      return
    }
    if (historyDirection === 'next' && props.onHistoryNext) {
      e.preventDefault()
      props.onHistoryNext()
      return
    }

    if (
      !shouldSubmitPromptKey({
        key: e.key,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        isComposing: e.nativeEvent.isComposing,
      })
    ) {
      return
    }
    e.preventDefault()
    if (isSubmitDisabled) return
    props.onSubmit()
  }

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!props.onPasteText) return
    const text = e.clipboardData.getData('text/plain')
    if (!text || !shouldFoldWebTextPaste(text)) return

    const cursor = props.onPasteText({
      text,
      selectionStart: e.currentTarget.selectionStart,
      selectionEnd: e.currentTarget.selectionEnd,
    })
    if (!cursor) return

    e.preventDefault()
    window.requestAnimationFrame(() => {
      e.currentTarget.setSelectionRange(
        cursor.cursorOffset,
        cursor.cursorOffset,
      )
    })
  }

  return (
    <form
      aria-label="Chat prompt"
      className="flex items-end gap-2 border border-[hsl(var(--kode-terminal-border))] bg-[hsl(var(--kode-terminal-panel))] p-2 font-mono shadow-sm shadow-black/20"
      onSubmit={event => {
        event.preventDefault()
        if (isSubmitDisabled) return
        props.onSubmit()
      }}
    >
      <label className="sr-only" htmlFor={inputId}>
        Prompt
      </label>
      <p id={hintId} className="sr-only">
        Press Enter to send. Press Shift+Enter for a new line. Press ArrowUp and
        ArrowDown at prompt boundaries to move through prompt history.
      </p>
      <div
        aria-hidden="true"
        className="flex min-h-12 shrink-0 items-start gap-2 px-1 py-2 text-[13px]"
      >
        <span className="text-[hsl(var(--kode-terminal-muted))]">chat</span>
        <span className="text-[hsl(var(--kode-terminal-prompt))]">$</span>
      </div>
      <Textarea
        id={inputId}
        ref={props.textareaRef}
        name="prompt"
        value={props.value}
        onChange={e => props.onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        aria-controls={props.controlsId}
        aria-describedby={hintId}
        placeholder={isBusy ? 'compose next prompt...' : 'type prompt...'}
        className="max-h-40 min-h-[48px] resize-none border-0 bg-transparent px-1 py-2 font-mono text-[13px] leading-6 text-[hsl(var(--kode-terminal-text))] shadow-none placeholder:text-[hsl(var(--kode-terminal-muted))] focus-visible:ring-0"
        disabled={props.disabled}
      />
      <Button
        type={isBusy ? 'button' : 'submit'}
        className="h-12 w-12 rounded-md border border-[hsl(var(--kode-terminal-border))] bg-[hsl(var(--kode-terminal-elevated))] text-[hsl(var(--kode-terminal-text))] hover:bg-[hsl(var(--kode-terminal-border))]"
        size="icon"
        disabled={isSubmitDisabled}
        aria-label={isBusy ? 'Stop' : 'Send'}
        aria-busy={isBusy}
        onClick={isBusy ? props.onCancel : undefined}
      >
        {props.isSending ? (
          props.onCancel ? (
            <Square className="h-4 w-4 fill-current" aria-hidden="true" />
          ) : (
            <Spinner
              size={16}
              className="h-4 w-4 text-current"
              aria-hidden="true"
            />
          )
        ) : (
          <SendHorizontal className="h-4 w-4" />
        )}
      </Button>
    </form>
  )
}

export const __inputAreaForTests = {
  getPromptHistoryDirection,
  shouldSubmitPromptKey,
}
