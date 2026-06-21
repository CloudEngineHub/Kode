import React, { useMemo, useState } from 'react'
import { Box, Text } from 'ink'
import figures from 'figures'

import type { SettingsDestination, SettingsFile } from '#config'
import {
  loadSettingsWithLegacyFallback,
  saveSettingsToPrimaryAndSyncLegacy,
} from '#config'
import {
  getDisableAllHooksState,
  listHookConfigurations,
  setDisableAllHooks,
  type HookConfigEntry,
} from '#core/hooks'
import type { Hook, HookEventName } from '#core/hooks/types'
import type { ToolUseContext } from '#core/tooling/Tool'
import { getTheme } from '#core/utils/theme'
import { getCwd } from '#core/utils/state'
import { useExitOnCtrlCD } from '#ui-ink/hooks/useExitOnCtrlCD'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { KEYPRESS_PRIORITY } from '#ui-ink/constants/keypressPriority'
import { ScreenFrame } from '#ui-ink/primitives/layout/ScreenFrame'
import { useScreenLayout } from '#ui-ink/primitives/layout/useScreenLayout'
import { getWindowedList } from '#ui-ink/primitives/list/windowedList'

type Props = {
  context: ToolUseContext
  onDone: (result?: string) => void
}

type Mode =
  | { kind: 'events' }
  | { kind: 'hooks'; event: HookEventName }
  | {
      kind: 'addHook'
      step: 'event' | 'destination' | 'matcher' | 'type' | 'input' | 'timeout'
    }
  | { kind: 'confirmDelete'; entry: HookConfigEntry }

type Row =
  | { kind: 'action'; id: string; label: string }
  | { kind: 'event'; event: HookEventName; count: number }
  | { kind: 'hook'; entry: HookConfigEntry; label: string }

const HOOK_EVENTS: HookEventName[] = [
  'PreToolUse',
  'PostToolUse',
  'Stop',
  'SubagentStop',
  'UserPromptSubmit',
  'SessionStart',
  'SessionEnd',
]

const DESTINATIONS: SettingsDestination[] = [
  'localSettings',
  'projectSettings',
  'userSettings',
]

const HOOK_TYPES: Array<Hook['type']> = ['command', 'prompt']

