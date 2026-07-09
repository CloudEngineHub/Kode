import React, { useEffect, useState } from 'react'
import { CACHE_PATHS } from '#core/utils/log'
import { LogSelector } from '#ui-ink/components/LogSelector'
import type { LogOption, LogListProps } from '#core/types/logs'
import { loadLogList } from '#core/utils/log'
import { logError } from '#core/utils/log'

type Props = LogListProps & {
  type: 'messages' | 'errors'
  logNumber?: number
  onDone?: (result: LogListResult) => void
}

export type LogListResult =
  | { type: 'stdout'; text: string; exitCode: 0 }
  | { type: 'stderr'; text: string; exitCode: 1 }
  | { type: 'cancel'; exitCode: 0 }

function serializeLog(log: LogOption): string {
  return `${JSON.stringify(log.messages, null, 2)}\n`
}

export function LogList({
  context,
  type,
  logNumber,
  onDone,
}: Props): React.ReactNode {
  const [logs, setLogs] = useState<LogOption[]>([])
  const [didSelectLog, setDidSelectLog] = useState(false)

  const finish = React.useCallback(
    (result: LogListResult) => {
      if (onDone) {
        onDone(result)
        return
      }
      context.unmount?.()
    },
    [context, onDone],
  )

  useEffect(() => {
    loadLogList(
      type === 'messages' ? CACHE_PATHS.messages() : CACHE_PATHS.errors(),
    )
      .then(logs => {
        // If logNumber is provided, immediately display that log
        if (logNumber !== undefined) {
          const log = logs[logNumber >= 0 ? logNumber : 0] // Handle out of bounds
          if (log) {
            finish({ type: 'stdout', text: serializeLog(log), exitCode: 0 })
            return
          } else {
            finish({
              type: 'stderr',
              text: `No log found at index ${String(logNumber)}\n`,
              exitCode: 1,
            })
            return
          }
        }

        if (logs.length === 0) {
          finish({
            type: 'stderr',
            text: `No ${type === 'messages' ? 'message' : 'error'} logs found.\n`,
            exitCode: 1,
          })
          return
        }

        setLogs(logs)
      })
      .catch(error => {
        logError(error)
        if (logNumber !== undefined) {
          finish({
            type: 'stderr',
            text: `Failed to load logs: ${String(error)}\n`,
            exitCode: 1,
          })
        } else {
          finish({ type: 'cancel', exitCode: 0 })
        }
      })
  }, [finish, type, logNumber])

  function onSelect(index: number): void {
    const log = logs[index]
    if (!log) {
      return
    }
    setDidSelectLog(true)
    finish({ type: 'stdout', text: serializeLog(log), exitCode: 0 })
  }

  // If logNumber is provided, don't render the selector
  if (logNumber !== undefined) {
    return null
  }

  if (didSelectLog) {
    return null
  }

  return (
    <LogSelector
      logs={logs}
      onSelect={onSelect}
      onCancel={() => finish({ type: 'cancel', exitCode: 0 })}
    />
  )
}
