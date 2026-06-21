import React, { useMemo, useState } from 'react'
import { Box, Text } from 'ink'
import figures from 'figures'

import type { ToolUseContext } from '#core/tooling/Tool'
import type {
  ToolPermissionContext,
  ToolPermissionContextUpdate,
  ToolPermissionRuleBehavior,
  ToolPermissionUpdateDestination,
} from '#core/types/toolPermissionContext'
import {
  applyToolPermissionContextUpdate,
  isPersistableToolPermissionDestination,
} from '#core/types/toolPermissionContext'
import {
  loadToolPermissionContextFromDisk,
  persistToolPermissionUpdateToDisk,
} from '#core/permissions/toolPermissionSettings'
import { getTheme } from '#core/utils/theme'
import { getCwd } from '#core/utils/state'
import { useExitOnCtrlCD } from '#ui-ink/hooks/useExitOnCtrlCD'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { KEYPRESS_PRIORITY } from '#ui-ink/constants/keypressPriority'
import { SearchBox } from '#ui-ink/components/SearchBox'
import { ScreenFrame } from '#ui-ink/primitives/layout/ScreenFrame'
import { useScreenLayout } from '#ui-ink/primitives/layout/useScreenLayout'
import { getWindowedList } from '#ui-ink/primitives/list/windowedList'

type Props = {
  context: ToolUseContext
  onDone: (result?: string) => void
  initialView?: 'list' | 'addDir'
  initialDraftInput?: string
  initialDestination?: ToolPermissionUpdateDestination
}

type PermissionItem =
  | {
      kind: 'action'
      id: 'add-rule' | 'add-dir'
      label: string
    }
  | {
      kind: 'rule'
      behavior: ToolPermissionRuleBehavior
      destination: ToolPermissionUpdateDestination
      rule: string
    }
  | {
      kind: 'dir'
      destination: ToolPermissionUpdateDestination
      path: string
    }

type ScreenMode =
  | { kind: 'list' }
  | { kind: 'addRule'; step: 'behavior' | 'destination' | 'input' }
  | { kind: 'addDir'; step: 'destination' | 'input' }
  | { kind: 'confirmRemove'; target: PermissionItem }

const BEHAVIORS: ToolPermissionRuleBehavior[] = ['allow', 'deny', 'ask']
const DESTINATIONS: ToolPermissionUpdateDestination[] = [
  'localSettings',
  'projectSettings',
  'userSettings',
  'session',
]

