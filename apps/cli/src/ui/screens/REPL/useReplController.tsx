import { Box } from 'ink'
import * as React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Logo } from '#ui-ink/components/Logo'
import ProjectOnboarding from '#ui-ink/components/ProjectOnboarding'
import type { ToolUseConfirm } from '#ui-ink/components/permissions/PermissionRequest'
import PromptInput from '#ui-ink/components/PromptInput'
import type { BinaryFeedbackResult } from '#core/query'
import { getTotalCost } from '#core/cost-tracker'
import { useCostSummary } from '#ui-ink/hooks/useCostSummary'
import { useLogStartupTime } from '#ui-ink/hooks/useLogStartupTime'
import { useApiKeyVerification } from '#ui-ink/hooks/useApiKeyVerification'
import { useCancelRequest } from '#ui-ink/hooks/useCancelRequest'
import useCanUseTool from '#ui-ink/hooks/useCanUseTool'
import { useLogMessages } from '#ui-ink/hooks/useLogMessages'
import {
  setMessagesGetter,
  setMessagesSetter,
  setModelConfigChangeHandler,
} from '#core/messages'
import type { Message as MessageType } from '#core/query'
import { getGlobalConfig, saveGlobalConfig } from '#core/utils/config'
import { getNextAvailableLogForkNumber } from '#core/utils/log'
import { clearTerminal } from '#cli-utils/terminal'
import { getOriginalCwd } from '#core/utils/state'
import { useTranscriptItems } from './useTranscriptItems'
import { useRequestToolUsePermission } from './useRequestToolUsePermission'
import { useReplQuery } from './useReplQuery'
import { useReplInit } from './useReplInit'
import { buildPromptInputProps } from './promptInputProps'
import { useMessageSelectorSelect } from './useMessageSelectorSelect'
import type { BinaryFeedbackContext, REPLProps } from './types'

