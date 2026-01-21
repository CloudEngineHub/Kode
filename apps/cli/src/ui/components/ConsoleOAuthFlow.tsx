import React, { useEffect, useState, useCallback } from 'react'
import { Static, Box, Text } from 'ink'
import { OAuthService, createAndStoreApiKey } from '#core/services/oauth'
import { getTheme } from '#core/utils/theme'
import { ASCII_LOGO } from '#core/constants/product'
import { useTerminalSize } from '#ui-ink/hooks/useTerminalSize'
import { logError } from '#core/utils/log'
import { clearTerminal } from '#cli-utils/terminal'
import { WelcomeBox } from '#ui-ink/components/WelcomeBox'
import { sendNotification } from '#core/services/notifier'
import { ConsoleOAuthStatusMessage } from './ConsoleOAuthStatusMessage'
import { PASTE_HERE_MSG, type OAuthStatus } from './oauthTypes'
import { useKeypress } from '#ui-ink/hooks/useKeypress'

type Props = {
  onDone(): void
}

export function ConsoleOAuthFlow({ onDone }: Props): React.ReactNode {
  const [oauthStatus, setOAuthStatus] = useState<OAuthStatus>({
    state: 'idle',
  })
  const theme = getTheme()

  const [pastedCode, setPastedCode] = useState('')
  const [cursorOffset, setCursorOffset] = useState(0)
  const [oauthService] = useState(() => new OAuthService())
  // After a few seconds we suggest the user to copy/paste url if the
  // browser did not open automatically. In this flow we expect the user to
  // copy the code from the browser and paste it in the terminal
  const [showPastePrompt, setShowPastePrompt] = useState(false)
  // we need a special clearing state to correctly re-render Static elements
  const [isClearing, setIsClearing] = useState(false)

  const textInputColumns = useTerminalSize().columns - PASTE_HERE_MSG.length - 1

  useEffect(() => {
    if (isClearing) {
      clearTerminal()
      setIsClearing(false)
    }
  }, [isClearing])

  // Retry logic
  useEffect(() => {
    if (oauthStatus.state === 'about_to_retry') {
      setIsClearing(true)
      setTimeout(() => {
        setOAuthStatus(oauthStatus.nextState)
      }, 1000)
    }
  }, [oauthStatus])

  useKeypress(async (_, key) => {
    if (key.return) {
      if (oauthStatus.state === 'idle') {
        setOAuthStatus({ state: 'ready_to_start' })
      } else if (oauthStatus.state === 'success') {
        await clearTerminal() // needed to clear out Static components
        onDone()
      } else if (oauthStatus.state === 'error' && oauthStatus.toRetry) {
        setPastedCode('')
        setOAuthStatus({
          state: 'about_to_retry',
          nextState: oauthStatus.toRetry,
        })
      }
    }
  })

  async function handleSubmitCode(value: string, url: string) {
    try {
      // Expecting format "authorizationCode#state" from the authorization callback URL
      const [authorizationCode, state] = value.split('#')

      if (!authorizationCode || !state) {
        setOAuthStatus({
          state: 'error',
          message: 'Invalid code. Please make sure the full code was copied',
          toRetry: { state: 'waiting_for_login', url },
        })
        return
      }

      // Track which path the user is taking (manual code entry)

      oauthService.processCallback({
        authorizationCode,
        state,
        useManualRedirect: true,
      })
    } catch (err) {
      logError(err)
      setOAuthStatus({
        state: 'error',
        message: (err as Error).message,
        toRetry: { state: 'waiting_for_login', url },
      })
    }
  }

  const startOAuth = useCallback(async () => {
    try {
      const result = await oauthService
        .startOAuthFlow(async url => {
          setOAuthStatus({ state: 'waiting_for_login', url })
          setTimeout(() => setShowPastePrompt(true), 3000)
        })
        .catch(err => {
          // Handle token exchange errors specifically
          if (err.message.includes('Token exchange failed')) {
            setOAuthStatus({
              state: 'error',
              message:
                'Failed to exchange authorization code for access token. Please try again.',
              toRetry: { state: 'ready_to_start' },
            })
          } else {
            // Handle other errors
            setOAuthStatus({
              state: 'error',
              message: err.message,
              toRetry: { state: 'ready_to_start' },
            })
          }
          throw err
        })

      setOAuthStatus({ state: 'creating_api_key' })

      const apiKey = await createAndStoreApiKey(result.accessToken).catch(
        err => {
          setOAuthStatus({
            state: 'error',
            message: 'Failed to create API key: ' + err.message,
            toRetry: { state: 'ready_to_start' },
          })

          throw err
        },
      )

      if (apiKey) {
        setOAuthStatus({ state: 'success', apiKey })
        sendNotification({ message: 'Kode login successful' })
      } else {
        setOAuthStatus({
          state: 'error',
          message:
            "Unable to create API key. The server accepted the request but didn't return a key.",
          toRetry: { state: 'ready_to_start' },
        })
      }
    } catch (err) {}
  }, [oauthService, setShowPastePrompt])

  useEffect(() => {
    if (oauthStatus.state === 'ready_to_start') {
      startOAuth()
    }
  }, [oauthStatus.state, startOAuth])

  // We need to render the copy-able URL statically to prevent Ink <Text> from inserting
  // newlines in the middle of the URL (this breaks Safari). Because <Static> components are
  // only rendered once top-to-bottom, we also need to make everything above the URL static.
  const staticItems: Record<string, React.JSX.Element> = {}
  if (!isClearing) {
    staticItems.header = (
      <Box key="header" flexDirection="column" gap={1}>
        <WelcomeBox />
        <Box paddingBottom={1} paddingLeft={1}>
          <Text color={theme.kode}>{ASCII_LOGO}</Text>
        </Box>
      </Box>
    )
  }
  if (oauthStatus.state === 'waiting_for_login' && showPastePrompt) {
    staticItems.urlToCopy = (
      <Box flexDirection="column" key="urlToCopy" gap={1} paddingBottom={1}>
        <Box paddingX={1}>
          <Text dimColor>
            Browser didn&apos;t open? Use the url below to sign in:
          </Text>
        </Box>
        <Box width={1000}>
          <Text dimColor>{oauthStatus.url}</Text>
        </Box>
      </Box>
    )
  }
  return (
    <Box flexDirection="column" gap={1}>
      <Static
        items={Object.keys(staticItems)}
        children={(item: string) => staticItems[item]}
      />
      <Box paddingLeft={1} flexDirection="column" gap={1}>
        <ConsoleOAuthStatusMessage
          oauthStatus={oauthStatus}
          theme={theme}
          showPastePrompt={showPastePrompt}
          pastedCode={pastedCode}
          onPastedCodeChange={setPastedCode}
          cursorOffset={cursorOffset}
          onCursorOffsetChange={setCursorOffset}
          textInputColumns={textInputColumns}
          onSubmitCode={handleSubmitCode}
        />
      </Box>
    </Box>
  )
}
