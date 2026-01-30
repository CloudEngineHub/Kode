import React from 'react'
import {
  FileText,
  Menu,
  MessagesSquare,
  Settings,
  Terminal,
} from 'lucide-react'

import { useChat } from './hooks/useChat'
import { useWebSocket } from './hooks/useWebSocket'
import { useWorkspaces } from './hooks/useWorkspaces'
import { Sidebar } from './components/Sidebar'
import { ThemeToggle } from './components/ThemeToggle'
import { PermissionModal } from './components/PermissionModal'
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

  const { client, restartClient, connected } = useWebSocket({
    baseUrl: baseUrlForClient(),
    token,
    workspaceId,
  })

  const chat = useChat({
    client,
    resetKey: workspaceId ?? 'none',
    onNewSession: restartClient,
  })

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
    <div className="h-screen bg-background text-foreground">
      <div className="grid h-full grid-cols-1 md:grid-cols-[320px_1fr]">
        <div className="hidden md:block">{sidebar}</div>

        <div className="flex h-full min-h-0 flex-col">
          <div className="flex items-center gap-2 border-b border-border bg-background/80 px-3 py-2 backdrop-blur">
            <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
              <SheetTrigger asChild className="md:hidden">
                <Button variant="ghost" size="icon" aria-label="Open sidebar">
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[320px] p-0">
                {sidebar}
              </SheetContent>
            </Sheet>

            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">
                {chat.selectedSessionId ? 'Chat' : 'New Session'}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {workspacesLoading
                  ? 'Loading workspaces…'
                  : (workspaces.find(w => w.id === workspaceId)?.title ?? '—')}
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
              <TabsList className="hidden sm:inline-flex">
                <TabsTrigger value="chat">
                  <MessagesSquare className="h-4 w-4" />
                  Chat
                </TabsTrigger>
                <TabsTrigger value="shell">
                  <Terminal className="h-4 w-4" />
                  Shell
                </TabsTrigger>
                <TabsTrigger value="files">
                  <FileText className="h-4 w-4" />
                  Files
                </TabsTrigger>
                <TabsTrigger value="settings">
                  <Settings className="h-4 w-4" />
                  Settings
                </TabsTrigger>
              </TabsList>
              <TabsList className="sm:hidden">
                <TabsTrigger value="chat" aria-label="Chat">
                  <MessagesSquare className="h-4 w-4" />
                </TabsTrigger>
                <TabsTrigger value="shell" aria-label="Shell">
                  <Terminal className="h-4 w-4" />
                </TabsTrigger>
                <TabsTrigger value="files" aria-label="Files">
                  <FileText className="h-4 w-4" />
                </TabsTrigger>
                <TabsTrigger value="settings" aria-label="Settings">
                  <Settings className="h-4 w-4" />
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div
              className={cn(
                'h-2 w-2 rounded-full',
                connected ? 'bg-emerald-500' : 'bg-muted-foreground/40',
              )}
              aria-label="Connection status"
            />
            <ThemeToggle />
          </div>

          <div className="flex-1 min-h-0">
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
                onSend={() => void chat.send()}
                disabled={!client || chat.sending}
                sending={chat.sending}
              />
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
                {view === 'shell'
                  ? 'Shell UI is coming soon.'
                  : 'File browser is coming soon.'}
              </div>
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
