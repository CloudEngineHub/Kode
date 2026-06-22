import { Box, Text } from 'ink'
import * as React from 'react'
import { CompactModeIndicator } from '#ui-ink/components/ModeIndicator'
import { SentryErrorBoundary } from '#ui-ink/components/SentryErrorBoundary'
import TextInput from '#ui-ink/components/TextInput'
import { TokenWarning } from '#ui-ink/components/TokenWarning'
import { useTerminalSize } from '#ui-ink/hooks/useTerminalSize'
import type { Key } from '#ui-ink/hooks/useKeypress'
import type { PermissionMode } from '#core/types/PermissionMode'
import type { Theme } from '#core/utils/theme'
import type { ClipboardImage } from '#core/utils/image/media'
import type { PromptMode } from './types'
import { PromptInputCompletionPanel } from './PromptInputCompletionPanel'
import { PendingPrompts } from './PendingPrompts'
import { QueuedPrompts } from './QueuedPrompts'

type ModelInfo = {
  name: string
  provider: string
  contextLength: number
  currentTokens: number
} | null

type ExitMessageState = { show: boolean; key?: string }
type InlineMessageState = { show: boolean; text?: string }
type ToastMessageState = {
  show: boolean
  text?: string
  kind?: 'info' | 'success' | 'warning' | 'error'
}

type Suggestion = {
  type: string
  value: string
  displayValue: string
  metadata?: { color?: string }
}

