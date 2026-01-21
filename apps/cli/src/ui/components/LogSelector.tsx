import React from 'react'
import { Box, Text } from 'ink'
import type { LogOption } from '#core/types/logs'
import { getTheme } from '#core/utils/theme'
import { useTerminalSize } from '#ui-ink/hooks/useTerminalSize'
import { formatDate } from '#core/utils/log'
import figures from 'figures'
import { ScreenFrame } from '#ui-ink/primitives/layout/ScreenFrame'
import { useScreenLayout } from '#ui-ink/primitives/layout/useScreenLayout'
import { getWindowedList } from '#ui-ink/primitives/list/windowedList'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { useExitOnCtrlCD } from '#ui-ink/hooks/useExitOnCtrlCD'

type LogSelectorProps = {
  logs: LogOption[]
  onSelect: (logValue: number) => void
}

export function LogSelector({
  logs,
  onSelect,
}: LogSelectorProps): React.ReactNode {
  const theme = getTheme()
  const layout = useScreenLayout()
  const exitState = useExitOnCtrlCD(() => process.exit(0))

  if (logs.length === 0) return null

  const [selectedIndex, setSelectedIndex] = React.useState(0)

  const reservedLines =
    (layout.tightLayout ? 7 : layout.compactLayout ? 9 : 11) +
    layout.paddingY * 2 +
    layout.gap * 3
  const maxVisible = Math.max(3, layout.rows - reservedLines - 1)
  const window = React.useMemo(
    () =>
      getWindowedList({
        itemCount: logs.length,
        focusIndex: selectedIndex,
        maxVisible,
        indicatorRows: 2,
      }),
    [logs.length, maxVisible, selectedIndex],
  )

  const visibleLogs = React.useMemo(
    () => logs.slice(window.start, window.end),
    [logs, window.end, window.start],
  )

  useKeypress((input, key) => {
    const inputChar = input.length === 1 ? input : ''

    if (key.escape) {
      process.exit(0)
      return true
    }

    if (key.return) {
      onSelect(selectedIndex)
      return true
    }

    if (key.upArrow || inputChar === 'k') {
      setSelectedIndex(prev => Math.max(0, prev - 1))
      return true
    }

    if (key.downArrow || inputChar === 'j') {
      setSelectedIndex(prev => Math.min(logs.length - 1, prev + 1))
      return true
    }

    if (key.pageUp) {
      setSelectedIndex(prev => Math.max(0, prev - window.visibleCount))
      return true
    }
    if (key.pageDown) {
      setSelectedIndex(prev =>
        Math.min(logs.length - 1, prev + window.visibleCount),
      )
      return true
    }

    if (key.home || inputChar === 'g') {
      setSelectedIndex(0)
      return true
    }
    if (key.end || inputChar === 'G') {
      setSelectedIndex(Math.max(0, logs.length - 1))
      return true
    }
  })

  const topIndicator = window.showUpIndicator ? `${figures.arrowUp} More` : ' '
  const bottomIndicator = window.showDownIndicator
    ? `${figures.arrowDown} More`
    : ' '

  const selectedLog = logs[selectedIndex] ?? null
  const selectedDetails = selectedLog
    ? `${formatDate(selectedLog.modified)} · ${selectedLog.messageCount} msgs`
    : null

  return (
    <ScreenFrame
      title="Logs"
      exitState={exitState}
      paddingX={layout.paddingX}
      paddingY={layout.paddingY}
      gap={layout.gap}
    >
      <Box flexDirection="column" gap={layout.gap}>
        <Text dimColor wrap="truncate-end">
          Select a log to print as JSON.
        </Text>

        <Box flexDirection="column" width="100%">
          <Text dimColor wrap="truncate-end">
            {topIndicator}
          </Text>
          {visibleLogs.map((log, idx) => {
            const absoluteIndex = window.start + idx
            const isSelected = absoluteIndex === selectedIndex

            let branchInfo = ''
            if (log.forkNumber) branchInfo += ` fork #${log.forkNumber}`
            if (log.sidechainNumber)
              branchInfo += ` sidechain #${log.sidechainNumber}`

            return (
              <Box key={absoluteIndex} flexDirection="row" gap={1}>
                <Text color={isSelected ? theme.kode : theme.secondaryText}>
                  {isSelected ? figures.pointer : ' '}
                </Text>
                <Text dimColor wrap="truncate-end">
                  {formatDate(log.modified)}
                </Text>
                <Text color={theme.secondaryText} wrap="truncate-end">
                  {`${log.messageCount} msgs`}
                </Text>
                <Text
                  bold={isSelected}
                  color={isSelected ? theme.text : theme.secondaryText}
                  wrap="truncate-end"
                >
                  {log.firstPrompt}
                  {branchInfo ? ` (${branchInfo.trim()})` : ''}
                </Text>
              </Box>
            )
          })}
          <Text dimColor wrap="truncate-end">
            {bottomIndicator}
          </Text>
        </Box>

        {selectedDetails ? (
          <Box paddingLeft={2}>
            <Text dimColor wrap="truncate-end">
              {selectedDetails}
            </Text>
          </Box>
        ) : null}

        <Text dimColor wrap="truncate-end">
          ↑/↓ or j/k · PgUp/PgDn · Home/End · Enter print · Esc quit
        </Text>
      </Box>
    </ScreenFrame>
  )
}
