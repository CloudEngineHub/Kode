import * as React from 'react'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { countTokens } from '#core/utils/tokens'
import { getTheme } from '#core/utils/theme'
import { getModelManager } from '#core/utils/model'
import { logStartupProfile } from '#core/utils/startupProfile'
import { getCwd } from '#core/utils/state'
import { usePermissionContext } from '#ui-ink/context/PermissionContext'
import { useArrowKeyHistory } from '#ui-ink/hooks/useArrowKeyHistory'
import { useDoublePress } from '#ui-ink/hooks/useDoublePress'
import { useStatusLine } from '#ui-ink/hooks/useStatusLine'
import { useTerminalSize } from '#ui-ink/hooks/useTerminalSize'
import { useUnifiedCompletion } from '#ui-ink/hooks/useUnifiedCompletion'
import { useKeypress, type Key } from '#ui-ink/hooks/useKeypress'
import { getPermissionModeCycleShortcut } from '#ui-ink/utils/permissionModeCycleShortcut'
import { getPromptInputSpecialKeyAction } from '#ui-ink/utils/promptInputSpecialKey'
import { setTerminalTitle } from '#cli-utils/terminal'
import { countWrappedLines } from '#cli-utils/Cursor'
import { submitPrompt } from './submit'
import { usePromptPastes } from './pastes'
import type { PromptInputProps, PromptMode } from './types'
import { PromptInputView } from './PromptInputView'
import { useExternalEdit } from './useExternalEdit'
import { useQuickModelSwitch } from './useQuickModelSwitch'

function exit(): never {
  setTerminalTitle('')
  process.exit(0)
}

function toPromptMode(value: string): { mode: PromptMode; text: string } {
  if (value.startsWith('!')) return { mode: 'bash', text: value.slice(1) }
  if (value.startsWith('#')) return { mode: 'koding', text: value.slice(1) }
  return { mode: 'prompt', text: value }
}

export function __adjustCursorOffsetForPromptPrefixForTests(args: {
  value: string
  nextText: string
  previousOffset: number
}): number {
  if (args.nextText === args.value) return args.previousOffset
  const removedChars = Math.max(0, args.value.length - args.nextText.length)
  if (removedChars === 0) return args.previousOffset
  return Math.max(0, args.previousOffset - removedChars)
}