export function PromptInputView({
  mode,
  theme,
  currentPwd,
  modelInfo,
  input,
  cursorOffset,
  setCursorOffset,
  onSubmit,
  onChange,
  isEditingExternally,
  isDisabled,
  isLoading,
  pendingPrompts,
  queuedPrompts,
  completionActive,
  historyIndex,
  suggestions,
  selectedIndex,
  emptyDirMessage,
  handleHistoryUp,
  handleHistoryDown,
  resetHistory,
  placeholder,
  submitCount,
  onExit,
  onExitMessage,
  onMessage,
  onImagePaste,
  onTextPaste,
  onSpecialKey,
  exitMessage,
  message,
  clearInputPending,
  rewindPending,
  modelSwitchMessage,
  toastMessage,
  statusLine,
  statusLinePadding,
  currentMode,
  modeCycleShortcutText,
  showQuickModelSwitchShortcut,
  tokenUsage,
  textInputColumns,
  textInputMaxHeight,
  completionReservedRows,
  isInFastBrowseMode,
}: {
  mode: PromptMode
  theme: Theme
  currentPwd: string
  modelInfo: ModelInfo
  input: string
  cursorOffset: number
  setCursorOffset: (offset: number) => void
  onSubmit: (value: string, isSubmittingSlashCommand?: boolean) => void
  onChange: (value: string) => void
  isEditingExternally: boolean
  isDisabled: boolean
  isLoading: boolean
  pendingPrompts: string[]
  queuedPrompts: string[]
  completionActive: boolean
  historyIndex: number
  suggestions: Suggestion[]
  selectedIndex: number
  emptyDirMessage: string
  handleHistoryUp: () => void
  handleHistoryDown: () => void
  resetHistory: () => void
  placeholder: string
  submitCount: number
  onExit: () => never
  onExitMessage: (show: boolean, key?: string) => void
  onMessage: (show: boolean, text?: string) => void
  onImagePaste: (image: ClipboardImage) => string | void
  onTextPaste: (text: string) => void
  onSpecialKey: (input: string, key: Key) => boolean
  exitMessage: ExitMessageState
  message: InlineMessageState
  clearInputPending: boolean
  rewindPending: boolean
  modelSwitchMessage: InlineMessageState
  toastMessage: ToastMessageState
  statusLine: string | null
  statusLinePadding: number
  currentMode: PermissionMode
  modeCycleShortcutText: string
  showQuickModelSwitchShortcut: boolean
  tokenUsage: number
  textInputColumns: number
  textInputMaxHeight: number
  completionReservedRows: number
  isInFastBrowseMode: () => boolean
}): React.ReactNode {
  const { rows, columns } = useTerminalSize()
  const compact = rows < 16
  const showStatusLine = rows > 8

  return (
    <Box flexDirection="column">
      {/* Model info - top right of input */}
      {modelInfo && !compact && (
        <Box justifyContent="flex-end" flexDirection="row">
          <Text dimColor wrap="truncate-end">
            [{modelInfo.provider}] {modelInfo.name}:{' '}
            {Math.round(modelInfo.currentTokens / 1000)}k /{' '}
            {Math.round(modelInfo.contextLength / 1000)}k
          </Text>
        </Box>
      )}

      {pendingPrompts.length > 0 && (
        <PendingPrompts pendingPrompts={pendingPrompts} width={columns} />
      )}

      {queuedPrompts.length > 0 && (
        <QueuedPrompts queuedPrompts={queuedPrompts} width={columns} />
      )}

      {/* Input box */}
      <Box
        alignItems="flex-start"
        justifyContent="flex-start"
        borderTop={true}
        borderBottom={true}
        borderLeft={false}
        borderRight={false}
        borderColor={
          mode === 'bash' || mode === 'background'
            ? theme.bashBorder
            : mode === 'koding'
              ? theme.notingBorder
              : theme.inputBorder
        }
        borderDimColor={false}
        borderStyle="single"
        width="100%"
      >
        <Box
          alignItems="flex-start"
          alignSelf="flex-start"
          flexWrap="nowrap"
          justifyContent="flex-start"
          width={2}
        >
          {mode === 'bash' ? (
            <Text color={theme.bashBorder}>$&nbsp;</Text>
          ) : mode === 'background' ? (
            <Text color={theme.bashBorder}>&amp;&nbsp;</Text>
          ) : mode === 'koding' ? (
            <Text color={theme.noting}>#&nbsp;</Text>
          ) : (
            <Text color={isLoading ? theme.secondaryText : undefined}>
              {'\u276F'}&nbsp;
            </Text>
          )}
        </Box>
        <Box paddingRight={1}>
          <TextInput
            multiline
            focus={!isEditingExternally}
            onSubmit={onSubmit}
            onChange={onChange}
            value={input}
            onHistoryUp={handleHistoryUp}
            onHistoryDown={handleHistoryDown}
            onHistoryReset={resetHistory}
            placeholder={submitCount > 0 ? undefined : placeholder}
            onExit={onExit}
            onExitMessage={onExitMessage}
            onMessage={onMessage}
            onImagePaste={onImagePaste}
            columns={textInputColumns}
            maxHeight={textInputMaxHeight}
            isDimmed={isDisabled || isLoading || isEditingExternally}
            disableCursorMovementForUpDownKeys={() =>
              completionActive ||
              historyIndex > 0 ||
              !input.includes('\n') ||
              isInFastBrowseMode()
            }
            cursorOffset={cursorOffset}
            onChangeCursorOffset={setCursorOffset}
            onPaste={onTextPaste}
            onSpecialKey={onSpecialKey}
          />
        </Box>
      </Box>

      {/* PWD line - first line below input */}
      {!compact && (
        <Box flexDirection="row" paddingX={1}>
          <Text dimColor wrap="truncate-end">
            {currentPwd}
          </Text>
        </Box>
      )}

      {/* Status line - below PWD */}
      {!completionActive && suggestions.length === 0 && showStatusLine && (
        <Box flexDirection="column">
          <Box
            flexDirection="row"
            justifyContent="space-between"
            paddingX={1 + Math.max(0, statusLinePadding)}
          >
            <Box justifyContent="flex-start" gap={1}>
              {exitMessage.show ? (
                <Text dimColor wrap="truncate-end">
                  Press {exitMessage.key} again to exit
                </Text>
              ) : message.show ? (
                <Text dimColor wrap="truncate-end">
                  {message.text}
                </Text>
              ) : rewindPending ? (
                <Text dimColor wrap="truncate-end">
                  Press Escape again to rewind
                </Text>
              ) : clearInputPending ? (
                <Text dimColor wrap="truncate-end">
                  Press Escape again to clear input
                </Text>
              ) : modelSwitchMessage.show ? (
                <Text color={theme.success} wrap="truncate-end">
                  {modelSwitchMessage.text}
                </Text>
              ) : toastMessage.show ? (
                <Text
                  color={
                    toastMessage.kind === 'error'
                      ? theme.error
                      : toastMessage.kind === 'warning'
                        ? theme.warning
                        : toastMessage.kind === 'success'
                          ? theme.success
                          : theme.secondaryText
                  }
                  wrap="truncate-end"
                >
                  {toastMessage.text}
                </Text>
              ) : statusLine ? (
                <Text dimColor wrap="truncate-end">
                  {statusLine}
                </Text>
              ) : null}
            </Box>
            {!compact && (
              <SentryErrorBoundary
                children={
                  <Box justifyContent="flex-end" gap={1}>
                    <TokenWarning
                      tokenUsage={tokenUsage}
                      contextLimit={modelInfo?.contextLength}
                    />
                  </Box>
                }
              />
            )}
          </Box>
          {!compact && mode === 'prompt' && currentMode !== 'default' && (
            <Box paddingX={1}>
              <CompactModeIndicator />
            </Box>
          )}
        </Box>
      )}

      {completionActive && suggestions.length > 0 && (
        <PromptInputCompletionPanel
          theme={theme}
          suggestions={suggestions}
          selectedIndex={selectedIndex}
          emptyDirMessage={emptyDirMessage}
          tokenUsage={tokenUsage}
          contextLimit={modelInfo?.contextLength}
          reservedRows={completionReservedRows}
        />
      )}
    </Box>
  )
}
