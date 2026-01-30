import React, { useMemo, useState } from 'react'
import { Box, Text } from 'ink'
import figures from 'figures'

import type { ToolUseContext } from '#core/tooling/Tool'
import { getBunShellSandboxPlan } from '#core/sandbox/bunShellSandboxPlan'
import { getTheme } from '#core/utils/theme'
import { getCwd } from '#core/utils/state'
import {
  getSettingsFileCandidates,
  loadSettingsWithLegacyFallback,
  saveSettingsToPrimaryAndSyncLegacy,
  type SettingsDestination,
  type SettingsFile,
} from '#config'
import { useExitOnCtrlCD } from '#ui-ink/hooks/useExitOnCtrlCD'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { SearchBox } from '#ui-ink/components/SearchBox'
import { ScreenFrame } from '#ui-ink/primitives/layout/ScreenFrame'
import { useScreenLayout } from '#ui-ink/primitives/layout/useScreenLayout'
import { getWindowedList } from '#ui-ink/primitives/list/windowedList'

type Props = {
  context: ToolUseContext
  onDone: (result?: string) => void
}

type Item =
  | { kind: 'toggle'; id: 'enabled' | 'autoAllow' | 'fallback' }
  | { kind: 'nav'; id: 'excluded' }
  | { kind: 'nav'; id: 'destination' }

type Mode = { kind: 'main' } | { kind: 'excluded' } | { kind: 'excludedAdd' }

const DESTINATIONS: SettingsDestination[] = [
  'localSettings',
  'projectSettings',
  'userSettings',
]

