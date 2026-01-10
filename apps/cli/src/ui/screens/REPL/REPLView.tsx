import { Box, Static, type DOMElement, measureElement, useStdout } from 'ink'
import * as React from 'react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import ansiEscapes from 'ansi-escapes'
import type { ToolUseConfirm } from '#ui-ink/components/permissions/PermissionRequest'
import { PermissionRequest } from '#ui-ink/components/permissions/PermissionRequest'
import PromptInput from '#ui-ink/components/PromptInput'
import { RequestStatusIndicator } from '#ui-ink/components/RequestStatusIndicator'
import { CostThresholdDialog } from '#ui-ink/components/CostThresholdDialog'
import { BinaryFeedback } from '#ui-ink/components/binary-feedback/BinaryFeedback'
import { MessageSelector } from '#ui-ink/components/MessageSelector'
import { PermissionProvider } from '#ui-ink/context/PermissionContext'
import { useTerminalSize } from '#ui-ink/hooks/useTerminalSize'
import { useFlickerDetector } from '#ui-ink/hooks/useFlickerDetector'
import {
  normalizeMessagesForAPI,
  type NormalizedMessage,
} from '#core/utils/messages'
import type { Message as MessageType } from '#core/query'
import type { Tool } from '#core/tooling/Tool'
import type { TranscriptItem } from './useTranscriptItems'
import type { BinaryFeedbackContext } from './types'
import { TransientViewportProvider } from '#ui-ink/contexts/TransientViewportContext'

