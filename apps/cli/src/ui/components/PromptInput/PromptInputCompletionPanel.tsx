import { Box, Text } from 'ink'
import * as React from 'react'
import { SentryErrorBoundary } from '#ui-ink/components/SentryErrorBoundary'
import { TokenWarning } from '#ui-ink/components/TokenWarning'
import type { Theme } from '#core/utils/theme'
import { computeResponsiveRows } from '#ui-ink/primitives/layout/viewportRows'
import wrapAnsi from 'wrap-ansi'

type Suggestion = {
  type: string
  value: string
  displayValue: string
  description?: string
  metadata?: { color?: string }
}

const MAX_COMPLETION_PANEL_ROWS = 10

// 使用 React.memo 优化建议列表渲染
const SuggestionItem = React.memo(
  ({
    suggestion,
    isSelected,
    theme,
    maxWidth,
  }: {
    suggestion: Suggestion
    isSelected: boolean
    theme: Theme
    maxWidth: number
  }) => {
    const isAgent = suggestion.type === 'agent'
    const displayColor = isSelected
      ? theme.suggestion
      : isAgent && suggestion.metadata?.color
        ? suggestion.metadata.color
        : undefined

    return (
      <Box flexDirection="row" width={maxWidth} overflow="hidden">
        <Text
          bold
          color={displayColor}
          dimColor={!isSelected && !displayColor}
          wrap="truncate-end"
        >
          {isSelected ? '> ' : '  '}
          {suggestion.displayValue}
        </Text>
      </Box>
    )
  },
  (prevProps, nextProps) => {
    // 只在选中状态或建议内容改变时重新渲染
    return (
      prevProps.isSelected === nextProps.isSelected &&
      prevProps.suggestion.value === nextProps.suggestion.value &&
      prevProps.suggestion.displayValue === nextProps.suggestion.displayValue &&
      prevProps.maxWidth === nextProps.maxWidth
    )
  },
)

SuggestionItem.displayName = 'SuggestionItem'

// 使用 React.memo 优化帮助文本组件
const HelpText = React.memo(
  ({
    emptyDirMessage,
    selectedSuggestion,
    maxWidth,
    theme,
  }: {
    emptyDirMessage: string
    selectedSuggestion?: Suggestion
    maxWidth: number
    theme: Theme
  }) => {
    const getHelpMessage = () => {
      if (emptyDirMessage) return emptyDirMessage
      if (!selectedSuggestion) {
        return '↑↓ navigate • → accept • Tab cycle • Esc close'
      }
      if (selectedSuggestion.value.endsWith('/')) {
        return '→ enter directory • ↑↓ navigate • Tab cycle • Esc close'
      }
      if (selectedSuggestion.type === 'agent') {
        return '→ select agent • ↑↓ navigate • Tab cycle • Esc close'
      }
      return '→ insert reference • ↑↓ navigate • Tab cycle • Esc close'
    }

    const commandDescription =
      !emptyDirMessage &&
      selectedSuggestion?.type === 'command' &&
      typeof selectedSuggestion.description === 'string'
        ? selectedSuggestion.description.trim()
        : ''

    if (commandDescription) {
      const wrapped = wrapAnsi(commandDescription, Math.max(1, maxWidth), {
        hard: true,
        trim: false,
      })
      const lines = wrapped.split('\n')

      // Keep help text to a single terminal row to avoid layout jumps/flicker
      // when the completion panel is shown on small terminals.
      const firstLine = (lines[0] ?? '').replace(/\s+$/g, '')
      const limited =
        lines.length > 1 && firstLine.length > 0 ? `${firstLine}…` : firstLine
      return (
        <Text dimColor wrap="truncate-end">
          {limited}
        </Text>
      )
    }

    return (
      <Text
        dimColor={!emptyDirMessage}
        color={emptyDirMessage ? theme.warning : undefined}
        wrap="truncate-end"
      >
        {getHelpMessage()}
      </Text>
    )
  },
  (prevProps, nextProps) => {
    return (
      prevProps.emptyDirMessage === nextProps.emptyDirMessage &&
      prevProps.selectedSuggestion?.value ===
        nextProps.selectedSuggestion?.value &&
      prevProps.selectedSuggestion?.description ===
        nextProps.selectedSuggestion?.description &&
      prevProps.maxWidth === nextProps.maxWidth &&
      prevProps.theme === nextProps.theme
    )
  },
)

HelpText.displayName = 'HelpText'

