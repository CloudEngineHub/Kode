import * as React from 'react'
import { Box, Text } from 'ink'
import { useState, useEffect, useRef } from 'react'
import { getTheme } from '#core/utils/theme'
import type { BashGateFinding } from './dataLossRules'

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export function LlmGateProgress({
  command,
  findings,
}: {
  command: string
  findings: BashGateFinding[]
}): React.ReactNode {
  const theme = getTheme()
  const [frame, setFrame] = useState(0)
  const [elapsedTime, setElapsedTime] = useState(0)
  const startTime = useRef(Date.now())

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame(f => (f + 1) % SPINNER_FRAMES.length)
    }, 80)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime.current) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const truncatedCommand =
    command.length > 60 ? `${command.slice(0, 57)}...` : command

  return (
    <Box flexDirection="column" marginY={1}>
      <Box>
        <Text color={theme.warning}>{SPINNER_FRAMES[frame]} </Text>
        <Text color={theme.warning} bold>
          Reviewing destructive command...
        </Text>
        <Text color={theme.secondaryText}> ({elapsedTime}s)</Text>
      </Box>

      <Box marginTop={1} paddingLeft={2}>
        <Text color={theme.secondaryText}>$ {truncatedCommand}</Text>
      </Box>

      {findings.length > 0 && (
        <Box marginTop={1} paddingLeft={2} flexDirection="column">
          {findings.slice(0, 3).map(f => (
            <Text key={f.code} color={theme.error}>
              - {f.title}
            </Text>
          ))}
          {findings.length > 3 && (
            <Text color={theme.secondaryText}>
              ... and {findings.length - 3} more
            </Text>
          )}
        </Box>
      )}
    </Box>
  )
}
