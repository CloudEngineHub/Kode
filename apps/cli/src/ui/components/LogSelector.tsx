import React from 'react'
import { Box, Text } from 'ink'
import { Select } from './CustomSelect/select'
import type { LogOption } from '#core/types/logs'
import { getTheme } from '#core/utils/theme'
import { useTerminalSize } from '#ui-ink/hooks/useTerminalSize'
import { formatDate } from '#core/utils/log'

type LogSelectorProps = {
  logs: LogOption[]
  onSelect: (logValue: number) => void
}

export function LogSelector({
  logs,
  onSelect,
}: LogSelectorProps): React.ReactNode {
  const { rows } = useTerminalSize()
  if (logs.length === 0) {
    return null
  }

  // Keep at least one empty row at the bottom to avoid terminal scroll/flicker when Ink re-renders
  // near the last row (especially on macOS Terminal/iTerm2 and Windows Terminal).
  const headerRows = 1
  const footerRows = 1
  const safeMarginRows = 1
  const maxVisibleCount = Math.max(
    1,
    rows - headerRows - footerRows - safeMarginRows,
  )
  const visibleCount = Math.min(logs.length, maxVisibleCount)
  const hiddenCount = Math.max(0, logs.length - visibleCount)

  // Create formatted options
  // Calculate column widths
  const indexWidth = 7 // [0] to [99] with extra spaces
  const modifiedWidth = 21 // "Yesterday at 7:49 pm" with space
  const createdWidth = 21 // "Yesterday at 7:49 pm" with space
  const countWidth = 9 // "999 msgs" (right-aligned)

  const headerLabel = `${'Modified'.padEnd(modifiedWidth)}${'Created'.padEnd(createdWidth)}${'# Messages'.padEnd(countWidth + 1)}First message`

  const options = logs.map((log, i) => {
    const index = `[${i}]`.padEnd(indexWidth)
    const modified = formatDate(log.modified).padEnd(modifiedWidth)
    const created = formatDate(log.created).padEnd(createdWidth)
    const msgCount = `${log.messageCount}`.padStart(countWidth)
    const prompt = log.firstPrompt
    let branchInfo = ''
    if (log.forkNumber) branchInfo += ` (fork #${log.forkNumber})`
    if (log.sidechainNumber)
      branchInfo += ` (sidechain #${log.sidechainNumber})`

    const labelTxt = `${index}${modified}${created}${msgCount} ${prompt}${branchInfo}`
    return {
      label: labelTxt,
      value: log.value.toString(),
    }
  })

  return (
    <Box flexDirection="column" width="100%">
      <Box paddingLeft={indexWidth + 2}>
        <Text bold color={getTheme().text} wrap="truncate-end">
          {headerLabel}
        </Text>
      </Box>
      <Select
        options={options}
        onChange={index => onSelect(parseInt(index, 10))}
        visibleOptionCount={visibleCount}
      />
      <Box paddingLeft={2}>
        <Text color={getTheme().secondaryText}>
          {hiddenCount > 0 ? `and ${hiddenCount} more…  •  ` : ''}
          Ctrl+C to quit
        </Text>
      </Box>
    </Box>
  )
}
