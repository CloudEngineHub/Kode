import * as React from 'react'
import { existsSync, readFileSync } from 'fs'
import { useMemo } from 'react'
import { Box, Text } from 'ink'
import { getCwd } from '#core/utils/state'
import { extname, relative } from 'path'
import { detectFileEncoding } from '#core/utils/file'
import { getPatch } from '#core/utils/diff'
import figures from 'figures'
import wrapAnsi from 'wrap-ansi'
import { highlight, supportsLanguage } from 'cli-highlight'
import { logError } from '#core/utils/log'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { useTerminalSize } from '#ui-ink/hooks/useTerminalSize'
import { getWindowedList } from '#ui-ink/primitives/list/windowedList'
import { structuredDiffLines } from '#ui-ink/components/StructuredDiff'

type Props = {
  file_path: string
  content: string
  verbose: boolean
  width: number
  enableScrolling?: boolean
  maxVisibleRows?: number
}

export function FileWriteToolDiff({
  file_path,
  content,
  verbose,
  width,
  enableScrolling = false,
  maxVisibleRows,
}: Props): React.ReactNode {
  const { rows } = useTerminalSize()
  const safeWidth = Math.max(10, Math.floor(width))
  const fileExists = useMemo(() => existsSync(file_path), [file_path])
  const oldContent = useMemo(() => {
    if (!fileExists) {
      return ''
    }
    const enc = detectFileEncoding(file_path)
    return readFileSync(file_path, enc)
  }, [file_path, fileExists])
  const hunks = useMemo(() => {
    if (!fileExists) {
      return null
    }
    return getPatch({
      filePath: file_path,
      fileContents: oldContent,
      oldStr: oldContent,
      newStr: content,
    })
  }, [fileExists, file_path, oldContent, content])

  const language = extname(file_path).slice(1)
  const highlightedCode = useMemo(() => {
    try {
      if (supportsLanguage(language)) {
        return highlight(content || '(No content)', { language })
      }
      return highlight(content || '(No content)', { language: 'markdown' })
    } catch (e) {
      if (e instanceof Error && e.message.includes('Unknown language')) {
        logError(
          `Language not supported while highlighting code, falling back to markdown: ${e}`,
        )
        return highlight(content || '(No content)', { language: 'markdown' })
      }
      return content || '(No content)'
    }
  }, [content, language])

  const previewLines = useMemo(() => {
    if (!hunks) {
      const wrapped = wrapAnsi(highlightedCode, safeWidth, {
        hard: true,
        trim: false,
      })
      return wrapped
        .split('\n')
        .map((line, i) => <Text key={`code-${i}`}>{line}</Text>)
    }

    const lines: React.ReactNode[] = []
    for (let i = 0; i < hunks.length; i += 1) {
      const hunk = hunks[i]
      if (!hunk) continue
      lines.push(
        ...structuredDiffLines({ patch: hunk, width: safeWidth, dim: false }),
      )
      if (i < hunks.length - 1) {
        lines.push(
          <Text key={`ellipsis-${i}`} dimColor>
            ...
          </Text>,
        )
      }
    }
    return lines
  }, [highlightedCode, hunks, safeWidth])

  const totalRows =
    maxVisibleRows ?? Math.max(6, Math.min(14, Math.floor(rows * 0.35)))
  const [focusIndex, setFocusIndex] = React.useState(0)

  React.useEffect(() => {
    setFocusIndex(prev => {
      if (previewLines.length === 0) return 0
      return Math.max(0, Math.min(prev, previewLines.length - 1))
    })
  }, [previewLines.length])

  const window = useMemo(
    () =>
      getWindowedList({
        itemCount: previewLines.length,
        focusIndex,
        maxVisible: totalRows,
        indicatorRows: 2,
      }),
    [focusIndex, previewLines.length, totalRows],
  )

  useKeypress(
    (_input, key) => {
      if (!enableScrolling) return
      if (previewLines.length <= window.visibleCount) return

      if (key.pageUp) {
        setFocusIndex(prev => Math.max(0, prev - window.visibleCount))
        return true
      }
      if (key.pageDown) {
        setFocusIndex(prev =>
          Math.min(
            Math.max(0, previewLines.length - 1),
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
        setFocusIndex(Math.max(0, previewLines.length - 1))
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
        {previewLines.slice(window.start, window.end).map((line, idx) => (
          <Box key={`${window.start + idx}`}>{line}</Box>
        ))}
        <Text dimColor wrap="truncate-end">
          {bottomIndicator}
        </Text>
      </Box>
    </Box>
  )
}
