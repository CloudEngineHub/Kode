import { Hunk } from 'diff'
import { Box, Text } from 'ink'
import * as React from 'react'
import { intersperse } from '#core/utils/array'
import { StructuredDiff } from './StructuredDiff'
import { getTheme } from '#core/utils/theme'
import { getCwd } from '#core/utils/state'
import { relative } from 'path'
import { useTerminalSize } from '#ui-ink/hooks/useTerminalSize'

type Props = {
  filePath: string
  structuredPatch?: Hunk[]
  verbose: boolean
}

const MAX_HUNKS_TO_RENDER = 4
const MAX_DIFF_LINES_TO_RENDER = 200

function truncateHunks(hunks: Hunk[]): {
  hunks: Hunk[]
  hiddenHunks: number
  hiddenLines: number
} {
  if (hunks.length === 0) {
    return { hunks: [], hiddenHunks: 0, hiddenLines: 0 }
  }

  let remainingLines = MAX_DIFF_LINES_TO_RENDER
  const kept: Hunk[] = []
  let hiddenLines = 0

  for (const hunk of hunks) {
    if (kept.length >= MAX_HUNKS_TO_RENDER) {
      hiddenLines += hunk.lines.length
      continue
    }

    if (remainingLines <= 0) {
      hiddenLines += hunk.lines.length
      continue
    }

    if (hunk.lines.length <= remainingLines) {
      kept.push(hunk)
      remainingLines -= hunk.lines.length
      continue
    }

    const visible = hunk.lines.slice(0, remainingLines)
    hiddenLines += hunk.lines.length - visible.length
    kept.push({
      ...hunk,
      lines: [...visible, `... (+${hiddenLines} more diff lines)`],
    })
    remainingLines = 0
  }

  const hiddenHunks = Math.max(0, hunks.length - kept.length)
  return { hunks: kept, hiddenHunks, hiddenLines }
}

export function FileEditToolUpdatedMessage({
  filePath,
  structuredPatch,
  verbose,
}: Props): React.ReactNode {
  const { columns } = useTerminalSize()
  const patches = Array.isArray(structuredPatch) ? structuredPatch : []
  const numAdditions = patches.reduce(
    (count, hunk) => count + hunk.lines.filter(_ => _.startsWith('+')).length,
    0,
  )
  const numRemovals = patches.reduce(
    (count, hunk) => count + hunk.lines.filter(_ => _.startsWith('-')).length,
    0,
  )

  const diff = React.useMemo(() => truncateHunks(patches), [patches])

  return (
    <Box flexDirection="column">
      <Text>
        {'  '}⎿ Updated <Text bold>{filePath}</Text>
        {numAdditions > 0 || numRemovals > 0 ? ' with ' : ''}
        {numAdditions > 0 ? (
          <>
            <Text bold>{numAdditions}</Text>{' '}
            {numAdditions > 1 ? 'additions' : 'addition'}
          </>
        ) : null}
        {numAdditions > 0 && numRemovals > 0 ? ' and ' : null}
        {numRemovals > 0 ? (
          <>
            <Text bold>{numRemovals}</Text>{' '}
            {numRemovals > 1 ? 'removals' : 'removal'}
          </>
        ) : null}
      </Text>
      {verbose &&
        diff.hunks.length > 0 &&
        intersperse(
          diff.hunks.map(_ => (
            <Box flexDirection="column" paddingLeft={5} key={_.newStart}>
              <StructuredDiff patch={_} dim={false} width={columns - 12} />
            </Box>
          )),
          i => (
            <Box paddingLeft={5} key={`ellipsis-${i}`}>
              <Text color={getTheme().secondaryText}>...</Text>
            </Box>
          ),
        )}
      {verbose && diff.hiddenLines > 0 && (
        <Box paddingLeft={5} marginTop={1}>
          <Text color={getTheme().secondaryText}>
            ... (+{diff.hiddenLines} more diff lines hidden)
          </Text>
        </Box>
      )}
    </Box>
  )
}
