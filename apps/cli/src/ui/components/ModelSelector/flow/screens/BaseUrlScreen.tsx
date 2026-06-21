import React from 'react'
import { Box, Newline, Text } from 'ink'

import { providers } from '#core/constants/models'
import TextInput from '#ui-ink/components/TextInput'
import {
  ScreenFrame,
  type ScreenExitState,
} from '#ui-ink/primitives/layout/ScreenFrame'

type Props = {
  theme: any
  exitState: ScreenExitState
  terminalColumns: number
  compactLayout: boolean
  tightLayout: boolean
  containerPaddingY: number
  containerGap: number
  selectedProvider: string
  isLoadingModels: boolean
  modelLoadError: string | null
  // custom-openai
  customBaseUrl: string
  setCustomBaseUrl: (value: string) => void
  handleCustomBaseUrlSubmit: (value: string) => void
  customBaseUrlCursorOffset: number
  setCustomBaseUrlCursorOffset: (value: number) => void
  // general provider base URL
  providerBaseUrl: string
  setProviderBaseUrl: (value: string) => void
  handleProviderBaseUrlSubmit: (value: string) => void
  providerBaseUrlCursorOffset: number
  setProviderBaseUrlCursorOffset: (value: number) => void
}

export function BaseUrlScreen({
  theme,
  exitState,
  terminalColumns,
  compactLayout,
  tightLayout,
  containerPaddingY,
  containerGap,
  selectedProvider,
  isLoadingModels,
  modelLoadError,
  customBaseUrl,
  setCustomBaseUrl,
  handleCustomBaseUrlSubmit,
  customBaseUrlCursorOffset,
  setCustomBaseUrlCursorOffset,
  providerBaseUrl,
  setProviderBaseUrl,
  handleProviderBaseUrlSubmit,
  providerBaseUrlCursorOffset,
  setProviderBaseUrlCursorOffset,
}: Props) {
  const isCustomOpenAI = selectedProvider === 'custom-openai'
  const inputColumns = Math.max(1, Math.min(120, terminalColumns - 10))
  const descriptionWidth = Math.max(1, Math.min(70, terminalColumns - 10))

  // For custom-openai, we still use the old logic with customBaseUrl
  if (isCustomOpenAI) {
    return (
      <ScreenFrame
        title="Custom API Server Setup"
        exitState={exitState}
        paddingX={tightLayout || compactLayout ? 1 : 2}
        paddingY={containerPaddingY}
        gap={containerGap}
      >
        <Box flexDirection="column" gap={containerGap}>
          <Text bold>Enter your custom API URL:</Text>
          {!tightLayout && (
            <Box flexDirection="column" width={descriptionWidth}>
              <Text color={theme.secondaryText}>
                This is the base URL for your OpenAI-compatible API.
                <Newline />
                For example: https://api.example.com/v1
              </Text>
            </Box>
          )}

          <TextInput
            placeholder="https://api.example.com/v1"
            value={customBaseUrl}
            onChange={setCustomBaseUrl}
            onSubmit={handleCustomBaseUrlSubmit}
            columns={inputColumns}
            cursorOffset={customBaseUrlCursorOffset}
            onChangeCursorOffset={setCustomBaseUrlCursorOffset}
            showCursor={!isLoadingModels}
            focus={!isLoadingModels}
          />

          {!tightLayout && (
            <Box marginTop={1}>
              <Text>
                <Text
                  color={
                    isLoadingModels ? theme.secondaryText : theme.suggestion
                  }
                >
                  [Submit Base URL]
                </Text>
                <Text> - Press Enter to continue</Text>
              </Text>
            </Box>
          )}

          <Box marginTop={tightLayout ? 0 : 1}>
            <Text dimColor>
              Press <Text color={theme.suggestion}>Enter</Text> to continue or{' '}
              <Text color={theme.suggestion}>Esc</Text> to go back
            </Text>
          </Box>
        </Box>
      </ScreenFrame>
    )
  }

  // For all other providers, use the new general provider URL configuration
  const providerName = providers[selectedProvider]?.name || selectedProvider
  const defaultUrl = providers[selectedProvider]?.baseURL || ''

  return (
    <ScreenFrame
      title={`${providerName} API Configuration`}
      exitState={exitState}
      paddingX={tightLayout || compactLayout ? 1 : 2}
      paddingY={containerPaddingY}
      gap={containerGap}
    >
      <Box flexDirection="column" gap={containerGap}>
        <Text bold>Configure the API endpoint for {providerName}:</Text>
        {!tightLayout && (
          <Box flexDirection="column" width={descriptionWidth}>
            <Text color={theme.secondaryText}>
              {selectedProvider === 'ollama' ? (
                <>
                  This is the URL of your Ollama server.
                  <Newline />
                  Default is http://localhost:11434/v1 for local Ollama
                  installations.
                </>
              ) : (
                <>
                  This is the base URL for the {providerName} API.
                  <Newline />
                  You can modify this URL or press Enter to use the default.
                </>
              )}
            </Text>
          </Box>
        )}

        <TextInput
          placeholder={defaultUrl}
          value={providerBaseUrl}
          onChange={setProviderBaseUrl}
          onSubmit={handleProviderBaseUrlSubmit}
          columns={inputColumns}
          cursorOffset={providerBaseUrlCursorOffset}
          onChangeCursorOffset={setProviderBaseUrlCursorOffset}
          showCursor={!isLoadingModels}
          focus={!isLoadingModels}
        />

        {!tightLayout && (
          <Box marginTop={1}>
            <Text>
              <Text
                color={isLoadingModels ? theme.secondaryText : theme.suggestion}
              >
                [Submit Base URL]
              </Text>
              <Text> - Press Enter to continue</Text>
            </Text>
          </Box>
        )}

        {isLoadingModels && (
          <Box marginTop={tightLayout ? 0 : 1}>
            <Text color={theme.success}>
              {selectedProvider === 'ollama'
                ? 'Connecting to Ollama server...'
                : `Connecting to ${providerName}...`}
            </Text>
          </Box>
        )}

        {modelLoadError && (
          <Box marginTop={tightLayout ? 0 : 1}>
            <Text color="red">Error: {modelLoadError}</Text>
          </Box>
        )}

        <Box marginTop={tightLayout ? 0 : 1}>
          <Text dimColor>
            Press <Text color={theme.suggestion}>Enter</Text> to continue or{' '}
            <Text color={theme.suggestion}>Esc</Text> to go back
          </Text>
        </Box>
      </Box>
    </ScreenFrame>
  )
}