export function PromptInput({
  commands,
  forkNumber,
  messageLogName,
  disableSlashCommands,
  isDisabled,
  isLoading,
  onQuery,
  verbose,
  messages,
  setToolJSX,
  tools,
  input,
  onInputChange,
  mode,
  onModeChange,
  submitCount,
  onSubmitCountChange,
  setIsLoading,
  abortController,
  setAbortController,
  onShowMessageSelector,
  setForkConvoWithMessagesOnTheNextRender,
  readFileTimestamps,
  onModelChange,
}: PromptInputProps): React.ReactNode {
  useEffect(() => {
    if (!isDisabled && !isLoading) {
      logStartupProfile('prompt_ready')
    }
  }, [isDisabled, isLoading])

  const [exitMessage, setExitMessage] = useState<{
    show: boolean
    key?: string
  }>({ show: false })
  const [rewindMessagePending, setRewindMessagePending] = useState(false)
  const [message, setMessage] = useState<{ show: boolean; text?: string }>({
    show: false,
  })
  const [modelSwitchMessage, setModelSwitchMessage] = useState<{
    show: boolean
    text?: string
  }>({ show: false })
  const placeholder = ''
  const [cursorOffset, setCursorOffset] = useState<number>(input.length)
  const [currentPwd, setCurrentPwd] = useState<string>(() => getCwd())

  const { cycleMode, currentMode, toolPermissionContext } =
    usePermissionContext()
  const modeCycleShortcut = useMemo(() => getPermissionModeCycleShortcut(), [])
  const showQuickModelSwitchShortcut = modeCycleShortcut.displayText !== 'alt+m'

  const handleExitMessage = useCallback((show: boolean, key?: string) => {
    setExitMessage(prev =>
      prev.show === show && prev.key === key ? prev : { show, key },
    )
  }, [])

  const handleInlineMessage = useCallback((show: boolean, text?: string) => {
    setMessage(prev =>
      prev.show === show && prev.text === text ? prev : { show, text },
    )
  }, [])
  const handleRewindConversation = useDoublePress(
    setRewindMessagePending,
    onShowMessageSelector,
  )

  const { columns, rows } = useTerminalSize()
  const textInputColumns = Math.max(1, columns - 6)
  // Prevent the prompt input from growing unbounded and overflowing the viewport,
  // which can cause flicker/ghost lines on small terminals.
  const textInputMaxHeight = Math.max(1, Math.min(8, Math.floor(rows / 3)))
  const inputLineCount = useMemo(
    () => countWrappedLines(input, textInputColumns, textInputMaxHeight + 1),
    [input, textInputColumns, textInputMaxHeight],
  )
  const inputBoxHeight = Math.min(inputLineCount, textInputMaxHeight) + 2

  const onChange = useCallback(
    (value: string) => {
      const next = toPromptMode(value)
      if (next.mode !== mode) onModeChange(next.mode)
      onInputChange(next.text)

      if (next.text !== value) {
        setCursorOffset(prev =>
          __adjustCursorOffsetForPromptPrefixForTests({
            value,
            nextText: next.text,
            previousOffset: prev,
          }),
        )
      }
    },
    [mode, onInputChange, onModeChange],
  )

  const statusLine = useStatusLine()
  const theme = getTheme()
  const tokenUsage = useMemo(() => countTokens(messages), [messages])

  const modelInfo = useMemo(() => {
    const current = getModelManager().getModel('main')
    return current
      ? {
          name: current.modelName,
          provider: current.provider,
          contextLength: current.contextLength,
          currentTokens: tokenUsage,
        }
      : null
  }, [tokenUsage, submitCount])

  const compact = rows < 16
  const modelInfoRows = !compact && modelInfo ? 1 : 0
  const pwdRows = compact ? 0 : 1
  const completionReservedRows = inputBoxHeight + modelInfoRows + pwdRows + 1
  const completionEnabled = rows >= 10 && rows - completionReservedRows >= 2

  const {
    suggestions,
    selectedIndex,
    isActive: completionActive,
    emptyDirMessage,
  } = useUnifiedCompletion({
    input,
    cursorOffset,
    onInputChange,
    setCursorOffset,
    commands,
    disableSlashCommands,
    isEnabled: completionEnabled,
  })
  const completionVisible =
    completionEnabled && completionActive && suggestions.length > 0
  const visibleSuggestions = completionVisible ? suggestions : []

  const { resetHistory, onHistoryUp, onHistoryDown } = useArrowKeyHistory(
    (value: string, restoredMode: 'bash' | 'prompt') => {
      const next = toPromptMode(restoredMode === 'bash' ? `!${value}` : value)
      onModeChange(next.mode)
      onInputChange(next.text)
      setCursorOffset(next.text.length)
    },
    input,
  )

  const handleHistoryUp = () => {
    if (!completionVisible) onHistoryUp()
  }
  const handleHistoryDown = () => {
    if (!completionVisible) onHistoryDown()
  }

  const handleQuickModelSwitch = useQuickModelSwitch({
    messages,
    onSubmitCountChange,
    setModelSwitchMessage,
    onModelChange,
  })

  const { isEditingExternally, handleExternalEdit } = useExternalEdit({
    input,
    isLoading,
    isDisabled,
    onInputChange,
    setCursorOffset,
    setMessage,
  })

  const handleSpecialKey = useCallback(
    (inputChar: string, key: Key): boolean => {
      if (isEditingExternally) return true

      const action = getPromptInputSpecialKeyAction({
        inputChar,
        key,
        modeCycleShortcut,
      })

      if (action === 'modeCycle') {
        cycleMode()
        return true
      }

      if (action === 'modelSwitch') {
        if (!isLoading) handleQuickModelSwitch()
        return true
      }

      if (action === 'externalEditor') {
        void handleExternalEdit()
        return true
      }

      return false
    },
    [
      cycleMode,
      handleExternalEdit,
      handleQuickModelSwitch,
      isEditingExternally,
      isLoading,
      modeCycleShortcut,
    ],
  )

  const { pastedTexts, pastedImages, onImagePaste, onTextPaste, clearPastes } =
    usePromptPastes({
      input,
      cursorOffset,
      onInputChange,
      setCursorOffset,
      onModeChange,
      terminalRows: rows,
    })

  async function onSubmit(value: string, isSubmittingSlashCommand = false) {
    await submitPrompt({
      input: value,
      mode,
      completionActive: completionVisible,
      suggestionCount: completionVisible ? suggestions.length : 0,
      isSubmittingSlashCommand,
      isDisabled,
      isLoading,
      isEditingExternally,
      abortController,
      setIsLoading,
      setAbortController,
      onInputChange,
      onModeChange,
      setCursorOffset,
      onSubmitCountChange,
      onQuery,
      setToolJSX,
      commands,
      forkNumber,
      messageLogName,
      tools,
      verbose,
      disableSlashCommands,
      permissionMode: currentMode,
      toolPermissionContext,
      setForkConvoWithMessagesOnTheNextRender,
      readFileTimestamps,
      pastedTexts,
      pastedImages,
      clearPastes,
      resetHistory,
      setCurrentPwd,
      exit,
    })
  }

  useKeypress(
    (inputChar, key) => {
      if (mode === 'bash' && (key.backspace || key.delete)) {
        if (input === '') onModeChange('prompt')
        return
      }

      if (mode === 'koding' && (key.backspace || key.delete)) {
        if (input === '') onModeChange('prompt')
        return
      }

      if (inputChar === '' && (key.escape || key.backspace || key.delete)) {
        onModeChange('prompt')
      }

      if (key.escape && messages.length > 0 && !input && !isLoading) {
        handleRewindConversation()
        return true
      }
    },
    { priority: 10 },
  )

  return (
    <PromptInputView
      mode={mode}
      theme={theme}
      currentPwd={currentPwd}
      modelInfo={modelInfo}
      input={input}
      cursorOffset={cursorOffset}
      setCursorOffset={setCursorOffset}
      onSubmit={onSubmit}
      onChange={onChange}
      isEditingExternally={isEditingExternally}
      isDisabled={isDisabled}
      isLoading={isLoading}
      completionActive={completionVisible}
      suggestions={visibleSuggestions}
      selectedIndex={selectedIndex}
      emptyDirMessage={emptyDirMessage}
      handleHistoryUp={handleHistoryUp}
      handleHistoryDown={handleHistoryDown}
      resetHistory={resetHistory}
      placeholder={placeholder}
      submitCount={submitCount}
      onExit={exit}
      onExitMessage={handleExitMessage}
      onMessage={handleInlineMessage}
      onImagePaste={onImagePaste}
      onTextPaste={onTextPaste}
      onSpecialKey={handleSpecialKey}
      exitMessage={exitMessage}
      message={message}
      rewindMessagePending={rewindMessagePending}
      modelSwitchMessage={modelSwitchMessage}
      statusLine={statusLine}
      currentMode={currentMode}
      modeCycleShortcutText={modeCycleShortcut.displayText}
      showQuickModelSwitchShortcut={showQuickModelSwitchShortcut}
      tokenUsage={tokenUsage}
      textInputColumns={textInputColumns}
      textInputMaxHeight={textInputMaxHeight}
      completionReservedRows={completionReservedRows}
    />
  )
}

export default memo(PromptInput)