function destinationLabel(dest: SettingsDestination): string {
  switch (dest) {
    case 'localSettings':
      return 'local (.kode/settings.local.json)'
    case 'projectSettings':
      return 'project (.kode/settings.json)'
    case 'userSettings':
      return 'user (~/.kode/settings.json)'
  }
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((v): v is string => typeof v === 'string')
    .map(v => v.trim())
    .filter(Boolean)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getSandboxSettingsFromFile(settings: SettingsFile | null): {
  enabled: boolean
  autoAllowBashIfSandboxed: boolean
  allowUnsandboxedCommands: boolean
  excludedCommands: string[]
} {
  const sandbox = isRecord(settings?.sandbox) ? settings!.sandbox : {}
  const enabled = sandbox.enabled === true
  const autoAllowBashIfSandboxed =
    typeof sandbox.autoAllowBashIfSandboxed === 'boolean'
      ? sandbox.autoAllowBashIfSandboxed
      : true
  const allowUnsandboxedCommands =
    typeof sandbox.allowUnsandboxedCommands === 'boolean'
      ? sandbox.allowUnsandboxedCommands
      : true
  const excludedCommands = normalizeStringArray(sandbox.excludedCommands)
  return {
    enabled,
    autoAllowBashIfSandboxed,
    allowUnsandboxedCommands,
    excludedCommands,
  }
}

function persistSandboxSettings(args: {
  destination: SettingsDestination
  projectDir: string
  settings: SettingsFile
}): void {
  saveSettingsToPrimaryAndSyncLegacy({
    destination: args.destination,
    projectDir: args.projectDir,
    settings: args.settings,
  })
}

function buildNextSettings(args: {
  base: SettingsFile | null
  patch: (sandbox: Record<string, unknown>) => Record<string, unknown>
}): SettingsFile {
  const base = (args.base ?? {}) as Record<string, unknown>
  const currentSandbox = isRecord(base.sandbox)
    ? (base.sandbox as Record<string, unknown>)
    : {}
  return {
    ...base,
    sandbox: args.patch(currentSandbox),
  }
}

export function SandboxScreen({ context, onDone }: Props): React.ReactNode {
  const theme = getTheme()
  const layout = useScreenLayout()
  const exitState = useExitOnCtrlCD(() => onDone('Sandbox dialog dismissed'))
  const projectDir = getCwd()

  const [destinationIndex, setDestinationIndex] = useState(0)
  const destination = DESTINATIONS[destinationIndex] ?? 'localSettings'

  const [mode, setMode] = useState<Mode>({ kind: 'main' })
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [excludedSelectedIndex, setExcludedSelectedIndex] = useState(0)
  const [draftExcluded, setDraftExcluded] = useState('')

  const loaded = useMemo(
    () =>
      loadSettingsWithLegacyFallback({
        destination,
        projectDir,
        migrateToPrimary: true,
      }),
    [destination, projectDir],
  )
  const settingsFile = loaded.settings
  const sandboxSettings = getSandboxSettingsFromFile(settingsFile)

  const effectivePlan = useMemo(
    () =>
      getBunShellSandboxPlan({
        command: 'echo sandbox screen',
        toolUseContext: context,
      }),
    [context],
  )

  const candidates = useMemo(
    () => getSettingsFileCandidates({ destination, projectDir }),
    [destination, projectDir],
  )
  const editingPath = candidates?.primary ?? '(unknown settings path)'

  const items: Item[] = useMemo(
    () => [
      { kind: 'toggle', id: 'enabled' },
      { kind: 'toggle', id: 'autoAllow' },
      { kind: 'toggle', id: 'fallback' },
      { kind: 'nav', id: 'excluded' },
      { kind: 'nav', id: 'destination' },
    ],
    [],
  )

  const reservedLines =
    (layout.tightLayout ? 9 : layout.compactLayout ? 11 : 13) +
    layout.paddingY * 2
  const maxVisible = Math.max(3, layout.rows - reservedLines)

  const visibleItems = items
  const window = useMemo(
    () =>
      getWindowedList({
        itemCount: visibleItems.length,
        focusIndex: selectedIndex,
        maxVisible,
        indicatorRows: 2,
      }),
    [maxVisible, selectedIndex, visibleItems.length],
  )

  const clampedSelectedIndex = Math.max(
    0,
    Math.min(selectedIndex, Math.max(0, visibleItems.length - 1)),
  )
  const selectedItem = visibleItems[clampedSelectedIndex] ?? null

  const persistToggle = (
    toggle: 'enabled' | 'autoAllowBashIfSandboxed' | 'allowUnsandboxedCommands',
  ) => {
    const next = buildNextSettings({
      base: settingsFile,
      patch: sandbox => ({
        ...sandbox,
        [toggle]:
          toggle === 'enabled'
            ? !sandboxSettings.enabled
            : toggle === 'autoAllowBashIfSandboxed'
              ? !sandboxSettings.autoAllowBashIfSandboxed
              : !sandboxSettings.allowUnsandboxedCommands,
      }),
    })

    persistSandboxSettings({ destination, projectDir, settings: next })
  }

  const persistExcludedList = (nextExcluded: string[]) => {
    const next = buildNextSettings({
      base: settingsFile,
      patch: sandbox => ({ ...sandbox, excludedCommands: nextExcluded }),
    })
    persistSandboxSettings({ destination, projectDir, settings: next })
  }

  const renderRow = (item: Item): { label: string; value?: string } => {
    switch (item.kind) {
      case 'toggle': {
        if (item.id === 'enabled') {
          return {
            label: 'Enable sandbox',
            value: sandboxSettings.enabled ? 'on' : 'off',
          }
        }
        if (item.id === 'autoAllow') {
          return {
            label: 'Auto-allow sandboxed Bash',
            value: sandboxSettings.autoAllowBashIfSandboxed ? 'on' : 'off',
          }
        }
        return {
          label: 'Allow fallback when sandbox unavailable',
          value: sandboxSettings.allowUnsandboxedCommands ? 'on' : 'off',
        }
      }
      case 'nav': {
        if (item.id === 'excluded') {
          return {
            label: `Excluded commands (${sandboxSettings.excludedCommands.length})`,
            value: 'edit…',
          }
        }
        return {
          label: 'Edit destination',
          value: destinationLabel(destination),
        }
      }
    }
  }

  const cycleDestination = () => {
    setDestinationIndex(idx => (idx + 1) % DESTINATIONS.length)
    setSelectedIndex(0)
    setMode({ kind: 'main' })
  }

  useKeypress(async (input, key) => {
    if (key.ctrl && key.name === 'c') return

    if (mode.kind === 'excludedAdd') {
      if (key.escape) {
        setMode({ kind: 'excluded' })
        setDraftExcluded('')
        return
      }
      if (key.return) {
        const pattern = draftExcluded.trim()
        if (pattern) {
          if (!sandboxSettings.excludedCommands.includes(pattern)) {
            persistExcludedList([...sandboxSettings.excludedCommands, pattern])
          }
        }
        setDraftExcluded('')
        setMode({ kind: 'excluded' })
        return
      }
      if (key.backspace || key.delete) {
        setDraftExcluded(value => value.slice(0, -1))
        return
      }
      if (key.insertable && input) {
        setDraftExcluded(value => value + input)
        return
      }
      return
    }

    if (mode.kind === 'excluded') {
      const entries = sandboxSettings.excludedCommands
      const total = entries.length + 2 // Add + Back
      if (key.upArrow) {
        setExcludedSelectedIndex(i => Math.max(0, i - 1))
        return
      }
      if (key.downArrow) {
        setExcludedSelectedIndex(i => Math.min(total - 1, i + 1))
        return
      }
      if (key.escape) {
        setMode({ kind: 'main' })
        setExcludedSelectedIndex(0)
        return
      }
      if (key.return) {
        if (excludedSelectedIndex === 0) {
          setMode({ kind: 'excludedAdd' })
          setDraftExcluded('')
          return
        }
        if (excludedSelectedIndex === total - 1) {
          setMode({ kind: 'main' })
          setExcludedSelectedIndex(0)
          return
        }
        const idx = excludedSelectedIndex - 1
        const target = entries[idx]
        if (!target) return
        persistExcludedList(entries.filter((_, i) => i !== idx))
        setExcludedSelectedIndex(i => Math.max(0, Math.min(i, total - 2)))
      }
      return
    }

    if (mode.kind === 'main') {
      if (key.escape) {
        onDone('Sandbox dialog dismissed')
        return
      }

      if (key.tab) {
        cycleDestination()
        return
      }

      if (key.upArrow) {
        setSelectedIndex(i => Math.max(0, i - 1))
        return
      }
      if (key.downArrow) {
        setSelectedIndex(i => Math.min(visibleItems.length - 1, i + 1))
        return
      }

      if (key.return && selectedItem) {
        if (selectedItem.kind === 'toggle') {
          if (selectedItem.id === 'enabled') persistToggle('enabled')
          else if (selectedItem.id === 'autoAllow')
            persistToggle('autoAllowBashIfSandboxed')
          else persistToggle('allowUnsandboxedCommands')
          return
        }

        if (selectedItem.kind === 'nav') {
          if (selectedItem.id === 'excluded') {
            setMode({ kind: 'excluded' })
            setExcludedSelectedIndex(0)
            return
          }
          if (selectedItem.id === 'destination') {
            cycleDestination()
            return
          }
        }
      }
    }
  })

  const titleSuffix = effectivePlan.settings.enabled
    ? effectivePlan.sandboxAvailable
      ? 'enabled'
      : 'enabled (unavailable)'
    : 'disabled'

  return (
    <ScreenFrame
      title={`Sandbox · ${titleSuffix}`}
      exitState={exitState}
      paddingX={layout.paddingX}
      paddingY={layout.paddingY}
      gap={layout.gap}
    >
      <Box flexDirection="column" gap={1}>
        <Text dimColor wrap="truncate-end">
          {`Editing: ${destinationLabel(destination)} · ${editingPath}`}
        </Text>
        <Text dimColor wrap="truncate-end">
          {`Platform: ${process.platform} · Runtime: ${
            effectivePlan.sandboxAvailable
              ? 'available'
              : 'missing dependencies'
          } · Tab: cycle destination`}
        </Text>
      </Box>

      {mode.kind === 'excludedAdd' ? (
        <Box flexDirection="column" gap={1}>
          <Text bold>Add excluded command pattern</Text>
          <SearchBox
            query={draftExcluded}
            placeholder="e.g. npm run test:*"
            isFocused
          />
          <Text dimColor>{`Enter to add · Esc to cancel`}</Text>
        </Box>
      ) : mode.kind === 'excluded' ? (
        <Box flexDirection="column" gap={1}>
          <Text bold>Excluded commands</Text>
          <Text dimColor>
            {`Enter: remove · Esc: back · Tab: cycle destination`}
          </Text>
          <Box flexDirection="column">
            {[
              { kind: 'action', label: 'Add pattern…' },
              ...sandboxSettings.excludedCommands.map(v => ({
                kind: 'pattern' as const,
                label: v,
              })),
              { kind: 'action', label: 'Back' },
            ].map((row, idx) => {
              const selected = idx === excludedSelectedIndex
              const indicator = selected ? figures.pointer : ' '
              return (
                <Text
                  key={`${row.kind}-${idx}`}
                  color={selected ? theme.suggestion : undefined}
                >
                  {indicator} {row.label}
                </Text>
              )
            })}
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column" gap={1}>
          <Text dimColor>
            {`↑↓ navigate · Enter toggle/open · Esc close · Tab cycle destination`}
          </Text>
          <Box flexDirection="column">
            {visibleItems.slice(window.start, window.end).map((item, idx) => {
              const absoluteIndex = window.start + idx
              const selected = absoluteIndex === clampedSelectedIndex
              const { label, value } = renderRow(item)
              const indicator = selected ? figures.pointer : ' '
              const valueText = value ? ` · ${value}` : ''
              return (
                <Text
                  key={`${item.kind}-${item.id}`}
                  color={selected ? theme.suggestion : undefined}
                  wrap="truncate-end"
                >
                  {indicator} {label}
                  <Text dimColor={!selected}>{valueText}</Text>
                </Text>
              )
            })}
            {window.showUpIndicator ? <Text dimColor>↑ more</Text> : null}
            {window.showDownIndicator ? <Text dimColor>↓ more</Text> : null}
          </Box>
        </Box>
      )}
    </ScreenFrame>
  )
}
