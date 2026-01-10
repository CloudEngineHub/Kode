import { Text } from 'ink'
import React from 'react'
import type { Operation } from './constants'
import { OPERATION_LABELS } from './constants'

export function summarizeToolResult(
  operation: Operation,
  resultCount: number,
  fileCount: number,
): React.ReactNode {
  const label = OPERATION_LABELS[operation] ?? {
    singular: 'result',
    plural: 'results',
  }
  const noun = resultCount === 1 ? label.singular : label.plural
  if (operation === 'hover' && resultCount > 0 && label.special) {
    return <Text>Hover info {label.special}</Text>
  }
  return (
    <Text>
      Found <Text bold>{resultCount}</Text> {noun}
      {fileCount > 1 ? (
        <>
          {' '}
          across <Text bold>{fileCount}</Text> files
        </>
      ) : null}
    </Text>
  )
}
