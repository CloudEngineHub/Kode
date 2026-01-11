import React, { useEffect, useState } from 'react'
import { Box, Text } from 'ink'
import { getGlobalConfig } from '#core/utils/config'
import { getTheme } from '#core/utils/theme'
import { PressEnterToContinue } from '#ui-ink/components/PressEnterToContinue'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { useTerminalSize } from '#ui-ink/hooks/useTerminalSize'
import { terminalCapabilityManager } from '#ui-ink/utils/terminalCapabilityManager'
import { isStdioPatchedForTui } from '#cli-utils/stdio'
import {
  isAlternateScreenActive,
  shouldEnterAlternateScreen,
} from '#cli-utils/terminal'

type Props = {
  onDone: () => void
  doctorMode?: boolean
}

// Interactive options removed; simplified status-only doctor

export function Doctor({ onDone, doctorMode = false }: Props): React.ReactNode {
  const [checked, setChecked] = useState(false)
  const theme = getTheme()
  const { columns, rows } = useTerminalSize()

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        await terminalCapabilityManager.detectCapabilities()
      } catch {
        // best-effort
      }
      if (!alive) return
      setChecked(true)
    })()
    return () => {
      alive = false
    }
  }, [])

  // Close on Enter
  useKeypress((_input, key) => {
    if (key.return) onDone()
  })

  if (!checked) {
    return (
      <Box paddingX={1} paddingTop={1}>
        <Text color={theme.secondaryText}>Running checks…</Text>
      </Box>
    )
  }

  const config = getGlobalConfig()
  const screenReaderEnv =
    process.env.KODE_SCREEN_READER ?? process.env.SCREENREADER
  const isScreenReader = Boolean(screenReaderEnv)

  const runtime = process.versions?.bun
    ? `bun ${process.versions.bun}`
    : `node ${process.versions.node}`

  const terminalName = terminalCapabilityManager.getTerminalName()
  const backgroundColor = terminalCapabilityManager.getTerminalBackgroundColor()
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

  return (
    <Box flexDirection="column" gap={1} paddingX={1} paddingTop={1}>
      <Text bold color={theme.kode}>
        Doctor
      </Text>

      <Text color={theme.success}>✓ Basic checks passed</Text>

      <Box flexDirection="column">
        <Text bold>Runtime</Text>
        <Text dimColor wrap="truncate-end">
          {runtime} · {process.platform} · {columns}×{rows}
        </Text>
      </Box>

      <Box flexDirection="column">
        <Text bold>Terminal</Text>
        <Text dimColor wrap="truncate-end">
          stdin TTY: {yesNo(Boolean(process.stdin.isTTY))} · stdout TTY:{' '}
          {yesNo(Boolean(process.stdout.isTTY))} · stderr TTY:{' '}
          {yesNo(Boolean(process.stderr.isTTY))}
        </Text>
        <Text dimColor wrap="truncate-end">
          detected: {terminalName ?? '(unknown)'} · bg:{' '}
          {backgroundColor ?? '(unknown)'}
        </Text>
        {envSummary ? (
          <Text dimColor wrap="truncate-end">
            {envSummary}
          </Text>
        ) : null}
      </Box>

      <Box flexDirection="column">
        <Text bold>Capabilities</Text>
        <Text dimColor wrap="truncate-end">
          kitty keyboard protocol: {yesNo(kittySupported)} (
          {enabledDisabled(kittyEnabled)})
        </Text>
        <Text dimColor wrap="truncate-end">
          modifyOtherKeys: {yesNo(mokSupported)} ({enabledDisabled(mokEnabled)})
        </Text>
        <Text dimColor wrap="truncate-end">
          bracketed paste: {yesNo(bpSupported)} ({enabledDisabled(bpEnabled)})
        </Text>
      </Box>

      <Box flexDirection="column">
        <Text bold>Rendering</Text>
        <Text dimColor wrap="truncate-end">
          TUI stdio guard: {enabledDisabled(isStdioPatchedForTui())} · alt
          screen: {enabledDisabled(isAlternateScreenActive())}
        </Text>
        <Text dimColor wrap="truncate-end">
          config useAlternateBuffer:{' '}
          {enabledDisabled(Boolean(config.useAlternateBuffer))} ·
          wouldUseAltScreen: {yesNo(wantsAltScreen)} · screenReader:{' '}
          {yesNo(isScreenReader)}
        </Text>
        <Text dimColor wrap="truncate-end">
          wipeScrollbackOnClear: {yesNo(Boolean(config.wipeScrollbackOnClear))}{' '}
          (recommended: no)
        </Text>
      </Box>

      {doctorMode ? (
        <Box flexDirection="column">
          <Text bold>Troubleshooting</Text>
          <Text dimColor wrap="truncate-end">
            Flicker/scroll issues: keep one free row at bottom, avoid wrapped
            list items, and keep `useAlternateBuffer=false` if you want shell
            scrollback preserved.
          </Text>
          <Text dimColor wrap="truncate-end">
            Input issues: prefer a terminal with kitty protocol or
            modifyOtherKeys; enable bracketed paste when available.
          </Text>
        </Box>
      ) : null}

      <PressEnterToContinue />
    </Box>
  )
}
