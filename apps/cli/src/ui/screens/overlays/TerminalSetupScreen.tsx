import React, { useEffect, useMemo, useState } from 'react'
import { Box, Text } from 'ink'

import { getTheme } from '#core/utils/theme'
import { useExitOnCtrlCD } from '#ui-ink/hooks/useExitOnCtrlCD'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { KEYPRESS_PRIORITY } from '#ui-ink/constants/keypressPriority'
import { ScreenFrame } from '#ui-ink/primitives/layout/ScreenFrame'
import { useScreenLayout } from '#ui-ink/primitives/layout/useScreenLayout'
import { wrapLines } from '#ui-ink/primitives/text/wrapLines'
import { terminalCapabilityManager } from '#ui-ink/utils/terminalCapabilityManager'

type Props = {
  onDone: (result?: string) => void
}

function detectTerminalName(): string | null {
  const termProgram = process.env.TERM_PROGRAM
  if (termProgram && termProgram.trim()) return termProgram.trim()
  const term = process.env.TERM
  if (term && term.trim()) return term.trim()
  return null
}

type TerminalCapabilities = {
  terminalName?: string
  tty: boolean
  kittySupported: boolean
  kittyEnabled: boolean
  modifyOtherKeysSupported: boolean
  modifyOtherKeysEnabled: boolean
  bracketedPasteSupported: boolean
  bracketedPasteEnabled: boolean
}

function snapshotCapabilities(): TerminalCapabilities {
  return {
    terminalName:
      terminalCapabilityManager.getTerminalName() ??
      detectTerminalName() ??
      undefined,
    tty: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    kittySupported: terminalCapabilityManager.isKittyProtocolSupported(),
    kittyEnabled: terminalCapabilityManager.isKittyProtocolEnabled(),
    modifyOtherKeysSupported:
      terminalCapabilityManager.isModifyOtherKeysSupported(),
    modifyOtherKeysEnabled:
      terminalCapabilityManager.isModifyOtherKeysEnabled(),
    bracketedPasteSupported:
      terminalCapabilityManager.isBracketedPasteSupported(),
    bracketedPasteEnabled: terminalCapabilityManager.isBracketedPasteEnabled(),
  }
}

function buildTerminalSetupLines(capabilities: TerminalCapabilities): string[] {
  const lines: string[] = []
  lines.push('Terminal setup')
  lines.push(`- terminal: ${capabilities.terminalName ?? '(unknown)'}`)
  lines.push(`- tty: ${capabilities.tty ? 'yes' : 'no'}`)
  lines.push('')
  lines.push('Capabilities')
  lines.push(
    `- kitty keyboard protocol: ${capabilities.kittySupported ? 'supported' : 'no'} (${capabilities.kittyEnabled ? 'enabled' : 'disabled'})`,
  )
  lines.push(
    `- modifyOtherKeys: ${capabilities.modifyOtherKeysSupported ? 'supported' : 'no'} (${capabilities.modifyOtherKeysEnabled ? 'enabled' : 'disabled'})`,
  )
  lines.push(
    `- bracketed paste: ${capabilities.bracketedPasteSupported ? 'supported' : 'no'} (${capabilities.bracketedPasteEnabled ? 'enabled' : 'disabled'})`,
  )

  lines.push('')
  lines.push('Multi-line input')
  lines.push(
    '- Shift+Enter inserts a newline (when your terminal sends modified Enter)',
  )
  lines.push(
    '- If Shift+Enter does not work, use an external editor or enable a terminal keyboard protocol that supports modified keys',
  )
  lines.push('')
  lines.push('Notes')
  lines.push(
    '- iTerm2, WezTerm, Ghostty, and Kitty typically support Shift+Enter',
  )
  lines.push('- In Apple Terminal, Option+Enter is commonly used for newlines')
  lines.push('')
  lines.push('Keys')
  lines.push('- r: refresh')
  lines.push('- Esc: close')
  return lines
}

export function TerminalSetupScreen({ onDone }: Props): React.ReactNode {
  const theme = getTheme()
  const layout = useScreenLayout()
  const exitState = useExitOnCtrlCD(() => onDone('Terminal setup dismissed'))

  const [capabilities, setCapabilities] = useState<TerminalCapabilities>(() =>
    snapshotCapabilities(),
  )

  useEffect(() => {
    terminalCapabilityManager
      .detectCapabilities()
      .then(() => terminalCapabilityManager.enableSupportedModes())
      .finally(() => setCapabilities(snapshotCapabilities()))
  }, [])

  const rawLines = useMemo(
    () => buildTerminalSetupLines(capabilities),
    [capabilities],
  )
  const wrapped = useMemo(() => {
    const width = Math.max(1, layout.columns - layout.paddingX * 2)
    return wrapLines(rawLines, width)
  }, [layout.columns, layout.paddingX, rawLines])

  useKeypress(
    (input, key) => {
      const inputChar = input.length === 1 ? input : ''
      if (key.escape) {
        onDone('Terminal setup dismissed')
        return true
      }
      if (inputChar === 'r') {
        setCapabilities(snapshotCapabilities())
        return true
      }
    },
    { priority: KEYPRESS_PRIORITY.FULLSCREEN_OVERLAY },
  )

  return (
    <ScreenFrame
      title="Terminal Setup"
      exitState={exitState}
      paddingX={layout.paddingX}
      paddingY={layout.paddingY}
      gap={layout.gap}
    >
      <Box flexDirection="column">
        {wrapped.map((line, idx) => (
          <Text
            key={idx}
            color={idx === 0 ? theme.text : undefined}
            wrap="truncate-end"
          >
            {line}
          </Text>
        ))}
      </Box>
    </ScreenFrame>
  )
}
