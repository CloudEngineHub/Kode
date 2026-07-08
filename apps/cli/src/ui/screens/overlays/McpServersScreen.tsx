import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Text } from 'ink'
import type { Option } from '@inkjs/ui'
import figures from 'figures'
import { existsSync } from 'node:fs'

import type { Tool } from '#core/tooling/Tool'
import {
  authenticateMcpServer,
  clearMcpAuth,
  getClients,
  getMcpAuthSnapshot,
  getMCPCommands,
  getMCPResources,
  getMCPTools,
  getMcprcServerStatus,
  getMcpServer,
  listMCPServers,
  resetMcpConnections,
  type McpResource,
} from '#core/mcp/client'
import {
  getCurrentProjectConfig,
  getGlobalConfig,
  getProjectMcpServerDefinitions,
  saveCurrentProjectConfig,
  saveGlobalConfig,
  type McpServerConfig,
} from '#core/utils/config'
import { getGlobalConfigFilePath } from '#core/utils/env'
import { getTheme } from '#core/utils/theme'
import { getCwd } from '#core/utils/state'

import { useExitOnCtrlCD } from '#ui-ink/hooks/useExitOnCtrlCD'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { useTerminalSize } from '#ui-ink/hooks/useTerminalSize'
import { ScreenFrame } from '#ui-ink/primitives/layout/ScreenFrame'
import {
  Select,
  type OptionSubtree,
} from '#ui-ink/components/CustomSelect/select'

type McpUiScope =
  'project' | 'local' | 'user' | 'enterprise' | 'agent' | 'dynamic'

type McpUiStatus =
  | 'connected'
  | 'failed'
  | 'needs-auth'
  | 'disabled'
  | 'pending-approval'
  | 'rejected'
  | 'disconnected'

type McpUiServer = {
  name: string
  config: McpServerConfig
  scope: McpUiScope
  configLocation: string
  status: McpUiStatus
}

type ServerCounts = {
  tools: number
  prompts: number
  resources: number
}

type Route =
  | { kind: 'list'; focusValue?: string }
  | { kind: 'server'; serverName: string }
  | { kind: 'tools'; serverName: string }
  | { kind: 'tool'; serverName: string; tool: Tool }
  | { kind: 'resources'; serverName: string }
  | { kind: 'resource'; serverName: string; resource: McpResource }
  | { kind: 'auth'; serverName: string }

function getScopeLabel(scope: McpUiScope): string {
  switch (scope) {
    case 'project':
      return 'Project MCPs'
    case 'local':
      return 'Local MCPs'
    case 'user':
      return 'User MCPs'
    case 'enterprise':
      return 'Enterprise MCPs'
    case 'agent':
      return 'Agent MCPs'
    case 'dynamic':
      return 'Built-in MCPs'
  }
}

function configLocationForScope(scope: McpUiScope): string {
  const globalPath = getGlobalConfigFilePath()
  const cwd = getCwd()
  const projectDefs = getProjectMcpServerDefinitions()

  switch (scope) {
    case 'user': {
      return `${globalPath}${existsSync(globalPath) ? '' : ' (file does not exist)'}`
    }
    case 'project': {
      return `${projectDefs.mcpJsonPath}${existsSync(projectDefs.mcpJsonPath) ? '' : ' (file does not exist)'}`
    }
    case 'local': {
      return `${globalPath} [project: ${cwd}]`
    }
    case 'enterprise': {
      return 'managed centrally'
    }
    case 'agent': {
      return 'dynamically configured (session)'
    }
    case 'dynamic': {
      return 'always available'
    }
  }
}

function headerConfigLocationForScope(
  scope: McpUiScope,
  serversInScope: McpUiServer[],
): string {
  const fallback = configLocationForScope(scope)
  if (serversInScope.length === 0) return fallback

  // UX parity with the reference CLI: if the primary config file does not exist
  // but legacy MCP servers were loaded, show the effective legacy config location
  // in the group header.
  const globalPath = getGlobalConfigFilePath()

  if (
    (scope === 'user' || scope === 'local') &&
    !existsSync(globalPath) &&
    serversInScope.some(s => !s.configLocation.startsWith(globalPath))
  ) {
    const legacyLocation = serversInScope.find(
      s => !s.configLocation.startsWith(globalPath),
    )?.configLocation
    if (legacyLocation) return legacyLocation
  }

  return fallback
}

function configLocationForServer(serverName: string): string {
  const globalPath = getGlobalConfigFilePath()
  const cwd = getCwd()
  const projectDefs = getProjectMcpServerDefinitions()

  if (serverName.startsWith('plugin_'))
    return 'dynamically configured (session)'

  const scoped = getMcpServer(serverName)
  if (scoped?.configLocation) return scoped.configLocation
  switch (scoped?.scope) {
    case 'global': {
      return `${globalPath}${existsSync(globalPath) ? '' : ' (file does not exist)'}`
    }
    case 'project': {
      return `${globalPath} [project: ${cwd}]`
    }
    case 'mcprc': {
      return `${projectDefs.mcprcPath}${existsSync(projectDefs.mcprcPath) ? '' : ' (file does not exist)'}`
    }
    case 'mcpjson': {
      return `${projectDefs.mcpJsonPath}${existsSync(projectDefs.mcpJsonPath) ? '' : ' (file does not exist)'}`
    }
    default: {
      return 'Dynamically configured'
    }
  }
}