function normalizeString(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function hookDisplay(hook: Hook): string {
  const body =
    hook.type === 'command'
      ? hook.command
      : hook.type === 'prompt'
        ? hook.prompt
        : ''
  return normalizeString(body || '')
}

function sourceLabel(entry: HookConfigEntry): string {
  if (entry.source.kind === 'plugin') return 'plugin'
  return entry.source.destination
}

function entryLabel(entry: HookConfigEntry): string {
  const matcher = normalizeString(entry.matcher || '*') || '*'
  const timeout =
    typeof entry.hook.timeout === 'number' ? ` · ${entry.hook.timeout}s` : ''
  return `${matcher} · ${entry.hook.type}: ${hookDisplay(entry.hook)}${timeout} · ${sourceLabel(entry)}`
}

function hookEquals(a: Hook, b: Hook): boolean {
  if (a.type !== b.type) return false
  const aTimeout = typeof a.timeout === 'number' ? a.timeout : null
  const bTimeout = typeof b.timeout === 'number' ? b.timeout : null
  if (aTimeout !== bTimeout) return false

  if (a.type === 'command' && b.type === 'command')
    return a.command === b.command
  if (a.type === 'prompt' && b.type === 'prompt') return a.prompt === b.prompt
  return false
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  if (Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readSettingsForDestination(args: {
  destination: SettingsDestination
  projectDir: string
}): SettingsFile {
  const loaded = loadSettingsWithLegacyFallback({
    destination: args.destination,
    projectDir: args.projectDir,
    migrateToPrimary: true,
  })
  return (loaded.settings ?? {}) as SettingsFile
}

function saveSettingsForDestination(args: {
  destination: SettingsDestination
  projectDir: string
  settings: SettingsFile
}): void {
  saveSettingsToPrimaryAndSyncLegacy({
    destination: args.destination,
    projectDir: args.projectDir,
    settings: args.settings,
    syncLegacyIfExists: true,
  })
}

function addHookToSettings(args: {
  destination: SettingsDestination
  projectDir: string
  event: HookEventName
  matcher: string
  hook: Hook
}): void {
  const settings = { ...readSettingsForDestination(args) } as Record<
    string,
    unknown
  >
  const hooks = asRecord(settings.hooks) ?? {}
  const existing = Array.isArray(hooks[args.event])
    ? (hooks[args.event] as unknown[])
    : []

  const normalizedMatcher = normalizeString(args.matcher || '*') || '*'

  const nextEventMatchers: any[] = []
  let appended = false

  for (const item of existing) {
    const rec = asRecord(item)
    if (!rec) continue
    const matcher =
      normalizeString(typeof rec.matcher === 'string' ? rec.matcher : '') || '*'
    const hooksRaw = Array.isArray(rec.hooks) ? rec.hooks : []

    if (matcher === normalizedMatcher) {
      nextEventMatchers.push({
        matcher,
        hooks: [...hooksRaw, args.hook],
      })
      appended = true
    } else {
      nextEventMatchers.push({ matcher, hooks: hooksRaw })
    }
  }

  if (!appended) {
    nextEventMatchers.push({ matcher: normalizedMatcher, hooks: [args.hook] })
  }

  const nextSettings: SettingsFile = {
    ...settings,
    hooks: { ...hooks, [args.event]: nextEventMatchers },
  }

  saveSettingsForDestination({
    destination: args.destination,
    projectDir: args.projectDir,
    settings: nextSettings,
  })
}

function removeHookFromSettings(args: {
  destination: SettingsDestination
  projectDir: string
  event: HookEventName
  matcher: string
  hook: Hook
}): void {
  const settings = { ...readSettingsForDestination(args) } as Record<
    string,
    unknown
  >
  const hooks = asRecord(settings.hooks)
  if (!hooks) return

  const existing = Array.isArray(hooks[args.event])
    ? (hooks[args.event] as unknown[])
    : []
  const normalizedMatcher = normalizeString(args.matcher || '*') || '*'

  const nextEventMatchers: any[] = []

  for (const item of existing) {
    const rec = asRecord(item)
    if (!rec) continue
    const matcher =
      normalizeString(typeof rec.matcher === 'string' ? rec.matcher : '') || '*'
    const hooksRaw = Array.isArray(rec.hooks) ? rec.hooks : []

    if (matcher !== normalizedMatcher) {
      nextEventMatchers.push({ matcher, hooks: hooksRaw })
      continue
    }

    const filtered = hooksRaw.filter(h => {
      const hook = asRecord(h)
      if (!hook) return true
      const type = hook.type
      if (type !== 'command' && type !== 'prompt') return true
      const candidate: Hook =
        type === 'command'
          ? {
              type,
              command: String(hook.command ?? ''),
              timeout: hook.timeout as any,
            }
          : {
              type,
              prompt: String(hook.prompt ?? ''),
              timeout: hook.timeout as any,
            }
      return !hookEquals(candidate, args.hook)
    })

    if (filtered.length > 0) {
      nextEventMatchers.push({ matcher, hooks: filtered })
    }
  }

  const nextHooks: Record<string, unknown> = { ...hooks }
  if (nextEventMatchers.length > 0) nextHooks[args.event] = nextEventMatchers
  else delete nextHooks[args.event]

  const nextSettings: SettingsFile = { ...settings }
  if (Object.keys(nextHooks).length > 0) nextSettings.hooks = nextHooks
  else delete (nextSettings as any).hooks

  saveSettingsForDestination({
    destination: args.destination,
    projectDir: args.projectDir,
    settings: nextSettings,
  })
}

export function HooksScreen({ onDone }: Props): React.ReactNode {
  const theme = getTheme()
  const layout = useScreenLayout()
  const exitState = useExitOnCtrlCD(() => onDone('Hooks dialog dismissed'))

  const projectDir = getCwd()
  const [status, setStatus] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>({ kind: 'events' })
  const [selectedIndex, setSelectedIndex] = useState(0)

  const [draftEventIndex, setDraftEventIndex] = useState(0)
  const [draftDestinationIndex, setDraftDestinationIndex] = useState(0)
  const [draftTypeIndex, setDraftTypeIndex] = useState(0)
  const [draftMatcher, setDraftMatcher] = useState('*')
  const [draftInput, setDraftInput] = useState('')
  const [draftTimeout, setDraftTimeout] = useState('')

  const [disableState, setDisableState] = useState(() =>
    getDisableAllHooksState({ projectDir }),
  )
  const [entries, setEntries] = useState(() =>
    listHookConfigurations(projectDir),
  )

  const refresh = () => {
    setDisableState(getDisableAllHooksState({ projectDir }))
    setEntries(listHookConfigurations(projectDir))
  }

  const countsByEvent = useMemo(() => {
    const map = new Map<HookEventName, number>()
    for (const e of HOOK_EVENTS) map.set(e, 0)
    for (const entry of entries) {
      map.set(entry.event, (map.get(entry.event) ?? 0) + 1)
    }
    return map
  }, [entries])

  const rows: Row[] = useMemo(() => {
    if (mode.kind === 'confirmDelete') return []

    if (mode.kind === 'addHook') {
      if (mode.step === 'event') {
        return HOOK_EVENTS.map(event => ({
          kind: 'event',
          event,
          count: countsByEvent.get(event) ?? 0,
        }))
      }
      if (mode.step === 'destination') {
        return DESTINATIONS.map(d => ({
          kind: 'action',
          id: d,
          label: d,
        }))
      }
      if (mode.step === 'type') {
        return HOOK_TYPES.map(t => ({
          kind: 'action',
          id: t,
          label: t,
        }))
      }
      return []
    }

    if (mode.kind === 'hooks') {
      const hookRows = entries
        .filter(e => e.event === mode.event)
        .map(entry => ({
          kind: 'hook' as const,
          entry,
          label: entryLabel(entry),
        }))
      return [
        { kind: 'action', id: 'back', label: 'Back' },
        { kind: 'action', id: 'add-hook', label: 'Add hook…' },
        ...hookRows,
      ]
    }

    const actions: Row[] = [
      {
        kind: 'action',
        id: disableState.disabled ? 'enable-hooks' : 'disable-hooks',
        label: disableState.disabled
          ? 'Re-enable all hooks'
          : 'Disable all hooks',
      },
      { kind: 'action', id: 'add-hook', label: 'Add hook…' },
    ]

    const eventRows: Row[] = HOOK_EVENTS.map(event => ({
      kind: 'event',
      event,
      count: countsByEvent.get(event) ?? 0,
    }))
    return [...actions, ...eventRows]
  }, [
    countsByEvent,
    disableState.disabled,
    entries,
    mode.kind,
    mode,
    projectDir,
  ])

  const reservedLines =
    (layout.tightLayout ? 7 : layout.compactLayout ? 9 : 11) +
    layout.paddingY * 2 +
    layout.gap * 3
  const maxVisible = Math.max(3, layout.rows - reservedLines - 1)
  const window = useMemo(
    () =>
      getWindowedList({
        itemCount: rows.length,
        focusIndex: selectedIndex,
        maxVisible,
        indicatorRows: 2,
      }),
    [maxVisible, rows.length, selectedIndex],
  )

  const clampedSelectedIndex = Math.max(
    0,
    Math.min(selectedIndex, Math.max(0, rows.length - 1)),
  )
  const selectedRow = rows[clampedSelectedIndex] ?? null

  useKeypress(
    (input, key) => {
      const inputChar = input.length === 1 ? input : ''
      if (key.escape) {
        onDone('Hooks dialog dismissed')
        return true
      }
      if (mode.kind === 'confirmDelete') {
        if (inputChar === 'y' || key.return) {
          const entry = mode.entry
          if (entry.source.kind !== 'settings') {
            setStatus('Cannot remove plugin hooks here')
            setMode({ kind: 'events' })
            refresh()
            return true
          }
          removeHookFromSettings({
            destination: entry.source.destination,
            projectDir,
            event: entry.event,
            matcher: entry.matcher,
            hook: entry.hook,
          })
          setStatus('Hook removed')
          setMode({ kind: 'hooks', event: entry.event })
          refresh()
          return true
        }
        if (inputChar === 'n' || key.escape) {
          setMode({ kind: 'hooks', event: mode.entry.event })
          return true
        }
        return
      }

      if (mode.kind === 'addHook') {
        if (mode.step === 'event') {
          if (key.upArrow || inputChar === 'k') {
            setDraftEventIndex(prev => Math.max(0, prev - 1))
            return true
          }
          if (key.downArrow || inputChar === 'j') {
            setDraftEventIndex(prev =>
              Math.min(HOOK_EVENTS.length - 1, prev + 1),
            )
            return true
          }
          if (key.return) {
            const event = HOOK_EVENTS[draftEventIndex] ?? 'PreToolUse'
            setDraftMatcher('*')
            setDraftDestinationIndex(0)
            setDraftTypeIndex(0)
            setDraftInput('')
            setDraftTimeout('')
            setMode({ kind: 'addHook', step: 'destination' })
            setStatus(`Event: ${event}`)
            setSelectedIndex(0)
            return true
          }
          return
        }
        if (mode.step === 'destination') {
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
            setMode({ kind: 'addHook', step: 'matcher' })
            setDraftMatcher('*')
            return true
          }
          return
        }
        if (mode.step === 'matcher') {
          if (key.backspace || key.delete) {
            setDraftMatcher(prev => prev.slice(0, -1))
            return true
          }
          if (key.return) {
            setMode({ kind: 'addHook', step: 'type' })
            return true
          }
          if (inputChar) {
            setDraftMatcher(prev => prev + inputChar)
            return true
          }
          return
        }
        if (mode.step === 'type') {
          if (key.upArrow || inputChar === 'k') {
            setDraftTypeIndex(prev => Math.max(0, prev - 1))
            return true
          }
          if (key.downArrow || inputChar === 'j') {
            setDraftTypeIndex(prev => Math.min(HOOK_TYPES.length - 1, prev + 1))
            return true
          }
          if (key.return) {
            setDraftInput('')
            setMode({ kind: 'addHook', step: 'input' })
            return true
          }
          return
        }
        if (mode.step === 'input') {
          if (key.backspace || key.delete) {
            setDraftInput(prev => prev.slice(0, -1))
            return true
          }
          if (key.return) {
            setMode({ kind: 'addHook', step: 'timeout' })
            setDraftTimeout('')
            return true
          }
          if (inputChar) {
            setDraftInput(prev => prev + inputChar)
            return true
          }
          return
        }
        if (mode.step === 'timeout') {
          if (key.backspace || key.delete) {
            setDraftTimeout(prev => prev.slice(0, -1))
            return true
          }
          if (key.return) {
            const event = HOOK_EVENTS[draftEventIndex] ?? 'PreToolUse'
            const destination =
              DESTINATIONS[draftDestinationIndex] ?? 'localSettings'
            const matcher = normalizeString(draftMatcher || '*') || '*'
            const hookType = HOOK_TYPES[draftTypeIndex] ?? 'command'
            const value = normalizeString(draftInput)
            const timeout = normalizeString(draftTimeout)

            const timeoutNum =
              timeout && /^\d+$/.test(timeout) ? parseInt(timeout, 10) : null

            const hook: Hook =
              hookType === 'command'
                ? {
                    type: 'command',
                    command: value,
                    ...(timeoutNum !== null ? { timeout: timeoutNum } : {}),
                  }
                : {
                    type: 'prompt',
                    prompt: value,
                    ...(timeoutNum !== null ? { timeout: timeoutNum } : {}),
                  }

            addHookToSettings({
              destination,
              projectDir,
              event,
              matcher,
              hook,
            })
            setStatus('Hook added')
            setMode({ kind: 'hooks', event })
            setSelectedIndex(0)
            refresh()
            return true
          }
          if (inputChar && (/^\d$/.test(inputChar) || inputChar === ' ')) {
            if (inputChar !== ' ') setDraftTimeout(prev => prev + inputChar)
            return true
          }
          return
        }
      }

      if (key.upArrow || inputChar === 'k') {
        setSelectedIndex(prev => Math.max(0, prev - 1))
        return true
      }
      if (key.downArrow || inputChar === 'j') {
        setSelectedIndex(prev =>
          Math.min(Math.max(0, rows.length - 1), prev + 1),
        )
        return true
      }
      if (key.pageUp) {
        setSelectedIndex(prev => Math.max(0, prev - window.visibleCount))
        return true
      }
      if (key.pageDown) {
        setSelectedIndex(prev =>
          Math.min(Math.max(0, rows.length - 1), prev + window.visibleCount),
        )
        return true
      }
      if (key.home || inputChar === 'g') {
        setSelectedIndex(0)
        return true
      }
      if (key.end || inputChar === 'G') {
        setSelectedIndex(Math.max(0, rows.length - 1))
        return true
      }

      if (inputChar === 'r') {
        refresh()
        setStatus('Refreshed')
        return true
      }

      if (key.return) {
        const row = selectedRow
        if (!row) return true

        if (row.kind === 'action') {
          if (row.id === 'back' && mode.kind === 'hooks') {
            setMode({ kind: 'events' })
            setSelectedIndex(0)
            return true
          }
          if (row.id === 'add-hook') {
            setMode({ kind: 'addHook', step: 'event' })
            setDraftEventIndex(0)
            setSelectedIndex(0)
            setStatus(null)
            return true
          }
          if (row.id === 'disable-hooks') {
            setDisableAllHooks({ destination: 'localSettings', disabled: true })
            refresh()
            setStatus('Disabled all hooks')
            return true
          }
          if (row.id === 'enable-hooks') {
            setDisableAllHooks({
              destination: 'localSettings',
              disabled: false,
            })
            refresh()
            setStatus('Re-enabled hooks')
            return true
          }
        }

        if (row.kind === 'event') {
          setMode({ kind: 'hooks', event: row.event })
          setSelectedIndex(0)
          return true
        }

        if (row.kind === 'hook') {
          if (row.entry.source.kind !== 'settings') {
            setStatus('Plugin hooks are read-only here')
            return true
          }
          setMode({ kind: 'confirmDelete', entry: row.entry })
          return true
        }
      }
    },
    { priority: KEYPRESS_PRIORITY.FULLSCREEN_OVERLAY },
  )

  const title =
    mode.kind === 'hooks'
      ? `Hooks · ${mode.event}`
      : mode.kind === 'addHook'
        ? mode.step === 'event'
          ? 'Add hook · Event'
          : mode.step === 'destination'
            ? 'Add hook · Destination'
            : mode.step === 'matcher'
              ? `Add hook · Matcher: ${draftMatcher}`
              : mode.step === 'type'
                ? 'Add hook · Type'
                : mode.step === 'input'
                  ? `Add hook · ${HOOK_TYPES[draftTypeIndex] ?? 'command'}: ${draftInput}`
                  : `Add hook · Timeout (sec): ${draftTimeout}`
        : mode.kind === 'confirmDelete'
          ? 'Remove hook?'
          : disableState.disabled
            ? 'Hooks (disabled)'
            : 'Hooks'

  const helpLine =
    mode.kind === 'confirmDelete'
      ? 'y/Enter confirm · n cancel · Esc close'
      : mode.kind === 'addHook' &&
          (mode.step === 'matcher' ||
            mode.step === 'input' ||
            mode.step === 'timeout')
        ? 'Type · Backspace delete · Enter continue · Esc close'
        : mode.kind === 'addHook'
          ? '↑/↓ j/k · Enter select · Esc close'
          : mode.kind === 'hooks'
            ? '↑/↓ j/k · Enter remove · r refresh · Esc close'
            : '↑/↓ j/k · Enter select · r refresh · Esc close'

  const listToRender =
    mode.kind === 'confirmDelete'
      ? []
      : mode.kind === 'addHook' &&
          (mode.step === 'event' ||
            mode.step === 'destination' ||
            mode.step === 'type')
        ? mode.step === 'event'
          ? HOOK_EVENTS.map((event, idx) => ({
              label: `${event} (${countsByEvent.get(event) ?? 0})`,
              selected: idx === draftEventIndex,
            }))
          : mode.step === 'destination'
            ? DESTINATIONS.map((d, idx) => ({
                label: d,
                selected: idx === draftDestinationIndex,
              }))
            : HOOK_TYPES.map((t, idx) => ({
                label: t,
                selected: idx === draftTypeIndex,
              }))
        : rows.slice(window.start, window.end).map((row, idx) => ({
            label:
              row.kind === 'event'
                ? `${row.event} (${row.count})`
                : row.kind === 'hook'
                  ? row.label
                  : row.label,
            selected: window.start + idx === clampedSelectedIndex,
            row,
          }))

  return (
    <ScreenFrame
      title={title}
      exitState={exitState}
      paddingX={layout.paddingX}
      paddingY={layout.paddingY}
      gap={layout.gap}
    >
      <Box flexDirection="column">
        {mode.kind !== 'confirmDelete' ? (
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
        ) : null}

        {mode.kind === 'confirmDelete' ? (
          <Text color={theme.warning} wrap="truncate-end">
            Remove: {entryLabel(mode.entry)}
          </Text>
        ) : null}

        {disableState.disabled && mode.kind === 'events' ? (
          <Box flexDirection="column">
            <Text dimColor wrap="truncate-end">
              When hooks are disabled:
            </Text>
            <Text dimColor wrap="truncate-end">
              · Hook commands do not execute
            </Text>
            <Text dimColor wrap="truncate-end">
              · StatusLine is hidden
            </Text>
            <Text dimColor wrap="truncate-end">
              · Tools run without hook validation
            </Text>
          </Box>
        ) : null}

        {status ? (
          <Text dimColor wrap="truncate-end">
            {status}
          </Text>
        ) : null}

        <Text dimColor wrap="truncate-end">
          {helpLine}
        </Text>
      </Box>
    </ScreenFrame>
  )
}
