import React from 'react'
import {
  FileText,
  Menu,
  MessagesSquare,
  Settings,
  Terminal,
} from 'lucide-react'

import { useChat } from './hooks/useChat'
import { useRuntimeClient } from './hooks/useRuntimeClient'
import { useWorkspaces } from './hooks/useWorkspaces'
import { Sidebar } from './components/Sidebar'
import { ThemeToggle } from './components/ThemeToggle'
import { PermissionModal } from './components/PermissionModal'
import { RuntimeStatusBar } from './components/RuntimeStatusBar'
import { TerminalPlaceholder } from './components/TerminalFrame'
import { Button } from './components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from './components/ui/sheet'
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs'
import { cn } from './lib/utils'
import {
  clearToken,
  consumeTokenFromUrl,
  loadTokenFromStorage,
  persistToken,
} from './lib/token'
import { ChatPage } from './pages/Chat'
import { ConnectPage } from './pages/Connect'
import { SettingsPage } from './pages/Settings'

type View = 'chat' | 'shell' | 'files' | 'settings'

const terminalTabsListClass =
  'rounded-md border border-[hsl(var(--kode-terminal-border))] bg-[hsl(var(--kode-terminal-bg))] p-1 text-[hsl(var(--kode-terminal-muted))]'

const terminalTabTriggerClass =
  'rounded-[4px] data-[state=active]:bg-[hsl(var(--kode-terminal-elevated))] data-[state=active]:text-[hsl(var(--kode-terminal-text))] data-[state=active]:shadow-none'

function getInitialToken(): string {
  return consumeTokenFromUrl() || loadTokenFromStorage()
}

function baseUrlForClient(): string {
  if (typeof window !== 'undefined' && window.location) {
    return window.location.origin
  }
  return 'http://127.0.0.1:3000'
}