function scopeForServer(serverName: string): McpUiScope {
  if (serverName.startsWith('plugin_')) return 'agent'

  const scoped = getMcpServer(serverName)
  switch (scoped?.scope) {
    case 'global':
      return 'user'
    case 'project':
      return 'local'
    case 'mcprc':
    case 'mcpjson':
      return 'project'
    default:
      return 'dynamic'
  }
}

function isRemoteConfig(
  config: McpServerConfig,
): config is Extract<McpServerConfig, { url: string }> {
  return (
    config.type === 'sse' ||
    config.type === 'http' ||
    config.type === 'ws' ||
    config.type === 'sse-ide' ||
    config.type === 'ws-ide'
  )
}

function isStdioConfig(
  config: McpServerConfig,
): config is Extract<McpServerConfig, { command: string }> {
  return (
    config.type === undefined ||
    config.type === 'stdio' ||
    ('command' in config && typeof config.command === 'string')
  )
}

function formatServerStatusLabel(status: McpUiStatus): string {
  switch (status) {
    case 'connected':
      return `${figures.tick} connected`
    case 'failed':
      return `${figures.cross} failed`
    case 'needs-auth':
      return `${figures.triangleUpOutline} needs authentication`
    case 'disabled':
      return `${figures.radioOff} disabled`
    case 'pending-approval':
      return `${figures.radioOff} needs approval`
    case 'rejected':
      return `${figures.cross} rejected`
    case 'disconnected':
      return `${figures.cross} disconnected`
  }
}

function statusColor(theme: ReturnType<typeof getTheme>, status: McpUiStatus) {
  switch (status) {
    case 'connected':
      return theme.success
    case 'needs-auth':
    case 'pending-approval':
      return theme.warning
    case 'disabled':
      return theme.secondaryText
    case 'failed':
    case 'rejected':
    case 'disconnected':
      return theme.error
  }
}

function toolTitleForList(serverName: string, tool: Tool): string {
  const full = tool.userFacingName()
  const prefix = `${serverName} - `
  const suffix = ' (MCP)'
  if (full.startsWith(prefix) && full.endsWith(suffix)) {
    return full.slice(prefix.length, full.length - suffix.length)
  }
  return full
}

function resourceTitleForList(resource: McpResource): string {
  return resource.title?.trim() || resource.name || resource.uri
}

function formatResourceSize(size: unknown): string | null {
  if (typeof size !== 'number' || !Number.isFinite(size)) return null
  if (size < 1024) return `${size} B`
  const kib = size / 1024
  if (kib < 1024) return `${kib.toFixed(1)} KiB`
  return `${(kib / 1024).toFixed(1)} MiB`
}

function getRequiredKeys(schema: unknown): Set<string> {
  if (!schema || typeof schema !== 'object') return new Set()
  const record = schema as Record<string, unknown>
  const raw = record['required']
  if (!Array.isArray(raw)) return new Set()
  return new Set(raw.filter((v): v is string => typeof v === 'string'))
}

function getSchemaProperties(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') return {}
  const record = schema as Record<string, unknown>
  const raw = record['properties']
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return raw as Record<string, unknown>
}

function formatParamType(param: unknown): string {
  if (!param || typeof param !== 'object' || Array.isArray(param))
    return 'unknown'
  const record = param as Record<string, unknown>
  const type = record['type']
  if (typeof type === 'string' && type.trim()) return type
  return 'unknown'
}

function formatParamDescription(param: unknown): string | null {
  if (!param || typeof param !== 'object' || Array.isArray(param)) return null
  const record = param as Record<string, unknown>
  const description = record['description']
  if (typeof description === 'string' && description.trim())
    return description.trim()
  return null
}

function computeAuthStatus(
  serverName: string,
  config: McpServerConfig,
): {
  showAuthLine: boolean
  authenticated: boolean
} {
  if (!isRemoteConfig(config))
    return { showAuthLine: false, authenticated: false }

  if (config.type === 'ws-ide') {
    return { showAuthLine: true, authenticated: Boolean(config.authToken) }
  }

  const snapshot = getMcpAuthSnapshot(serverName)
  return { showAuthLine: true, authenticated: snapshot.isAuthenticated }
}

