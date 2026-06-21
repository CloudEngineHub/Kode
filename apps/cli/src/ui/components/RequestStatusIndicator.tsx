import { Box, Text } from 'ink'
import React, { useEffect, useRef, useState } from 'react'
import { getTheme } from '#core/utils/theme'
import {
  getRequestStatus,
  subscribeRequestStatus,
  type RequestStatus,
} from '#core/utils/requestStatus'

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

function getLabel(status: RequestStatus): string {
  switch (status.kind) {
    case 'thinking':
      return 'Prefilling'
    case 'streaming':
      return 'Decoding'
    default:
      return ''
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`
  }
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${minutes}m ${secs}s`
  }
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  return `${hours}h ${minutes}m ${secs}s`
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`
  }
  return tokens.toString()
}

function getTokenDisplay(status: RequestStatus): string {
  if (status.kind === 'thinking' && status.inputTokens) {
    return ` · ↑ ${formatTokens(status.inputTokens)}`
  }
  if (status.kind === 'streaming' && status.outputTokens !== undefined) {
    return ` · ↓ ${formatTokens(status.outputTokens)}`
  }
  return ''
}

export function RequestStatusIndicator(): React.ReactNode {
  const frames = SPINNER_FRAMES
  const theme = getTheme()

  const [frame, setFrame] = useState(0)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [status, setStatus] = useState<RequestStatus>(() => getRequestStatus())

  const requestStartTime = useRef<number>(Date.now())

  useEffect(() => {
    const initialStatus = getRequestStatus()
    if (initialStatus.kind !== 'idle') {
      requestStartTime.current = Date.now()
    }

    return subscribeRequestStatus(next => {
      setStatus(next)
      if (next.kind !== 'idle') {
        setElapsedTime(
          Math.floor((Date.now() - requestStartTime.current) / 1000),
        )
      }
      if (next.kind === 'idle') {
        requestStartTime.current = Date.now()
        setElapsedTime(0)
      }
    })
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame(f => (f + 1) % frames.length)
    }, 80)
    return () => clearInterval(timer)
  }, [frames.length])

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - requestStartTime.current) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  if (status.kind === 'tool' || status.kind === 'idle') {
    return null
  }

  return (
    <Box flexDirection="row" marginTop={1}>
      <Text color={theme.kode} bold>
        {frames[frame]} {getLabel(status)}
      </Text>
      <Text color={theme.secondaryText}>
        {' '}
        :: {formatDuration(elapsedTime)} (Esc to interrupt)
        {getTokenDisplay(status)}
      </Text>
    </Box>
  )
}
