import React from 'react'
import { Box, Text } from 'ink'
import { usePermissionContext } from '#ui-ink/contexts/PermissionContext'
import { getTheme, type Theme } from '#core/utils/theme'
import { getPermissionModeCycleShortcut } from '#ui-ink/utils/permissionModeCycleShortcut'
import type { PermissionMode } from '#core/types/PermissionMode'
import { normalizePermissionMode } from '#core/types/PermissionMode'

interface ModeIndicatorProps {
  showTransitionCount?: boolean
}

export function ModeIndicator({
  showTransitionCount = false,
}: ModeIndicatorProps) {
  const { currentMode, permissionContext } = usePermissionContext()
  const theme = getTheme()
  const shortcut = getPermissionModeCycleShortcut()

  const normalized = normalizePermissionMode(currentMode)

  const indicator = __getModeIndicatorDisplayForTests({
    mode: normalized,
    shortcutDisplayText: shortcut.displayText,
    theme,
  })

  if (!indicator.shouldRender && !showTransitionCount) {
    return null
  }

  return (
    <Box flexDirection="row" justifyContent="space-between" width="100%">
      <Text color={indicator.color}>
        {indicator.mainText}
        {indicator.shortcutHintText ? (
          <Text dimColor>{indicator.shortcutHintText}</Text>
        ) : null}
      </Text>
      {showTransitionCount && (
        <Text color="gray" dimColor>
          Switches: {permissionContext.metadata.transitionCount}
        </Text>
      )}
    </Box>
  )
}

export function __getModeIndicatorDisplayForTests(args: {
  mode: PermissionMode
  shortcutDisplayText: string
  theme: Theme
}): {
  shouldRender: boolean
  color: string
  mainText: string
  shortcutHintText: string
} {
  const normalized = normalizePermissionMode(args.mode)

  const icon = getModeIndicatorIcon(normalized)
  const label = getModeIndicatorLabel(normalized).toLowerCase()
  const color = getModeIndicatorColor(args.theme, normalized)

  return {
    shouldRender: true,
    color,
    mainText: icon ? `${icon} ${label} mode` : `${label} mode`,
    shortcutHintText: ` (${args.shortcutDisplayText} to cycle)`,
  }
}

function getModeIndicatorLabel(mode: PermissionMode): string {
  switch (normalizePermissionMode(mode)) {
    case 'yolo':
      return 'YOLO'
    case 'cautious':
      return 'Ask'
    case 'plan':
      return 'Plan'
    case 'acceptEdits':
      return 'Accept Edits'
    case 'bypassPermissions':
      return 'Bypass'
    case 'dontAsk':
      return "Don't Ask"
    default:
      return 'Unknown'
  }
}

function getModeIndicatorIcon(mode: PermissionMode): string {
  switch (normalizePermissionMode(mode)) {
    case 'yolo':
      return ''
    case 'cautious':
      return '??'
    case 'plan':
      return '||'
    case 'acceptEdits':
      return '>>'
    case 'bypassPermissions':
      return '🚀'
    case 'dontAsk':
      return 'X'
    default:
      return ''
  }
}

function getModeIndicatorColor(theme: Theme, mode: PermissionMode): string {
  switch (normalizePermissionMode(mode)) {
    case 'yolo':
      return theme.secondaryText
    case 'cautious':
      return theme.warning
    case 'plan':
      return theme.success
    case 'acceptEdits':
      return theme.autoAccept
    case 'bypassPermissions':
    case 'dontAsk':
      return theme.error
    default:
      return theme.secondaryText
  }
}

// Compact mode indicator for status bar
export function CompactModeIndicator() {
  const { currentMode } = usePermissionContext()
  const theme = getTheme()
  const shortcut = getPermissionModeCycleShortcut()

  const normalized = normalizePermissionMode(currentMode)

  const indicator = __getModeIndicatorDisplayForTests({
    mode: normalized,
    shortcutDisplayText: shortcut.displayText,
    theme,
  })

  return (
    <Text color={indicator.color}>
      {indicator.mainText}
      <Text dimColor>{indicator.shortcutHintText}</Text>
    </Text>
  )
}