export function McpServersScreen(props: { onDone(result?: string): void }) {
  const theme = getTheme()
  const { rows, columns } = useTerminalSize()
  const tightLayout = rows <= 18 || columns <= 72
  const compactLayout = tightLayout || rows <= 22
  const paddingY = tightLayout ? 0 : 1
  const gap = tightLayout ? 0 : 1
  const paddingX = tightLayout || compactLayout ? 1 : 2

  const exitState = useExitOnCtrlCD(() => process.exit(0))

  const [route, setRoute] = useState<Route>({ kind: 'list' })
  const [servers, setServers] = useState<McpUiServer[]>([])
  const [loadingServers, setLoadingServers] = useState(true)
  const [serversError, setServersError] = useState<string | null>(null)

  const [activeServerCounts, setActiveServerCounts] =
    useState<ServerCounts | null>(null)
  const [activeServerCountsLoading, setActiveServerCountsLoading] =
    useState(false)
  const [activeServerCountsError, setActiveServerCountsError] = useState<
    string | null
  >(null)

  const [toolsLoading, setToolsLoading] = useState(false)
  const [toolsError, setToolsError] = useState<string | null>(null)
  const [tools, setTools] = useState<Tool[]>([])
  const [toolDetailDescription, setToolDetailDescription] = useState<
    string | null
  >(null)
  const [resourcesLoading, setResourcesLoading] = useState(false)
  const [resources, setResources] = useState<McpResource[]>([])
  const [resourcesError, setResourcesError] = useState<string | null>(null)

  const [authInProgress, setAuthInProgress] = useState(false)
  const [authUrl, setAuthUrl] = useState<string | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const authAbortControllerRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)
  const serverRefreshGenerationRef = useRef(0)

  const [actionError, setActionError] = useState<string | null>(null)

  const runAction = useCallback(async (action: () => Promise<void>) => {
    setActionError(null)
    try {
      await action()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const refreshServers = useCallback(async () => {
    if (!mountedRef.current) return

    const requestGeneration = serverRefreshGenerationRef.current + 1
    serverRefreshGenerationRef.current = requestGeneration
    const isCurrentRefresh = () =>
      mountedRef.current &&
      serverRefreshGenerationRef.current === requestGeneration

    setLoadingServers(true)
    setServersError(null)
    try {
      const all = listMCPServers()
      const clients = await getClients()

      const clientByName = new Map<string, (typeof clients)[number]>()
      for (const client of clients) clientByName.set(client.name, client)

      const globalConfig = getGlobalConfig()
      const projectConfig = getCurrentProjectConfig()

      const globalDisabled = new Set(globalConfig.disabledMcpServers ?? [])
      const projectDisabled = new Set(projectConfig.disabledMcpServers ?? [])

      const items: McpUiServer[] = Object.keys(all)
        .sort((a, b) => a.localeCompare(b))
        .map(name => {
          const config = all[name] as McpServerConfig
          const scope = scopeForServer(name)
          const configLocation = configLocationForServer(name)

          const isDisabled =
            globalDisabled.has(name) || projectDisabled.has(name)
          if (isDisabled) {
            return { name, config, scope, configLocation, status: 'disabled' }
          }

          if (scope === 'project') {
            const approval = getMcprcServerStatus(name)
            if (approval === 'pending') {
              return {
                name,
                config,
                scope,
                configLocation,
                status: 'pending-approval',
              }
            }
            if (approval === 'rejected') {
              return {
                name,
                config,
                scope,
                configLocation,
                status: 'rejected',
              }
            }
          }

          const client = clientByName.get(name)
          if (client?.type === 'connected') {
            return { name, config, scope, configLocation, status: 'connected' }
          }
          if (client?.type === 'needs-auth') {
            return { name, config, scope, configLocation, status: 'needs-auth' }
          }
          if (client?.type === 'failed') {
            return { name, config, scope, configLocation, status: 'failed' }
          }

          return { name, config, scope, configLocation, status: 'disconnected' }
        })

      if (!isCurrentRefresh()) return
      setServers(items)
    } catch (err) {
      if (!isCurrentRefresh()) return
      setServers([])
      setServersError(err instanceof Error ? err.message : String(err))
    } finally {
      if (isCurrentRefresh()) setLoadingServers(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    refreshServers().catch(() => {})
    return () => {
      mountedRef.current = false
      serverRefreshGenerationRef.current += 1
    }
  }, [refreshServers])

  const serversByScope = useMemo(() => {
    const out = new Map<McpUiScope, McpUiServer[]>()
    for (const server of servers) {
      const list = out.get(server.scope) ?? []
      list.push(server)
      out.set(server.scope, list)
    }
    return out
  }, [servers])

  const listOptions = useMemo((): OptionSubtree[] => {
    const order: McpUiScope[] = [
      'project',
      'user',
      'local',
      'enterprise',
      'agent',
      'dynamic',
    ]
    const options: OptionSubtree[] = []

    for (const scope of order) {
      const items = serversByScope.get(scope) ?? []
      if (items.length === 0) continue
      const header = `${getScopeLabel(scope)} (${headerConfigLocationForScope(scope, items)})`
      options.push({
        header,
        options: items.map((server): Option => ({
          label: `${server.name} · ${formatServerStatusLabel(server.status)}`,
          value: server.name,
        })),
      })
    }

    return options
  }, [serversByScope])

  const activeServer =
    route.kind === 'server' ||
    route.kind === 'tools' ||
    route.kind === 'tool' ||
    route.kind === 'resources' ||
    route.kind === 'resource' ||
    route.kind === 'auth'
      ? (servers.find(s => s.name === route.serverName) ?? null)
      : null
  const activeServerName = activeServer?.name ?? null
  const activeServerStatus = activeServer?.status ?? null

  const visibleOptionCount = (() => {
    if (route.kind === 'list') {
      const headerCount = listOptions.length
      const serverCount = servers.length
      const reservedLines = (compactLayout ? 10 : 12) + paddingY * 2 + gap * 4
      const target = Math.max(3, rows - reservedLines - headerCount)
      return Math.max(3, Math.min(12, serverCount + headerCount, target))
    }
    return 10
  })()

  const showListFooter =
    servers.some(s => s.status === 'failed') ||
    servers.some(s => s.status === 'needs-auth')

  const rememberListFocus = useCallback((focusValue: string) => {
    setRoute(prev => {
      if (prev.kind !== 'list' || prev.focusValue === focusValue) return prev
      return { kind: 'list', focusValue }
    })
  }, [])

  useKeypress((input, key) => {
    if (!key.escape) return

    switch (route.kind) {
      case 'list':
        authAbortControllerRef.current?.abort()
        props.onDone()
        return
      case 'server':
        setRoute({ kind: 'list', focusValue: route.serverName })
        return
      case 'tools':
        setRoute({ kind: 'server', serverName: route.serverName })
        return
      case 'tool':
        setRoute({ kind: 'tools', serverName: route.serverName })
        return
      case 'resources':
        setRoute({ kind: 'server', serverName: route.serverName })
        return
      case 'resource':
        setRoute({ kind: 'resources', serverName: route.serverName })
        return
      case 'auth':
        authAbortControllerRef.current?.abort()
        authAbortControllerRef.current = null
        setAuthInProgress(false)
        setAuthError(null)
        setAuthUrl(null)
        setRoute({ kind: 'server', serverName: route.serverName })
        return
    }
  })

  useEffect(() => {
    if (route.kind !== 'server') return
    if (activeServerName === null) return

    let didCancel = false

    setActiveServerCounts(null)
    setActiveServerCountsLoading(true)
    setActiveServerCountsError(null)

    if (activeServerStatus !== 'connected') {
      setActiveServerCountsLoading(false)
      return () => {
        didCancel = true
      }
    }

    ;(async () => {
      try {
        const [allTools, allPrompts, allResources] = await Promise.all([
          getMCPTools(),
          getMCPCommands(),
          getMCPResources(),
        ])
        const toolsForServer = allTools.filter(t =>
          t.userFacingName().startsWith(`${activeServerName} - `),
        )
        const promptsForServer = allPrompts.filter(p =>
          p.userFacingName().startsWith(`${activeServerName}:`),
        )
        const resourcesForServer = allResources.filter(
          resource => resource.server === activeServerName,
        )

        if (didCancel) return
        setActiveServerCounts({
          tools: toolsForServer.length,
          prompts: promptsForServer.length,
          resources: resourcesForServer.length,
        })
      } catch (err) {
        if (didCancel) return
        setActiveServerCountsError(
          err instanceof Error ? err.message : String(err),
        )
      } finally {
        if (!didCancel) setActiveServerCountsLoading(false)
      }
    })()

    return () => {
      didCancel = true
    }
  }, [
    route.kind,
    route.kind === 'server' ? route.serverName : null,
    activeServerName,
    activeServerStatus,
  ])

  useEffect(() => {
    if (route.kind !== 'tools') return
    if (activeServerName === null) return

    let didCancel = false

    setTools([])
    setToolsLoading(true)
    setToolsError(null)
    ;(async () => {
      try {
        const allTools = await getMCPTools()
        const toolsForServer = allTools.filter(t =>
          t.userFacingName().startsWith(`${activeServerName} - `),
        )
        if (didCancel) return
        setTools(toolsForServer)
      } catch (err) {
        if (didCancel) return
        setToolsError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!didCancel) setToolsLoading(false)
      }
    })()

    return () => {
      didCancel = true
    }
  }, [
    route.kind,
    route.kind === 'tools' ? route.serverName : null,
    activeServerName,
  ])

  useEffect(() => {
    if (route.kind !== 'resources') return
    if (activeServerName === null) return

    let didCancel = false

    setResources([])
    setResourcesLoading(true)
    setResourcesError(null)
    ;(async () => {
      try {
        const allResources = await getMCPResources()
        const resourcesForServer = allResources.filter(
          resource => resource.server === activeServerName,
        )
        if (didCancel) return
        setResources(resourcesForServer)
      } catch (err) {
        if (didCancel) return
        setResourcesError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!didCancel) setResourcesLoading(false)
      }
    })()

    return () => {
      didCancel = true
    }
  }, [
    route.kind,
    route.kind === 'resources' ? route.serverName : null,
    activeServerName,
  ])

  useEffect(() => {
    if (route.kind !== 'tool') return
    let didCancel = false
    setToolDetailDescription(null)
    ;(async () => {
      try {
        const desc =
          typeof route.tool.description === 'function'
            ? await route.tool.description()
            : (route.tool.cachedDescription ?? '')
        if (didCancel) return
        setToolDetailDescription(desc)
      } catch {
        if (didCancel) return
        setToolDetailDescription('Failed to load description')
      }
    })()

    return () => {
      didCancel = true
    }
  }, [route.kind, route.kind === 'tool' ? route.tool.name : null])

  const toggleDisabled = useCallback(
    async (server: McpUiServer) => {
      const globalConfig = getGlobalConfig()
      const projectConfig = getCurrentProjectConfig()

      const globalDisabled = new Set(globalConfig.disabledMcpServers ?? [])
      const projectDisabled = new Set(projectConfig.disabledMcpServers ?? [])

      const isCurrentlyDisabled =
        globalDisabled.has(server.name) || projectDisabled.has(server.name)
      const shouldDisable = !isCurrentlyDisabled

      if (!shouldDisable) {
        globalDisabled.delete(server.name)
        projectDisabled.delete(server.name)
      } else if (server.scope === 'user') {
        globalDisabled.add(server.name)
      } else {
        projectDisabled.add(server.name)
      }

      globalConfig.disabledMcpServers = Array.from(globalDisabled).sort()
      projectConfig.disabledMcpServers = Array.from(projectDisabled).sort()

      saveGlobalConfig(globalConfig)
      saveCurrentProjectConfig(projectConfig)

      await resetMcpConnections()
      await refreshServers()
    },
    [refreshServers],
  )

  const reconnect = useCallback(async () => {
    await resetMcpConnections()
    await refreshServers()
  }, [refreshServers])

  const clearAuth = useCallback(
    async (serverName: string) => {
      await clearMcpAuth(serverName)
      await resetMcpConnections()
      await refreshServers()
    },
    [refreshServers],
  )

  const startAuth = useCallback(
    async (server: McpUiServer) => {
      if (!isRemoteConfig(server.config)) return

      setAuthError(null)
      setAuthUrl(null)
      setAuthInProgress(true)

      authAbortControllerRef.current?.abort()
      const controller = new AbortController()
      authAbortControllerRef.current = controller

      try {
        await authenticateMcpServer({
          serverName: server.name,
          serverUrl: server.config.url,
          signal: controller.signal,
          onAuthUrl: nextUrl => setAuthUrl(nextUrl),
        })

        if (controller.signal.aborted) return
        await resetMcpConnections()
        await refreshServers()
        setRoute({ kind: 'server', serverName: server.name })
      } catch (err) {
        if (controller.signal.aborted) return
        setAuthError(err instanceof Error ? err.message : String(err))
      } finally {
        if (authAbortControllerRef.current === controller) {
          authAbortControllerRef.current = null
        }
        setAuthInProgress(false)
      }
    },
    [refreshServers],
  )

  const listView = (
    <Box flexDirection="column" gap={gap}>
      <Text wrap="truncate-end">
        {loadingServers ? 'Loading MCP servers…' : `${servers.length} servers`}
      </Text>

      <Box flexDirection="column" borderStyle="round" paddingX={1}>
        {listOptions.length === 0 && !loadingServers ? (
          <Text dimColor wrap="truncate-end">
            No MCP servers configured.
          </Text>
        ) : (
          <Select
            options={listOptions}
            visibleOptionCount={visibleOptionCount}
            focusValue={route.kind === 'list' ? route.focusValue : undefined}
            onFocus={rememberListFocus}
            onChange={value => setRoute({ kind: 'server', serverName: value })}
          />
        )}
      </Box>

      {serversError ? (
        <Box marginTop={tightLayout ? 0 : 1}>
          <Text color={theme.error} wrap="truncate-end">
            Error: {serversError}
          </Text>
        </Box>
      ) : null}

      <Box flexDirection="column" marginTop={tightLayout ? 0 : 1}>
        {showListFooter ? (
          <Text dimColor wrap="truncate-end">
            ※ Run <Text bold>kode --debug</Text> to see error logs
          </Text>
        ) : null}
        <Box flexDirection="column" marginTop={tightLayout ? 0 : 1}>
          <Text dimColor wrap="truncate-end">
            See <Text bold>kode mcp --help</Text> for help
          </Text>
        </Box>
      </Box>

      <Box marginTop={tightLayout ? 0 : 1}>
        <Text dimColor wrap="truncate-end">
          {exitState.pending
            ? `Press ${exitState.keyName} again to exit`
            : '↑↓ to navigate · Enter to confirm · Esc to cancel'}
        </Text>
      </Box>
    </Box>
  )

  const serverView = (() => {
    if (!activeServer) {
      return (
        <Box flexDirection="column">
          <Text color={theme.error}>Server not found.</Text>
        </Box>
      )
    }

    const displayName =
      activeServer.name.charAt(0).toUpperCase() + activeServer.name.slice(1)

    const statusText = formatServerStatusLabel(activeServer.status)
    const statusTextColor = statusColor(theme, activeServer.status)

    const counts = activeServerCounts
    const capabilitiesPending =
      activeServer.status === 'connected' &&
      activeServerCountsError === null &&
      (activeServerCountsLoading || counts === null)
    const capabilities: string[] = []
    if (counts?.tools) capabilities.push('tools')
    if (counts?.resources) capabilities.push('resources')
    if (counts?.prompts) capabilities.push('prompts')

    const { showAuthLine, authenticated } = computeAuthStatus(
      activeServer.name,
      activeServer.config,
    )

    const actions: Array<{ label: string; value: string }> = []

    if (activeServer.status === 'disabled') {
      actions.push({ label: 'Enable', value: 'toggle-enabled' })
    } else {
      if (counts?.tools && counts.tools > 0) {
        actions.push({ label: 'View tools', value: 'tools' })
      }
      if (counts?.resources && counts.resources > 0) {
        actions.push({ label: 'View resources', value: 'resources' })
      }

      if (isRemoteConfig(activeServer.config)) {
        if (authenticated) {
          actions.push({ label: 'Re-authenticate', value: 'reauth' })
          actions.push({ label: 'Clear authentication', value: 'clear-auth' })
        } else {
          actions.push({ label: 'Authenticate', value: 'auth' })
        }
      }

      if (activeServer.status !== 'needs-auth') {
        actions.push({ label: 'Reconnect', value: 'reconnect' })
      }

      actions.push({ label: 'Disable', value: 'toggle-enabled' })
    }

    const actionOptions: Option[] =
      actions.length > 0
        ? actions.map((action, idx) => ({
            label: `${idx + 1}. ${action.label}`,
            value: action.value,
          }))
        : [{ label: 'Back', value: 'back' }]

    return (
      <Box flexDirection="column" gap={gap}>
        <Box flexDirection="column" borderStyle="round" paddingX={1}>
          <Box marginBottom={1}>
            <Text bold wrap="truncate-end">
              {displayName} MCP Server
            </Text>
          </Box>

          <Box flexDirection="column" gap={0}>
            <Text wrap="truncate-end">
              <Text bold>Status: </Text>
              <Text color={statusTextColor}>{statusText}</Text>
            </Text>

            {showAuthLine ? (
              <Text wrap="truncate-end">
                <Text bold>Auth: </Text>
                <Text color={authenticated ? theme.success : theme.error}>
                  {authenticated
                    ? `${figures.tick} authenticated`
                    : `${figures.cross} not authenticated`}
                </Text>
              </Text>
            ) : null}

            {isRemoteConfig(activeServer.config) ? (
              <Text wrap="truncate-end">
                <Text bold>URL: </Text>
                <Text dimColor>{activeServer.config.url}</Text>
              </Text>
            ) : isStdioConfig(activeServer.config) ? (
              <>
                <Text wrap="truncate-end">
                  <Text bold>Command: </Text>
                  <Text dimColor>{activeServer.config.command}</Text>
                </Text>
                {activeServer.config.args?.length ? (
                  <Text wrap="truncate-end">
                    <Text bold>Args: </Text>
                    <Text dimColor>{activeServer.config.args.join(' ')}</Text>
                  </Text>
                ) : null}
              </>
            ) : null}

            <Text wrap="truncate-end">
              <Text bold>Config location: </Text>
              <Text dimColor>{activeServer.configLocation}</Text>
            </Text>

            {activeServer.status === 'connected' ? (
              <Text wrap="truncate-end">
                <Text bold>Capabilities: </Text>
                {capabilitiesPending ? (
                  <Text dimColor>loading...</Text>
                ) : (
                  <Text color={theme.text}>
                    {capabilities.length ? capabilities.join(', ') : 'none'}
                  </Text>
                )}
              </Text>
            ) : null}

            {counts?.tools && counts.tools > 0 ? (
              <Text wrap="truncate-end">
                <Text bold>Tools: </Text>
                <Text dimColor>{counts.tools} tools</Text>
              </Text>
            ) : null}

            {counts?.resources && counts.resources > 0 ? (
              <Text wrap="truncate-end">
                <Text bold>Resources: </Text>
                <Text dimColor>{counts.resources} resources</Text>
              </Text>
            ) : null}
          </Box>

          {activeServerCountsError ? (
            <Box marginTop={1}>
              <Text color={theme.error} wrap="truncate-end">
                Error: {activeServerCountsError}
              </Text>
            </Box>
          ) : null}

          {actionError ? (
            <Box marginTop={1}>
              <Text color={theme.error} wrap="wrap">
                Error: {actionError}
              </Text>
            </Box>
          ) : null}
        </Box>

        <Box flexDirection="column" borderStyle="round" paddingX={1}>
          {capabilitiesPending ? (
            <Text dimColor wrap="truncate-end">
              Loading actions...
            </Text>
          ) : (
            <Select
              options={actionOptions}
              visibleOptionCount={Math.min(10, actionOptions.length || 1)}
              onChange={async value => {
                if (value === 'tools') {
                  setRoute({ kind: 'tools', serverName: activeServer.name })
                  return
                }
                if (value === 'resources') {
                  setRoute({ kind: 'resources', serverName: activeServer.name })
                  return
                }
                if (value === 'auth' || value === 'reauth') {
                  setRoute({ kind: 'auth', serverName: activeServer.name })
                  await startAuth(activeServer)
                  return
                }
                if (value === 'clear-auth') {
                  await runAction(async () => clearAuth(activeServer.name))
                  return
                }
                if (value === 'reconnect') {
                  await runAction(async () => reconnect())
                  return
                }
                if (value === 'toggle-enabled') {
                  await runAction(async () => toggleDisabled(activeServer))
                  return
                }
                if (value === 'back') {
                  setRoute({ kind: 'list', focusValue: activeServer.name })
                  return
                }
              }}
            />
          )}
        </Box>

        <Box marginTop={tightLayout ? 0 : 1}>
          <Text dimColor wrap="truncate-end">
            {exitState.pending
              ? `Press ${exitState.keyName} again to exit`
              : 'Esc to go back'}
          </Text>
        </Box>
      </Box>
    )
  })()

  const toolsView = (() => {
    if (!activeServer) return null

    const options: Option[] = tools.map((tool, idx) => ({
      label: toolTitleForList(activeServer.name, tool),
      value: String(idx),
    }))

    return (
      <Box flexDirection="column" gap={gap}>
        <Box flexDirection="column" borderStyle="round" paddingX={1}>
          <Box marginBottom={1}>
            <Text bold wrap="truncate-end">
              Tools for {activeServer.name}{' '}
              <Text dimColor>({tools.length} tools)</Text>
            </Text>
          </Box>

          {toolsLoading ? (
            <Text dimColor wrap="truncate-end">
              Loading tools…
            </Text>
          ) : toolsError ? (
            <Text color={theme.error} wrap="wrap">
              Error: {toolsError}
            </Text>
          ) : tools.length === 0 ? (
            <Text dimColor wrap="truncate-end">
              No tools available
            </Text>
          ) : (
            <Select
              options={options}
              visibleOptionCount={Math.min(12, Math.max(3, options.length))}
              onChange={value => {
                const idx = Number.parseInt(value, 10)
                const tool = tools[idx]
                if (tool)
                  setRoute({
                    kind: 'tool',
                    serverName: activeServer.name,
                    tool,
                  })
              }}
            />
          )}
        </Box>

        <Box marginTop={tightLayout ? 0 : 1}>
          <Text dimColor wrap="truncate-end">
            {exitState.pending
              ? `Press ${exitState.keyName} again to exit`
              : 'Esc to go back'}
          </Text>
        </Box>
      </Box>
    )
  })()

  const resourcesView = (() => {
    if (!activeServer) return null

    const options: Option[] = resources.map((resource, idx) => ({
      label: resourceTitleForList(resource),
      value: String(idx),
    }))

    return (
      <Box flexDirection="column" gap={gap}>
        <Box flexDirection="column" borderStyle="round" paddingX={1}>
          <Box marginBottom={1}>
            <Text bold wrap="truncate-end">
              Resources for {activeServer.name}{' '}
              <Text dimColor>({resources.length} resources)</Text>
            </Text>
          </Box>

          {resourcesLoading ? (
            <Text dimColor wrap="truncate-end">
              Loading resources...
            </Text>
          ) : resourcesError ? (
            <Text color={theme.error} wrap="wrap">
              Error: {resourcesError}
            </Text>
          ) : resources.length === 0 ? (
            <Text dimColor wrap="truncate-end">
              No resources available
            </Text>
          ) : (
            <Select
              options={options}
              visibleOptionCount={Math.min(12, Math.max(3, options.length))}
              onChange={value => {
                const idx = Number.parseInt(value, 10)
                const resource = resources[idx]
                if (resource)
                  setRoute({
                    kind: 'resource',
                    serverName: activeServer.name,
                    resource,
                  })
              }}
            />
          )}
        </Box>

        <Box marginTop={tightLayout ? 0 : 1}>
          <Text dimColor wrap="truncate-end">
            {exitState.pending
              ? `Press ${exitState.keyName} again to exit`
              : 'Esc to go back'}
          </Text>
        </Box>
      </Box>
    )
  })()

  const resourceView = (() => {
    if (route.kind !== 'resource') return null
    const resource = route.resource
    const title = resourceTitleForList(resource)
    const size = formatResourceSize(resource.size)
    const annotationRecord =
      resource.annotations &&
      typeof resource.annotations === 'object' &&
      !Array.isArray(resource.annotations)
        ? (resource.annotations as Record<string, unknown>)
        : null
    const lastModified =
      typeof annotationRecord?.lastModified === 'string'
        ? annotationRecord.lastModified
        : null
    const priority =
      typeof annotationRecord?.priority === 'number'
        ? annotationRecord.priority
        : null
    const audience = Array.isArray(annotationRecord?.audience)
      ? annotationRecord.audience.filter(
          (value): value is string => typeof value === 'string',
        )
      : []

    return (
      <Box flexDirection="column" gap={gap}>
        <Box flexDirection="column" borderStyle="round" paddingX={1}>
          <Box marginBottom={1}>
            <Text bold wrap="truncate-end">
              {title} <Text dimColor>({route.serverName})</Text>
            </Text>
          </Box>

          <Text wrap="truncate-end">
            <Text bold>Resource name: </Text>
            <Text dimColor>{resource.name}</Text>
          </Text>

          <Text wrap="wrap">
            <Text bold>URI: </Text>
            <Text dimColor>{resource.uri}</Text>
          </Text>

          {resource.mimeType ? (
            <Text wrap="truncate-end">
              <Text bold>MIME type: </Text>
              <Text dimColor>{resource.mimeType}</Text>
            </Text>
          ) : null}

          {size ? (
            <Text wrap="truncate-end">
              <Text bold>Size: </Text>
              <Text dimColor>{size}</Text>
            </Text>
          ) : null}

          {resource.description ? (
            <Box flexDirection="column" marginTop={1}>
              <Text bold>Description:</Text>
              <Text wrap="wrap">{resource.description}</Text>
            </Box>
          ) : null}

          {audience.length || priority !== null || lastModified ? (
            <Box flexDirection="column" marginTop={1}>
              <Text bold>Annotations:</Text>
              <Box flexDirection="column" paddingLeft={2}>
                {audience.length ? (
                  <Text wrap="truncate-end">
                    <Text dimColor>audience: {audience.join(', ')}</Text>
                  </Text>
                ) : null}
                {priority !== null ? (
                  <Text wrap="truncate-end">
                    <Text dimColor>priority: {priority}</Text>
                  </Text>
                ) : null}
                {lastModified ? (
                  <Text wrap="truncate-end">
                    <Text dimColor>last modified: {lastModified}</Text>
                  </Text>
                ) : null}
              </Box>
            </Box>
          ) : null}
        </Box>

        <Box marginTop={tightLayout ? 0 : 1}>
          <Text dimColor wrap="truncate-end">
            {exitState.pending
              ? `Press ${exitState.keyName} again to exit`
              : 'Esc to go back'}
          </Text>
        </Box>
      </Box>
    )
  })()

  const toolView = (() => {
    if (route.kind !== 'tool') return null
    const tool = route.tool
    const title = toolTitleForList(route.serverName, tool)

    const required = getRequiredKeys(tool.inputJSONSchema)
    const properties = getSchemaProperties(tool.inputJSONSchema)
    const params = Object.entries(properties)

    return (
      <Box flexDirection="column" gap={gap}>
        <Box flexDirection="column" borderStyle="round" paddingX={1}>
          <Box marginBottom={1}>
            <Text bold wrap="truncate-end">
              {title} <Text dimColor>({route.serverName})</Text>
            </Text>
          </Box>

          <Text wrap="truncate-end">
            <Text bold>Tool name: </Text>
            <Text dimColor>{tool.name}</Text>
          </Text>

          {toolDetailDescription ? (
            <Box flexDirection="column" marginTop={1}>
              <Text bold>Description:</Text>
              <Text wrap="wrap">{toolDetailDescription}</Text>
            </Box>
          ) : (
            <Box flexDirection="column" marginTop={1}>
              <Text dimColor wrap="truncate-end">
                Loading description…
              </Text>
            </Box>
          )}

          {params.length > 0 ? (
            <Box flexDirection="column" marginTop={1}>
              <Text bold>Parameters:</Text>
              <Box flexDirection="column" paddingLeft={2}>
                {params.map(([key, value]) => (
                  <Text key={key} wrap="wrap">
                    • {key}
                    {required.has(key) ? (
                      <Text dimColor> (required)</Text>
                    ) : null}
                    : <Text dimColor> {formatParamType(value)}</Text>
                    {formatParamDescription(value) ? (
                      <Text dimColor> - {formatParamDescription(value)}</Text>
                    ) : null}
                  </Text>
                ))}
              </Box>
            </Box>
          ) : null}
        </Box>

        <Box marginTop={tightLayout ? 0 : 1}>
          <Text dimColor wrap="truncate-end">
            {exitState.pending
              ? `Press ${exitState.keyName} again to exit`
              : 'Esc to go back'}
          </Text>
        </Box>
      </Box>
    )
  })()

  const authView = (() => {
    if (route.kind !== 'auth') return null
    const snapshot = getMcpAuthSnapshot(route.serverName)

    return (
      <Box flexDirection="column" gap={gap}>
        <Box flexDirection="column" borderStyle="round" paddingX={1}>
          <Box marginBottom={1}>
            <Text bold wrap="truncate-end">
              Authenticating {route.serverName}
            </Text>
          </Box>

          <Text wrap="truncate-end">
            <Text dimColor>A browser window will open for authentication.</Text>
          </Text>

          {authUrl ? (
            <Box flexDirection="column" marginTop={1}>
              <Text dimColor wrap="truncate-end">
                If your browser doesn’t open automatically, open this URL:
              </Text>
              <Text wrap="wrap">{authUrl}</Text>
            </Box>
          ) : snapshot.lastAuthUrl ? (
            <Box flexDirection="column" marginTop={1}>
              <Text dimColor wrap="truncate-end">
                Authorization URL:
              </Text>
              <Text wrap="wrap">{snapshot.lastAuthUrl}</Text>
            </Box>
          ) : null}

          {authError ? (
            <Box marginTop={1}>
              <Text color={theme.error} wrap="wrap">
                Error: {authError}
              </Text>
            </Box>
          ) : null}

          {authInProgress ? (
            <Box marginTop={1}>
              <Text dimColor wrap="truncate-end">
                Waiting for authentication to complete…
              </Text>
            </Box>
          ) : (
            <Box marginTop={1}>
              <Text dimColor wrap="truncate-end">
                Esc to go back
              </Text>
            </Box>
          )}
        </Box>
      </Box>
    )
  })()

  return (
    <ScreenFrame
      title="Manage MCP servers"
      exitState={exitState}
      paddingX={paddingX}
      paddingY={paddingY}
      gap={gap}
    >
      {route.kind === 'list'
        ? listView
        : route.kind === 'server'
          ? serverView
          : route.kind === 'tools'
            ? toolsView
            : route.kind === 'tool'
              ? toolView
              : route.kind === 'resources'
                ? resourcesView
                : route.kind === 'resource'
                  ? resourceView
                  : route.kind === 'auth'
                    ? authView
                    : null}
    </ScreenFrame>
  )
}
