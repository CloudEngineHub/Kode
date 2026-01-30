import * as React from 'react'
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { estimateTokens } from '#core/utils/tokens'
import { getTheme } from '#core/utils/theme'
import { getModelManager } from '#core/utils/model'
import { logStartupProfile } from '#core/utils/startupProfile'
import { MACRO } from '#core/constants/macros'
import { getCwd, getOriginalCwd } from '#core/utils/state'
import { getMessagesPath } from '#core/utils/log'
import { getTotalAPIDuration, getTotalDuration } from '#core/cost-tracker'
import {
  getCurrentProjectConfig,
  getGlobalConfigCached,
  saveCurrentProjectConfig,
} from '#core/utils/config'
import { usePermissionContext } from '#ui-ink/contexts/PermissionContext'
import { useArrowKeyHistory } from '#ui-ink/hooks/useArrowKeyHistory'
import { useDoublePress } from '#ui-ink/hooks/useDoublePress'
import { useStatusLine } from '#ui-ink/hooks/useStatusLine'
import { useTerminalSize } from '#ui-ink/hooks/useTerminalSize'
import { useUnifiedCompletion } from '#ui-ink/hooks/useUnifiedCompletion'
import { useKeypress, type Key } from '#ui-ink/hooks/useKeypress'
import { useUndoBuffer } from '#ui-ink/hooks/useUndoBuffer'
import { KEYPRESS_PRIORITY } from '#ui-ink/constants/keypressPriority'
import { getPermissionModeCycleShortcut } from '#ui-ink/utils/permissionModeCycleShortcut'
import { getPromptInputSpecialKeyAction } from '#ui-ink/utils/promptInputSpecialKey'
import { setTerminalTitle } from '#cli-utils/terminal'
import { Cursor, countWrappedLines } from '#cli-utils/Cursor'
import { getCurrentOutputStyle } from '#cli-services/outputStyles'
import { BunShell } from '#runtime/shell'
import { listBackgroundAgentTaskSnapshots } from '#core/utils/backgroundTasks'
import { computeContextWindowPercentages } from '#core/utils/contextWindowPercentages'
import { submitPrompt } from './submit'
import {
  usePromptPastes,
  type PastedImageAttachment,
  type PastedTextSegment,
} from './pastes'
import { toggleBashMode, type PromptInputProps, type PromptMode } from './types'
import { PromptInputView } from './PromptInputView'
import { useExternalEdit } from './useExternalEdit'
import { useQuickModelSwitch } from './useQuickModelSwitch'
import { getKodeAgentSessionId } from '#protocol/utils/kodeAgentSessionId'

const PROMPT_DRAFT_KEY = 'repl'

function exit(): never {
  setTerminalTitle('')
  process.exit(0)
}

