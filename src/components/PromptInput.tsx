import { Box, Text, useInput } from 'ink'
import { sample } from 'lodash-es'
import * as React from 'react'
import { type Message } from '@query'
import { processUserInput } from '@utils/messages'
import { useArrowKeyHistory } from '@hooks/useArrowKeyHistory'
import { useDoublePress } from '@hooks/useDoublePress'
import { useUnifiedCompletion } from '@hooks/useUnifiedCompletion'
import { addToHistory } from '@history'
import TextInput from './TextInput'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { countTokens } from '@utils/tokens'
import { SentryErrorBoundary } from './SentryErrorBoundary'
import type { Command } from '@commands'
import type { SetToolJSXFn, Tool } from '@tool'
import { TokenWarning, WARNING_THRESHOLD } from './TokenWarning'
import { useTerminalSize } from '@hooks/useTerminalSize'
import { getTheme } from '@utils/theme'
import { getModelManager, reloadModelManager } from '@utils/model'
import { saveGlobalConfig } from '@utils/config'
import { setTerminalTitle } from '@utils/terminal'
import { launchExternalEditor } from '@utils/externalEditor'
import {
  countLineBreaks,
  normalizeLineEndings,
  shouldTreatAsSpecialPaste,
} from '@utils/paste'
import { handleHashCommand } from '@utils/hashCommand'
import { logError } from '@utils/log'
import { usePermissionContext } from '@context/PermissionContext'
import { getPermissionModeCycleShortcut } from '@utils/permissionModeCycleShortcut'
import { getCwd } from '@utils/state'
import { CompactModeIndicator } from '@components/ModeIndicator'
import { getPromptInputSpecialKeyAction } from '@utils/promptInputSpecialKey'
import { logStartupProfile } from '@utils/startupProfile'
import { useStatusLine } from '@hooks/useStatusLine'

// Async function to interpret the '#' command input using AI
async function interpretHashCommand(input: string): Promise<string> {
  // Use the AI to interpret the input
  try {
    const { queryQuick } = await import('@services/llm')

    // Create a prompt for the model to interpret the hash command
    const systemPrompt = [
      "You're helping the user structure notes that will be added to their KODING.md file.",
      "Format the user's input into a well-structured note that will be useful for later reference.",
      'Add appropriate markdown formatting, headings, bullet points, or other structural elements as needed.',
      'The goal is to transform the raw note into something that will be more useful when reviewed later.',
      'You should keep the original meaning but make the structure clear.',
    ]

    // Send the request to the AI
    const result = await queryQuick({
      systemPrompt,
      userPrompt: `Transform this note for KODING.md: ${input}`,
    })

    // Extract the content from the response
    if (typeof result.message.content === 'string') {
      return result.message.content
    } else if (Array.isArray(result.message.content)) {
      return result.message.content
        .filter(block => block.type === 'text')
        .map(block => (block.type === 'text' ? block.text : ''))
        .join('\n')
    }

    return `# ${input}\n\n_Added on ${new Date().toLocaleString()}_`
  } catch (e) {
    // If interpretation fails, return the input with minimal formatting
    return `# ${input}\n\n_Added on ${new Date().toLocaleString()}_`
  }
}

type Props = {
  commands: Command[]
  forkNumber: number
  messageLogName: string
  disableSlashCommands?: boolean
  isDisabled: boolean
  isLoading: boolean
  onQuery: (
    newMessages: Message[],
    abortController?: AbortController,
  ) => Promise<void>
  debug: boolean
  verbose: boolean
  messages: Message[]
  setToolJSX: SetToolJSXFn
  tools: Tool[]
  input: string
  onInputChange: (value: string) => void
  mode: 'bash' | 'prompt' | 'koding'
  onModeChange: (mode: 'bash' | 'prompt' | 'koding') => void
  submitCount: number
  onSubmitCountChange: (updater: (prev: number) => number) => void
  setIsLoading: (isLoading: boolean) => void
  setAbortController: (abortController: AbortController | null) => void
  onShowMessageSelector: () => void
  setForkConvoWithMessagesOnTheNextRender: (
    forkConvoWithMessages: Message[],
  ) => void
  readFileTimestamps: { [filename: string]: number }
  abortController: AbortController | null
  onModelChange?: () => void
  uiRefreshCounter?: number
}

