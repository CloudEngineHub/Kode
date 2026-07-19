import { Box, Text, useIsScreenReaderEnabled } from 'ink'
import React, { useEffect, useRef, useState } from 'react'
import type { ToolKeypressHandler } from '@kode/tool-interface/Tool'
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

function RequestStatusIndicator(): React.ReactNode {
  const theme = getTheme()
  const isScreenReaderEnabled = useIsScreenReaderEnabled()

  const [frame, setFrame] = useState(0)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [status, setStatus] = useState<RequestStatus>(() => getRequestStatus())

  const requestStartTime = useRef<number | null>(
    status.kind === 'thinking' || status.kind === 'streaming'
      ? Date.now()
      : null,
  )
  const isVisible = status.kind !== 'tool' && status.kind !== 'idle'
  const shouldAnimate = isVisible && !isScreenReaderEnabled

  useEffect(() => {
    return subscribeRequestStatus(next => {
      setStatus(next)
      if (next.kind !== 'idle' && requestStartTime.current === null) {
        requestStartTime.current = Date.now()
      }
      if (next.kind === 'idle') {
        requestStartTime.current = null
        setElapsedTime(0)
      }
    })
  }, [])

  useEffect(() => {
    if (!shouldAnimate) return
    const timer = setInterval(() => {
      setFrame(f => (f + 1) % SPINNER_FRAMES.length)
    }, 80)
    return () => clearInterval(timer)
  }, [shouldAnimate])

  useEffect(() => {
    if (!shouldAnimate || requestStartTime.current === null) return
    const timer = setInterval(() => {
      const startTime = requestStartTime.current
      if (startTime !== null) {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000))
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [shouldAnimate])

  if (status.kind === 'tool' || status.kind === 'idle') {
    return null
  }

  return (
    <Box flexDirection="row" marginTop={1}>
      <Text color={theme.kode} bold>
        {SPINNER_FRAMES[frame]} {getLabel(status)}
      </Text>
      <Text color={theme.secondaryText}>
        {' '}
        :: {elapsedTime}s (Esc to interrupt)
        {getTokenDisplay(status)}
      </Text>
    </Box>
  )
}

export function createRunInBackgroundKeypressHandler(
  onBackground: () => void,
): ToolKeypressHandler {
  let hasRequestedBackground = false

  return (input, key) => {
    if (input !== 'b' || !key.ctrl || key.meta || key.shift) return false
    if (!hasRequestedBackground) {
      hasRequestedBackground = true
      onBackground()
    }
    return true
  }
}

export function BashToolRunInBackgroundOverlay(): React.ReactNode {
  const shortcut = process.env.TMUX ? 'ctrl+b ctrl+b' : 'ctrl+b'

  return (
    <Box flexDirection="column">
      <RequestStatusIndicator />
      <Box paddingLeft={5}>
        <Text dimColor>{`${shortcut} run in background`}</Text>
      </Box>
    </Box>
  )
}
