import React from 'react'
import { Box, Newline, Text } from 'ink'
import type { ConnectionTestResult } from '../actions/connectionTest'
import {
  ScreenFrame,
  type ScreenExitState,
} from '#ui-ink/primitives/layout/ScreenFrame'

function formatStrategyLabel(value?: string): string | null {
  if (!value) return null
  switch (value) {
    case 'kode-default':
      return 'Kode default'
    case 'compat-headers':
      return 'Compatibility headers'
    case 'compat-headers-system':
      return 'Compatibility headers + prompt'
    case 'compat-full':
      return 'Compatibility full'
    default:
      return value
  }
}

function formatErrorCategory(value?: string): string | null {
  if (!value) return null
  switch (value) {
    case 'restricted_client_only':
      return 'Provider restricts third-party clients for this model'
    case 'auth':
      return 'Authentication error'
    case 'billing':
      return 'Billing / quota error'
    case 'network':
      return 'Network error'
    case 'timeout':
      return 'Request timed out'
    case 'tool_use_unsupported':
      return 'Tool use unsupported'
    case 'unexpected_tool_call':
      return 'Unexpected tool call'
    case 'invalid_tool_args':
      return 'Invalid tool arguments'
    case 'local_verification_failed':
      return 'Local verification failed'
    case 'other':
      return 'Other error'
    default:
      return value
  }
}

type Props = {
  theme: any
  exitState: ScreenExitState
  terminalColumns: number
  compactLayout: boolean
  tightLayout: boolean
  containerPaddingY: number
  containerGap: number
  selectedProvider: string
  getProviderLabel: (provider: string, modelCount: number) => string
  isTestingConnection: boolean
  connectionTestResult: ConnectionTestResult | null
}

export function ConnectionTestScreen({
  theme,
  exitState,
  terminalColumns,
  compactLayout,
  tightLayout,
  containerPaddingY,
  containerGap,
  selectedProvider,
  getProviderLabel,
  isTestingConnection,
  connectionTestResult,
}: Props) {
  const providerDisplayName = getProviderLabel(selectedProvider, 0).split(
    ' (',
  )[0]
  const descriptionWidth = Math.max(1, Math.min(70, terminalColumns - 10))

  return (
    <ScreenFrame
      title="Connection Test"
      exitState={exitState}
      paddingX={tightLayout || compactLayout ? 1 : 2}
      paddingY={containerPaddingY}
      gap={containerGap}
    >
      <Box flexDirection="column" gap={containerGap}>
        <Text bold>Testing connection to {providerDisplayName}...</Text>
        {!tightLayout && (
          <Box flexDirection="column" width={descriptionWidth}>
            <Text color={theme.secondaryText}>
              This will verify your configuration by sending a test request to
              the API.
              {selectedProvider === 'minimax' && (
                <>
                  <Newline />
                  For MiniMax, we'll test both v2 and v1 endpoints to find the
                  best one.
                </>
              )}
            </Text>
          </Box>
        )}

        {!connectionTestResult && !isTestingConnection && (
          <Box marginTop={tightLayout ? 0 : 1}>
            <Text>
              <Text color={theme.suggestion}>Press Enter</Text> to start the
              connection test
            </Text>
          </Box>
        )}

        {isTestingConnection && (
          <Box
            flexDirection="column"
            marginTop={tightLayout ? 0 : 1}
            gap={containerGap}
          >
            <Text color={theme.suggestion}>
              {tightLayout ? 'Testing connection…' : '🔄 Testing connection...'}
            </Text>
            {connectionTestResult?.message && (
              <Text color={theme.secondaryText}>
                {connectionTestResult.message}
              </Text>
            )}
            {!tightLayout &&
              (connectionTestResult?.attempt ||
                connectionTestResult?.phase) && (
                <Text color={theme.secondaryText}>
                  {connectionTestResult.phase
                    ? `Phase: ${connectionTestResult.phase}`
                    : null}
                  {connectionTestResult.attempt
                    ? ` · Attempt: ${connectionTestResult.attempt}/${connectionTestResult.maxAttempts ?? '?'}`
                    : ''}
                  {connectionTestResult.fallbackStep
                    ? ` · Strategy: ${formatStrategyLabel(connectionTestResult.fallbackStep)}`
                    : ''}
                </Text>
              )}
            {!tightLayout &&
              typeof connectionTestResult?.retryInMs === 'number' && (
                <Text color={theme.secondaryText}>
                  Retrying in{' '}
                  {Math.round(connectionTestResult.retryInMs / 1000)}s...
                </Text>
              )}
          </Box>
        )}

        {connectionTestResult && !isTestingConnection && (
          <Box
            flexDirection="column"
            marginTop={tightLayout ? 0 : 1}
            gap={containerGap}
          >
            <Text color={connectionTestResult.success ? theme.success : 'red'}>
              {connectionTestResult.message}
            </Text>

            {!tightLayout && connectionTestResult.endpoint && (
              <Text color={theme.secondaryText}>
                Endpoint: {connectionTestResult.endpoint}
              </Text>
            )}

            {!tightLayout && connectionTestResult.fallbackStep && (
              <Text color={theme.secondaryText}>
                Strategy:{' '}
                {formatStrategyLabel(connectionTestResult.fallbackStep)}
              </Text>
            )}

            {!tightLayout && connectionTestResult.errorCategory && (
              <Text color={theme.secondaryText}>
                Error type:{' '}
                {formatErrorCategory(connectionTestResult.errorCategory)}
              </Text>
            )}

            {!tightLayout && connectionTestResult.details && (
              <Text color={theme.secondaryText}>
                Details: {connectionTestResult.details}
              </Text>
            )}

            {connectionTestResult.success ? (
              !tightLayout && (
                <Text color={theme.success}>Automatically proceeding...</Text>
              )
            ) : (
              <Text>
                <Text color={theme.suggestion}>Press Enter</Text> to retry, or{' '}
                <Text color={theme.suggestion}>Esc</Text> to go back
              </Text>
            )}
          </Box>
        )}

        <Box marginTop={tightLayout ? 0 : 1}>
          <Text dimColor>
            Press <Text color={theme.suggestion}>Esc</Text> to go back to
            context length
          </Text>
        </Box>
      </Box>
    </ScreenFrame>
  )
}
