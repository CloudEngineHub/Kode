import { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import React, { useMemo } from 'react'
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

const FINAL_MARKDOWN_FOLD_LINE_THRESHOLD = 220
const FINAL_MARKDOWN_VISIBLE_LINES = 120
const FINAL_MARKDOWN_FOLD_CHAR_THRESHOLD = 20000
const FINAL_MARKDOWN_VISIBLE_CHARS = 12000
const TOOL_PROGRESS_VISIBLE_LINES = 8

export function prepareToolProgressTextForRender(raw: string): {
  summary: string
  details: string[]
  hiddenLines: number
} {
  const lines = raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trimEnd())

  const firstContentIndex = lines.findIndex(line => line.trim().length > 0)
  if (firstContentIndex < 0) {
    return { summary: '', details: [], hiddenLines: 0 }
  }

  const contentLines = lines
    .slice(firstContentIndex)
    .filter((line, index, list) => {
      if (line.trim().length > 0) return true
      return index < list.length - 1
    })

  const visibleLines = contentLines.slice(0, TOOL_PROGRESS_VISIBLE_LINES)
  const hiddenLines = Math.max(0, contentLines.length - visibleLines.length)
  const [summary = '', ...details] = visibleLines

  return {
    summary: summary.trim(),
    details: details.map(line => line.trim()),
    hiddenLines,
  }
}

export function prepareAssistantMarkdownTextForRender(text: string): {
  text: string
  folded: boolean
} {
  if (
    text.length <= FINAL_MARKDOWN_FOLD_CHAR_THRESHOLD &&
    text.split(/\r?\n/, FINAL_MARKDOWN_FOLD_LINE_THRESHOLD + 1).length <=
      FINAL_MARKDOWN_FOLD_LINE_THRESHOLD
  ) {
    return { text, folded: false }
  }

  const lines = text.split(/\r?\n/)
  let visibleText: string
  let hiddenDescription: string

  if (lines.length > FINAL_MARKDOWN_FOLD_LINE_THRESHOLD) {
    const visibleLines = lines.slice(0, FINAL_MARKDOWN_VISIBLE_LINES)
    visibleText = visibleLines.join('\n')
    hiddenDescription = `${lines.length - visibleLines.length} lines hidden`
  } else {
    visibleText = text.slice(0, FINAL_MARKDOWN_VISIBLE_CHARS)
    hiddenDescription = `${text.length - visibleText.length} characters hidden`
  }

  const fenceCount = visibleText
    .split(/\r?\n/)
    .filter(line => line.trimStart().startsWith('```')).length
  const closedVisibleText =
    fenceCount % 2 === 1 ? `${visibleText}\n\`\`\`` : visibleText

  return {
    text: `${closedVisibleText}\n\n[Output folded: ${hiddenDescription}. Full content is available in the transcript.]`,
    folded: true,
  }
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
    const prepared = prepareToolProgressTextForRender(raw)
    if (prepared.summary.length === 0) return null
    const theme = getTheme()
    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Text color={theme.secondaryText}> Progress </Text>
          <Text color={theme.secondaryText} wrap="truncate-end">
            {prepared.summary}
          </Text>
        </Box>
        {prepared.details.map((line, index) => (
          <Text
            key={`${index}:${line}`}
            color={theme.secondaryText}
            wrap="truncate-end"
          >
            {`    ${line}`}
          </Text>
        ))}
        {prepared.hiddenLines > 0 && (
          <Text color={theme.secondaryText}>
            {`    ... ${prepared.hiddenLines} more progress lines`}
          </Text>
        )}
      </Box>
    )
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
      <AssistantBackgroundTaskOutputMessage
        content={text}
        verbose={verbose}
        maxHeight={maxHeight}
      />
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
      return (
        <AssistantMarkdownContent
          text={text}
          contentWidth={contentWidth}
          maxHeight={maxHeight}
          isTransient={Boolean(isTransient)}
          addMargin={addMargin}
          shouldShowDot={shouldShowDot}
          costUSD={costUSD}
          durationMs={durationMs}
          debug={debug}
        />
      )
  }
}

function AssistantMarkdownContent({
  text,
  contentWidth,
  maxHeight,
  isTransient,
  addMargin,
  shouldShowDot,
  costUSD,
  durationMs,
  debug,
}: {
  text: string
  contentWidth: number
  maxHeight?: number
  isTransient: boolean
  addMargin: boolean
  shouldShowDot: boolean
  costUSD: number
  durationMs: number
  debug: boolean
}): React.ReactNode {
  const renderText = useMemo(
    () =>
      isTransient
        ? { text, folded: false }
        : prepareAssistantMarkdownTextForRender(text),
    [isTransient, text],
  )
  const content = useMemo(
    () => applyMarkdown(renderText.text),
    [renderText.text],
  )

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