export function PromptInput({
  commands,
  forkNumber,
  messageLogName,
  initialPrompt,
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
  uiRefreshCounter,
  onShowMessageSelector,
  setForkConvoWithMessagesOnTheNextRender,
  readFileTimestamps,
  onModelChange,
  onManageTasks,
  restorePastes,
  onRestorePastesApplied,
  draftPastes,
  onDraftPastesChange,
}: PromptInputProps): React.ReactNode {
  type QueuedPrompt = {
    seq: number
    input: string
    mode: PromptMode
    pastedTexts: PastedTextSegment[]
    pastedImages: PastedImageAttachment[]
  }

  type PromptStash = {
    input: string
    mode: PromptMode
    cursorOffset: number
    pastedTexts: PastedTextSegment[]
    pastedImages: PastedImageAttachment[]
  }

  useEffect(() => {
    if (!isDisabled && !isLoading) {
      logStartupProfile('prompt_ready')
    }
  }, [isDisabled, isLoading])

  const [exitMessage, setExitMessage] = useState<{
    show: boolean
    key?: string
  }>({ show: false })
  const [clearInputPending, setClearInputPending] = useState(false)
  const [rewindPending, setRewindPending] = useState(false)
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
  const [queuedPrompts, setQueuedPrompts] = useState<QueuedPrompt[]>([])
  const [pendingPrompts, setPendingPrompts] = useState<QueuedPrompt[]>([])
  const nextQueuedPromptSeqRef = useRef(0)
  const [promptStash, setPromptStash] = useState<PromptStash | null>(null)
  const onHistoryUserInputRef = useRef<() => void>(() => {})
  const editorMode = getGlobalConfigCached().editorMode ?? 'normal'
  const [vimMode, setVimMode] = useState<'INSERT' | 'NORMAL'>('INSERT')

  useEffect(() => {
    if (editorMode !== 'vim') return
    setVimMode('INSERT')
  }, [editorMode])

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
  const handleClearInput = useDoublePress(setClearInputPending, () => {
    clearPastes()
    onInputChange('')
    setCursorOffset(0)
  })
  const handleRewind = useDoublePress(setRewindPending, () => {
    onShowMessageSelector()
  })

  const {
    pushToBuffer: pushUndoSnapshot,
    undo: undoOnce,
    canUndo,
    clearBuffer: clearUndoBuffer,
  } = useUndoBuffer<{
    mode: PromptMode
    pastedTexts: PastedTextSegment[]
    pastedImages: PastedImageAttachment[]
  }>({ maxBufferSize: 50, debounceMs: 200 })

  const cursorOffsetRef = useRef(cursorOffset)
  useEffect(() => {
    cursorOffsetRef.current = cursorOffset
  }, [cursorOffset])

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
      onHistoryUserInputRef.current()

      // Only check for mode prefix when in 'prompt' mode
      // In other modes (bash/koding/background), just update the input directly
      if (mode === 'prompt') {
        if (value.startsWith('!') || value.startsWith('$')) {
          onModeChange('bash')
          return
        }
        if (value.startsWith('&')) {
          onModeChange('background')
          return
        }
        if (value.startsWith('#')) {
          onModeChange('koding')
          return
        }
      }

      onInputChange(value)
    },
    [mode, onInputChange, onModeChange],
  )

  const theme = getTheme()
  const tokenUsage = useMemo(() => estimateTokens(messages), [messages])
  const totalCostUSD = useMemo(() => {
    let total = 0
    for (const message of messages) {
      if (message.type === 'assistant') total += message.costUSD
    }
    return total
  }, [messages])

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
  }, [submitCount, tokenUsage, uiRefreshCounter])

  const statusLineUsage = useMemo(() => {
    let totalInputTokens = 0
    let totalOutputTokens = 0

    let currentUsage: null | {
      input_tokens: number
      output_tokens: number
      cache_creation_input_tokens: number
      cache_read_input_tokens: number
    } = null

    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i]
      if (!message || message.type !== 'assistant') continue
      const usage = (message.message as unknown as { usage?: unknown }).usage
      if (!usage || typeof usage !== 'object') continue

      const rec = usage as Record<string, unknown>
      const inputTokens = rec.input_tokens
      const outputTokens = rec.output_tokens
      if (typeof inputTokens !== 'number' || typeof outputTokens !== 'number') {
        continue
      }

      currentUsage = {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_creation_input_tokens:
          typeof rec.cache_creation_input_tokens === 'number'
            ? rec.cache_creation_input_tokens
            : 0,
        cache_read_input_tokens:
          typeof rec.cache_read_input_tokens === 'number'
            ? rec.cache_read_input_tokens
            : 0,
      }
      break
    }

    for (const message of messages) {
      if (!message || message.type !== 'assistant') continue
      const usage = (message.message as unknown as { usage?: unknown }).usage
      if (!usage || typeof usage !== 'object') continue
      const rec = usage as Record<string, unknown>
      const inputTokens = rec.input_tokens
      const outputTokens = rec.output_tokens
      if (typeof inputTokens !== 'number' || typeof outputTokens !== 'number') {
        continue
      }
      totalInputTokens += inputTokens
      totalOutputTokens += outputTokens
    }

    return { totalInputTokens, totalOutputTokens, currentUsage }
  }, [messages])

  const statusLineInput = useMemo(() => {
    const profile = getModelManager().getModel('main')
    const outputStyleName = getCurrentOutputStyle()
    const transcriptPath = getMessagesPath(messageLogName, forkNumber, 0)

    const currentUsage = statusLineUsage.currentUsage
    const contextWindowSize =
      typeof profile?.contextLength === 'number' ? profile.contextLength : 0

    const { used_percentage, remaining_percentage } =
      computeContextWindowPercentages({
        currentUsage,
        contextWindowSize,
      })
    const exceeds200kTokens = currentUsage
      ? currentUsage.input_tokens +
          currentUsage.output_tokens +
          currentUsage.cache_creation_input_tokens +
          currentUsage.cache_read_input_tokens >
        200000
      : false

    return {
      session_id: getKodeAgentSessionId(),
      transcript_path: transcriptPath,
      cwd: currentPwd,
      model: {
        id: profile?.modelName ?? '',
        display_name: profile?.name ?? profile?.modelName ?? '',
      },
      workspace: {
        current_dir: currentPwd,
        project_dir: getOriginalCwd(),
      },
      version: MACRO.VERSION,
      output_style: { name: outputStyleName },
      cost: {
        total_cost_usd: totalCostUSD,
        total_duration_ms: getTotalDuration(),
        total_api_duration_ms: getTotalAPIDuration(),
      },
      context_window: {
        total_input_tokens: statusLineUsage.totalInputTokens,
        total_output_tokens: statusLineUsage.totalOutputTokens,
        context_window_size: contextWindowSize,
        current_usage: currentUsage,
        used_percentage,
        remaining_percentage,
      },
      exceeds_200k_tokens: exceeds200kTokens,
      ...(editorMode === 'vim' ? { vim: { mode: vimMode } } : {}),
      kode: {
        conversation: { messageLogName, forkNumber },
        permission_mode: toolPermissionContext.mode,
        model: {
          provider: profile?.provider ?? null,
        },
      },
    }
  }, [
    currentPwd,
    editorMode,
    forkNumber,
    messageLogName,
    statusLineUsage,
    submitCount,
    toolPermissionContext.mode,
    totalCostUSD,
    uiRefreshCounter,
    vimMode,
  ])

  const { text: statusLineText, padding: statusLinePadding } =
    useStatusLine(statusLineInput)

  const defaultStatusLine = useMemo(() => {
    const parts: string[] = []
    if (editorMode === 'vim' && vimMode === 'INSERT') {
      parts.push('-- INSERT --')
    } else if (mode === 'bash') {
      parts.push('$ bash')
    } else if (mode === 'background') {
      parts.push('& background')
    } else if (mode === 'koding') {
      parts.push('# koding')
    } else {
      parts.push('? shortcuts')
    }

    parts.push(isLoading ? 'Enter send · Tab queue' : 'Enter send')

    if (pendingPrompts.length > 0) {
      parts.push(`pending ${pendingPrompts.length}`)
    }

    if (queuedPrompts.length > 0) {
      parts.push(`queued ${queuedPrompts.length}`)
      parts.push('Alt+↑ edit')
    }

    return parts.join(' · ')
  }, [
    editorMode,
    isLoading,
    mode,
    pendingPrompts.length,
    queuedPrompts.length,
    vimMode,
  ])

  const effectiveStatusLine = statusLineText ?? defaultStatusLine

  const toastMessage = useMemo(() => ({ show: false as const }), [])

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
    resetCompletion,
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

  const {
    pastedTexts,
    pastedImages,
    setPastedTexts,
    setPastedImages,
    onImagePaste,
    onTextPaste,
    clearPastes,
  } = usePromptPastes({
    input,
    cursorOffset,
    onInputChange,
    setCursorOffset,
    onModeChange,
    terminalRows: rows,
  })

  // Codex-style prompt queue shortcuts:
  // - Tab queues while a turn is running (and does not send immediately)
  // - Alt+Up pops the most recent queued/pending message for editing
  useKeypress(
    (_inputChar, key) => {
      if (isEditingExternally) return
      if (isDisabled) return

      if (key.meta && key.upArrow && !key.shift && !key.ctrl) {
        const draftForQueue: QueuedPrompt | null =
          input.trim().length > 0 ||
          pastedTexts.length > 0 ||
          pastedImages.length > 0
            ? {
                seq: nextQueuedPromptSeqRef.current++,
                input,
                mode,
                pastedTexts: [...pastedTexts],
                pastedImages: [...pastedImages],
              }
            : null

        const latest =
          queuedPrompts.length > 0
            ? queuedPrompts.reduce((best, item) =>
                item.seq > best.seq ? item : best,
              )
            : null
        if (!latest) return

        if (completionActive) resetCompletion()
        clearSavedPromptDraftBestEffort()
        if (draftForQueue) {
          setQueuedPrompts(prev => [...prev, draftForQueue])
        }
        setQueuedPrompts(prev => prev.filter(item => item !== latest))
        clearPastes()
        onModeChange(latest.mode)
        onInputChange(latest.input)
        setPastedTexts(latest.pastedTexts)
        setPastedImages(latest.pastedImages)
        setCursorOffset(latest.input.length)
        return true
      }

      if (
        isLoading &&
        key.tab &&
        !key.shift &&
        (input.trim().length > 0 ||
          pastedTexts.length > 0 ||
          pastedImages.length > 0)
      ) {
        if (completionActive) resetCompletion()
        clearSavedPromptDraftBestEffort()
        clearUndoBuffer()
        setQueuedPrompts(prev => [
          ...prev,
          {
            seq: nextQueuedPromptSeqRef.current++,
            input,
            mode,
            pastedTexts: [...pastedTexts],
            pastedImages: [...pastedImages],
          },
        ])
        clearPastes()
        onInputChange('')
        setCursorOffset(0)
        return true
      }
    },
    { priority: KEYPRESS_PRIORITY.REPL_CONTROLLER },
  )

  const lastRestorePastesIdRef = useRef<number | null>(null)
  useLayoutEffect(() => {
    if (!restorePastes) return
    if (lastRestorePastesIdRef.current === restorePastes.id) return
    lastRestorePastesIdRef.current = restorePastes.id

    setPastedTexts(restorePastes.pastedTexts)
    setPastedImages(restorePastes.pastedImages)
    onDraftPastesChange?.({
      pastedTexts: restorePastes.pastedTexts,
      pastedImages: restorePastes.pastedImages,
    })
    onRestorePastesApplied?.(restorePastes.id)
  }, [
    onDraftPastesChange,
    onRestorePastesApplied,
    restorePastes,
    setPastedImages,
    setPastedTexts,
  ])

  const didRestoreDraftPastesRef = useRef(false)
  useLayoutEffect(() => {
    if (didRestoreDraftPastesRef.current) return
    if (restorePastes) return
    if (!draftPastes) return
    if (pastedTexts.length > 0 || pastedImages.length > 0) {
      didRestoreDraftPastesRef.current = true
      return
    }
    if (
      draftPastes.pastedTexts.length === 0 &&
      draftPastes.pastedImages.length === 0
    ) {
      didRestoreDraftPastesRef.current = true
      return
    }

    setPastedTexts(draftPastes.pastedTexts)
    setPastedImages(draftPastes.pastedImages)
    didRestoreDraftPastesRef.current = true
  }, [
    draftPastes,
    pastedImages.length,
    pastedTexts.length,
    restorePastes,
    setPastedImages,
    setPastedTexts,
  ])

  const didSkipDraftPastesSyncRef = useRef(false)
  useLayoutEffect(() => {
    if (!onDraftPastesChange) return
    if (!didSkipDraftPastesSyncRef.current) {
      didSkipDraftPastesSyncRef.current = true
      return
    }
    onDraftPastesChange({ pastedTexts, pastedImages })
  }, [onDraftPastesChange, pastedImages, pastedTexts])

  const didRestoreDraftRef = useRef(false)
  useEffect(() => {
    if (didRestoreDraftRef.current) return
    // Only attempt to restore a saved draft once per PromptInput mount.
    // Otherwise, clearing the input (e.g. after submit) can cause the last saved
    // draft to "pop back" into the input.
    didRestoreDraftRef.current = true
    if (initialPrompt && initialPrompt.trim()) return

    const hasPendingInput =
      input.trim().length > 0 ||
      pastedTexts.length > 0 ||
      pastedImages.length > 0
    if (hasPendingInput) return

    try {
      const draft = getCurrentProjectConfig().promptDrafts?.[PROMPT_DRAFT_KEY]
      if (!draft || typeof draft.text !== 'string' || !draft.text.trim()) return

      const nextMode = draft.mode
      const rawOffset =
        typeof draft.cursorOffset === 'number'
          ? draft.cursorOffset
          : draft.text.length
      const clampedOffset = Math.min(Math.max(0, rawOffset), draft.text.length)

      didRestoreDraftRef.current = true
      onModeChange(nextMode)
      onInputChange(draft.text)
      setCursorOffset(clampedOffset)
    } catch {
      // best-effort
    }
  }, [
    initialPrompt,
    input,
    onInputChange,
    onModeChange,
    pastedImages.length,
    pastedTexts.length,
  ])

  const lastPersistedDraftRef = useRef<{
    text: string
    mode: PromptMode
    cursorOffset: number
  } | null>(null)
  const draftPersistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  useEffect(() => {
    if (initialPrompt && initialPrompt.trim()) return

    const normalizedCursor = Math.min(Math.max(0, cursorOffset), input.length)
    const shouldClearDraft = input.trim().length === 0 && mode === 'prompt'
    const nextSnapshot = {
      text: input,
      mode,
      cursorOffset: normalizedCursor,
    }

    const prev = lastPersistedDraftRef.current
    const unchanged =
      prev &&
      prev.text === nextSnapshot.text &&
      prev.mode === nextSnapshot.mode &&
      prev.cursorOffset === nextSnapshot.cursorOffset

    if (shouldClearDraft && !prev) return
    if (!shouldClearDraft && unchanged) return

    if (draftPersistTimeoutRef.current) {
      clearTimeout(draftPersistTimeoutRef.current)
      draftPersistTimeoutRef.current = null
    }

    draftPersistTimeoutRef.current = setTimeout(() => {
      try {
        const projectConfig = getCurrentProjectConfig()
        const promptDrafts = { ...(projectConfig.promptDrafts ?? {}) }

        if (shouldClearDraft) {
          delete promptDrafts[PROMPT_DRAFT_KEY]
          lastPersistedDraftRef.current = null
        } else {
          promptDrafts[PROMPT_DRAFT_KEY] = {
            text: nextSnapshot.text,
            mode: nextSnapshot.mode,
            cursorOffset: nextSnapshot.cursorOffset,
            updatedAt: Date.now(),
          }
          lastPersistedDraftRef.current = nextSnapshot
        }

        saveCurrentProjectConfig({ ...projectConfig, promptDrafts })
      } catch {
        // best-effort
      }
      draftPersistTimeoutRef.current = null
    }, 400)

    return () => {
      if (draftPersistTimeoutRef.current) {
        clearTimeout(draftPersistTimeoutRef.current)
        draftPersistTimeoutRef.current = null
      }
    }
  }, [cursorOffset, initialPrompt, input, mode])

  const {
    resetHistory,
    onHistoryUp,
    onHistoryDown,
    onUserInput,
    historyIndex,
    isInFastBrowseMode,
  } = useArrowKeyHistory({
    current: {
      text: input,
      mode,
      cursorOffset,
      extra: { pastedTexts, pastedImages },
    },
    emptyExtra: { pastedTexts: [], pastedImages: [] },
    onRestore: snapshot => {
      setPastedTexts(snapshot.extra.pastedTexts)
      setPastedImages(snapshot.extra.pastedImages)
      onModeChange(snapshot.mode)
      onInputChange(snapshot.text)
      setCursorOffset(snapshot.cursorOffset)
    },
    buildExtraFromHistoryEntry: entry => ({
      pastedTexts: entry.pastedTexts,
      pastedImages: [],
    }),
  })
  onHistoryUserInputRef.current = onUserInput

  const historyHintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const lastHistoryHintTimeRef = useRef<number>(0)
  useEffect(() => {
    if (historyIndex < 2) return

    const now = Date.now()
    // Don't show again within 10 seconds of last hint
    if (now - lastHistoryHintTimeRef.current < 10000) return
    // Clear existing timeout if any
    if (historyHintTimeoutRef.current) {
      clearTimeout(historyHintTimeoutRef.current)
      historyHintTimeoutRef.current = null
    }

    lastHistoryHintTimeRef.current = now
    handleInlineMessage(true, 'Tip: Ctrl+R to search history')

    historyHintTimeoutRef.current = setTimeout(() => {
      setMessage(prev => {
        if (!prev.show) return prev
        if (prev.text !== 'Tip: Ctrl+R to search history') return prev
        return { show: false }
      })
      historyHintTimeoutRef.current = null
    }, 5000)
  }, [handleInlineMessage, historyIndex])

  useEffect(() => {
    return () => {
      if (historyHintTimeoutRef.current) {
        clearTimeout(historyHintTimeoutRef.current)
      }
    }
  }, [])

  const handleHistoryUp = () => {
    if (completionActive) resetCompletion()
    onHistoryUp()
  }
  const handleHistoryDown = () => {
    if (completionActive) resetCompletion()

    if (
      typeof onManageTasks === 'function' &&
      historyIndex === 0 &&
      input.length === 0
    ) {
      const hasBackgroundTasks =
        BunShell.getInstance().listBackgroundShells().length > 0 ||
        listBackgroundAgentTaskSnapshots().length > 0
      if (hasBackgroundTasks) {
        onManageTasks()
        return
      }
    }

    onHistoryDown()
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

      if (action === 'bashModeToggle') {
        onModeChange(toggleBashMode(mode))
        return true
      }

      if (action === 'modelSwitch') {
        // Allow model switching while a turn is running. The change will apply to
        // subsequent model requests / the next turn, depending on the engine.
        handleQuickModelSwitch()
        return true
      }

      if (action === 'externalEditor') {
        void handleExternalEdit()
        return true
      }

      if (
        editorMode === 'vim' &&
        vimMode === 'NORMAL' &&
        key.insertable &&
        !key.ctrl &&
        !key.meta &&
        inputChar.length === 1
      ) {
        const cursor = Cursor.fromText(
          input,
          textInputColumns,
          cursorOffsetRef.current,
        )

        const applyCursor = (nextCursor: Cursor) => {
          if (nextCursor.text !== input) onInputChange(nextCursor.text)
          setCursorOffset(nextCursor.offset)
        }

        switch (inputChar) {
          case 'h':
            applyCursor(cursor.left())
            return true
          case 'j':
            applyCursor(cursor.down())
            return true
          case 'k':
            applyCursor(cursor.up())
            return true
          case 'l':
            applyCursor(cursor.right())
            return true
          case '0':
            applyCursor(cursor.startOfLine())
            return true
          case '$':
            applyCursor(cursor.endOfLine())
            return true
          case 'w':
            applyCursor(cursor.nextWord())
            return true
          case 'b':
            applyCursor(cursor.prevWord())
            return true
          case 'x':
            applyCursor(cursor.del())
            return true
          case 'i':
            setVimMode('INSERT')
            return true
          case 'I':
            applyCursor(cursor.startOfLine())
            setVimMode('INSERT')
            return true
          case 'a':
            applyCursor(cursor.right())
            setVimMode('INSERT')
            return true
          case 'A':
            applyCursor(cursor.endOfLine())
            setVimMode('INSERT')
            return true
          default:
            return true
        }
      }

      return false
    },
    [
      cycleMode,
      editorMode,
      handleExternalEdit,
      handleQuickModelSwitch,
      isEditingExternally,
      isLoading,
      mode,
      modeCycleShortcut,
      onInputChange,
      onModeChange,
      input,
      textInputColumns,
      vimMode,
    ],
  )

  useEffect(() => {
    const signature = [
      `mode:${mode}`,
      `input:${input}`,
      ...pastedTexts.map(p => `text:${p.placeholder}`),
      ...pastedImages.map(p => `image:${p.placeholder}`),
    ].join('\n')

    pushUndoSnapshot({
      signature,
      text: input,
      cursorOffset: cursorOffsetRef.current,
      extra: {
        mode,
        pastedTexts: [...pastedTexts],
        pastedImages: [...pastedImages],
      },
    })
  }, [input, mode, pastedImages, pastedTexts, pushUndoSnapshot])

  const clearSavedPromptDraftBestEffort = useCallback(() => {
    try {
      if (draftPersistTimeoutRef.current) {
        clearTimeout(draftPersistTimeoutRef.current)
        draftPersistTimeoutRef.current = null
      }

      const projectConfig = getCurrentProjectConfig()
      const existing = projectConfig.promptDrafts?.[PROMPT_DRAFT_KEY]
      if (!existing) {
        lastPersistedDraftRef.current = null
        return
      }

      const promptDrafts = { ...(projectConfig.promptDrafts ?? {}) }
      delete promptDrafts[PROMPT_DRAFT_KEY]
      saveCurrentProjectConfig({ ...projectConfig, promptDrafts })
      lastPersistedDraftRef.current = null
    } catch {
      // best-effort
    }
  }, [])

  async function onSubmit(value: string, isSubmittingSlashCommand = false) {
    if (isEditingExternally) return

    if (
      !isSubmittingSlashCommand &&
      completionVisible &&
      suggestions.length > 0
    ) {
      return
    }

    if (!value) return
    if (isDisabled) return
    if (!value.trim()) return

    if (isLoading) {
      // Enter always "sends". While a turn is running, treat it as a pending submission
      // (distinct from Tab-queued tasks) and auto-run it when the current turn completes.
      if (completionActive) resetCompletion()
      clearSavedPromptDraftBestEffort()
      clearUndoBuffer()
      setPendingPrompts(prev => [
        ...prev,
        {
          seq: nextQueuedPromptSeqRef.current++,
          input: value,
          mode,
          pastedTexts: [...pastedTexts],
          pastedImages: [...pastedImages],
        },
      ])
      clearPastes()
      onInputChange('')
      setCursorOffset(0)
      return
    }

    clearSavedPromptDraftBestEffort()
    clearUndoBuffer()

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
      onShowMessageSelector,
      readFileTimestamps,
      pastedTexts,
      pastedImages,
      clearPastes,
      resetHistory,
      setCurrentPwd,
      exit,
    })
  }

  const [isQueueDrainInFlight, setIsQueueDrainInFlight] = useState(false)
  useEffect(() => {
    if (isQueueDrainInFlight) return
    if (isLoading) return
    if (isDisabled) return
    if (isEditingExternally) return

    const next = pendingPrompts[0] ?? queuedPrompts[0]
    if (!next) return

    setIsQueueDrainInFlight(true)
    if (pendingPrompts.length > 0) {
      setPendingPrompts(prev => prev.slice(1))
    } else {
      setQueuedPrompts(prev => prev.slice(1))
    }

    void (async () => {
      try {
        await submitPrompt({
          input: next.input,
          mode: next.mode,
          completionActive: false,
          suggestionCount: 0,
          isSubmittingSlashCommand: false,
          isDisabled,
          isLoading: false,
          isEditingExternally,
          abortController,
          setIsLoading,
          setAbortController,
          // Do not clobber the user's current draft while draining the queue.
          onInputChange: () => {},
          onModeChange: () => {},
          setCursorOffset: () => {},
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
          onShowMessageSelector,
          readFileTimestamps,
          pastedTexts: next.pastedTexts,
          pastedImages: next.pastedImages,
          clearPastes: () => {},
          resetHistory: () => {},
          setCurrentPwd,
          exit,
        })
      } finally {
        setIsQueueDrainInFlight(false)
      }
    })()
  }, [
    abortController,
    commands,
    currentMode,
    disableSlashCommands,
    forkNumber,
    input,
    isDisabled,
    isEditingExternally,
    isLoading,
    messageLogName,
    onQuery,
    onSubmitCountChange,
    pendingPrompts,
    queuedPrompts,
    readFileTimestamps,
    isQueueDrainInFlight,
    setAbortController,
    setCurrentPwd,
    setForkConvoWithMessagesOnTheNextRender,
    setIsLoading,
    setToolJSX,
    toolPermissionContext,
    tools,
    verbose,
  ])

  useKeypress(
    (inputChar, key) => {
      if (clearInputPending && !key.escape) {
        setClearInputPending(false)
      }
      if (rewindPending && !key.escape) {
        setRewindPending(false)
      }

      if (key.escape && editorMode === 'vim' && vimMode === 'INSERT') {
        setVimMode('NORMAL')
        return true
      }

      if (key.ctrl && inputChar === 's') {
        setClearInputPending(false)

        if (
          input.trim() === '' &&
          pastedTexts.length === 0 &&
          pastedImages.length === 0 &&
          promptStash
        ) {
          onModeChange(promptStash.mode)
          onInputChange(promptStash.input)
          setPastedTexts(promptStash.pastedTexts)
          setPastedImages(promptStash.pastedImages)
          setCursorOffset(promptStash.cursorOffset)
          setPromptStash(null)
          return true
        }

        if (
          input.trim() !== '' ||
          pastedTexts.length > 0 ||
          pastedImages.length > 0
        ) {
          setPromptStash({
            input,
            mode,
            cursorOffset,
            pastedTexts: [...pastedTexts],
            pastedImages: [...pastedImages],
          })
          clearPastes()
          onInputChange('')
          setCursorOffset(0)
          return true
        }

        return true
      }

      if (key.ctrl && inputChar === '_') {
        setClearInputPending(false)
        if (!canUndo) return true

        const snapshot = undoOnce()
        if (!snapshot) return true

        setPastedTexts(snapshot.extra.pastedTexts)
        setPastedImages(snapshot.extra.pastedImages)
        onModeChange(snapshot.extra.mode)
        onInputChange(snapshot.text)
        setCursorOffset(snapshot.cursorOffset)
        return true
      }

      // Handle mode exit when input is empty and user presses backspace/delete/escape
      if (
        (mode === 'bash' || mode === 'background' || mode === 'koding') &&
        input === '' &&
        (key.backspace || key.delete || key.escape)
      ) {
        onModeChange('prompt')
        return true
      }

      if (
        key.escape &&
        !isLoading &&
        mode === 'prompt' &&
        !completionVisible &&
        input.length === 0 &&
        pastedTexts.length === 0 &&
        pastedImages.length === 0
      ) {
        setClearInputPending(false)
        handleRewind()
        return true
      }

      if (
        key.escape &&
        !isLoading &&
        (input.length > 0 || pastedTexts.length > 0 || pastedImages.length > 0)
      ) {
        setRewindPending(false)
        handleClearInput()
        return true
      }
    },
    { priority: KEYPRESS_PRIORITY.INPUT },
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
      pendingPrompts={pendingPrompts.map(item => item.input)}
      queuedPrompts={queuedPrompts.map(item => item.input)}
      completionActive={completionVisible}
      historyIndex={historyIndex}
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
      clearInputPending={clearInputPending}
      rewindPending={rewindPending}
      modelSwitchMessage={modelSwitchMessage}
      toastMessage={toastMessage}
      statusLine={effectiveStatusLine}
      statusLinePadding={statusLinePadding}
      currentMode={currentMode}
      modeCycleShortcutText={modeCycleShortcut.displayText}
      showQuickModelSwitchShortcut={showQuickModelSwitchShortcut}
      tokenUsage={tokenUsage}
      textInputColumns={textInputColumns}
      textInputMaxHeight={textInputMaxHeight}
      completionReservedRows={completionReservedRows}
      isInFastBrowseMode={isInFastBrowseMode}
    />
  )
}

export default memo(PromptInput)