function normalizeString(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function getContextOrDiskPermissionContext(args: {
  context: ToolUseContext
}): ToolPermissionContext {
  const ctx = args.context.options?.toolPermissionContext
  if (ctx) return ctx
  return loadToolPermissionContextFromDisk({
    projectDir: getCwd(),
    includeKodeProjectConfig: true,
    isBypassPermissionsModeAvailable: args.context.safeMode !== true,
  })
}

function flattenPermissionItems(
  toolPermissionContext: ToolPermissionContext,
): PermissionItem[] {
  const items: PermissionItem[] = [
    { kind: 'action', id: 'add-rule', label: 'Add rule…' },
    { kind: 'action', id: 'add-dir', label: 'Add directory…' },
  ]

  const pushRules = (behavior: ToolPermissionRuleBehavior) => {
    const map =
      behavior === 'allow'
        ? toolPermissionContext.alwaysAllowRules
        : behavior === 'deny'
          ? toolPermissionContext.alwaysDenyRules
          : toolPermissionContext.alwaysAskRules
    for (const [destination, rules] of Object.entries(map)) {
      if (!Array.isArray(rules)) continue
      for (const rule of rules) {
        if (typeof rule !== 'string' || !rule.trim()) continue
        items.push({
          kind: 'rule',
          behavior,
          destination: destination as ToolPermissionUpdateDestination,
          rule,
        })
      }
    }
  }

  pushRules('allow')
  pushRules('deny')
  pushRules('ask')

  for (const dir of toolPermissionContext.additionalWorkingDirectories.values()) {
    items.push({
      kind: 'dir',
      destination: dir.source,
      path: dir.path,
    })
  }

  return items
}

function matchesQuery(item: PermissionItem, query: string): boolean {
  const q = query.toLowerCase().trim()
  if (!q) return true
  if (item.kind === 'rule') return item.rule.toLowerCase().includes(q)
  if (item.kind === 'dir') return item.path.toLowerCase().includes(q)
  return item.label.toLowerCase().includes(q)
}

function labelForItem(item: PermissionItem): string {
  if (item.kind === 'action') return item.label
  if (item.kind === 'dir')
    return `dir: ${item.path} · ${item.destination || 'unknown'}`
  return `${item.behavior}: ${item.rule} · ${item.destination || 'unknown'}`
}

export function PermissionsScreen({
  context,
  onDone,
  initialView = 'list',
  initialDraftInput,
  initialDestination,
}: Props): React.ReactNode {
  const theme = getTheme()
  const layout = useScreenLayout()
  const exitState = useExitOnCtrlCD(() =>
    onDone('Permissions dialog dismissed'),
  )

  const [dirty, setDirty] = useState(false)
  const [mode, setMode] = useState<ScreenMode>(() => {
    if (initialView === 'addDir') {
      return {
        kind: 'addDir',
        step: initialDraftInput?.trim() ? 'input' : 'destination',
      }
    }
    return { kind: 'list' }
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchMode, setIsSearchMode] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [draftBehaviorIndex, setDraftBehaviorIndex] = useState(0)
  const [draftDestinationIndex, setDraftDestinationIndex] = useState(() => {
    if (!initialDestination) return 0
    const idx = DESTINATIONS.indexOf(initialDestination)
    return idx >= 0 ? idx : 0
  })
  const [draftInput, setDraftInput] = useState(initialDraftInput ?? '')

  const [toolPermissionContext, setToolPermissionContext] = useState(() =>
    getContextOrDiskPermissionContext({ context }),
  )

  const allItems = useMemo(
    () => flattenPermissionItems(toolPermissionContext),
    [toolPermissionContext],
  )
  const visibleItems = useMemo(() => {
    if (!searchQuery.trim()) return allItems
    return allItems.filter(item => matchesQuery(item, searchQuery))
  }, [allItems, searchQuery])

  const reservedLines =
    (layout.tightLayout ? 7 : layout.compactLayout ? 9 : 11) +
    layout.paddingY * 2 +
    layout.gap * 3
  const maxVisible = Math.max(3, layout.rows - reservedLines - 1)
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

  const applyUpdate = (update: ToolPermissionContextUpdate) => {
    const next = applyToolPermissionContextUpdate(toolPermissionContext, update)
    setToolPermissionContext(next)
    context.options ??= {}
    context.options.toolPermissionContext = next

    if (isPersistableToolPermissionDestination(update.destination)) {
      persistToolPermissionUpdateToDisk({ update, projectDir: getCwd() })
    }
    setDirty(true)
  }

  useKeypress(
    (input, key) => {
      const inputChar = input.length === 1 ? input : ''
      const isPlainChar = Boolean(inputChar) && !key.ctrl && !key.meta

      if (mode.kind === 'list' && isSearchMode) {
        if (key.escape) {
          if (searchQuery.length > 0) {
            setSearchQuery('')
          } else {
            setIsSearchMode(false)
          }
          setSelectedIndex(0)
          return true
        }

        if (key.return || key.downArrow) {
          setIsSearchMode(false)
          return true
        }

        if (key.backspace || key.delete) {
          if (searchQuery.length === 0) {
            setIsSearchMode(false)
            return true
          }
          setSearchQuery(prev => prev.slice(0, -1))
          setSelectedIndex(0)
          return true
        }

        if (isPlainChar) {
          setSearchQuery(prev => prev + inputChar)
          setSelectedIndex(0)
          return true
        }

        return true
      }

      if (mode.kind === 'confirmRemove') {
        if (inputChar === 'y' || key.return) {
          const target = mode.target
          if (target.kind === 'rule') {
            applyUpdate({
              type: 'removeRules',
              destination: target.destination,
              behavior: target.behavior,
              rules: [target.rule],
            })
          } else if (target.kind === 'dir') {
            applyUpdate({
              type: 'removeDirectories',
              destination: target.destination,
              directories: [target.path],
            })
          }
          setMode({ kind: 'list' })
          return true
        }
        if (inputChar === 'n' || key.escape) {
          setMode({ kind: 'list' })
          return true
        }
        return
      }

      if (mode.kind === 'addRule') {
        if (mode.step === 'behavior') {
          if (key.escape) {
            setMode({ kind: 'list' })
            return true
          }
          if (key.upArrow || inputChar === 'k') {
            setDraftBehaviorIndex(prev => Math.max(0, prev - 1))
            return true
          }
          if (key.downArrow || inputChar === 'j') {
            setDraftBehaviorIndex(prev =>
              Math.min(BEHAVIORS.length - 1, prev + 1),
            )
            return true
          }
          if (key.return) {
            setMode({ kind: 'addRule', step: 'destination' })
            return true
          }
          return
        }
        if (mode.step === 'destination') {
          if (key.escape) {
            setMode({ kind: 'list' })
            return true
          }
          if (key.upArrow || inputChar === 'k') {
            setDraftDestinationIndex(prev => Math.max(0, prev - 1))
            return true
          }
          if (key.downArrow || inputChar === 'j') {
            setDraftDestinationIndex(prev =>
              Math.min(DESTINATIONS.length - 1, prev + 1),
            )
            return true
          }
          if (key.return) {
            setDraftInput('')
            setMode({ kind: 'addRule', step: 'input' })
            return true
          }
          return
        }
        if (mode.step === 'input') {
          if (key.escape) {
            setMode({ kind: 'list' })
            return true
          }
          if (key.backspace || key.delete) {
            setDraftInput(prev => prev.slice(0, -1))
            return true
          }
          if (key.return) {
            const rule = normalizeString(draftInput)
            if (!rule) {
              setMode({ kind: 'list' })
              return true
            }
            const behavior = BEHAVIORS[draftBehaviorIndex] ?? 'allow'
            const destination = DESTINATIONS[draftDestinationIndex] ?? 'session'
            applyUpdate({
              type: 'addRules',
              destination,
              behavior,
              rules: [rule],
            })
            setMode({ kind: 'list' })
            return true
          }
          if (inputChar) {
            setDraftInput(prev => prev + inputChar)
            return true
          }
          return
        }
      }

      if (mode.kind === 'addDir') {
        if (mode.step === 'destination') {
          if (key.escape) {
            setMode({ kind: 'list' })
            return true
          }
          if (key.upArrow || inputChar === 'k') {
            setDraftDestinationIndex(prev => Math.max(0, prev - 1))
            return true
          }
          if (key.downArrow || inputChar === 'j') {
            setDraftDestinationIndex(prev =>
              Math.min(DESTINATIONS.length - 1, prev + 1),
            )
            return true
          }
          if (key.return) {
            setDraftInput('')
            setMode({ kind: 'addDir', step: 'input' })
            return true
          }
          return
        }
        if (mode.step === 'input') {
          if (key.escape) {
            setMode({ kind: 'list' })
            return true
          }
          if (key.backspace || key.delete) {
            setDraftInput(prev => prev.slice(0, -1))
            return true
          }
          if (key.return) {
            const path = normalizeString(draftInput)
            if (!path) {
              setMode({ kind: 'list' })
              return true
            }
            const destination = DESTINATIONS[draftDestinationIndex] ?? 'session'
            applyUpdate({
              type: 'addDirectories',
              destination,
              directories: [path],
            })
            setMode({ kind: 'list' })
            return true
          }
          if (inputChar) {
            setDraftInput(prev => prev + inputChar)
            return true
          }
          return
        }
      }

      if (mode.kind === 'list') {
        if (key.escape) {
          onDone(dirty ? 'Permissions updated' : 'Permissions dialog dismissed')
          return true
        }

        if (inputChar === '/' && isPlainChar) {
          setIsSearchMode(true)
          setSearchQuery('')
          setSelectedIndex(0)
          return true
        }

        if (
          isPlainChar &&
          inputChar.length > 0 &&
          !/^\s+$/.test(inputChar) &&
          !['j', 'k', 'm', 'i', 'a', 'A', 'g', 'G', '/'].includes(inputChar)
        ) {
          setIsSearchMode(true)
          setSearchQuery(inputChar)
          setSelectedIndex(0)
          return true
        }

        if (inputChar === 'a') {
          setDraftBehaviorIndex(0)
          setDraftDestinationIndex(0)
          setDraftInput('')
          setMode({ kind: 'addRule', step: 'behavior' })
          setIsSearchMode(false)
          return true
        }
        if (inputChar === 'A') {
          setDraftDestinationIndex(0)
          setDraftInput('')
          setMode({ kind: 'addDir', step: 'destination' })
          setIsSearchMode(false)
          return true
        }

        if (key.upArrow || inputChar === 'k') {
          if (selectedIndex === 0 && key.upArrow) {
            setIsSearchMode(true)
            return true
          }
          setSelectedIndex(prev => Math.max(0, prev - 1))
          return true
        }
        if (key.downArrow || inputChar === 'j') {
          setSelectedIndex(prev =>
            Math.min(Math.max(0, visibleItems.length - 1), prev + 1),
          )
          return true
        }
        if (key.pageUp) {
          setSelectedIndex(prev => Math.max(0, prev - window.visibleCount))
          return true
        }
        if (key.pageDown) {
          setSelectedIndex(prev =>
            Math.min(
              Math.max(0, visibleItems.length - 1),
              prev + window.visibleCount,
            ),
          )
          return true
        }
        if (key.home || inputChar === 'g') {
          setSelectedIndex(0)
          return true
        }
        if (key.end || inputChar === 'G') {
          setSelectedIndex(Math.max(0, visibleItems.length - 1))
          return true
        }

        if (key.return) {
          const item = selectedItem
          if (!item) return true
          if (item.kind === 'action') {
            if (item.id === 'add-rule') {
              setDraftBehaviorIndex(0)
              setDraftDestinationIndex(0)
              setDraftInput('')
              setMode({ kind: 'addRule', step: 'behavior' })
              setIsSearchMode(false)
              return true
            }
            if (item.id === 'add-dir') {
              setDraftDestinationIndex(0)
              setDraftInput('')
              setMode({ kind: 'addDir', step: 'destination' })
              setIsSearchMode(false)
              return true
            }
          }

          if (item.kind === 'rule' || item.kind === 'dir') {
            setMode({ kind: 'confirmRemove', target: item })
            setIsSearchMode(false)
            return true
          }
        }
      }
    },
    { priority: KEYPRESS_PRIORITY.FULLSCREEN_OVERLAY },
  )

  const header =
    mode.kind === 'addRule' && mode.step === 'input'
      ? `Rule: ${draftInput}`
      : mode.kind === 'addDir' && mode.step === 'input'
        ? `Directory: ${draftInput}`
        : null

  const helpLine =
    mode.kind === 'list' && isSearchMode
      ? 'Type to search · Enter/↓ done · Esc clear/back'
      : mode.kind === 'confirmRemove'
        ? 'y/Enter confirm · n cancel · Esc close'
        : mode.kind === 'addRule' && mode.step === 'input'
          ? 'Enter save · Esc close'
          : mode.kind === 'addDir' && mode.step === 'input'
            ? 'Enter save · Esc close'
            : mode.kind === 'list'
              ? 'Press ↑↓ to navigate · Enter to select · Type to search · Esc to cancel'
              : 'Esc back'

  const title =
    mode.kind === 'confirmRemove'
      ? 'Remove permission?'
      : mode.kind === 'addRule'
        ? 'Add rule'
        : mode.kind === 'addDir'
          ? 'Add directory'
          : 'Permissions'

  const listToRender =
    mode.kind === 'addRule' && mode.step !== 'input'
      ? mode.step === 'behavior'
        ? BEHAVIORS.map((b, idx) => ({
            label: b,
            selected: idx === draftBehaviorIndex,
          }))
        : DESTINATIONS.map((d, idx) => ({
            label: d,
            selected: idx === draftDestinationIndex,
          }))
      : mode.kind === 'addDir' && mode.step === 'destination'
        ? DESTINATIONS.map((d, idx) => ({
            label: d,
            selected: idx === draftDestinationIndex,
          }))
        : visibleItems.slice(window.start, window.end).map((item, idx) => ({
            label: labelForItem(item),
            selected: window.start + idx === clampedSelectedIndex,
            item,
          }))

  return (
    <ScreenFrame
      title={title}
      exitState={exitState}
      paddingX={layout.paddingX}
      paddingY={layout.paddingY}
      gap={layout.gap}
    >
      <Box flexDirection="column" gap={layout.gap}>
        {mode.kind === 'list' ? (
          <SearchBox
            query={searchQuery}
            isFocused={isSearchMode}
            isTerminalFocused={true}
          />
        ) : null}
        {header ? (
          <Text dimColor wrap="truncate-end">
            {header}
          </Text>
        ) : null}
        <Box flexDirection="column" width="100%">
          <Text dimColor wrap="truncate-end">
            {window.showUpIndicator ? `${figures.arrowUp} More` : ' '}
          </Text>

          {listToRender.map((row: any, idx: number) => {
            const isSelected = Boolean(row.selected)
            const label = String(row.label ?? '')
            return (
              <Box key={idx} flexDirection="row" gap={1}>
                <Text color={isSelected ? theme.kode : theme.secondaryText}>
                  {isSelected ? figures.pointer : ' '}
                </Text>
                <Text
                  bold={isSelected}
                  color={isSelected ? theme.text : undefined}
                  wrap="truncate-end"
                >
                  {label}
                </Text>
              </Box>
            )
          })}

          <Text dimColor wrap="truncate-end">
            {window.showDownIndicator ? `${figures.arrowDown} More` : ' '}
          </Text>
        </Box>

        {mode.kind === 'confirmRemove' ? (
          <Text color={theme.warning} wrap="truncate-end">
            Remove: {labelForItem(mode.target)}
          </Text>
        ) : null}

        <Text dimColor wrap="truncate-end">
          {helpLine}
        </Text>
      </Box>
    </ScreenFrame>
  )
}
