import { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import React from 'react'
import { AssistantBashOutputMessage } from './AssistantBashOutputMessage'
import { AssistantBackgroundTaskOutputMessage } from './AssistantBackgroundTaskOutputMessage'
import { AssistantLocalCommandOutputMessage } from './AssistantLocalCommandOutputMessage'
import { getTheme } from '#core/utils/theme'
import { Box, Text } from 'ink'
import { Cost } from '#ui-ink/components/Cost'
import { MaxSizedText } from '#ui-ink/components/MaxSizedText'
import {
  API_ERROR_MESSAGE_PREFIX,
  CREDIT_BALANCE_TOO_LOW_ERROR_MESSAGE,
  INVALID_API_KEY_ERROR_MESSAGE,
  PROMPT_TOO_LONG_ERROR_MESSAGE,
} from '#core/ai/constants'
import {
  CANCEL_MESSAGE,
  INTERRUPT_MESSAGE,
  INTERRUPT_MESSAGE_FOR_TOOL_USE,
  isEmptyMessageText,
  NO_RESPONSE_REQUESTED,
  extractTag,
} from '#core/utils/messages'
import { CIRCLE } from '#core/constants/figures'
import { applyMarkdown } from '#core/utils/markdown'
import { useTerminalSize } from '#ui-ink/hooks/useTerminalSize'
import { useTransientViewport } from '#ui-ink/contexts/TransientViewportContext'

type Props = {
  param: TextBlockParam
  costUSD: number
  durationMs: number
  debug: boolean
  addMargin: boolean
  shouldShowDot: boolean
  verbose?: boolean
  width?: number | string
  isTransient?: boolean
}

export function AssistantTextMessage({
  param: { text },
  costUSD,
  durationMs,
  debug,
  addMargin,
  shouldShowDot,
  verbose,
  isTransient,
}: Props): React.ReactNode {
  const { columns, rows } = useTerminalSize()
  const transientViewport = useTransientViewport()
  if (isEmptyMessageText(text)) {
    return null
  }

  // Tool progress messages should render as raw text (no markdown parsing).
  if (text.startsWith('<tool-progress>')) {
    const raw = extractTag(text, 'tool-progress') ?? ''
    if (raw.trim().length === 0) return null
    return <Text color={getTheme().secondaryText}>{raw}</Text>
  }

  // Compatibility: background bash completion notification.
  if (text.startsWith('<bash-notification>')) {
    const status = (extractTag(text, 'status') ?? '').trim()
    const summary = (extractTag(text, 'summary') ?? '').trim()
    if (!summary) return null

    const theme = getTheme()
    const color =
      status === 'completed'
        ? theme.success
        : status === 'failed'
          ? theme.error
          : status === 'killed'
            ? theme.warning
            : theme.secondaryText

    return (
      <Box>
        <Text color={color}>&nbsp;&nbsp;⎿ &nbsp;</Text>
        <Text>{summary}</Text>
      </Box>
    )
  }

  // Compatibility: async agent completion notification.
  if (text.startsWith('<agent-notification>')) {
    const status = (extractTag(text, 'status') ?? '').trim()
    const summary = (extractTag(text, 'summary') ?? '').trim()
    if (!summary) return null

    const theme = getTheme()
    const color =
      status === 'completed'
        ? theme.success
        : status === 'failed'
          ? theme.error
          : status === 'killed'
            ? theme.warning
            : theme.secondaryText

    return (
      <Box>
        <Text color={color}>&nbsp;&nbsp;⎿ &nbsp;</Text>
        <Text>{summary}</Text>
      </Box>
    )
  }

  // Compatibility: remote task completion notification.
  if (text.startsWith('<task-notification>')) {
    const status = (extractTag(text, 'status') ?? '').trim()
    const summary = (extractTag(text, 'summary') ?? '').trim()
    if (!summary) return null

    const theme = getTheme()
    const color =
      status === 'completed'
        ? theme.success
        : status === 'failed'
          ? theme.error
          : status === 'killed'
            ? theme.warning
            : theme.secondaryText

    return (
      <Box>
        <Text color={color}>&nbsp;&nbsp;⎿ &nbsp;</Text>
        <Text>{summary}</Text>
      </Box>
    )
  }

  const contentWidth = Math.max(1, columns - 6)
  const defaultTransientMaxHeight = Math.max(1, rows - 10)
  const viewportMaxHeight = transientViewport.maxHeight
  const maxHeight = isTransient
    ? Math.max(
        1,
        Math.min(defaultTransientMaxHeight, viewportMaxHeight ?? Infinity),
      )
    : undefined

  // Show bash output
  if (text.startsWith('<bash-stdout') || text.startsWith('<bash-stderr')) {
    return (
      <AssistantBashOutputMessage
        content={text}
        verbose={verbose}
        maxHeight={maxHeight}
        maxWidth={contentWidth}
      />
    )
  }

  // Show background task output
  if (text.startsWith('<background-task-output')) {
    return (
      <AssistantBackgroundTaskOutputMessage content={text} verbose={verbose} />
    )
  }

  // Show command output
  if (
    text.startsWith('<local-command-stdout') ||
    text.startsWith('<local-command-stderr')
  ) {
    return (
      <AssistantLocalCommandOutputMessage
        content={text}
        maxHeight={maxHeight}
        maxWidth={contentWidth}
      />
    )
  }

  if (text.startsWith(API_ERROR_MESSAGE_PREFIX)) {
    return (
      <Text>
        &nbsp;&nbsp;⎿ &nbsp;
        <Text color={getTheme().error}>
          {text === API_ERROR_MESSAGE_PREFIX
            ? `${API_ERROR_MESSAGE_PREFIX}: Please wait a moment and try again.`
            : text}
        </Text>
      </Text>
    )
  }

  switch (text) {
    // Local JSX commands don't need a response, but we still want the assistant to see them
    // Tool results render their own interrupt messages
    case NO_RESPONSE_REQUESTED:
    case INTERRUPT_MESSAGE_FOR_TOOL_USE:
      return null

    case INTERRUPT_MESSAGE:
    case CANCEL_MESSAGE:
      return (
        <Text>
          &nbsp;&nbsp;⎿ &nbsp;
          <Text color={getTheme().error}>Interrupted by user</Text>
        </Text>
      )

    case PROMPT_TOO_LONG_ERROR_MESSAGE:
      return (
        <Text>
          &nbsp;&nbsp;⎿ &nbsp;
          <Text color={getTheme().error}>
            Context low &middot; Run /compact to compact & continue
          </Text>
        </Text>
      )

    case CREDIT_BALANCE_TOO_LOW_ERROR_MESSAGE:
      return (
        <Text>
          &nbsp;&nbsp;⎿ &nbsp;
          <Text color={getTheme().error}>
            Credit balance too low &middot; Add funds in your provider billing
            settings
          </Text>
        </Text>
      )

    case INVALID_API_KEY_ERROR_MESSAGE:
      return (
        <Text>
          &nbsp;&nbsp;⎿ &nbsp;
          <Text color={getTheme().error}>{INVALID_API_KEY_ERROR_MESSAGE}</Text>
        </Text>
      )

    default:
      const content = applyMarkdown(text)
      return (
        <Box
          alignItems="flex-start"
          flexDirection="row"
          justifyContent="space-between"
          marginTop={addMargin ? 1 : 0}
          width="100%"
        >
          <Box flexDirection="row">
            {shouldShowDot && (
              <Box minWidth={2}>
                <Text color={getTheme().kode}>{CIRCLE}</Text>
              </Box>
            )}
            <Box flexDirection="column" width={contentWidth}>
              {maxHeight ? (
                <MaxSizedText
                  text={content}
                  maxWidth={contentWidth}
                  maxHeight={maxHeight}
                  overflowDirection="bottom"
                />
              ) : (
                <Text>{content}</Text>
              )}
            </Box>
          </Box>
          <Cost costUSD={costUSD} durationMs={durationMs} debug={debug} />
        </Box>
      )
  }
}
