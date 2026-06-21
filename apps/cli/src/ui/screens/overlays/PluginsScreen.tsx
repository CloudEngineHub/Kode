import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Text } from 'ink'
import figures from 'figures'

import { getTheme } from '#core/utils/theme'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { useExitOnCtrlCD } from '#ui-ink/hooks/useExitOnCtrlCD'
import { ScreenFrame } from '#ui-ink/primitives/layout/ScreenFrame'
import { useScreenLayout } from '#ui-ink/primitives/layout/useScreenLayout'
import { getWindowedList } from '#ui-ink/primitives/list/windowedList'
import { SearchBox } from '#ui-ink/components/SearchBox'

import {
  addMarketplace,
  getMarketplaceManifest,
  listInstalledSkillPlugins,
  listMarketplaces,
  refreshAllMarketplacesAsync,
  refreshMarketplaceAsync,
  removeMarketplace,
  installSkillPlugin,
  enableSkillPlugin,
  disableSkillPlugin,
  uninstallSkillPlugin,
  listEnabledInstalledPluginPackRoots,
  type MarketplaceManifest,
} from '#cli-services/skillMarketplace'
import { reloadCustomCommandsForSession } from '#cli-services/customCommands'
import { getSessionPlugins } from '#core/utils/sessionPlugins'

type TabId = 'discover' | 'installed' | 'marketplaces' | 'errors'

const TAB_ORDER: readonly TabId[] = [
  'discover',
  'installed',
  'marketplaces',
  'errors',
]

const TAB_LABELS: Record<TabId, string> = {
  discover: 'Discover',
  installed: 'Installed',
  marketplaces: 'Marketplaces',
  errors: 'Errors',
}

type MarketplacePlugin = {
  pluginSpec: string
  marketplaceName: string
  entry: MarketplaceManifest['plugins'][number]
}

type MarketplaceRow = {
  name: string
  sourceLabel: string
  lastUpdated?: string
}

type ScreenError = {
  scope: 'marketplace' | 'install' | 'runtime'
  message: string
  detail?: string
}

