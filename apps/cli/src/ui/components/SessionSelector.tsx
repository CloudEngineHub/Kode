import React from 'react'
import { Box, Text } from 'ink'
import { Select } from './CustomSelect/select'
import { getTheme } from '#core/utils/theme'
import { useTerminalSize } from '#ui-ink/hooks/useTerminalSize'
import { formatDate } from '#core/utils/log'
import type { KodeAgentSessionListItem } from '#protocol/utils/kodeAgentSessionResume'

type SessionSelectorProps = {
  sessions: KodeAgentSessionListItem[]
  onSelect: (index: number) => void
}

export function SessionSelector({
  sessions,
  onSelect,
}: SessionSelectorProps): React.ReactNode {
  const { rows } = useTerminalSize()
  if (sessions.length === 0) return null

  // Keep at least one empty row at the bottom to avoid terminal scroll/flicker when Ink re-renders
  // near the last row (especially on macOS Terminal/iTerm2 and Windows Terminal).
  const headerRows = 1
  const footerRows = 1
  const safeMarginRows = 1
  const maxVisibleCount = Math.max(
    1,
    rows - headerRows - footerRows - safeMarginRows,
  )
  const visibleCount = Math.min(sessions.length, maxVisibleCount)
  const hiddenCount = Math.max(0, sessions.length - visibleCount)

  const indexWidth = 7
  const modifiedWidth = 21
  const createdWidth = 21
  const tagWidth = 10

  const headerLabel = `${'Modified'.padEnd(modifiedWidth)}${'Created'.padEnd(createdWidth)}${'Tag'.padEnd(tagWidth)}Session`

  const options = sessions.map((s, i) => {
    const index = `[${i}]`.padEnd(indexWidth)
    const modified = formatDate(
      s.modifiedAt ?? s.createdAt ?? new Date(0),
    ).padEnd(modifiedWidth)
    const created = formatDate(
      s.createdAt ?? s.modifiedAt ?? new Date(0),
    ).padEnd(createdWidth)
    const tag = (s.tag ? `#${s.tag}` : '').padEnd(tagWidth)

    const name = s.customTitle ?? s.slug ?? s.sessionId
    const summary = s.summary ? s.summary.split('\n')[0] : ''

    const labelTxt = `${index}${modified}${created}${tag}${name}${summary ? ` — ${summary}` : ''}`
    return { label: labelTxt, value: String(i) }
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
        onChange={value => onSelect(parseInt(value, 10))}
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
