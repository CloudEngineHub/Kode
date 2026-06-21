import * as React from 'react'
import { existsSync, readFileSync } from 'fs'
import { useMemo } from 'react'
import { Box, Text } from 'ink'
import { getCwd } from '#core/utils/state'
import { relative } from 'path'
import { getPatch } from '#core/utils/diff'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { useTerminalSize } from '#ui-ink/hooks/useTerminalSize'
import { getWindowedList } from '#ui-ink/primitives/list/windowedList'
import { structuredDiffLines } from '#ui-ink/components/StructuredDiff'
import figures from 'figures'

type Props = {
  file_path: string
  new_string: string
  old_string: string
  verbose: boolean
  width: number
  enableScrolling?: boolean
  maxVisibleRows?: number
}

export function FileEditToolDiff({
  file_path,
  new_string,
  old_string,
  verbose,
  width,
  enableScrolling = false,
  maxVisibleRows,
}: Props): React.ReactNode {
  const { rows } = useTerminalSize()
  const safeWidth = Math.max(10, Math.floor(width))
  const file = useMemo(
    () => (existsSync(file_path) ? readFileSync(file_path, 'utf8') : ''),
    [file_path],
  )
  const patch = useMemo(
    () =>
      getPatch({
        filePath: file_path,
        fileContents: file,
        oldStr: old_string,
        newStr: new_string,
      }),
    [file_path, file, old_string, new_string],
  )

  const diffLines = useMemo(() => {
    const lines: React.ReactNode[] = []
    for (let i = 0; i < patch.length; i += 1) {
      const hunk = patch[i]
      if (!hunk) continue
      lines.push(
        ...structuredDiffLines({ patch: hunk, width: safeWidth, dim: false }),
      )
      if (i < patch.length - 1) {
        lines.push(
          <Text key={`ellipsis-${i}`} dimColor>
            ...
          </Text>,
        )
      }
    }
    return lines
  }, [patch, safeWidth])

  const totalRows =
    maxVisibleRows ?? Math.max(6, Math.min(14, Math.floor(rows * 0.35)))
  const [focusIndex, setFocusIndex] = React.useState(0)

  React.useEffect(() => {
    setFocusIndex(prev => {
      if (diffLines.length === 0) return 0
      return Math.max(0, Math.min(prev, diffLines.length - 1))
    })
  }, [diffLines.length])

  const window = useMemo(
    () =>
      getWindowedList({
        itemCount: diffLines.length,
        focusIndex,
        maxVisible: totalRows,
        indicatorRows: 2,
      }),
    [diffLines.length, focusIndex, totalRows],
  )

  useKeypress(
    (_input, key) => {
      if (!enableScrolling) return
      if (diffLines.length <= window.visibleCount) return

      if (key.pageUp) {
        setFocusIndex(prev => Math.max(0, prev - window.visibleCount))
        return true
      }
      if (key.pageDown) {
        setFocusIndex(prev =>
          Math.min(
            Math.max(0, diffLines.length - 1),
            prev + window.visibleCount,
          ),
        )
        return true
      }
      if (key.home) {
        setFocusIndex(0)
        return true
      }
      if (key.end) {
        setFocusIndex(Math.max(0, diffLines.length - 1))
        return true
      }
    },
    { isActive: enableScrolling },
  )

  const topIndicator = window.showUpIndicator ? `${figures.arrowUp} More` : ' '
  const bottomIndicator = window.showDownIndicator
    ? `${figures.arrowDown} More`
    : ' '

  return (
    <Box flexDirection="column">
      <Text bold wrap="truncate-end">
        {file_path}
      </Text>

      {enableScrolling ? (
        <Text dimColor wrap="truncate-end">
          PgUp/PgDn scroll · Home/End
        </Text>
      ) : null}

      <Box flexDirection="column" width="100%">
        <Text dimColor wrap="truncate-end">
          {topIndicator}
        </Text>
        {diffLines.slice(window.start, window.end).map((line, idx) => (
          <Box key={`${window.start + idx}`}>{line}</Box>
        ))}
        <Text dimColor wrap="truncate-end">
          {bottomIndicator}
        </Text>
      </Box>
    </Box>
  )
}
