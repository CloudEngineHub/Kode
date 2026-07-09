import React from 'react'
import { CircleDot, Terminal } from 'lucide-react'

import { cn } from '../lib/utils'

export type TerminalStatusHint = {
  key: string
  label: string
}

function terminalAttachmentLabel(runtimeAttached?: boolean): string {
  return runtimeAttached ? 'attached' : 'detached'
}

function terminalStatusHintText(hints: readonly TerminalStatusHint[]): string {
  return hints.map(hint => `${hint.key} ${hint.label}`).join(' | ')
}

function TerminalTitleBar(props: {
  title: string
  context?: string | null
  detail?: string | null
  runtimeAttached?: boolean
}) {
  return (
    <div className="flex min-h-10 items-center gap-3 border-b border-[hsl(var(--kode-terminal-border))] bg-[hsl(var(--kode-terminal-elevated))] px-3 font-mono text-xs">
      <div className="flex shrink-0 items-center gap-1.5" aria-hidden="true">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400/90" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-300/90" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/90" />
      </div>
      <Terminal className="h-4 w-4 shrink-0 text-[hsl(var(--kode-terminal-prompt))]" />
      <div className="min-w-0 flex-1 truncate">
        <span className="text-[hsl(var(--kode-terminal-text))]">
          {props.title}
        </span>
        {props.context ? (
          <>
            <span className="px-2 text-[hsl(var(--kode-terminal-muted))]">
              /
            </span>
            <span className="text-[hsl(var(--kode-terminal-muted))]">
              {props.context}
            </span>
          </>
        ) : null}
      </div>
      {props.detail ? (
        <div className="hidden min-w-0 max-w-[38%] truncate text-[hsl(var(--kode-terminal-muted))] lg:block">
          {props.detail}
        </div>
      ) : null}
      <div className="flex shrink-0 items-center gap-1.5 text-[hsl(var(--kode-terminal-muted))]">
        <CircleDot
          className={cn(
            'h-3.5 w-3.5',
            props.runtimeAttached && 'text-[hsl(var(--kode-terminal-user))]',
          )}
        />
        {terminalAttachmentLabel(props.runtimeAttached)}
      </div>
    </div>
  )
}

export function TerminalStatusLine(props: {
  hints: readonly TerminalStatusHint[]
  leading?: string
}) {
  return (
    <div
      className="flex min-h-8 items-center gap-3 border-t border-[hsl(var(--kode-terminal-border))] bg-[hsl(var(--kode-terminal-panel))] px-3 py-1 font-mono text-[11px] text-[hsl(var(--kode-terminal-muted))]"
      role="status"
      aria-label={terminalStatusHintText(props.hints)}
    >
      <div className="hidden shrink-0 items-center gap-2 sm:flex">
        <span className="text-[hsl(var(--kode-terminal-prompt))]">$</span>
        <span>{props.leading ?? 'ready'}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        {props.hints.map(hint => (
          <span
            key={`${hint.key}:${hint.label}`}
            className="inline-flex min-w-0 items-center gap-1.5"
          >
            <kbd className="rounded-[4px] border border-[hsl(var(--kode-terminal-border))] bg-[hsl(var(--kode-terminal-bg))] px-1.5 py-0.5 text-[10px] font-normal text-[hsl(var(--kode-terminal-text))]">
              {hint.key}
            </kbd>
            <span className="truncate">{hint.label}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

export function TerminalFrame(props: {
  title: string
  context?: string | null
  detail?: string | null
  runtimeAttached?: boolean
  children: React.ReactNode
  footer?: React.ReactNode
  statusLine?: React.ReactNode
  className?: string
  contentClassName?: string
  footerClassName?: string
}) {
  return (
    <div
      aria-label={`${props.title} terminal`}
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden bg-[hsl(var(--kode-terminal-bg))] text-[hsl(var(--kode-terminal-text))]',
        props.className,
      )}
      role="region"
    >
      <TerminalTitleBar
        title={props.title}
        context={props.context}
        detail={props.detail}
        runtimeAttached={props.runtimeAttached}
      />
      <div
        className={cn(
          'kode-terminal-surface flex min-h-0 flex-1 flex-col',
          props.contentClassName,
        )}
      >
        {props.children}
      </div>
      {props.footer ? (
        <div
          className={cn(
            'border-t border-[hsl(var(--kode-terminal-border))] bg-[hsl(var(--kode-terminal-bg))] p-3 md:p-4',
            props.footerClassName,
          )}
        >
          {props.footer}
        </div>
      ) : null}
      {props.statusLine ? props.statusLine : null}
    </div>
  )
}

function TerminalOutputLine(props: {
  label: string
  marker: string
  children: React.ReactNode
  tone?: 'muted' | 'accent' | 'warning'
}) {
  return (
    <div className="grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] gap-3 py-0.5">
      <div className="truncate text-right text-[11px] uppercase tracking-normal text-[hsl(var(--kode-terminal-muted))]">
        {props.label}
      </div>
      <div className="flex min-w-0 gap-3">
        <span
          className={cn(
            'shrink-0 text-[hsl(var(--kode-terminal-muted))]',
            props.tone === 'accent' &&
              'text-[hsl(var(--kode-terminal-prompt))]',
            props.tone === 'warning' && 'text-[hsl(var(--kode-terminal-tool))]',
          )}
        >
          {props.marker}
        </span>
        <div className="min-w-0 break-words">{props.children}</div>
      </div>
    </div>
  )
}

export function TerminalPlaceholder(props: {
  command: 'shell' | 'files'
  workspacePath: string | null
  runtimeAttached: boolean
}) {
  return (
    <TerminalFrame
      title="kode"
      context={props.command}
      detail={props.workspacePath ?? '~'}
      runtimeAttached={props.runtimeAttached}
    >
      <div className="flex h-full min-h-0 items-end p-4 font-mono text-[13px] leading-6 md:p-6">
        <div className="grid w-full gap-1">
          <TerminalOutputLine label="session" marker="$" tone="accent">
            kode {props.command}
          </TerminalOutputLine>
          <TerminalOutputLine label="cwd" marker="~">
            <span className="text-[hsl(var(--kode-terminal-muted))]">
              {props.workspacePath ?? '~'}
            </span>
          </TerminalOutputLine>
          <TerminalOutputLine label="status" marker="!" tone="warning">
            <span className="text-[hsl(var(--kode-terminal-tool))]">
              {props.command === 'shell'
                ? 'shell transport pending'
                : 'workspace file bridge pending'}
            </span>
          </TerminalOutputLine>
          <TerminalOutputLine label="runtime" marker=">" tone="accent">
            {props.runtimeAttached ? 'attached' : 'detached'}
          </TerminalOutputLine>
        </div>
      </div>
    </TerminalFrame>
  )
}

export const __terminalFrameForTests = {
  terminalAttachmentLabel,
  terminalStatusHintText,
}
