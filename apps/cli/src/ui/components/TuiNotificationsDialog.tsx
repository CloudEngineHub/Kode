import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Box, Text } from 'ink'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CACHE_PATHS, DATE } from '#core/logging/log/paths'
import { getTheme } from '#core/utils/theme'
import {
  clearNotifications,
  getNotifications,
  subscribeNotifications,
  type InAppNotification,
} from '#core/services/notificationCenter'
import { launchExternalEditorForFilePath } from '#cli-utils/externalEditor'
import { useExitOnCtrlCD } from '#ui-ink/hooks/useExitOnCtrlCD'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { useTerminalSize } from '#ui-ink/hooks/useTerminalSize'

const VIEWPORT_SAFE_MARGIN_ROWS = 1
const INDICATOR_ROWS = 2

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function getLogPath(): string {
  return join(CACHE_PATHS.errors(), `notifications-${DATE}.log`)
}

function sanitizeSingleLine(text: string): string {
  return text.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim()
}

function formatNotificationLine(n: InAppNotification): string {
  const time = new Date(n.createdAt).toLocaleTimeString()
  const source = n.source ?? 'system'
  const channel = n.channel ? `/${n.channel}` : ''
  const titlePrefix = n.title ? `${sanitizeSingleLine(n.title)}: ` : ''
  const message = sanitizeSingleLine(n.message)
  const kind = n.kind ? ` ${n.kind.toUpperCase()}` : ''
  return `[${time}] [${source}${channel}${kind}] ${titlePrefix}${message}`
}

function flushNotificationsToFile(notifs: InAppNotification[]): string | null {
  if (notifs.length === 0) return null
  try {
    const dir = CACHE_PATHS.errors()
    mkdirSync(dir, { recursive: true })
    const path = getLogPath()
    const content = notifs.map(formatNotificationLine).join('\n') + '\n'
    writeFileSync(path, content, 'utf8')
    return path
  } catch {
    return null
  }
}

