import React, { useEffect, useMemo, useState } from 'react'
import { Box, Text } from 'ink'
import figures from 'figures'

import { getGlobalConfig } from '#core/utils/config'
import { getTheme } from '#core/utils/theme'
import type { ToolPermissionContext } from '#core/types/toolPermissionContext'
import { findUnreachablePermissionRules } from '#core/permissions'
import { describeToolPermissionRuleSource } from '#core/permissions/ruleString'

import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { KEYPRESS_PRIORITY } from '#ui-ink/constants/keypressPriority'
import { terminalCapabilityManager } from '#ui-ink/utils/terminalCapabilityManager'
import { ScreenFrame } from '#ui-ink/primitives/layout/ScreenFrame'
import { useScreenLayout } from '#ui-ink/primitives/layout/useScreenLayout'
import { wrapLines } from '#ui-ink/primitives/text/wrapLines'

import { isStdioPatchedForTui } from '#cli-utils/stdio'
import {
  isAlternateScreenActive,
  shouldEnterAlternateScreen,
} from '#cli-utils/terminal'

type Props = {
  onDone: () => void
  doctorMode?: boolean
  toolPermissionContext?: ToolPermissionContext
}

const VIEWPORT_SAFE_MARGIN_ROWS = 1
const INDICATOR_ROWS = 2

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function Doctor({
  onDone,
  doctorMode = false,
  toolPermissionContext,
}: Props): React.ReactNode {
  const [checked, setChecked] = useState(false)
  const [scrollTop, setScrollTop] = useState(0)
  const theme = getTheme()
  const layout = useScreenLayout()

  useEffect(() => {
    setChecked(true)
  }, [])

  const unreachableRules = useMemo(() => {
    if (!toolPermissionContext) return []
    return findUnreachablePermissionRules(toolPermissionContext)
  }, [toolPermissionContext])

  const rawLines = useMemo((): string[] => {
    if (!checked) return ['Running checks…']

    const config = getGlobalConfig()
    const screenReaderEnv =
      process.env.KODE_SCREEN_READER ?? process.env.SCREENREADER
    const isScreenReader = Boolean(screenReaderEnv)

    const runtime = process.versions?.bun
      ? `bun ${process.versions.bun}`
      : `node ${process.versions.node}`

    const terminalName = terminalCapabilityManager.getTerminalName()
    const backgroundColor =
      terminalCapabilityManager.getTerminalBackgroundColor()
    const kittySupported = terminalCapabilityManager.isKittyProtocolSupported()
    const kittyEnabled = terminalCapabilityManager.isKittyProtocolEnabled()
    const mokSupported = terminalCapabilityManager.isModifyOtherKeysSupported()
    const mokEnabled = terminalCapabilityManager.isModifyOtherKeysEnabled()
    const bpSupported = terminalCapabilityManager.isBracketedPasteSupported()
    const bpEnabled = terminalCapabilityManager.isBracketedPasteEnabled()

    const wantsAltScreen = shouldEnterAlternateScreen(
      config.useAlternateBuffer ?? false,
      isScreenReader,
    )

    const envSummary = (() => {
      const entries: Array<[string, string | undefined]> = [
        ['TERM', process.env.TERM],
        ['COLORTERM', process.env.COLORTERM],
        ['TERM_PROGRAM', process.env.TERM_PROGRAM],
        ['TERM_PROGRAM_VERSION', process.env.TERM_PROGRAM_VERSION],
        ['WT_SESSION', process.env.WT_SESSION],
        ['VTE_VERSION', process.env.VTE_VERSION],
        ['KITTY_WINDOW_ID', process.env.KITTY_WINDOW_ID],
        ['WEZTERM_EXECUTABLE', process.env.WEZTERM_EXECUTABLE],
      ]

      const parts = entries
        .filter(([, v]) => typeof v === 'string' && v.trim().length > 0)
        .map(([k, v]) => `${k}=${v}`)
      return parts.join(' · ')
    })()

    const yesNo = (value: boolean) => (value ? 'yes' : 'no')
    const enabledDisabled = (value: boolean) => (value ? 'enabled' : 'disabled')

    const lines: string[] = []
    lines.push('Doctor')
    lines.push('')
    lines.push(`${figures.tick} Basic checks passed`)
    lines.push('')
    lines.push('Runtime')
    lines.push(
      `- ${runtime} · ${process.platform} · ${layout.columns}×${layout.rows}`,
    )
    lines.push('')
    lines.push('Terminal')
    lines.push(
      `- stdin TTY: ${yesNo(Boolean(process.stdin.isTTY))} · stdout TTY: ${yesNo(Boolean(process.stdout.isTTY))} · stderr TTY: ${yesNo(Boolean(process.stderr.isTTY))}`,
    )
    lines.push(
      `- detected: ${terminalName ?? '(unknown)'} · bg: ${backgroundColor ?? '(unknown)'}`,
    )
    if (envSummary) lines.push(`- env: ${envSummary}`)
    lines.push('')
    lines.push('Capabilities')
    lines.push(
      `- kitty keyboard protocol: ${yesNo(kittySupported)} (${enabledDisabled(kittyEnabled)})`,
    )
    lines.push(
      `- modifyOtherKeys: ${yesNo(mokSupported)} (${enabledDisabled(mokEnabled)})`,
    )
    lines.push(
      `- bracketed paste: ${yesNo(bpSupported)} (${enabledDisabled(bpEnabled)})`,
    )
    lines.push('')
    lines.push('Rendering')
    lines.push(
      `- TUI stdio guard: ${enabledDisabled(isStdioPatchedForTui())} · alt screen: ${enabledDisabled(isAlternateScreenActive())}`,
    )
    lines.push(
      `- useAlternateBuffer: ${enabledDisabled(Boolean(config.useAlternateBuffer))} · wouldUseAltScreen: ${yesNo(wantsAltScreen)} · screenReader: ${yesNo(isScreenReader)}`,
    )
    lines.push(
      `- wipeScrollbackOnClear: ${yesNo(Boolean(config.wipeScrollbackOnClear))} (recommended: no)`,
    )
    const incrementalEnv = process.env.KODE_TUI_INCREMENTAL_RENDERING
    const incrementalConfigured = config.incrementalRendering
    const incrementalEffective = (() => {
      if (isScreenReader) return false
      if (!process.stdout.isTTY) return false
      if (incrementalEnv === '0' || incrementalEnv === 'false') return false
      if (incrementalEnv === '1' || incrementalEnv === 'true') return true
      if (typeof incrementalConfigured === 'boolean')
        return incrementalConfigured
      return true
    })()
    lines.push(
      `- incrementalRendering: ${enabledDisabled(incrementalEffective)} (config: ${
        typeof incrementalConfigured === 'boolean'
          ? enabledDisabled(incrementalConfigured)
          : 'default'
      } · env: ${incrementalEnv ?? 'default'})`,
    )

    const syncEnv = process.env.KODE_SYNC_OUTPUT
    const syncEffective = (() => {
      if (isScreenReader) return false
      if (!process.stdout.isTTY) return false
      if (syncEnv === '0' || syncEnv === 'false') return false
      return true
    })()
    lines.push(
      `- syncOutput: ${enabledDisabled(syncEffective)} (env: ${syncEnv ?? 'default'})`,
    )
    if (process.env.KODE_TUI_MAX_FPS) {
      lines.push(`- maxFps: ${process.env.KODE_TUI_MAX_FPS} (env override)`)
    }

    if (unreachableRules.length > 0) {
      lines.push('')
      lines.push('Permissions')
      lines.push(
        `- ${unreachableRules.length} unreachable rule${
          unreachableRules.length === 1 ? '' : 's'
        } detected`,
      )
      for (const warning of unreachableRules.slice(0, 8)) {
        lines.push(
          `  - ${warning.rule} (${describeToolPermissionRuleSource(
            warning.source,
          )})`,
        )
        lines.push(`    Reason: ${warning.reason}`)
        lines.push(`    Fix: ${warning.fix}`)
      }
      if (unreachableRules.length > 8) {
        lines.push(`  ... ${unreachableRules.length - 8} more warnings`)
      }
    }

    if (doctorMode) {
      lines.push('')
      lines.push('Troubleshooting')
      lines.push(
        '- Flicker/scroll issues: keep one free row at bottom; avoid wrapped list items; keep useAlternateBuffer=false if you want shell scrollback preserved.',
      )
      lines.push(
        '- Input issues: prefer a terminal with kitty protocol or modifyOtherKeys; enable bracketed paste when available.',
      )
    }

    return lines
  }, [
    checked,
    doctorMode,
    layout.columns,
    layout.rows,
    unreachableRules.length,
  ])

  const wrappedLines = useMemo(() => {
    return wrapLines(
      rawLines,
      Math.max(1, layout.columns - layout.paddingX * 2),
    )
  }, [layout.columns, layout.paddingX, rawLines])

  const frameRows = 1 + 1 + layout.gap * 2 + layout.paddingY * 2
  const contentRows = Math.max(
    1,
    layout.rows - frameRows - (1 + INDICATOR_ROWS) - VIEWPORT_SAFE_MARGIN_ROWS,
  )
  const maxScrollTop = Math.max(0, wrappedLines.length - contentRows)

  useEffect(() => {
    setScrollTop(prev => clamp(prev, 0, maxScrollTop))
  }, [maxScrollTop])

  const clampedScrollTop = clamp(scrollTop, 0, maxScrollTop)
  const hiddenAbove = clampedScrollTop
  const hiddenBelow = Math.max(
    0,
    wrappedLines.length - (clampedScrollTop + contentRows),
  )

  const visible = wrappedLines.slice(
    clampedScrollTop,
    clampedScrollTop + contentRows,
  )

  const topIndicator = hiddenAbove
    ? `${figures.arrowUp} ${hiddenAbove} more`
    : ' '
  const bottomIndicator = hiddenBelow
    ? `${figures.arrowDown} ${hiddenBelow} more`
    : ' '

  useKeypress(
    (input, key) => {
      const inputChar = input.length === 1 ? input : ''

      if (key.return || key.escape) {
        onDone()
        return true
      }

      if (!checked) return false

      if (key.upArrow || inputChar === 'k') {
        setScrollTop(prev => clamp(prev - 1, 0, maxScrollTop))
        return true
      }

      if (key.downArrow || inputChar === 'j') {
        setScrollTop(prev => clamp(prev + 1, 0, maxScrollTop))
        return true
      }

      if (key.pageUp) {
        setScrollTop(prev => clamp(prev - contentRows, 0, maxScrollTop))
        return true
      }

      if (key.pageDown) {
        setScrollTop(prev => clamp(prev + contentRows, 0, maxScrollTop))
        return true
      }

      if (key.home || inputChar === 'g') {
        setScrollTop(0)
        return true
      }

      if (key.end || inputChar === 'G') {
        setScrollTop(maxScrollTop)
        return true
      }
    },
    { priority: KEYPRESS_PRIORITY.FULLSCREEN_OVERLAY },
  )

  return (
    <ScreenFrame
      title="Doctor"
      paddingX={layout.paddingX}
      paddingY={layout.paddingY}
      gap={layout.gap}
    >
      <Box flexDirection="column">
        <Text dimColor wrap="truncate-end">
          Scroll: ↑↓ j/k PgUp/PgDn Home/End · Enter/Esc close
        </Text>
        <Text dimColor wrap="truncate-end">
          {topIndicator}
        </Text>
        {checked ? (
          visible.map((line, idx) => (
            <Text
              key={`${clampedScrollTop}:${idx}`}
              color={line === 'Doctor' ? theme.kode : undefined}
              wrap="truncate-end"
            >
              {line}
            </Text>
          ))
        ) : (
          <Text color={theme.secondaryText} wrap="truncate-end">
            Running checks…
          </Text>
        )}
        <Text dimColor wrap="truncate-end">
          {bottomIndicator}
        </Text>
      </Box>
    </ScreenFrame>
  )
}