export default function App() {
  const [token, setToken] = React.useState(getInitialToken)
  const [view, setView] = React.useState<View>('chat')
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false)

  const {
    workspaces,
    workspaceId,
    setWorkspaceId,
    loading: workspacesLoading,
  } = useWorkspaces({ token })

  const { client, restartClient, runtimeAttached, runtimeStatus } =
    useRuntimeClient({
      baseUrl: baseUrlForClient(),
      token,
      workspaceId,
    })

  const chat = useChat({
    client,
    resetKey: workspaceId ?? 'none',
    onNewSession: restartClient,
  })

  const currentWorkspace =
    workspaces.find(w => w.id === workspaceId) ??
    workspaces.find(w => w.isCurrent) ??
    workspaces[0] ??
    null

  const selectedSession =
    chat.sessions.find(s => s.sessionId === chat.selectedSessionId) ?? null
  const selectedSessionTitle =
    selectedSession?.customTitle ||
    selectedSession?.slug ||
    (chat.selectedSessionId ? 'Chat' : 'New session')

  if (!token) {
    return (
      <ConnectPage
        token={token}
        onTokenChange={setToken}
        onSave={() => {
          const next = token.trim()
          if (!next) return
          persistToken(next)
          setToken(next)
        }}
      />
    )
  }

  const sidebar = (
    <Sidebar
      workspaces={workspaces}
      workspaceId={workspaceId}
      onSelectWorkspace={id => {
        setWorkspaceId(id)
        restartClient()
      }}
      sessions={chat.sessions}
      selectedSessionId={chat.selectedSessionId}
      onSelectSession={id => {
        void chat.selectSession(id)
        setView('chat')
        setMobileSidebarOpen(false)
      }}
      onNewSession={() => {
        chat.startNewSession()
        setView('chat')
        setMobileSidebarOpen(false)
      }}
    />
  )

  return (
    <div className="kode-web-root bg-background text-foreground">
      <div className="grid h-full grid-cols-1 lg:grid-cols-[304px_minmax(0,1fr)]">
        <div className="hidden lg:block">{sidebar}</div>

        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <div className="flex min-h-14 items-center gap-2 border-b border-[hsl(var(--kode-terminal-border))] bg-[hsl(var(--kode-terminal-panel))] px-3 py-2 font-mono text-[hsl(var(--kode-terminal-text))] shadow-sm shadow-black/20">
            <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
              <SheetTrigger asChild className="lg:hidden">
                <Button variant="ghost" size="icon" aria-label="Open sidebar">
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[min(304px,100vw)] p-0">
                {sidebar}
              </SheetContent>
            </Sheet>

            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">
                {selectedSessionTitle}
              </div>
              <div className="truncate text-xs text-[hsl(var(--kode-terminal-muted))]">
                {workspacesLoading
                  ? 'Loading workspaces...'
                  : (currentWorkspace?.path ?? 'No workspace')}
              </div>
            </div>

            <Tabs
              value={view}
              onValueChange={v => {
                if (
                  v === 'chat' ||
                  v === 'shell' ||
                  v === 'files' ||
                  v === 'settings'
                ) {
                  setView(v)
                }
              }}
            >
              <TabsList
                className={cn('hidden sm:inline-flex', terminalTabsListClass)}
              >
                <TabsTrigger className={terminalTabTriggerClass} value="chat">
                  <MessagesSquare className="h-4 w-4" />
                  Chat
                </TabsTrigger>
                <TabsTrigger className={terminalTabTriggerClass} value="shell">
                  <Terminal className="h-4 w-4" />
                  Shell
                </TabsTrigger>
                <TabsTrigger className={terminalTabTriggerClass} value="files">
                  <FileText className="h-4 w-4" />
                  Files
                </TabsTrigger>
                <TabsTrigger
                  className={terminalTabTriggerClass}
                  value="settings"
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </TabsTrigger>
              </TabsList>
              <TabsList className={cn('sm:hidden', terminalTabsListClass)}>
                <TabsTrigger
                  className={terminalTabTriggerClass}
                  value="chat"
                  aria-label="Chat"
                >
                  <MessagesSquare className="h-4 w-4" />
                </TabsTrigger>
                <TabsTrigger
                  className={terminalTabTriggerClass}
                  value="shell"
                  aria-label="Shell"
                >
                  <Terminal className="h-4 w-4" />
                </TabsTrigger>
                <TabsTrigger
                  className={terminalTabTriggerClass}
                  value="files"
                  aria-label="Files"
                >
                  <FileText className="h-4 w-4" />
                </TabsTrigger>
                <TabsTrigger
                  className={terminalTabTriggerClass}
                  value="settings"
                  aria-label="Settings"
                >
                  <Settings className="h-4 w-4" />
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <RuntimeStatusBar
              runtimeStatus={runtimeStatus}
              runtimeAttached={runtimeAttached}
              running={chat.sending}
              selectedSessionId={chat.selectedSessionId}
              eventCount={chat.events.length}
            />

            <div
              className={cn(
                'h-2 w-2 shrink-0 rounded-full xl:hidden',
                runtimeAttached ? 'bg-emerald-500' : 'bg-muted-foreground/40',
              )}
              aria-label={
                runtimeAttached ? 'Runtime attached' : 'Runtime detached'
              }
              role="status"
              title={runtimeAttached ? 'Runtime attached' : 'Runtime detached'}
            />
            <ThemeToggle />
          </div>

          <div className="min-h-0 flex-1">
            {view === 'settings' ? (
              <SettingsPage
                token={token}
                onTokenChange={t => {
                  persistToken(t)
                  setToken(t)
                }}
                onTokenClear={() => {
                  clearToken()
                  setToken('')
                }}
              />
            ) : view === 'chat' ? (
              <ChatPage
                events={chat.events}
                input={chat.input}
                onInputChange={chat.setInput}
                onPasteText={chat.insertPastedText}
                onSend={() => void chat.send()}
                disabled={!client}
                sending={chat.sending}
                permissionRequest={chat.permissionRequest}
                runtimeAttached={runtimeAttached}
                runtimeStatus={runtimeStatus}
                sessionTitle={selectedSessionTitle}
                workspacePath={currentWorkspace?.path ?? null}
              />
            ) : (
              <TerminalPlaceholder
                command={view}
                workspacePath={currentWorkspace?.path ?? null}
                runtimeAttached={runtimeAttached}
              />
            )}
          </div>
        </div>
      </div>

      <PermissionModal
        request={chat.permissionRequest}
        onAllowOnce={id => {
          if (!client) return
          void client.approveToolUse(id, { decision: 'allow_once' })
          chat.clearPermissionRequest()
        }}
        onAllowAlways={id => {
          if (!client) return
          void client.approveToolUse(id, { decision: 'allow_always' })
          chat.clearPermissionRequest()
        }}
        onDeny={(id, reason) => {
          if (!client) return
          void client.denyToolUse(id, reason)
          chat.clearPermissionRequest()
        }}
      />
    </div>
  )
}
