import React from 'react'
import { ChevronDown, Plus } from 'lucide-react'

import type { Session } from '@kode/protocol'

import { cn } from '../lib/utils'
import type { WorkspaceInfo } from '../lib/workspaces'
import { Button } from './ui/button'
import { ScrollArea } from './ui/scroll-area'
import { Separator } from './ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'

function sessionLabel(s: Session): string {
  return (
    (s.customTitle && s.customTitle.trim()) ||
    (s.slug && s.slug.trim()) ||
    s.sessionId
  )
}

export function Sidebar(props: {
  workspaces: WorkspaceInfo[]
  workspaceId: string | null
  onSelectWorkspace: (id: string) => void

  sessions: Session[]
  selectedSessionId: string | null
  onSelectSession: (id: string) => void
  onNewSession: () => void
}) {
  const currentWorkspace =
    props.workspaces.find(w => w.id === props.workspaceId) ??
    props.workspaces.find(w => w.isCurrent) ??
    props.workspaces[0] ??
    null

  return (
    <div className="flex h-full flex-col border-r border-border bg-muted/30">
      <div className="flex items-center justify-between gap-2 p-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">Kode Web</div>
          <div className="truncate text-xs text-muted-foreground">
            {currentWorkspace?.path ?? '—'}
          </div>
        </div>
      </div>

      <div className="px-3 pb-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full justify-between">
              <span className="truncate">
                {currentWorkspace?.title ?? 'Select workspace'}
              </span>
              <ChevronDown className="h-4 w-4 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[min(360px,calc(100vw-2rem))]"
            align="start"
          >
            {props.workspaces.map(w => (
              <DropdownMenuItem
                key={w.id}
                onClick={() => props.onSelectWorkspace(w.id)}
              >
                <span className="truncate">{w.title}</span>
                {w.branch ? (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {w.branch}
                  </span>
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Separator />

      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <div className="text-xs font-medium text-muted-foreground">
          Sessions
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={props.onNewSession}
          aria-label="New session"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 px-2 pb-2">
        <div className="grid gap-1">
          {props.sessions.length === 0 ? (
            <div className="px-2 py-6 text-center text-xs text-muted-foreground">
              No sessions yet
            </div>
          ) : (
            props.sessions.map(s => (
              <button
                key={s.sessionId}
                className={cn(
                  'w-full rounded-lg px-3 py-2 text-left text-sm transition-colors',
                  'hover:bg-muted/60',
                  props.selectedSessionId === s.sessionId
                    ? 'bg-muted'
                    : 'bg-transparent',
                )}
                onClick={() => props.onSelectSession(s.sessionId)}
              >
                <div className="truncate font-medium">{sessionLabel(s)}</div>
                {s.summary ? (
                  <div className="truncate text-xs text-muted-foreground">
                    {s.summary}
                  </div>
                ) : null}
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