type PastedTextSegment = { placeholder: string; text: string }
type PastedImageAttachment = {
  placeholder: string
  data: string
  mediaType: string
}
function PromptInput({
  commands,
  forkNumber,
  messageLogName,
  disableSlashCommands,
  isDisabled,
  isLoading,
  onQuery,
  debug,
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
}: Props): React.ReactNode {
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
  }>({
    show: false,
  })
  const [placeholder, setPlaceholder] = useState('')
  const [cursorOffset, setCursorOffset] = useState<number>(input.length)
  const [pastedTexts, setPastedTexts] = useState<PastedTextSegment[]>([])
  const [pastedImages, setPastedImages] = useState<PastedImageAttachment[]>([])
  const [isEditingExternally, setIsEditingExternally] = useState(false)
  const [currentPwd, setCurrentPwd] = useState<string>(process.cwd())
  const pastedTextCounter = React.useRef(1)
  const pastedImageCounter = React.useRef(1)

  // Permission context for mode management
  const { cycleMode, currentMode, toolPermissionContext } =
    usePermissionContext()
  const modeCycleShortcut = useMemo(() => getPermissionModeCycleShortcut(), [])
  const showQuickModelSwitchShortcut = modeCycleShortcut.displayText !== 'alt+m'

  const handleRewindConversation = useDoublePress(setRewindMessagePending, () =>
    onShowMessageSelector(),
  )

  // useEffect(() => {
  //   getExampleCommands().then(commands => {
  //     setPlaceholder(`Try "${sample(commands)}"`)
  //   })
  // }, [])
  const { columns, rows } = useTerminalSize()

  const commandWidth = useMemo(
    () => Math.max(...commands.map(cmd => cmd.userFacingName().length)) + 5,
    [commands],
  )

  // Unified completion system - one hook to rule them all (now with terminal behavior)
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
    onSubmit,
  })

  // Get theme early for memoized rendering
  const theme = getTheme()
  const statusLine = useStatusLine()

  // Memoized completion suggestions rendering - after useUnifiedCompletion
  const renderedSuggestions = useMemo(() => {
    if (suggestions.length === 0) return null

    return suggestions.map((suggestion, index) => {
      const isSelected = index === selectedIndex
      const isAgent = suggestion.type === 'agent'

      // Simple color logic without complex lookups
      const displayColor = isSelected
        ? theme.suggestion
        : isAgent && suggestion.metadata?.color
          ? suggestion.metadata.color
          : undefined

      return (
        <Box
          key={`${suggestion.type}-${suggestion.value}-${index}`}
          flexDirection="row"
        >
          <Text color={displayColor} dimColor={!isSelected && !displayColor}>
            {isSelected ? '◆ ' : '  '}
            {suggestion.displayValue}
          </Text>
        </Box>
      )
    })
  }, [suggestions, selectedIndex, theme.suggestion])

  const onChange = useCallback(
    (value: string) => {
      if (value.startsWith('!')) {
        onModeChange('bash')
        return
      }
      if (value.startsWith('#')) {
        onModeChange('koding')
        return
      }
      onInputChange(value)
    },
    [onModeChange, onInputChange],
  )

  // Handle Option+M (Alt+M) model switching with enhanced debugging
  const handleQuickModelSwitch = useCallback(async () => {
    const modelManager = getModelManager()
    const currentTokens = countTokens(messages)

    // Get debug info for better error reporting
    const debugInfo = modelManager.getModelSwitchingDebugInfo()

    const switchResult = modelManager.switchToNextModel(currentTokens)

    if (switchResult.success && switchResult.modelName) {
      // Successful switch - use enhanced message from model manager
      onModelChange?.()
      onSubmitCountChange(prev => prev + 1)
      setModelSwitchMessage({
        show: true,
        text:
          switchResult.message || `✅ Switched to ${switchResult.modelName}`,
      })
      setTimeout(() => setModelSwitchMessage({ show: false }), 3000)
    } else if (switchResult.blocked && switchResult.message) {
      // Context overflow - show detailed message
      setModelSwitchMessage({
        show: true,
        text: switchResult.message,
      })
      setTimeout(() => setModelSwitchMessage({ show: false }), 5000)
    } else {
      // Enhanced error reporting with debug info
      let errorMessage = switchResult.message

      if (!errorMessage) {
        if (debugInfo.totalModels === 0) {
          errorMessage = '❌ No models configured. Use /model to add models.'
        } else if (debugInfo.activeModels === 0) {
          errorMessage = `❌ No active models (${debugInfo.totalModels} total, all inactive). Use /model to activate models.`
        } else if (debugInfo.activeModels === 1) {
          // Show ALL models including inactive ones for debugging
          const allModelNames = debugInfo.availableModels
            .map(m => `${m.name}${m.isActive ? '' : ' (inactive)'}`)
            .join(', ')
          errorMessage = `⚠️ Only 1 active model out of ${debugInfo.totalModels} total models: ${allModelNames}. ALL configured models will be activated for switching.`
        } else {
          errorMessage = `❌ Model switching failed (${debugInfo.activeModels} active, ${debugInfo.totalModels} total models available)`
        }
      }

      setModelSwitchMessage({
        show: true,
        text: errorMessage,
      })
      setTimeout(() => setModelSwitchMessage({ show: false }), 6000)
    }
  }, [onSubmitCountChange, messages])

  const { resetHistory, onHistoryUp, onHistoryDown } = useArrowKeyHistory(
    (value: string, mode: 'bash' | 'prompt' | 'koding') => {
      onChange(value)
      onModeChange(mode)
    },
    input,
  )

  // Only use history navigation when there are no suggestions
  const handleHistoryUp = () => {
    if (!completionActive) {
      onHistoryUp()
    }
  }

  const handleHistoryDown = () => {
    if (!completionActive) {
      onHistoryDown()
    }
  }

  async function onSubmit(input: string, isSubmittingSlashCommand = false) {
    // When unified completion is open, Enter confirms the selection; avoid submitting the prompt.
    if (
      !isSubmittingSlashCommand &&
      completionActive &&
      suggestions.length > 0
    ) {
      return
    }

    // Special handling for "put a verbose summary" and similar action prompts in koding mode
    if (
      (mode === 'koding' || input.startsWith('#')) &&
      input.match(/^(#\s*)?(put|create|generate|write|give|provide)/i)
    ) {
      try {
        // Store the original input for history
        const originalInput = input

        // Strip the # prefix if present
        const cleanInput = mode === 'koding' ? input : input.substring(1).trim()

        // Add to history and clear input field
        addToHistory(mode === 'koding' ? `#${input}` : input)
        onInputChange('')

        // Create additional context to inform the assistant this is for KODING.md
        const kodingContext =
          'The user is using Koding mode. Format your response as a comprehensive, well-structured document suitable for adding to AGENTS.md. Use proper markdown formatting with headings, lists, code blocks, etc. The response should be complete and ready to add to AGENTS.md documentation.'

        // Switch to prompt mode but tag the submission for later capture
        onModeChange('prompt')

        // 🔧 Fix Koding mode: clean up previous state
        if (abortController) {
          abortController.abort()
        }
        setIsLoading(false)
        await new Promise(resolve => setTimeout(resolve, 0))

        // Set loading state - AbortController now created in onQuery
        setIsLoading(true)

        // Expand any pasted-text placeholders before sending
        let finalInput = cleanInput
        for (const { placeholder, text } of pastedTexts) {
          if (!finalInput.includes(placeholder)) continue
          finalInput = finalInput.replace(placeholder, text)
        }
        const imagesForMessage = pastedImages
        setPastedImages([])
        setPastedTexts([])

        // Process as a normal user input but with special handling
        const messages = await processUserInput(
          finalInput,
          'prompt', // Use prompt mode for processing
          setToolJSX,
          {
            options: {
              commands,
              forkNumber,
              messageLogName,
              tools,
              verbose,
              maxThinkingTokens: 0,
              permissionMode: currentMode,
              toolPermissionContext,
              // Add context flag for koding mode
              isKodingRequest: true,
              kodingContext,
            },
            messageId: undefined,
            abortController: abortController || new AbortController(), // Temporary controller, actual one created in onQuery
            readFileTimestamps,
            setForkConvoWithMessagesOnTheNextRender,
          },
          imagesForMessage.length > 0 ? imagesForMessage : null,
        )

        // Send query and capture response
        if (messages.length) {
          await onQuery(messages)

          // After query completes, the last message should be the assistant's response
          // We'll set up a one-time listener to capture and save that response
          // This will be handled by the REPL component or message handler
        }

        return
      } catch (e) {
        // If something fails, log the error
        logError(e)
      }
    }

    // If in koding mode or input starts with '#', interpret it using AI before appending to AGENTS.md
    else if (mode === 'koding' || input.startsWith('#')) {
      try {
        // Strip the # if we're in koding mode and the user didn't type it (since it's implied)
        const contentToInterpret =
          mode === 'koding' && !input.startsWith('#')
            ? input.trim()
            : input.substring(1).trim()

        const interpreted = await interpretHashCommand(contentToInterpret)
        handleHashCommand(interpreted)
      } catch (e) {
        // If interpretation fails, log the error
        logError(e)
      }
      onInputChange('')
      addToHistory(mode === 'koding' ? `#${input}` : input)
      onModeChange('prompt')
      return
    }
    if (input === '') {
      return
    }
    if (isDisabled) {
      return
    }
    if (isLoading) {
      return
    }

    // Handle exit commands
    if (['exit', 'quit', ':q', ':q!', ':wq', ':wq!'].includes(input.trim())) {
      exit()
    }

    let finalInput = input
    for (const { placeholder, text } of pastedTexts) {
      if (!finalInput.includes(placeholder)) continue
      finalInput = finalInput.replace(placeholder, text)
    }
    onInputChange('')
    // Keep bash mode if we're in bash mode, otherwise switch to prompt
    if (mode !== 'bash') {
      onModeChange('prompt')
    }
    // Suggestions are now handled by unified completion
    const imagesForMessage = pastedImages
    setPastedImages([])
    setPastedTexts([])
    onSubmitCountChange(_ => _ + 1)

    setIsLoading(true)

    const newAbortController = new AbortController()
    setAbortController(newAbortController)

    const messages = await processUserInput(
      finalInput,
      mode,
      setToolJSX,
      {
        options: {
          commands,
          forkNumber,
          messageLogName,
          tools,
          verbose,
          maxThinkingTokens: 0,
          permissionMode: currentMode,
          toolPermissionContext,
          disableSlashCommands,
        },
        messageId: undefined,
        abortController: newAbortController,
        readFileTimestamps,
        setForkConvoWithMessagesOnTheNextRender,
      },
      imagesForMessage.length > 0 ? imagesForMessage : null,
    )

    if (messages.length) {
      // After executing a bash command, update the PWD
      if (mode === 'bash') {
        // Schedule PWD update after command execution
        onQuery(messages, newAbortController).then(async () => {
          const { getCwd } = await import('@utils/state')
          setCurrentPwd(getCwd())
        })
      } else {
        onQuery(messages, newAbortController)
      }
    } else {
      // Local JSX commands
      addToHistory(input)
      resetHistory()
      return
    }

    for (const message of messages) {
      if (message.type === 'user') {
        const inputToAdd = mode === 'bash' ? `!${input}` : input
        addToHistory(inputToAdd)
        resetHistory()
      }
    }
  }

  function onImagePaste(image: string): string {
    onModeChange('prompt')
    const placeholder = `[Image #${pastedImageCounter.current}]`
    pastedImageCounter.current += 1
    setPastedImages(prev => [
      ...prev,
      { placeholder, data: image, mediaType: 'image/png' },
    ])
    return placeholder
  }

  function onTextPaste(rawText: string) {
    const text = normalizeLineEndings(rawText)
    const newlineCount = countLineBreaks(text)

    // Reference CLI gating: only use a pasted-text placeholder when the paste is large or
    // has more than a small number of newlines (threshold depends on terminal rows).
    if (!shouldTreatAsSpecialPaste(text, { terminalRows: rows })) {
      const newInput =
        input.slice(0, cursorOffset) + text + input.slice(cursorOffset)
      onInputChange(newInput)
      setCursorOffset(cursorOffset + text.length)
      return
    }

    const pasteId = pastedTextCounter.current
    pastedTextCounter.current += 1
    const pastedPrompt =
      newlineCount === 0
        ? `[Pasted text #${pasteId}]`
        : `[Pasted text #${pasteId} +${newlineCount} lines]`

    // Update the input with a visual indicator that text has been pasted
    const newInput =
      input.slice(0, cursorOffset) + pastedPrompt + input.slice(cursorOffset)
    onInputChange(newInput)

    // Update cursor position to be after the inserted indicator
    setCursorOffset(cursorOffset + pastedPrompt.length)

    // Still set the pastedText state for actual submission
    setPastedTexts(prev => [...prev, { placeholder: pastedPrompt, text }])
  }

  useEffect(() => {
    setPastedTexts(prev => prev.filter(p => input.includes(p.placeholder)))
    setPastedImages(prev => prev.filter(p => input.includes(p.placeholder)))
  }, [input])

  useInput(
    (inputChar, key) => {
      // For bash mode, only exit when deleting the last character (which would be the '!' character)
      if (mode === 'bash' && (key.backspace || key.delete)) {
        // Check the current input state, not the inputChar parameter
        // If current input is empty, we're about to delete the '!' character, so exit bash mode
        if (input === '') {
          onModeChange('prompt')
        }
        return
      }

      // For koding mode, only exit when deleting the last character (which would be the '#' character)
      if (mode === 'koding' && (key.backspace || key.delete)) {
        // Check the current input state, not the inputChar parameter
        // If current input is empty, we're about to delete the '#' character, so exit koding mode
        if (input === '') {
          onModeChange('prompt')
        }
        return
      }

      // For other modes, keep the original behavior
      if (inputChar === '' && (key.escape || key.backspace || key.delete)) {
        onModeChange('prompt')
      }
      // esc is a little overloaded:
      // - when we're loading a response, it's used to cancel the request
      // - otherwise, it's used to show the message selector
      // - when double pressed, it's used to clear the input
      if (key.escape && messages.length > 0 && !input && !isLoading) {
        handleRewindConversation()
        return true
      }

      return false // Not handled, allow other hooks
    },
    { isActive: !isEditingExternally },
  )

  const handleExternalEdit = useCallback(async () => {
    if (isEditingExternally || isLoading || isDisabled) return
    setIsEditingExternally(true)
    setMessage({ show: true, text: 'Opening external editor...' })

    const result = await launchExternalEditor(input)
    if (result.text !== null) {
      onInputChange(result.text)
      setCursorOffset(result.text.length)
      setMessage({
        show: true,
        text: `Loaded from ${result.editorLabel ?? 'editor'}`,
      })
      setTimeout(() => setMessage({ show: false }), 3000)
    } else {
      setMessage({
        show: true,
        text:
          ('error' in result && result.error?.message) ??
          'External editor unavailable. Set $EDITOR or install code/nano/vim/notepad.',
      })
      setTimeout(() => setMessage({ show: false }), 4000)
    }

    setIsEditingExternally(false)
  }, [
    input,
    isEditingExternally,
    isLoading,
    isDisabled,
    onInputChange,
    setCursorOffset,
    setMessage,
  ])

  // Handle special key combinations before character input
  const handleSpecialKey = useCallback(
    (inputChar: string, key: any): boolean => {
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
        if (!isLoading) {
          handleQuickModelSwitch()
        }
        return true
      }

      // Note: Option + Enter is now handled in useTextInput

      if (action === 'externalEditor') {
        void handleExternalEdit()
        return true // Block character insertion
      }

      return false // Not handled, allow normal processing
    },
    [
      cycleMode,
      handleQuickModelSwitch,
      handleExternalEdit,
      isEditingExternally,
      isLoading,
      modeCycleShortcut,
    ],
  )

  const textInputColumns = columns - 6
  const tokenUsage = useMemo(() => countTokens(messages), [messages])
  // 🔧 Fix: Track model ID changes to detect external config updates
  const modelManager = getModelManager()
  const currentModelId = (modelManager.getModel('main') as any)?.id || null

  const modelInfo = useMemo(() => {
    // Force fresh ModelManager instance to detect config changes
    const freshModelManager = getModelManager()
    const currentModel = freshModelManager.getModel('main')
    if (!currentModel) {
      return null
    }

    return {
      name: currentModel.modelName, // 🔧 Fix: Use actual model name, not display name
      id: (currentModel as any).id, // 添加模型ID用于调试
      provider: currentModel.provider, // 添加提供商信息
      contextLength: currentModel.contextLength,
      currentTokens: tokenUsage,
    }
  }, [tokenUsage, modelSwitchMessage.show, submitCount, currentModelId]) // Track model ID to detect config changes

  return (
    <Box flexDirection="column">
      {/* Top info bar: PWD on left (bash mode) and Model info on right */}
      {(mode === 'bash' || modelInfo) && (
        <Box
          justifyContent="space-between"
          marginBottom={1}
          flexDirection="row"
        >
          {/* PWD in top-left when in bash mode */}
          {mode === 'bash' ? (
            <Text color={theme.bashBorder}>Shell PWD: {currentPwd}</Text>
          ) : (
            <Text> </Text>
          )}
          {/* Model info in top-right corner */}
          {modelInfo && (
            <Text dimColor>
              [{modelInfo.provider}] {modelInfo.name}:{' '}
              {Math.round(modelInfo.currentTokens / 1000)}k /{' '}
              {Math.round(modelInfo.contextLength / 1000)}k
            </Text>
          )}
        </Box>
      )}

      <Box
        alignItems="flex-start"
        justifyContent="flex-start"
        borderTop={true}
        borderBottom={true}
        borderLeft={false}
        borderRight={false}
        borderColor={
          mode === 'bash'
            ? theme.bashBorder
            : mode === 'koding'
              ? theme.notingBorder
              : theme.inputBorder
        }
        borderDimColor={false}
        borderStyle="classic"
        marginTop={1}
        width="100%"
      >
        <Box
          alignItems="flex-start"
          alignSelf="flex-start"
          flexWrap="nowrap"
          justifyContent="flex-start"
          width={3}
        >
          {mode === 'bash' ? (
            <Text color={theme.bashBorder}>&nbsp;!&nbsp;</Text>
          ) : mode === 'koding' ? (
            <Text color={theme.noting}>&nbsp;#&nbsp;</Text>
          ) : (
            <Text color={isLoading ? theme.secondaryText : undefined}>
              K&gt;&nbsp;
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
            onHistoryReset={() => resetHistory()}
            placeholder={submitCount > 0 ? undefined : placeholder}
            onExit={() => process.exit(0)}
            onExitMessage={(show, key) => setExitMessage({ show, key })}
            onMessage={(show, text) => setMessage({ show, text })}
            onImagePaste={onImagePaste}
            columns={textInputColumns}
            isDimmed={isDisabled || isLoading || isEditingExternally}
            disableCursorMovementForUpDownKeys={completionActive}
            cursorOffset={cursorOffset}
            onChangeCursorOffset={setCursorOffset}
            onPaste={onTextPaste}
            onSpecialKey={handleSpecialKey}
          />
        </Box>
      </Box>
      {!completionActive && suggestions.length === 0 && (
        <Box flexDirection="column" paddingX={2} paddingY={0}>
          {/* First line: Command indicators */}
          <Box flexDirection="row" justifyContent="space-between">
            <Box justifyContent="flex-start" gap={1}>
              {exitMessage.show ? (
                <Text dimColor>Press {exitMessage.key} again to exit</Text>
              ) : message.show ? (
                <Text dimColor>{message.text}</Text>
              ) : rewindMessagePending ? (
                <Text dimColor>Press Escape again to undo</Text>
              ) : modelSwitchMessage.show ? (
                <Text color={theme.success}>{modelSwitchMessage.text}</Text>
              ) : mode === 'prompt' && currentMode !== 'default' ? (
                <CompactModeIndicator />
              ) : (
                <>
                  <Text
                    color={mode === 'bash' ? theme.bashBorder : undefined}
                    dimColor={mode !== 'bash'}
                  >
                    ! run some shell command
                  </Text>
                  <Text dimColor> · / for commands</Text>
                  <Text
                    color={mode === 'koding' ? theme.noting : undefined}
                    dimColor={mode !== 'koding'}
                  >
                    {' '}
                    · # tell agent something to remember forever
                  </Text>
                </>
              )}
            </Box>
            <Box justifyContent="flex-end">
              <Text dimColor wrap="truncate-end">
                {statusLine
                  ? `${statusLine} · ESC to interrupt · 2×ESC for undo`
                  : 'ESC to interrupt · 2×ESC for undo'}
              </Text>
            </Box>
          </Box>

          {/* Second line: Shortcuts */}
          {!exitMessage.show &&
            !message.show &&
            !modelSwitchMessage.show &&
            !rewindMessagePending && (
              <Box flexDirection="row" justifyContent="space-between">
                <Box justifyContent="flex-start" gap={1}>
                  <Text dimColor wrap="truncate-end">
                    option+enter: newline ·{' '}
                    {showQuickModelSwitchShortcut
                      ? 'option+m: switch model · '
                      : ''}
                    option+g: external editor · {modeCycleShortcut.displayText}:
                    switch mode
                  </Text>
                </Box>
                <SentryErrorBoundary
                  children={
                    <Box justifyContent="flex-end" gap={1}>
                      <TokenWarning tokenUsage={tokenUsage} />
                    </Box>
                  }
                />
              </Box>
            )}
        </Box>
      )}
      {/* Unified completion suggestions - optimized rendering */}
      {suggestions.length > 0 && (
        <Box
          flexDirection="row"
          justifyContent="space-between"
          paddingX={2}
          paddingY={0}
        >
          <Box flexDirection="column">
            {renderedSuggestions}

            {/* 简洁操作提示框 */}
            <Box
              marginTop={1}
              paddingX={3}
              borderStyle="round"
              borderColor="gray"
            >
              <Text
                dimColor={!emptyDirMessage}
                color={emptyDirMessage ? 'yellow' : undefined}
              >
                {emptyDirMessage ||
                  (() => {
                    const selected = suggestions[selectedIndex]
                    if (!selected) {
                      return '↑↓ navigate • → accept • Tab cycle • Esc close'
                    }
                    if (selected?.value.endsWith('/')) {
                      return '→ enter directory • ↑↓ navigate • Tab cycle • Esc close'
                    } else if (selected?.type === 'agent') {
                      return '→ select agent • ↑↓ navigate • Tab cycle • Esc close'
                    } else {
                      return '→ insert reference • ↑↓ navigate • Tab cycle • Esc close'
                    }
                  })()}
              </Text>
            </Box>
          </Box>
          <SentryErrorBoundary
            children={
              <Box justifyContent="flex-end" gap={1}>
                <TokenWarning tokenUsage={countTokens(messages)} />
              </Box>
            }
          />
        </Box>
      )}
    </Box>
  )
}

export default memo(PromptInput)

function exit(): never {
  setTerminalTitle('')
  process.exit(0)
}