export function REPLView({
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
  normalizedMessages,
  tools,
  erroredToolUseIDs,
  inProgressToolUseIDs,
  unresolvedToolUseIDs,
  showingCostDialog,
  onCostDialogDone,
  shouldShowPromptInput,
  isMessageSelectorVisible,
  promptInputProps,
  messageSelectorMessages,
  onMessageSelectorSelect,
  onMessageSelectorEscape,
}: {
  conversationKey: string
  safeMode: boolean
  debug: boolean
  forkNumber: number
  staticItems: TranscriptItem[]
  transientItems: TranscriptItem[]
  toolJSX: {
    jsx: ReactNode | null
    shouldHidePromptInput: boolean
    displayMode?: 'inline' | 'fullscreen'
  } | null
  toolUseConfirm: ToolUseConfirm | null
  setToolUseConfirm: (confirm: ToolUseConfirm | null) => void
  binaryFeedbackContext: BinaryFeedbackContext | null
  setBinaryFeedbackContext: (ctx: BinaryFeedbackContext | null) => void
  isLoading: boolean
  verbose: boolean
  normalizedMessages: NormalizedMessage[]
  tools: Tool[]
  erroredToolUseIDs: Set<string>
  inProgressToolUseIDs: Set<string>
  unresolvedToolUseIDs: Set<string>
  showingCostDialog: boolean
  onCostDialogDone: () => void
  shouldShowPromptInput: boolean
  isMessageSelectorVisible: boolean
  promptInputProps: React.ComponentProps<typeof PromptInput>
  messageSelectorMessages: MessageType[]
  onMessageSelectorSelect: (message: MessageType) => void | Promise<void>
  onMessageSelectorEscape: () => void
}): React.ReactNode {
  const rootUiRef = useRef<DOMElement | null>(null)
  const mainControlsRef = useRef<DOMElement | null>(null)
  const transientItemsRef = useRef<DOMElement | null>(null)
  const messageSelectorRef = useRef<DOMElement | null>(null)
  const { stdout } = useStdout()
  const { rows, columns } = useTerminalSize()
  useFlickerDetector(rootUiRef, rows, true)

  const isFullScreenToolView = toolJSX?.displayMode === 'fullscreen'

  const lastTerminalWidthRef = useRef(columns)
  const isInitialMountRef = useRef(true)
  const [staticRemountKey, setStaticRemountKey] = useState(0)
  const [staticNeedsRefresh, setStaticNeedsRefresh] = useState(false)
  const lastStaticRefreshAtRef = useRef(0)

  const [footerMeasureTick, setFooterMeasureTick] = useState(0)
  const requestFooterRemeasure = useCallback(() => {
    setFooterMeasureTick(prev => prev + 1)
  }, [])

  const [mainControlsHeight, setMainControlsHeight] = useState(0)
  const [messageSelectorHeight, setMessageSelectorHeight] = useState(0)

  // Mirror Gemini CLI: measure the "footer" (controls + prompt) height and use it to
  // constrain transient (actively changing) transcript content to the remaining viewport.
  //
  // Use `useLayoutEffect` so height changes (e.g. opening/closing completion) are applied
  // before Ink paints, avoiding one-frame overflows that can scroll the terminal and leave
  // "ghost" prompt lines behind.
  //
  // Note: completion can become active via effects without changing `promptInputProps.input`
  // (e.g. auto-triggered suggestions). Measure every render and only commit when the height
  // actually changes so we never miss a footer growth event.
  useLayoutEffect(() => {
    if (mainControlsRef.current) {
      const measured = measureElement(mainControlsRef.current).height
      setMainControlsHeight(prev => (prev === measured ? prev : measured))
    }

    if (messageSelectorRef.current) {
      const measured = measureElement(messageSelectorRef.current).height
      setMessageSelectorHeight(prev => (prev === measured ? prev : measured))
    } else {
      setMessageSelectorHeight(prev => (prev === 0 ? prev : 0))
    }
  }, [
    footerMeasureTick,
    columns,
    rows,
    isLoading,
    showingCostDialog,
    isMessageSelectorVisible,
    shouldShowPromptInput,
    toolJSX,
    toolUseConfirm,
    binaryFeedbackContext,
  ])

  useEffect(() => {
    if (!transientItemsRef.current) return
    if (rows <= 0 || columns <= 0) return

    const transientHeight = measureElement(transientItemsRef.current).height
    const availableHeight = Math.max(
      1,
      rows - mainControlsHeight - messageSelectorHeight,
    )

    if (transientHeight <= availableHeight) return
    if (staticNeedsRefresh) return

    const now = Date.now()
    const elapsed = now - lastStaticRefreshAtRef.current
    if (elapsed < 500) return

    setStaticNeedsRefresh(true)
  }, [
    columns,
    rows,
    mainControlsHeight,
    messageSelectorHeight,
    staticNeedsRefresh,
    transientItems.length,
  ])

  useEffect(() => {
    if (!staticNeedsRefresh) return

    // Avoid clearing while the UI is actively streaming; wait until idle-ish
    // so we don't introduce additional tearing.
    if (isLoading) return

    try {
      const out = stdout ?? process.stdout
      if (out?.isTTY) {
        out.write(ansiEscapes.clearTerminal)
      }
    } catch {
      // best-effort only
    }
    lastStaticRefreshAtRef.current = Date.now()
    setStaticRemountKey(prev => prev + 1)
    setStaticNeedsRefresh(false)
  }, [columns, isLoading, rows, staticNeedsRefresh, stdout])

  const lastFullScreenToolViewRef = useRef(isFullScreenToolView)
  useEffect(() => {
    if (lastFullScreenToolViewRef.current === isFullScreenToolView) return
    lastFullScreenToolViewRef.current = isFullScreenToolView

    try {
      const out = stdout ?? process.stdout
      if (out?.isTTY) {
        out.write(ansiEscapes.clearTerminal)
      }
    } catch {
      // best-effort only
    }

    lastStaticRefreshAtRef.current = Date.now()
    setStaticRemountKey(prev => prev + 1)
    setStaticNeedsRefresh(false)
  }, [isFullScreenToolView, stdout])

  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false
      lastTerminalWidthRef.current = columns
      return
    }

    // When <Static> content was printed at a wider terminal width, shrinking the terminal can
    // cause "tearing" where Ink's dynamic region ends up misaligned with scrollback rows.
    // Gemini CLI fixes this by clearing and remounting <Static> when the width decreases.
    const handler = setTimeout(() => {
      const last = lastTerminalWidthRef.current
      if (columns < last) {
        try {
          const out = stdout ?? process.stdout
          if (out?.isTTY) {
            out.write(ansiEscapes.clearTerminal)
          }
        } catch {
          // best-effort only
        }
        setStaticRemountKey(prev => prev + 1)
      }
      lastTerminalWidthRef.current = columns
    }, 300)

    return () => {
      clearTimeout(handler)
    }
  }, [columns, stdout])

  const transientMaxHeight = Math.max(
    1,
    rows - mainControlsHeight - messageSelectorHeight,
  )
  const transientViewportValue = useMemo(
    () => ({ maxHeight: transientMaxHeight }),
    [transientMaxHeight],
  )

  return (
    <TransientViewportProvider value={transientViewportValue}>
      <PermissionProvider
        conversationKey={conversationKey}
        isBypassPermissionsModeAvailable={!safeMode}
      >
        <Box ref={rootUiRef} flexDirection="column" width="100%">
          {!isFullScreenToolView && (
            <>
              <React.Fragment
                key={`static-messages-${forkNumber}-${staticRemountKey}`}
              >
                <Static
                  items={staticItems}
                  children={(item, index) => (
                    <React.Fragment key={index}>{item.jsx}</React.Fragment>
                  )}
                />
              </React.Fragment>
              <Box ref={transientItemsRef} flexDirection="column" width="100%">
                {transientItems.map(_ => _.jsx)}
              </Box>
            </>
          )}
          <Box
            ref={mainControlsRef}
            borderColor="red"
            borderStyle={debug ? 'single' : undefined}
            flexDirection="column"
            width="100%"
          >
            {!toolJSX &&
              !toolUseConfirm &&
              !binaryFeedbackContext &&
              isLoading && <RequestStatusIndicator />}
            {toolJSX ? toolJSX.jsx : null}
            {!toolJSX && binaryFeedbackContext && !isMessageSelectorVisible && (
              <BinaryFeedback
                m1={binaryFeedbackContext.m1}
                m2={binaryFeedbackContext.m2}
                resolve={result => {
                  binaryFeedbackContext.resolve(result)
                  setTimeout(() => setBinaryFeedbackContext(null), 0)
                }}
                verbose={verbose}
                normalizedMessages={normalizedMessages}
                tools={tools}
                debug={debug}
                erroredToolUseIDs={erroredToolUseIDs}
                inProgressToolUseIDs={inProgressToolUseIDs}
                unresolvedToolUseIDs={unresolvedToolUseIDs}
              />
            )}
            {!toolJSX &&
              toolUseConfirm &&
              !isMessageSelectorVisible &&
              !binaryFeedbackContext && (
                <PermissionRequest
                  toolUseConfirm={toolUseConfirm}
                  onDone={() => setToolUseConfirm(null)}
                  verbose={verbose}
                />
              )}
            {!toolJSX &&
              !toolUseConfirm &&
              !isMessageSelectorVisible &&
              !binaryFeedbackContext &&
              showingCostDialog && (
                <CostThresholdDialog onDone={onCostDialogDone} />
              )}

            {!toolUseConfirm &&
              !toolJSX?.shouldHidePromptInput &&
              shouldShowPromptInput &&
              !isMessageSelectorVisible &&
              !binaryFeedbackContext &&
              !showingCostDialog && <PromptInput {...promptInputProps} />}
          </Box>
          {isMessageSelectorVisible && (
            <Box ref={messageSelectorRef} flexDirection="column" width="100%">
              <MessageSelector
                erroredToolUseIDs={erroredToolUseIDs}
                unresolvedToolUseIDs={unresolvedToolUseIDs}
                messages={normalizeMessagesForAPI(messageSelectorMessages)}
                onSelect={onMessageSelectorSelect}
                onEscape={onMessageSelectorEscape}
                tools={tools}
              />
            </Box>
          )}
        </Box>
      </PermissionProvider>
    </TransientViewportProvider>
  )
}
