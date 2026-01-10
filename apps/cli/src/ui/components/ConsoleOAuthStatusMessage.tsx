import React from 'react'
import { Box, Text } from 'ink'
import { PRODUCT_NAME } from '#core/constants/product'
import type { Theme } from '#core/utils/theme'
import { SimpleSpinner } from './Spinner'
import TextInput from './TextInput'
import type { OAuthStatus } from './oauthTypes'
import { PASTE_HERE_MSG } from './oauthTypes'

type Props = {
  oauthStatus: OAuthStatus
  theme: Theme
  showPastePrompt: boolean
  pastedCode: string
  onPastedCodeChange: (value: string) => void
  cursorOffset: number
  onCursorOffsetChange: (value: number) => void
  textInputColumns: number
  onSubmitCode: (value: string, url: string) => void | Promise<void>
}

export function ConsoleOAuthStatusMessage(props: Props): React.ReactNode {
  const {
    oauthStatus,
    theme,
    showPastePrompt,
    pastedCode,
    onPastedCodeChange,
    cursorOffset,
    onCursorOffsetChange,
    textInputColumns,
    onSubmitCode,
  } = props

  switch (oauthStatus.state) {
    case 'idle':
      return (
        <Box flexDirection="column" gap={1}>
          <Text bold>
            {PRODUCT_NAME} is billed based on API usage through your ShareAI Lab
            account.
          </Text>

          <Box>
            <Text>
              Pricing may evolve as we move towards general availability.
            </Text>
          </Box>

          <Box marginTop={1}>
            <Text color={theme.permission}>
              Press <Text bold>Enter</Text> to login to your ShareAI Lab
              account…
            </Text>
          </Box>
        </Box>
      )

    case 'waiting_for_login':
      return (
        <Box flexDirection="column" gap={1}>
          {!showPastePrompt && (
            <Box>
              <SimpleSpinner />
              <Text>Opening browser to sign in…</Text>
            </Box>
          )}

          {showPastePrompt && (
            <Box>
              <Text>{PASTE_HERE_MSG}</Text>
              <TextInput
                value={pastedCode}
                onChange={onPastedCodeChange}
                onSubmit={(value: string) =>
                  onSubmitCode(value, oauthStatus.url)
                }
                cursorOffset={cursorOffset}
                onChangeCursorOffset={onCursorOffsetChange}
                columns={textInputColumns}
              />
            </Box>
          )}
        </Box>
      )

    case 'creating_api_key':
      return (
        <Box flexDirection="column" gap={1}>
          <Box>
            <SimpleSpinner />
            <Text>Creating API key for Kode…</Text>
          </Box>
        </Box>
      )

    case 'about_to_retry':
      return (
        <Box flexDirection="column" gap={1}>
          <Text color={theme.permission}>Retrying…</Text>
        </Box>
      )

    case 'success':
      return (
        <Box flexDirection="column" gap={1}>
          <Text color={theme.success}>
            Login successful. Press <Text bold>Enter</Text> to continue…
          </Text>
        </Box>
      )

    case 'error':
      return (
        <Box flexDirection="column" gap={1}>
          <Text color={theme.error}>OAuth error: {oauthStatus.message}</Text>

          {oauthStatus.toRetry && (
            <Box marginTop={1}>
              <Text color={theme.permission}>
                Press <Text bold>Enter</Text> to retry.
              </Text>
            </Box>
          )}
        </Box>
      )

    default:
      return null
  }
}