export function TuiNotificationsDialog({
  onDone,
}: {
  onDone: (result?: string) => void
}): React.ReactNode {
  const theme = getTheme()
  const { rows } = useTerminalSize()
  const exitState = useExitOnCtrlCD(() => process.exit(0))

  const [notifs, setNotifs] = useState<InAppNotification[]>(() =>
    getNotifications(),
  )
  const [follow, setFollow] = useState(true)
  const [scrollTop, setScrollTop] = useState(0)
  const [status, setStatus] = useState<string | null>(null)
  const [savedPath, setSavedPath] = useState<string | null>(null)

  useEffect(() => {
    return subscribeNotifications(() => {
      setNotifs(getNotifications())
    })
  }, [])

  const lines = useMemo(() => notifs.map(formatNotificationLine), [notifs])

  const headerRows = 4
  const footerRows = 1
  const viewportRows = Math.max(
    1,
    rows - headerRows - footerRows - VIEWPORT_SAFE_MARGIN_ROWS,
  )
  const contentRows = Math.max(1, viewportRows - INDICATOR_ROWS)
  const maxScrollTop = Math.max(0, lines.length - contentRows)

  useEffect(() => {
    setScrollTop(prev => {
      if (follow) return maxScrollTop
      return clamp(prev, 0, maxScrollTop)
    })
  }, [contentRows, follow, maxScrollTop])

  const refresh = useCallback(() => {
    setNotifs(getNotifications())
    setStatus('Refreshed')
  }, [])

  const clear = useCallback(() => {
    clearNotifications()
    setSavedPath(null)
    setScrollTop(0)
    setFollow(true)
    setStatus('Cleared notifications')
  }, [])

  const save = useCallback(() => {
    const path = flushNotificationsToFile(getNotifications())
    if (!path) {
      setStatus('No notifications to save')
      return null
    }
    setSavedPath(path)
    setStatus(`Saved to ${path}`)
    return path
  }, [])

  const openSaved = useCallback(async () => {
    const path = savedPath ?? save()
    if (!path) return
    const result = await launchExternalEditorForFilePath(path)
    if (result.ok === true) {
      setStatus(`Opened in ${result.editorLabel}`)
    } else {
      setStatus(result.error.message || 'Failed to open file')
    }
  }, [save, savedPath])

  useKeypress(
    (input, key) => {
      if (key.escape) {
        onDone()
        return true
      }

      if (key.upArrow) {
        setFollow(false)
        setScrollTop(prev => clamp(prev - 1, 0, maxScrollTop))
        return true
      }

      if (key.downArrow) {
        setScrollTop(prev => {
          const next = clamp(prev + 1, 0, maxScrollTop)
          if (next >= maxScrollTop) setFollow(true)
          return next
        })
        return true
      }

      if (key.pageUp) {
        setFollow(false)
        setScrollTop(prev => clamp(prev - contentRows, 0, maxScrollTop))
        return true
      }

      if (key.pageDown) {
        setScrollTop(prev => {
          const next = clamp(prev + contentRows, 0, maxScrollTop)
          if (next >= maxScrollTop) setFollow(true)
          return next
        })
        return true
      }

      if (key.home) {
        setFollow(false)
        setScrollTop(0)
        return true
      }

      if (key.end) {
        setFollow(true)
        setScrollTop(maxScrollTop)
        return true
      }

      if (input === 'r') {
        refresh()
        return true
      }

      if (input === 'c') {
        clear()
        return true
      }

      if (input === 's') {
        save()
        return true
      }

      if (input === 'o') {
        void openSaved()
        return true
      }
    },
    { priority: 10 },
  )

  const hiddenAbove = scrollTop
  const hiddenBelow = Math.max(0, lines.length - (scrollTop + contentRows))

  const visibleLines = useMemo(() => {
    return lines.slice(scrollTop, scrollTop + contentRows)
  }, [contentRows, lines, scrollTop])

  const topIndicator = hiddenAbove ? `... ${hiddenAbove} hidden ...` : ''
  const bottomIndicator = hiddenBelow ? `... ${hiddenBelow} hidden ...` : ''

  const statusLine =
    status ??
    (lines.length > 0
      ? `Showing ${Math.min(contentRows, lines.length)} of ${lines.length}`
      : 'No notifications')

  const logPath = getLogPath()

  return (
    <Box flexDirection="column" width="100%">
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold color={theme.kode}>
          Notifications
        </Text>
        <Text dimColor>
          {exitState.pending
            ? `Press ${exitState.keyName} again to exit`
            : 'Esc to close'}
        </Text>
      </Box>

      <Text dimColor wrap="truncate-end">
        In-app notification history (auto-flush path: {logPath})
      </Text>

      <Text dimColor wrap="truncate-end">
        {follow ? 'Follow: ON' : 'Follow: OFF'} · Scroll: ↑↓ PgUp/PgDn Home/End
        · r refresh · s save · o open · c clear
      </Text>

      <Text color={theme.secondaryText} wrap="truncate-end">
        {statusLine}
      </Text>

      <Box flexDirection="column" width="100%">
        <Text dimColor wrap="truncate-end">
          {topIndicator}
        </Text>
        {visibleLines.length > 0 ? (
          visibleLines.map((line, idx) => (
            <Text
              key={`${scrollTop}:${idx}`}
              color={line.includes(' ERROR]') ? theme.error : theme.text}
              wrap="truncate-end"
            >
              {line}
            </Text>
          ))
        ) : (
          <Text dimColor>(empty)</Text>
        )}
        <Text dimColor wrap="truncate-end">
          {bottomIndicator}
        </Text>
      </Box>

      <Text dimColor wrap="truncate-end">
        {savedPath
          ? `Saved: ${savedPath}`
          : `Tip: use 's' to save and 'o' to open`}
      </Text>
    </Box>
  )
}