type View =
  | { type: 'tabs' }
  | { type: 'pluginDetails'; plugin: MarketplacePlugin }
  | { type: 'addMarketplace' }

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalizeQuery(value: string): string {
  return value.trim().toLowerCase()
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function formatMarketplaceSource(source: unknown): string {
  if (!source || typeof source !== 'object') return 'unknown'
  const s = source as any
  if (s.source === 'github' && typeof s.repo === 'string')
    return `GitHub (${s.repo})`
  if (s.source === 'git' && typeof s.url === 'string') return `Git (${s.url})`
  if (s.source === 'url' && typeof s.url === 'string') return `URL (${s.url})`
  if (s.source === 'file' && typeof s.path === 'string')
    return `File (${s.path})`
  if (s.source === 'directory' && typeof s.path === 'string')
    return `Directory (${s.path})`
  if (s.source === 'npm' && typeof s.package === 'string')
    return `NPM (${s.package})`
  return typeof s.source === 'string' ? s.source : 'unknown'
}

function matchesPlugin(plugin: MarketplacePlugin, query: string): boolean {
  if (!query) return true
  const name = String(plugin.entry?.name ?? '').toLowerCase()
  const description = String(plugin.entry?.description ?? '').toLowerCase()
  const marketplace = plugin.marketplaceName.toLowerCase()
  return (
    name.includes(query) ||
    description.includes(query) ||
    marketplace.includes(query)
  )
}

async function refreshPluginRuntimeFromInstalls(): Promise<string[]> {
  const installedRoots = listEnabledInstalledPluginPackRoots()
  const existingRoots = getSessionPlugins().map(p => p.rootDir)
  const dirs = Array.from(new Set([...existingRoots, ...installedRoots]))
  if (dirs.length === 0) return []

  const { configureSessionPlugins } =
    await import('#cli-services/pluginRuntime')
  const { errors } = await configureSessionPlugins({ pluginDirs: dirs })
  return errors
}

export function PluginsScreen({
  onDone,
}: {
  onDone: (message?: string) => void
}): React.ReactNode {
  const theme = getTheme()
  const layout = useScreenLayout()
  const exitState = useExitOnCtrlCD(() => onDone())

  const [view, setView] = useState<View>({ type: 'tabs' })
  const [activeTab, setActiveTab] = useState<TabId>('discover')

  const [isLoading, setIsLoading] = useState(true)
  const [plugins, setPlugins] = useState<MarketplacePlugin[]>([])
  const [marketplaces, setMarketplaces] = useState<MarketplaceRow[]>([])
  const [errors, setErrors] = useState<ScreenError[]>([])
  const [installedPlugins, setInstalledPlugins] = useState(() =>
    listInstalledSkillPlugins(),
  )

  const [discoverQuery, setDiscoverQuery] = useState('')
  const [discoverSearchFocused, setDiscoverSearchFocused] = useState(true)
  const [discoverSelectedIndex, setDiscoverSelectedIndex] = useState(0)
  const [selectedPluginSpecs, setSelectedPluginSpecs] = useState<Set<string>>(
    () => new Set(),
  )
  const [installingSpecs, setInstallingSpecs] = useState<Set<string>>(
    () => new Set(),
  )
  const [status, setStatus] = useState<string | null>(null)

  const [installedSelectedIndex, setInstalledSelectedIndex] = useState(0)
  const [marketplaceSelectedIndex, setMarketplaceSelectedIndex] = useState(0)

  const [addMarketplaceInput, setAddMarketplaceInput] = useState('')

  const installedSpecs = useMemo(
    () => new Set(Object.keys(installedPlugins)),
    [installedPlugins],
  )

  const refreshInstalled = useCallback(() => {
    setInstalledPlugins(listInstalledSkillPlugins())
  }, [])

  const refreshData = useCallback(async () => {
    setIsLoading(true)
    setStatus(null)

    const nextErrors: ScreenError[] = []

    try {
      refreshInstalled()
      const configured = listMarketplaces()
      const marketplaceNames = Object.keys(configured).sort()

      const nextMarketplaces: MarketplaceRow[] = []
      const nextPlugins: MarketplacePlugin[] = []

      for (const name of marketplaceNames) {
        const entry = (configured as any)[name]
        nextMarketplaces.push({
          name,
          sourceLabel: formatMarketplaceSource(entry?.source),
          lastUpdated:
            typeof entry?.lastUpdated === 'string'
              ? entry.lastUpdated
              : undefined,
        })

        try {
          const { manifest } = getMarketplaceManifest(name)
          for (const pluginEntry of manifest.plugins ?? []) {
            const pluginName = String((pluginEntry as any)?.name ?? '').trim()
            if (!pluginName) continue
            nextPlugins.push({
              pluginSpec: `${pluginName}@${name}`,
              marketplaceName: name,
              entry: pluginEntry,
            })
          }
        } catch (error) {
          nextErrors.push({
            scope: 'marketplace',
            message: `Failed to load marketplace '${name}'`,
            detail: stringifyError(error),
          })
        }
      }

      setMarketplaces(nextMarketplaces)
      setPlugins(nextPlugins)
      setErrors(nextErrors)
    } catch (error) {
      nextErrors.push({
        scope: 'marketplace',
        message: 'Failed to load marketplaces',
        detail: stringifyError(error),
      })
      setErrors(nextErrors)
    } finally {
      setIsLoading(false)
    }
  }, [refreshInstalled])

  useEffect(() => {
    void refreshData()
  }, [refreshData])

  const discoverCandidates = useMemo(() => {
    // Match CC: Discover only shows not-yet-installed plugins.
    return plugins.filter(p => !installedSpecs.has(p.pluginSpec))
  }, [installedSpecs, plugins])

  const discoverFiltered = useMemo(() => {
    const q = normalizeQuery(discoverQuery)
    return discoverCandidates.filter(p => matchesPlugin(p, q))
  }, [discoverCandidates, discoverQuery])

  const discoverReason = useMemo(() => {
    const marketplaceCount = marketplaces.length
    const hadMarketplaceLoadErrors =
      errors.some(e => e.scope === 'marketplace') && marketplaceCount > 0

    if (marketplaceCount === 0) return 'no-marketplaces-configured'
    if (plugins.length === 0 && hadMarketplaceLoadErrors)
      return 'all-marketplaces-failed'
    if (discoverCandidates.length === 0 && plugins.length > 0)
      return 'all-plugins-installed'
    return null
  }, [discoverCandidates.length, errors, marketplaces.length, plugins.length])

  useEffect(() => {
    setDiscoverSelectedIndex(prev =>
      clamp(prev, 0, Math.max(0, discoverFiltered.length - 1)),
    )
  }, [discoverFiltered.length])

  const installedRows = useMemo(() => {
    const rows = Object.entries(installedPlugins).map(([spec, record]) => {
      return {
        pluginSpec: spec,
        plugin: record,
      }
    })
    rows.sort((a, b) => a.pluginSpec.localeCompare(b.pluginSpec))
    return rows
  }, [installedPlugins])

  useEffect(() => {
    setInstalledSelectedIndex(prev =>
      clamp(prev, 0, Math.max(0, installedRows.length - 1)),
    )
  }, [installedRows.length])

  useEffect(() => {
    setMarketplaceSelectedIndex(prev =>
      clamp(prev, 0, Math.max(0, marketplaces.length - 1)),
    )
  }, [marketplaces.length])

  const installSelected = useCallback(
    async (specsOverride?: string[]) => {
      const specs = specsOverride ?? Array.from(selectedPluginSpecs)
      if (specs.length === 0) return

      setStatus(`Installing ${specs.length} plugin(s)…`)

      for (const spec of specs) {
        setInstallingSpecs(prev => new Set([...prev, spec]))
        try {
          installSkillPlugin(spec, { scope: 'user' })
        } catch (error) {
          setErrors(prev => [
            ...prev,
            {
              scope: 'install',
              message: `Failed to install ${spec}`,
              detail: stringifyError(error),
            },
          ])
        } finally {
          setInstallingSpecs(prev => {
            const next = new Set(prev)
            next.delete(spec)
            return next
          })
        }
      }

      try {
        const runtimeErrors = await refreshPluginRuntimeFromInstalls()
        if (runtimeErrors.length > 0) {
          setErrors(prev => [
            ...prev,
            ...runtimeErrors.map(message => ({
              scope: 'runtime' as const,
              message,
            })),
          ])
        }
        await reloadCustomCommandsForSession()
      } catch (error) {
        setErrors(prev => [
          ...prev,
          {
            scope: 'runtime',
            message: 'Failed to refresh plugin runtime',
            detail: stringifyError(error),
          },
        ])
      }

      setSelectedPluginSpecs(new Set())
      setStatus('Install complete')
      void refreshData()
    },
    [refreshData, selectedPluginSpecs],
  )

  const toggleSelected = useCallback((spec: string) => {
    setSelectedPluginSpecs(prev => {
      const next = new Set(prev)
      if (next.has(spec)) next.delete(spec)
      else next.add(spec)
      return next
    })
  }, [])

  const renderTabs = (): React.ReactNode => {
    const showTabHint = !layout.tightLayout
    return (
      <Box flexDirection="row" gap={1} flexWrap="nowrap">
        {TAB_ORDER.map(tab => {
          const isActive = tab === activeTab
          return (
            <Text
              key={tab}
              inverse={isActive}
              bold={isActive}
              color={isActive ? theme.text : theme.secondaryText}
              wrap="truncate-end"
            >
              {' '}
              {TAB_LABELS[tab]}{' '}
            </Text>
          )
        })}
        {showTabHint ? (
          <Text dimColor wrap="truncate-end">
            (tab to cycle)
          </Text>
        ) : null}
      </Box>
    )
  }

  const renderDiscover = (): React.ReactNode => {
    if (discoverReason) {
      return (
        <Box flexDirection="column" gap={layout.gap}>
          <Text bold>Discover plugins</Text>
          <Text dimColor>
            {discoverReason === 'all-plugins-installed'
              ? 'All available plugins are already installed.'
              : discoverReason === 'all-marketplaces-failed'
                ? 'Failed to load marketplace data.'
                : 'No plugins available.'}
          </Text>
          <Text dimColor>
            {discoverReason === 'all-plugins-installed'
              ? 'Check for new plugins later or add more marketplaces.'
              : discoverReason === 'all-marketplaces-failed'
                ? 'Check your network connection.'
                : 'Add a marketplace first using the Marketplaces tab.'}
          </Text>
          <Text dimColor italic>
            Esc to go back
          </Text>
        </Box>
      )
    }

    const reservedLines =
      (layout.tightLayout ? 10 : layout.compactLayout ? 12 : 14) +
      layout.paddingY * 2 +
      layout.gap * 3
    const maxVisible = Math.max(3, layout.rows - reservedLines - 1)

    const clampedSelection = clamp(
      discoverSelectedIndex,
      0,
      Math.max(0, discoverFiltered.length - 1),
    )

    const window = getWindowedList({
      itemCount: discoverFiltered.length,
      focusIndex: clampedSelection,
      maxVisible,
      indicatorRows: 2,
    })
    const visible = discoverFiltered.slice(window.start, window.end)

    const topIndicator = window.showUpIndicator
      ? `${figures.arrowUp} more above`
      : ' '
    const bottomIndicator = window.showDownIndicator
      ? `${figures.arrowDown} more below`
      : ' '

    return (
      <Box flexDirection="column" gap={layout.gap}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold wrap="truncate-end">
            Discover plugins
          </Text>
          {discoverFiltered.length > 0 ? (
            <Text dimColor wrap="truncate-end">
              {clampedSelection + 1}/{discoverFiltered.length}
            </Text>
          ) : null}
        </Box>

        <SearchBox
          query={discoverQuery}
          isFocused={discoverSearchFocused}
          isTerminalFocused={true}
        />

        {discoverFiltered.length === 0 && discoverQuery.trim() ? (
          <Text dimColor wrap="truncate-end">
            No plugins match "{discoverQuery.trim()}"
          </Text>
        ) : null}

        <Box flexDirection="column" width="100%">
          <Text dimColor wrap="truncate-end">
            {topIndicator}
          </Text>
          {visible.map((plugin, idx) => {
            const absoluteIndex = window.start + idx
            const isSelected = absoluteIndex === clampedSelection
            const isChecked = selectedPluginSpecs.has(plugin.pluginSpec)
            const isInstalling = installingSpecs.has(plugin.pluginSpec)

            const name = String(plugin.entry?.name ?? '')
            const marketplace = plugin.marketplaceName
            const description = String(plugin.entry?.description ?? '').trim()
            const communityManaged = Array.isArray((plugin.entry as any)?.tags)
              ? ((plugin.entry as any).tags as unknown[]).includes(
                  'community-managed',
                )
              : false

            const main = [
              name,
              `· ${marketplace}`,
              communityManaged ? '[Community Managed]' : null,
              description ? `— ${description}` : null,
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <Box key={plugin.pluginSpec} flexDirection="row" gap={1}>
                <Text
                  color={
                    isSelected && !discoverSearchFocused
                      ? theme.kode
                      : theme.secondaryText
                  }
                >
                  {isSelected && !discoverSearchFocused ? figures.pointer : ' '}
                </Text>
                <Text dimColor>
                  {isInstalling ? figures.ellipsis : isChecked ? '●' : '○'}
                </Text>
                <Text
                  bold={isSelected && !discoverSearchFocused}
                  color={
                    isSelected && !discoverSearchFocused
                      ? theme.text
                      : theme.secondaryText
                  }
                  wrap="truncate-end"
                >
                  {main}
                </Text>
              </Box>
            )
          })}
          <Text dimColor wrap="truncate-end">
            {bottomIndicator}
          </Text>
        </Box>

        {status ? (
          <Text dimColor wrap="truncate-end">
            {status}
          </Text>
        ) : null}

        <Box marginTop={layout.tightLayout ? 0 : 1}>
          <Text dimColor italic wrap="truncate-end">
            {selectedPluginSpecs.size > 0 ? (
              <>
                <Text bold color={theme.suggestion}>
                  i to install
                </Text>{' '}
              </>
            ) : null}
            type to search · Space toggle · Enter details · Esc back
          </Text>
        </Box>
      </Box>
    )
  }

  const renderInstalled = (): React.ReactNode => {
    if (installedRows.length === 0) {
      return (
        <Box flexDirection="column" gap={layout.gap}>
          <Text bold>Installed plugins</Text>
          <Text dimColor>(none)</Text>
        </Box>
      )
    }

    const reservedLines =
      (layout.tightLayout ? 8 : layout.compactLayout ? 10 : 12) +
      layout.paddingY * 2 +
      layout.gap * 3
    const maxVisible = Math.max(3, layout.rows - reservedLines - 1)
    const clampedSelection = clamp(
      installedSelectedIndex,
      0,
      Math.max(0, installedRows.length - 1),
    )
    const window = getWindowedList({
      itemCount: installedRows.length,
      focusIndex: clampedSelection,
      maxVisible,
      indicatorRows: 2,
    })
    const visible = installedRows.slice(window.start, window.end)

    return (
      <Box flexDirection="column" gap={layout.gap}>
        <Text bold>Installed plugins</Text>
        <Box flexDirection="column" width="100%">
          <Text dimColor wrap="truncate-end">
            {window.showUpIndicator ? `${figures.arrowUp} More` : ' '}
          </Text>
          {visible.map((row, idx) => {
            const absoluteIndex = window.start + idx
            const isSelected = absoluteIndex === clampedSelection
            const enabled = row.plugin.isEnabled !== false
            const badge = enabled ? 'enabled' : 'disabled'
            return (
              <Box key={row.pluginSpec} flexDirection="row" gap={1}>
                <Text color={isSelected ? theme.kode : theme.secondaryText}>
                  {isSelected ? figures.pointer : ' '}
                </Text>
                <Text dimColor>{enabled ? '●' : '○'}</Text>
                <Text
                  bold={isSelected}
                  color={isSelected ? theme.text : theme.secondaryText}
                  wrap="truncate-end"
                >
                  {row.pluginSpec}{' '}
                  <Text dimColor>
                    · {badge} · scope={row.plugin.scope}
                    {row.plugin.kind === 'plugin-pack' ? ' · pack' : ''}
                  </Text>
                </Text>
              </Box>
            )
          })}
          <Text dimColor wrap="truncate-end">
            {window.showDownIndicator ? `${figures.arrowDown} More` : ' '}
          </Text>
        </Box>

        <Text dimColor italic wrap="truncate-end">
          ↑/↓ select · Enter toggle enable · Backspace uninstall · Esc back
        </Text>
      </Box>
    )
  }

  const renderMarketplacesTab = (): React.ReactNode => {
    if (marketplaces.length === 0) {
      return (
        <Box flexDirection="column" gap={layout.gap}>
          <Text bold>Marketplaces</Text>
          <Text dimColor>No marketplaces configured</Text>
          <Text dimColor italic>
            Press a to add · Esc back
          </Text>
        </Box>
      )
    }

    const reservedLines =
      (layout.tightLayout ? 8 : layout.compactLayout ? 10 : 12) +
      layout.paddingY * 2 +
      layout.gap * 3
    const maxVisible = Math.max(3, layout.rows - reservedLines - 1)
    const clampedSelection = clamp(
      marketplaceSelectedIndex,
      0,
      Math.max(0, marketplaces.length - 1),
    )
    const window = getWindowedList({
      itemCount: marketplaces.length,
      focusIndex: clampedSelection,
      maxVisible,
      indicatorRows: 2,
    })
    const visible = marketplaces.slice(window.start, window.end)

    return (
      <Box flexDirection="column" gap={layout.gap}>
        <Text bold>Marketplaces</Text>

        <Box flexDirection="column" width="100%">
          <Text dimColor wrap="truncate-end">
            {window.showUpIndicator ? `${figures.arrowUp} More` : ' '}
          </Text>
          {visible.map((row, idx) => {
            const absoluteIndex = window.start + idx
            const isSelected = absoluteIndex === clampedSelection
            return (
              <Box key={row.name} flexDirection="row" gap={1}>
                <Text color={isSelected ? theme.kode : theme.secondaryText}>
                  {isSelected ? figures.pointer : ' '}
                </Text>
                <Text
                  bold={isSelected}
                  color={isSelected ? theme.text : theme.secondaryText}
                  wrap="truncate-end"
                >
                  {row.name}{' '}
                  <Text dimColor>
                    · {row.sourceLabel}
                    {row.lastUpdated ? ` · ${row.lastUpdated}` : ''}
                  </Text>
                </Text>
              </Box>
            )
          })}
          <Text dimColor wrap="truncate-end">
            {window.showDownIndicator ? `${figures.arrowDown} More` : ' '}
          </Text>
        </Box>

        <Text dimColor italic wrap="truncate-end">
          ↑/↓ select · a add · u update · U update all · r remove · Esc back
        </Text>
      </Box>
    )
  }

  const renderErrors = (): React.ReactNode => {
    if (errors.length === 0) {
      return (
        <Box flexDirection="column" gap={layout.gap}>
          <Text bold>Errors</Text>
          <Text dimColor>(none)</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={layout.gap}>
        <Text bold>Errors</Text>
        <Box flexDirection="column">
          {errors.slice(0, 20).map((err, idx) => {
            const prefix =
              err.scope === 'install'
                ? 'install'
                : err.scope === 'runtime'
                  ? 'runtime'
                  : 'marketplace'
            return (
              <Box key={`${idx}:${err.message}`} flexDirection="column">
                <Text color={theme.error} wrap="truncate-end">
                  {figures.cross} {prefix}: {err.message}
                </Text>
                {err.detail ? (
                  <Text dimColor wrap="truncate-end">
                    {err.detail}
                  </Text>
                ) : null}
              </Box>
            )
          })}
        </Box>
      </Box>
    )
  }

  const cycleTab = useCallback(
    (delta: number) => {
      setActiveTab(prev => {
        const currentIndex = TAB_ORDER.indexOf(prev)
        const nextIndex =
          currentIndex === -1
            ? 0
            : (currentIndex + TAB_ORDER.length + delta) % TAB_ORDER.length
        return TAB_ORDER[nextIndex]!
      })
    },
    [setActiveTab],
  )

  const didCloseRef = useRef(false)
  const safeClose = useCallback(() => {
    if (didCloseRef.current) return
    didCloseRef.current = true
    onDone()
  }, [onDone])

  useKeypress((input, key) => {
    if (exitState.pending) return true

    const inputChar = input.length === 1 ? input : ''

    if (view.type === 'addMarketplace') {
      if (key.escape) {
        setView({ type: 'tabs' })
        setAddMarketplaceInput('')
        return true
      }
      if (key.return) {
        const src = addMarketplaceInput.trim()
        if (!src) {
          setStatus('Marketplace source is required')
          return true
        }
        setStatus('Adding marketplace…')
        try {
          void Promise.resolve(addMarketplace(src))
            .then(() => {
              setStatus('Marketplace added')
              setView({ type: 'tabs' })
              setAddMarketplaceInput('')
              return refreshData()
            })
            .catch(error => {
              setErrors(prev => [
                ...prev,
                {
                  scope: 'marketplace',
                  message: `Failed to add marketplace`,
                  detail: stringifyError(error),
                },
              ])
              setStatus('Failed to add marketplace')
            })
        } catch (error) {
          setErrors(prev => [
            ...prev,
            {
              scope: 'marketplace',
              message: `Failed to add marketplace`,
              detail: stringifyError(error),
            },
          ])
          setStatus('Failed to add marketplace')
        }
        return true
      }
      if (key.backspace || key.delete) {
        setAddMarketplaceInput(prev => prev.slice(0, -1))
        return true
      }
      if (input && !key.ctrl && !key.meta) {
        setAddMarketplaceInput(prev => prev + input)
        return true
      }
      return true
    }

    if (view.type === 'pluginDetails') {
      if (key.escape) {
        setView({ type: 'tabs' })
        return true
      }
      if (inputChar === 'i') {
        void installSelected([view.plugin.pluginSpec])
        setView({ type: 'tabs' })
        return true
      }
      return true
    }

    // Global tab cycling
    if (key.tab) {
      cycleTab(key.shift ? -1 : 1)
      return true
    }
    if (key.leftArrow) {
      cycleTab(-1)
      return true
    }
    if (key.rightArrow) {
      cycleTab(1)
      return true
    }

    if (activeTab === 'discover') {
      if (key.return && !discoverSearchFocused) {
        const plugin = discoverFiltered[discoverSelectedIndex]
        if (plugin) setView({ type: 'pluginDetails', plugin })
        return true
      }

      if (inputChar === 'i' && selectedPluginSpecs.size > 0) {
        void installSelected()
        return true
      }

      if (discoverSearchFocused) {
        if (key.downArrow || key.return) {
          setDiscoverSearchFocused(false)
          setDiscoverSelectedIndex(0)
          return true
        }
        if (key.backspace || key.delete) {
          if (discoverQuery.length === 0) {
            setDiscoverSearchFocused(false)
          } else {
            setDiscoverQuery(prev => prev.slice(0, -1))
          }
          return true
        }
        if (key.escape) {
          if (discoverQuery.length > 0) setDiscoverQuery('')
          else setDiscoverSearchFocused(false)
          return true
        }
        if (input && !key.ctrl && !key.meta) {
          setDiscoverQuery(prev => prev + input)
          return true
        }
        return true
      }

      if (key.upArrow || inputChar === 'k') {
        if (discoverSelectedIndex === 0) {
          setDiscoverSearchFocused(true)
        } else {
          setDiscoverSelectedIndex(prev => Math.max(0, prev - 1))
        }
        return true
      }
      if (key.downArrow || inputChar === 'j') {
        setDiscoverSelectedIndex(prev =>
          Math.min(Math.max(0, discoverFiltered.length - 1), prev + 1),
        )
        return true
      }
      if (key.pageUp) {
        setDiscoverSelectedIndex(prev =>
          Math.max(0, prev - Math.max(1, Math.floor(layout.rows / 3))),
        )
        return true
      }
      if (key.pageDown) {
        setDiscoverSelectedIndex(prev =>
          Math.min(
            Math.max(0, discoverFiltered.length - 1),
            prev + Math.max(1, Math.floor(layout.rows / 3)),
          ),
        )
        return true
      }
      if (inputChar === '/') {
        setDiscoverSearchFocused(true)
        setDiscoverQuery('')
        return true
      }
      if (input && !key.ctrl && !key.meta && !/^[\\s]+$/.test(input)) {
        setDiscoverSearchFocused(true)
        setDiscoverQuery(input)
        return true
      }
      if (inputChar === ' ') {
        const plugin = discoverFiltered[discoverSelectedIndex]
        if (plugin) toggleSelected(plugin.pluginSpec)
        return true
      }
      if (key.escape) {
        safeClose()
        return true
      }
      return false
    }

    if (activeTab === 'installed') {
      if (installedRows.length === 0) return false

      if (key.upArrow || inputChar === 'k') {
        setInstalledSelectedIndex(prev => Math.max(0, prev - 1))
        return true
      }
      if (key.downArrow || inputChar === 'j') {
        setInstalledSelectedIndex(prev =>
          Math.min(Math.max(0, installedRows.length - 1), prev + 1),
        )
        return true
      }

      if (key.return) {
        const row = installedRows[installedSelectedIndex]
        if (!row) return true
        const enabled = row.plugin.isEnabled !== false
        try {
          if (enabled)
            disableSkillPlugin(row.pluginSpec, { scope: row.plugin.scope })
          else enableSkillPlugin(row.pluginSpec, { scope: row.plugin.scope })
          void refreshPluginRuntimeFromInstalls().then(() =>
            reloadCustomCommandsForSession(),
          )
          refreshInstalled()
          setStatus(enabled ? 'Disabled plugin' : 'Enabled plugin')
        } catch (error) {
          setErrors(prev => [
            ...prev,
            {
              scope: 'runtime',
              message: `Failed to toggle ${row.pluginSpec}`,
              detail: stringifyError(error),
            },
          ])
        }
        return true
      }

      if (key.backspace || key.delete) {
        const row = installedRows[installedSelectedIndex]
        if (!row) return true
        try {
          uninstallSkillPlugin(row.pluginSpec, { scope: row.plugin.scope })
          void refreshPluginRuntimeFromInstalls().then(() =>
            reloadCustomCommandsForSession(),
          )
          setStatus('Uninstalled plugin')
          void refreshData()
        } catch (error) {
          setErrors(prev => [
            ...prev,
            {
              scope: 'runtime',
              message: `Failed to uninstall ${row.pluginSpec}`,
              detail: stringifyError(error),
            },
          ])
        }
        return true
      }

      return false
    }

    if (activeTab === 'marketplaces') {
      if (inputChar === 'U') {
        setStatus('Updating marketplaces…')
        void refreshAllMarketplacesAsync(message => setStatus(message))
          .then(result => {
            if (result.failed.length > 0) {
              setErrors(prev => [
                ...prev,
                ...result.failed.map(f => ({
                  scope: 'marketplace' as const,
                  message: `Failed to update marketplace ${f.name}`,
                  detail: f.error,
                })),
              ])
            }
            setStatus(`Updated ${result.refreshed.length} marketplace(s)`)
            return refreshData()
          })
          .catch(error => {
            setErrors(prev => [
              ...prev,
              {
                scope: 'marketplace',
                message: 'Failed to update marketplaces',
                detail: stringifyError(error),
              },
            ])
            setStatus('Failed to update marketplaces')
          })
        return true
      }

      const inputLower = inputChar.toLowerCase()

      if (inputLower === 'a') {
        setView({ type: 'addMarketplace' })
        setStatus(null)
        return true
      }

      if (marketplaces.length === 0) return false

      if (key.upArrow || inputChar === 'k') {
        setMarketplaceSelectedIndex(prev => Math.max(0, prev - 1))
        return true
      }
      if (key.downArrow || inputChar === 'j') {
        setMarketplaceSelectedIndex(prev =>
          Math.min(Math.max(0, marketplaces.length - 1), prev + 1),
        )
        return true
      }

      if (inputLower === 'u') {
        const selected = marketplaces[marketplaceSelectedIndex]
        if (!selected) return true
        setStatus(`Updating marketplace: ${selected.name}…`)
        void refreshMarketplaceAsync(selected.name)
          .then(() => {
            setStatus(`Updated marketplace: ${selected.name}`)
            return refreshData()
          })
          .catch(error => {
            setErrors(prev => [
              ...prev,
              {
                scope: 'marketplace',
                message: `Failed to update marketplace ${selected.name}`,
                detail: stringifyError(error),
              },
            ])
            setStatus(`Failed to update marketplace: ${selected.name}`)
          })
        return true
      }

      if (inputLower === 'r') {
        const selected = marketplaces[marketplaceSelectedIndex]
        if (!selected) return true
        try {
          removeMarketplace(selected.name)
          setStatus(`Removed marketplace: ${selected.name}`)
          void refreshData()
        } catch (error) {
          setErrors(prev => [
            ...prev,
            {
              scope: 'marketplace',
              message: `Failed to remove marketplace ${selected.name}`,
              detail: stringifyError(error),
            },
          ])
        }
        return true
      }

      return false
    }

    if (key.escape) {
      safeClose()
      return true
    }

    return false
  })

  if (isLoading) {
    return (
      <ScreenFrame
        title="Plugins"
        exitState={exitState}
        paddingX={layout.paddingX}
        paddingY={layout.paddingY}
        gap={layout.gap}
      >
        <Box flexDirection="column" gap={layout.gap}>
          {renderTabs()}
          <Text dimColor>Loading…</Text>
        </Box>
      </ScreenFrame>
    )
  }

  if (view.type === 'pluginDetails') {
    const plugin = view.plugin
    const name = String(plugin.entry?.name ?? '')
    const description = String(plugin.entry?.description ?? '').trim()
    const tags = Array.isArray((plugin.entry as any)?.tags)
      ? ((plugin.entry as any).tags as unknown[])
          .filter(t => typeof t === 'string')
          .join(', ')
      : ''
    const skills = Array.isArray((plugin.entry as any)?.skills)
      ? ((plugin.entry as any).skills as unknown[]).length
      : 0
    const commands = Array.isArray((plugin.entry as any)?.commands)
      ? ((plugin.entry as any).commands as unknown[]).length
      : 0

    return (
      <ScreenFrame
        title="Plugin Details"
        exitState={exitState}
        paddingX={layout.paddingX}
        paddingY={layout.paddingY}
        gap={layout.gap}
      >
        <Box flexDirection="column" gap={layout.gap}>
          <Text bold wrap="truncate-end">
            {name} <Text dimColor>· {plugin.marketplaceName}</Text>
          </Text>
          {description ? <Text dimColor>{description}</Text> : null}
          {tags ? <Text dimColor>Tags: {tags}</Text> : null}
          <Text dimColor>
            Includes: {skills} skills · {commands} commands
          </Text>
          <Text dimColor italic>
            i install · Esc back
          </Text>
        </Box>
      </ScreenFrame>
    )
  }

  if (view.type === 'addMarketplace') {
    return (
      <ScreenFrame
        title="Add Marketplace"
        exitState={exitState}
        paddingX={layout.paddingX}
        paddingY={layout.paddingY}
        gap={layout.gap}
      >
        <Box flexDirection="column" gap={layout.gap}>
          <Text dimColor wrap="truncate-end">
            Enter a marketplace source (GitHub repo, git URL, local path, or
            URL)
          </Text>
          <Box flexDirection="column">
            <SearchBox
              query={addMarketplaceInput}
              isFocused={true}
              isTerminalFocused={true}
              prefix="+"
              placeholder="owner/repo or ./path"
            />
          </Box>
          {status ? (
            <Text dimColor wrap="truncate-end">
              {status}
            </Text>
          ) : null}
          <Text dimColor italic wrap="truncate-end">
            Enter add · Esc cancel
          </Text>
        </Box>
      </ScreenFrame>
    )
  }

  return (
    <ScreenFrame
      title="Plugins"
      exitState={exitState}
      paddingX={layout.paddingX}
      paddingY={layout.paddingY}
      gap={layout.gap}
    >
      <Box flexDirection="column" gap={layout.gap}>
        {renderTabs()}
        {activeTab === 'discover'
          ? renderDiscover()
          : activeTab === 'installed'
            ? renderInstalled()
            : activeTab === 'marketplaces'
              ? renderMarketplacesTab()
              : renderErrors()}
      </Box>
    </ScreenFrame>
  )
}
