import { Box, Text } from 'ink'
import React, { useEffect, useMemo, useState } from 'react'
import figures from 'figures'
import type { ToolUseConfirm } from '#ui-ink/components/permissions/PermissionRequest'
import { getTheme } from '#core/utils/theme'
import { usePermissionContext } from '#ui-ink/contexts/PermissionContext'
import {
  getPlanConversationKey,
  getPlanFilePath,
  readPlanFile,
} from '#core/utils/planMode'
import {
  launchExternalEditor,
  launchExternalEditorForFilePath,
} from '#cli-utils/externalEditor'
import { writeFileSync } from 'fs'
import {
  type ExitPlanModeOptionValue,
  getExitPlanModeOptions,
} from './ExitPlanModeOptions'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { useTerminalSize } from '#ui-ink/hooks/useTerminalSize'
import { ScreenFrame } from '#ui-ink/primitives/layout/ScreenFrame'
import { useScreenLayout } from '#ui-ink/primitives/layout/useScreenLayout'
import { getWindowedList } from '#ui-ink/primitives/list/windowedList'
import { wrapLines } from '#ui-ink/primitives/text/wrapLines'
import { getPermissionModeCycleShortcut } from '#ui-ink/utils/permissionModeCycleShortcut'
import type { PermissionMode } from '#core/types/PermissionMode'
import { applyToolPermissionContextUpdateForConversationKey } from '#core/utils/toolPermissionContextState'
import { getMessagesSetter } from '#core/messages'
import { getContext } from '#core/context'
import { getCodeStyle } from '#core/utils/style'
import { resetReminderSession } from '#core/services/systemReminder'
import { resetFileFreshnessSession } from '#core/services/fileFreshness'

type Props = {
  toolUseConfirm: ToolUseConfirm
  onDone(): void
  verbose: boolean
}

export { __getExitPlanModeOptionsForTests } from './ExitPlanModeOptions'

function planPlaceholder(): string {
  return 'No plan found. Please write your plan to the plan file first.'
}

function clearConversationContextForPlanExit(): void {
  getMessagesSetter()([])
  getContext.cache.clear?.()
  getCodeStyle.cache.clear?.()
  resetReminderSession()
  resetFileFreshnessSession()
}