export function __getSuggestionWindowForTests(args: {
  rows: number
  selectedIndex: number
  suggestionCount: number
  reservedRows?: number
}) {
  const reservedRows = Math.max(0, args.reservedRows ?? 10)
  const panelRows = computeResponsiveRows({
    rows: args.rows,
    reservedRows,
    minRows: 1,
    maxRows: MAX_COMPLETION_PANEL_ROWS,
  })
  const showHelp = panelRows >= 4
  const helpRows = showHelp ? 1 : 0
  const listRows = Math.max(1, panelRows - helpRows)

  const suggestionCount = Math.max(0, args.suggestionCount)
  const selectedIndex = Math.max(
    0,
    Math.min(args.selectedIndex, Math.max(0, suggestionCount - 1)),
  )

  if (suggestionCount === 0) {
    return {
      startIndex: 0,
      endIndex: 0,
      hiddenAbove: 0,
      hiddenBelow: 0,
      showHelp,
      showTopEllipsis: false,
      showBottomEllipsis: false,
    }
  }

  const canShowEllipsis = listRows >= 3
  let showTopEllipsis = canShowEllipsis
  let showBottomEllipsis = canShowEllipsis

  let startIndex = 0
  let endIndex = 0
  let hiddenAbove = 0
  let hiddenBelow = 0

  for (let i = 0; i < 3; i += 1) {
    const ellipsisRows =
      (showTopEllipsis ? 1 : 0) + (showBottomEllipsis ? 1 : 0)
    const visibleCount = Math.max(
      1,
      Math.min(suggestionCount, listRows - ellipsisRows),
    )

    startIndex = Math.max(
      0,
      Math.min(
        selectedIndex - Math.floor(visibleCount / 2),
        suggestionCount - visibleCount,
      ),
    )
    endIndex = startIndex + visibleCount
    hiddenAbove = startIndex
    hiddenBelow = Math.max(0, suggestionCount - endIndex)

    const nextShowTop = canShowEllipsis && hiddenAbove > 0
    const nextShowBottom = canShowEllipsis && hiddenBelow > 0

    if (
      nextShowTop === showTopEllipsis &&
      nextShowBottom === showBottomEllipsis
    ) {
      break
    }
    showTopEllipsis = nextShowTop
    showBottomEllipsis = nextShowBottom
  }

  return {
    startIndex,
    endIndex,
    hiddenAbove,
    hiddenBelow,
    showHelp,
    showTopEllipsis,
    showBottomEllipsis,
  }
}

export const PromptInputCompletionPanel = React.memo(
  function PromptInputCompletionPanel({
    theme,
    suggestions,
    selectedIndex,
    emptyDirMessage,
    tokenUsage,
    contextLimit,
    reservedRows = 10,
    rows,
    columns,
  }: {
    theme: Theme
    suggestions: Suggestion[]
    selectedIndex: number
    emptyDirMessage: string
    tokenUsage: number
    contextLimit?: number
    reservedRows?: number
    rows: number
    columns: number
  }): React.ReactNode {
    const panelWidth = Math.max(1, columns)
    const horizontalPadding = panelWidth >= 8 ? 2 : panelWidth >= 4 ? 1 : 0
    const innerWidth = Math.max(1, panelWidth - horizontalPadding * 2)
    const showTokenWarning = innerWidth >= 20
    const tokenWarningWidth = showTokenWarning
      ? Math.min(32, Math.max(16, Math.floor(innerWidth * 0.42)))
      : 0
    const leftWidth = Math.max(
      1,
      showTokenWarning ? innerWidth - tokenWarningWidth - 1 : innerWidth,
    )
    const window = __getSuggestionWindowForTests({
      rows,
      selectedIndex,
      suggestionCount: suggestions.length,
      reservedRows,
    })
    const visibleSuggestions = suggestions.slice(
      window.startIndex,
      window.endIndex,
    )

    const selectedSuggestion = suggestions[selectedIndex]

    return (
      <Box
        width={panelWidth}
        overflow="hidden"
        flexDirection="row"
        paddingX={horizontalPadding}
      >
        <Box flexDirection="column" width={leftWidth} overflow="hidden">
          {window.showTopEllipsis && window.hiddenAbove > 0 && (
            <Text
              dimColor
              wrap="truncate-end"
            >{`... ${window.hiddenAbove} more above ...`}</Text>
          )}
          {visibleSuggestions.map((suggestion, index) => (
            <SuggestionItem
              key={`${suggestion.type}-${suggestion.value}-${window.startIndex + index}`}
              suggestion={suggestion}
              isSelected={window.startIndex + index === selectedIndex}
              theme={theme}
              maxWidth={leftWidth}
            />
          ))}
          {window.showBottomEllipsis && window.hiddenBelow > 0 && (
            <Text
              dimColor
              wrap="truncate-end"
            >{`... ${window.hiddenBelow} more below ...`}</Text>
          )}
          {window.showHelp && (
            <HelpText
              emptyDirMessage={emptyDirMessage}
              selectedSuggestion={selectedSuggestion}
              maxWidth={leftWidth}
              theme={theme}
            />
          )}
        </Box>
        {showTokenWarning && (
          <Box
            width={tokenWarningWidth}
            overflow="hidden"
            justifyContent="flex-end"
            marginLeft={1}
            flexShrink={0}
          >
            <SentryErrorBoundary
              children={
                <TokenWarning
                  tokenUsage={tokenUsage}
                  contextLimit={contextLimit}
                />
              }
            />
          </Box>
        )}
      </Box>
    )
  },
  (prevProps, nextProps) => {
    // 只在这些关键属性改变时重新渲染整个面板（保证正确性：不要对 suggestions 做不安全的“抽样比较”）
    return (
      prevProps.theme === nextProps.theme &&
      prevProps.selectedIndex === nextProps.selectedIndex &&
      prevProps.suggestions === nextProps.suggestions &&
      prevProps.emptyDirMessage === nextProps.emptyDirMessage &&
      prevProps.tokenUsage === nextProps.tokenUsage &&
      prevProps.contextLimit === nextProps.contextLimit &&
      prevProps.reservedRows === nextProps.reservedRows &&
      prevProps.rows === nextProps.rows &&
      prevProps.columns === nextProps.columns
    )
  },
)