export function useReplController(props: REPLProps) {
  const debug = props.debug ?? false
  const disableSlashCommands = props.disableSlashCommands ?? false
  const safeMode = Boolean(props.safeMode)
  const mcpClients = props.mcpClients ?? []
  const isDefaultModel = props.isDefaultModel ?? true
  const updateAvailableVersion = props.initialUpdateVersion ?? null
  const updateCommands = props.initialUpdateCommands ?? null

  const [verboseConfig] = useState(
    () => props.verbose ?? getGlobalConfig().verbose,
  )
  const verbose = verboseConfig

  const [forkNumber, setForkNumber] = useState(
    getNextAvailableLogForkNumber(
      props.messageLogName,
      props.initialForkNumber ?? 0,
      0,
    ),
  )
  const [uiRefreshCounter, setUiRefreshCounter] = useState(0)

  const [
    forkConvoWithMessagesOnTheNextRender,
    setForkConvoWithMessagesOnTheNextRender,
  ] = useState<MessageType[] | null>(null)

  const [abortController, setAbortController] =
    useState<AbortController | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [toolJSX, setToolJSX] = useState<{
    jsx: React.ReactNode | null
    shouldHidePromptInput: boolean
    displayMode?: 'inline' | 'fullscreen'
  } | null>(null)
  const [toolUseConfirm, setToolUseConfirm] = useState<ToolUseConfirm | null>(
    null,
  )
  const [messages, setMessages] = useState<MessageType[]>(
    props.initialMessages ?? [],
  )
  const [inputValue, setInputValue] = useState('')
  const [inputMode, setInputMode] = useState<'bash' | 'prompt' | 'koding'>(
    'prompt',
  )
  const [submitCount, setSubmitCount] = useState(0)
  const [isMessageSelectorVisible, setIsMessageSelectorVisible] =
    useState(false)
  const [showCostDialog, setShowCostDialog] = useState(false)
  const [haveShownCostDialog, setHaveShownCostDialog] = useState(
    getGlobalConfig().hasAcknowledgedCostThreshold,
  )
  const [binaryFeedbackContext, setBinaryFeedbackContext] =
    useState<BinaryFeedbackContext | null>(null)

  const getBinaryFeedbackResponse = useCallback(
    (m1: BinaryFeedbackContext['m1'], m2: BinaryFeedbackContext['m2']) => {
      return new Promise<BinaryFeedbackResult>(resolvePromise => {
        setBinaryFeedbackContext({ m1, m2, resolve: resolvePromise })
      })
    },
    [],
  )

  const readFileTimestampsRef = useRef<{ [filename: string]: number }>({})

  const { status: apiKeyStatus, reverify } = useApiKeyVerification()

  const onCancel = useCallback(() => {
    if (!isLoading) return
    setIsLoading(false)
    if (toolUseConfirm) {
      toolUseConfirm.onAbort()
      return
    }
    if (abortController && !abortController.signal.aborted) {
      abortController.abort()
    }
  }, [abortController, isLoading, toolUseConfirm])

  useCancelRequest(
    setToolJSX,
    setToolUseConfirm,
    setBinaryFeedbackContext,
    onCancel,
    isLoading,
    isMessageSelectorVisible,
    abortController?.signal,
  )

  useEffect(() => {
    if (!forkConvoWithMessagesOnTheNextRender) return
    setForkNumber(prev => prev + 1)
    setForkConvoWithMessagesOnTheNextRender(null)
    setMessages(forkConvoWithMessagesOnTheNextRender)
  }, [forkConvoWithMessagesOnTheNextRender])

  useEffect(() => {
    const totalCost = getTotalCost()
    if (totalCost >= 5 && !showCostDialog && !haveShownCostDialog) {
      setShowCostDialog(true)
    }
  }, [messages, showCostDialog, haveShownCostDialog])

  const canUseTool = useCanUseTool(setToolUseConfirm)
  const requestToolUsePermission = useRequestToolUsePermission({
    setToolUseConfirm,
  })

  const onQuery = useReplQuery({
    disableSlashCommands,
    messages,
    setMessages,
    commands: props.commands,
    forkNumber,
    messageLogName: props.messageLogName,
    tools: props.tools,
    mcpClients,
    verbose,
    safeMode,
    requestToolUsePermission,
    canUseTool,
    readFileTimestamps: readFileTimestampsRef.current,
    setToolJSX,
    getBinaryFeedbackResponse,
    setAbortController,
    setIsLoading,
  })

  const onInit = useReplInit({
    initialPrompt: props.initialPrompt,
    commands: props.commands,
    forkNumber,
    messageLogName: props.messageLogName,
    tools: props.tools,
    mcpClients,
    verbose,
    safeMode,
    messages,
    setToolJSX,
    readFileTimestamps: readFileTimestampsRef.current,
    setForkConvoWithMessagesOnTheNextRender,
    reverify,
    setIsLoading,
    setAbortController,
    setHaveShownCostDialog,
    onQuery,
  })

  useCostSummary()

  useEffect(() => {
    setMessagesGetter(() => messages)
    setMessagesSetter(setMessages)
  }, [messages])

  useEffect(() => {
    setModelConfigChangeHandler(() => setUiRefreshCounter(prev => prev + 1))
  }, [])

  useLogMessages(messages, props.messageLogName, forkNumber)
  useLogStartupTime()

  useEffect(() => {
    onInit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const transcript = useTranscriptItems({
    messages,
    tools: props.tools,
    verbose,
    debug,
    toolJSX,
    toolUseConfirm,
    isMessageSelectorVisible,
    forkNumber,
  })

  const staticItems = useMemo(
    () => [
      {
        jsx: (
          <Box flexDirection="column" key={`logo${forkNumber}`}>
            <Logo
              mcpClients={mcpClients}
              isDefaultModel={isDefaultModel}
              updateBannerVersion={updateAvailableVersion}
              updateBannerCommands={updateCommands}
            />
            <ProjectOnboarding workspaceDir={getOriginalCwd()} />
          </Box>
        ),
      },
      ...transcript.items.slice(0, transcript.replStaticPrefixLength),
    ],
    [
      forkNumber,
      transcript.items,
      transcript.replStaticPrefixLength,
      mcpClients,
      isDefaultModel,
      updateAvailableVersion,
      updateCommands,
    ],
  )

  const transientItems = useMemo(
    () => transcript.items.slice(transcript.replStaticPrefixLength),
    [transcript.items, transcript.replStaticPrefixLength],
  )

  const showingCostDialog = !isLoading && showCostDialog
  const conversationKey = `${props.messageLogName}:${forkNumber}`

  const onCostDialogDone = useCallback(() => {
    setShowCostDialog(false)
    setHaveShownCostDialog(true)
    const projectConfig = getGlobalConfig()
    saveGlobalConfig({ ...projectConfig, hasAcknowledgedCostThreshold: true })
  }, [])

  const promptInputProps = buildPromptInputProps({
    commands: props.commands,
    forkNumber,
    messageLogName: props.messageLogName,
    tools: props.tools,
    disableSlashCommands,
    isDisabled: apiKeyStatus === 'invalid',
    isLoading,
    onQuery,
    debug,
    verbose,
    messages,
    setToolJSX,
    input: inputValue,
    onInputChange: setInputValue,
    mode: inputMode,
    onModeChange: setInputMode,
    submitCount,
    onSubmitCountChange: setSubmitCount,
    setIsLoading,
    setAbortController,
    uiRefreshCounter,
    onShowMessageSelector: () => setIsMessageSelectorVisible(prev => !prev),
    setForkConvoWithMessagesOnTheNextRender,
    readFileTimestamps: readFileTimestampsRef.current,
    abortController,
  })

  const handleMessageSelectorSelect = useMessageSelectorSelect({
    messages,
    setIsMessageSelectorVisible,
    setMessages,
    setForkConvoWithMessagesOnTheNextRender,
    setInputValue,
    onCancel,
  })

  return {
    conversationKey,
    safeMode,
    debug,
    forkNumber,
    staticItems,
    transientItems,
    toolJSX,
    toolUseConfirm,
    setToolUseConfirm,
    binaryFeedbackContext,
    setBinaryFeedbackContext,
    isLoading,
    verbose,
    normalizedMessages: transcript.normalizedMessages,
    tools: props.tools,
    erroredToolUseIDs: transcript.erroredToolUseIDs,
    inProgressToolUseIDs: transcript.inProgressToolUseIDs,
    unresolvedToolUseIDs: transcript.unresolvedToolUseIDs,
    showingCostDialog,
    onCostDialogDone,
    shouldShowPromptInput: props.shouldShowPromptInput,
    isMessageSelectorVisible,
    promptInputProps,
    messageSelectorMessages: messages,
    onMessageSelectorSelect: handleMessageSelectorSelect,
    onMessageSelectorEscape: () => setIsMessageSelectorVisible(false),
  }
}