export function ExitPlanModePermissionRequest({
  toolUseConfirm,
  onDone,
}: Props): React.ReactNode {
  const theme = getTheme()
  const layout = useScreenLayout()
  const { columns, rows } = useTerminalSize()
  const { setMode } = usePermissionContext()
  const modeCycleShortcut = useMemo(() => getPermissionModeCycleShortcut(), [])

  const conversationKey = getPlanConversationKey(toolUseConfirm.toolUseContext)
  const planFilePath = useMemo(
    () => getPlanFilePath(undefined, conversationKey),
    [conversationKey],
  )

  const inputPlan = toolUseConfirm.input.plan
  const planFromInput =
    typeof inputPlan === 'string' && inputPlan.trim().length > 0
      ? inputPlan
      : null
  const planSource: 'file' | 'input' = planFromInput ? 'input' : 'file'

  const [planText, setPlanText] = useState(() => {
    if (planSource === 'input') {
      return planFromInput!
    }
    const { content, exists } = readPlanFile(undefined, conversationKey)
    return exists ? content : planPlaceholder()
  })
  const [planExists, setPlanExists] = useState(() => {
    if (planSource === 'input') return false
    const { exists } = readPlanFile(undefined, conversationKey)
    return exists
  })
  const [planSaved, setPlanSaved] = useState(false)
  const [rejectDraft, setRejectDraft] = useState('')
  const [focusedOptionIndex, setFocusedOptionIndex] = useState(0)
  const [planFocusIndex, setPlanFocusIndex] = useState(0)

  useEffect(() => {
    if (!planSaved) return
    const timeout = setTimeout(() => setPlanSaved(false), 5000)
    return () => clearTimeout(timeout)
  }, [planSaved])

  const planViewportWidth = Math.max(20, columns - layout.paddingX * 2 - 2)
  const planLines = useMemo(
    () => wrapLines(planText.split('\n'), planViewportWidth),
    [planText, planViewportWidth],
  )

  useEffect(() => {
    setPlanFocusIndex(prev => {
      if (planLines.length === 0) return 0
      return Math.max(0, Math.min(prev, planLines.length - 1))
    })
  }, [planLines.length])

  const planViewportRows = Math.max(6, Math.min(14, Math.floor(rows * 0.4)))
  const planWindow = useMemo(
    () =>
      getWindowedList({
        itemCount: planLines.length,
        focusIndex: planFocusIndex,
        maxVisible: planViewportRows,
        indicatorRows: 2,
      }),
    [planFocusIndex, planLines.length, planViewportRows],
  )

  const showExitWithoutPlan =
    planSource === 'file' && (!planExists || planText.trim().length === 0)

  const bypassAvailable =
    toolUseConfirm.toolUseContext.options?.safeMode !== true
  const options = useMemo(() => {
    return getExitPlanModeOptions({ bypassAvailable })
  }, [bypassAvailable])

  useEffect(() => {
    setFocusedOptionIndex(prev =>
      Math.max(0, Math.min(prev, options.length - 1)),
    )
  }, [options.length])

  useEffect(() => {
    if (!showExitWithoutPlan) return
    setFocusedOptionIndex(prev => Math.max(0, Math.min(prev, 1)))
  }, [showExitWithoutPlan])

  const applyPermissionMode = (nextMode: PermissionMode) => {
    const conversationKey = getPlanConversationKey(
      toolUseConfirm.toolUseContext,
    )
    const safeMode = toolUseConfirm.toolUseContext.options?.safeMode === true
    const updatedToolPermissionContext =
      applyToolPermissionContextUpdateForConversationKey({
        conversationKey,
        isBypassPermissionsModeAvailable: !safeMode,
        update: { type: 'setMode', mode: nextMode, destination: 'session' },
      })

    toolUseConfirm.toolUseContext.options ??= {}
    toolUseConfirm.toolUseContext.options.toolPermissionContext =
      updatedToolPermissionContext

    setMode(nextMode)
  }

  const handleApprove = (value: ExitPlanModeOptionValue) => {
    const clearContext =
      value !== 'yes-accept-edits-keep-context' &&
      value !== 'yes-default-keep-context'

    let nextMode: PermissionMode = 'default'
    switch (value) {
      case 'yes-bypass-permissions':
        nextMode = 'bypassPermissions'
        break
      case 'yes-accept-edits':
        nextMode = 'acceptEdits'
        break
      case 'yes-default':
        nextMode = 'default'
        break
      case 'yes-accept-edits-keep-context':
        nextMode = bypassAvailable ? 'bypassPermissions' : 'acceptEdits'
        break
      case 'yes-default-keep-context':
        nextMode = 'default'
        break
      case 'no':
        return
      default: {
        const neverValue: never = value
        throw new Error(`Unexpected ExitPlanMode option: ${String(neverValue)}`)
      }
    }

    applyPermissionMode(nextMode)

    if (clearContext) {
      clearConversationContextForPlanExit()
    }

    toolUseConfirm.onAllow('temporary')
    onDone()
  }

  useKeypress((input, key) => {
    if (key.escape) {
      toolUseConfirm.onReject()
      onDone()
      return true
    }

    if (showExitWithoutPlan) {
      if (key.upArrow) {
        setFocusedOptionIndex(0)
        return true
      }

      if (key.downArrow) {
        setFocusedOptionIndex(1)
        return true
      }

      if (key.return) {
        if (focusedOptionIndex === 0) {
          applyPermissionMode('default')
          toolUseConfirm.onAllow('temporary')
          onDone()
          return true
        }

        toolUseConfirm.onReject()
        onDone()
        return true
      }

      return
    }

    if (modeCycleShortcut.check(input, key)) {
      const quickValue: ExitPlanModeOptionValue = bypassAvailable
        ? 'yes-bypass-permissions'
        : 'yes-accept-edits'
      handleApprove(quickValue)
      return true
    }

    if (key.pageUp && !showExitWithoutPlan) {
      setPlanFocusIndex(prev => Math.max(0, prev - planWindow.visibleCount))
      return true
    }

    if (key.pageDown && !showExitWithoutPlan) {
      setPlanFocusIndex(prev =>
        Math.min(
          Math.max(0, planLines.length - 1),
          prev + planWindow.visibleCount,
        ),
      )
      return true
    }

    if (key.home && !showExitWithoutPlan) {
      setPlanFocusIndex(0)
      return true
    }

    if (key.end && !showExitWithoutPlan) {
      setPlanFocusIndex(Math.max(0, planLines.length - 1))
      return true
    }

    if (key.upArrow) {
      setFocusedOptionIndex(prev => Math.max(0, prev - 1))
      return true
    }

    if (key.downArrow) {
      setFocusedOptionIndex(prev => Math.min(options.length - 1, prev + 1))
      return true
    }

    const focusedOption = options[focusedOptionIndex]

    if (key.return) {
      if (focusedOption?.type === 'input') {
        const trimmed = rejectDraft.trim()
        if (!trimmed) return true
        toolUseConfirm.onReject(trimmed)
        onDone()
        return true
      }

      if (focusedOption && 'value' in focusedOption) {
        handleApprove(focusedOption.value)
        return true
      }
    }

    if (focusedOption?.type === 'input') {
      if (key.backspace || key.delete) {
        setRejectDraft(prev => prev.slice(0, -1))
        return true
      }

      if (key.paste || key.insertable) {
        if (input.length > 0) {
          setRejectDraft(prev => prev + input)
        }
        return true
      }
    }

    if (!(key.ctrl && input.toLowerCase() === 'g')) return

    void (async () => {
      if (planSource === 'input') {
        const edited = await launchExternalEditor(planText)
        if (edited.text !== null) {
          setPlanText(edited.text)
          setPlanSaved(true)
        }
        return
      }

      if (!planExists) {
        const initial = planText === planPlaceholder() ? '# Plan\n' : planText
        try {
          writeFileSync(planFilePath, initial, 'utf-8')
        } catch {
          const edited = await launchExternalEditor(initial)
          if (edited.text !== null) {
            setPlanText(edited.text)
            setPlanSaved(true)
          }
          return
        }
      }

      const opened = await launchExternalEditorForFilePath(planFilePath)
      if (opened.ok) {
        const next = readPlanFile(undefined, conversationKey)
        setPlanExists(next.exists)
        setPlanText(next.exists ? next.content : planPlaceholder())
        setPlanSaved(true)
      }
    })()
  })

  if (showExitWithoutPlan) {
    const yesIsFocused = focusedOptionIndex === 0
    const noIsFocused = focusedOptionIndex === 1

    return (
      <Box marginTop={1} width="100%">
        <ScreenFrame
          title="Exit plan mode?"
          titleColor={theme.planMode}
          paddingX={layout.paddingX}
          paddingY={layout.tightLayout ? 0 : layout.paddingY}
          gap={layout.gap}
        >
          <Box flexDirection="column" gap={layout.gap}>
            <Text>Agent wants to exit plan mode</Text>
            <Box flexDirection="column">
              <Box paddingLeft={2} paddingRight={1}>
                {yesIsFocused ? (
                  <Text color={theme.kode}>{figures.pointer}</Text>
                ) : null}
                <Text
                  bold={yesIsFocused}
                  color={yesIsFocused ? theme.kode : theme.text}
                >
                  Yes
                </Text>
              </Box>
              <Box paddingLeft={2} paddingRight={1}>
                {noIsFocused ? (
                  <Text color={theme.kode}>{figures.pointer}</Text>
                ) : null}
                <Text
                  bold={noIsFocused}
                  color={noIsFocused ? theme.kode : theme.text}
                >
                  No
                </Text>
              </Box>
            </Box>
            <Text dimColor wrap="truncate-end">
              Enter to confirm · Esc to exit
            </Text>
          </Box>
        </ScreenFrame>
      </Box>
    )
  }

  const topIndicator = planWindow.showUpIndicator
    ? `${figures.arrowUp} More`
    : ' '
  const bottomIndicator = planWindow.showDownIndicator
    ? `${figures.arrowDown} More`
    : ' '

  return (
    <Box marginTop={1} width="100%">
      <ScreenFrame
        title="Ready to code?"
        titleColor={theme.planMode}
        paddingX={layout.paddingX}
        paddingY={layout.tightLayout ? 0 : layout.paddingY}
        gap={layout.gap}
      >
        <Box flexDirection="column" gap={layout.gap}>
          <Box flexDirection="column">
            <Text dimColor wrap="truncate-end">
              Plan preview · PgUp/PgDn scroll
            </Text>
            <Box flexDirection="column" width="100%">
              <Text dimColor wrap="truncate-end">
                {topIndicator}
              </Text>
              {planLines
                .slice(planWindow.start, planWindow.end)
                .map((line, idx) => (
                  <Box key={`${planWindow.start + idx}`}>
                    <Text wrap="truncate-end">{line}</Text>
                  </Box>
                ))}
              <Text dimColor wrap="truncate-end">
                {bottomIndicator}
              </Text>
            </Box>
          </Box>

          <Text dimColor wrap="truncate-end">
            Tip: Ctrl+G to edit{' '}
            {planSource === 'file' ? planFilePath : 'plan text'}
            {planSaved ? ' · Plan saved!' : ''}
          </Text>

          <Box flexDirection="column">
            <Text dimColor>Would you like to proceed?</Text>
            <Box flexDirection="column">
              {options.map((option, idx) => {
                const isFocused = idx === focusedOptionIndex

                if (option.type === 'input') {
                  const placeholder = option.placeholder
                  const suffix =
                    rejectDraft.length > 0 ? rejectDraft : placeholder
                  const suffixColor =
                    rejectDraft.length > 0 ? theme.text : theme.secondaryText

                  return (
                    <Box key={option.value} paddingLeft={2} paddingRight={1}>
                      {isFocused ? (
                        <Text color={theme.kode}>{figures.pointer}</Text>
                      ) : null}
                      <Text
                        bold={isFocused}
                        color={isFocused ? theme.kode : theme.text}
                        wrap="truncate-end"
                      >
                        {option.label}
                      </Text>
                      <Text dimColor> {figures.arrowRight} </Text>
                      <Text color={suffixColor} wrap="truncate-end">
                        {suffix}
                      </Text>
                    </Box>
                  )
                }

                return (
                  <Box key={option.value} paddingLeft={2} paddingRight={1}>
                    {isFocused ? (
                      <Text color={theme.kode}>{figures.pointer}</Text>
                    ) : null}
                    <Text
                      bold={isFocused}
                      color={isFocused ? theme.kode : theme.text}
                      wrap="truncate-end"
                    >
                      {option.label}
                    </Text>
                  </Box>
                )
              })}
            </Box>
          </Box>

          <Text dimColor wrap="truncate-end">
            Enter to confirm · Esc to exit · {modeCycleShortcut.displayText}{' '}
            quick select
          </Text>
        </Box>
      </ScreenFrame>
    </Box>
  )
}
