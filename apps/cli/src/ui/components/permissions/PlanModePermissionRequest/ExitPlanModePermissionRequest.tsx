import { Box, Text } from 'ink'
import React, { useEffect, useMemo, useState } from 'react'
import { Select } from '#ui-ink/components/CustomSelect/select'
import TextInput from '#ui-ink/components/TextInput'
import { PermissionRequestTitle } from '#ui-ink/components/permissions/PermissionRequestTitle'
import type { ToolUseConfirm } from '#ui-ink/components/permissions/PermissionRequest'
import { getTheme } from '#core/utils/theme'
import { usePermissionContext } from '#ui-ink/context/PermissionContext'
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

type Props = {
  toolUseConfirm: ToolUseConfirm
  onDone(): void
  verbose: boolean
}

export { __getExitPlanModeOptionsForTests } from './ExitPlanModeOptions'

function planPlaceholder(): string {
  return 'No plan found. Please write your plan to the plan file first.'
}

export function ExitPlanModePermissionRequest({
  toolUseConfirm,
  onDone,
}: Props): React.ReactNode {
  const theme = getTheme()
  const { setMode } = usePermissionContext()

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
  const [showRejectInput, setShowRejectInput] = useState(false)
  const [rejectFeedback, setRejectFeedback] = useState('')
  const [rejectError, setRejectError] = useState<string | null>(null)
  const [rejectCursorOffset, setRejectCursorOffset] = useState(0)
  const [focusedOption, setFocusedOption] =
    useState<ExitPlanModeOptionValue | null>(null)

  useEffect(() => {
    if (!planSaved) return
    const timeout = setTimeout(() => setPlanSaved(false), 5000)
    return () => clearTimeout(timeout)
  }, [planSaved])

  useKeypress((input, key) => {
    if (key.escape && !showRejectInput) {
      toolUseConfirm.onReject()
      onDone()
      return
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
          // Fall back to editing a temp buffer.
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

  const bypassAvailable =
    toolUseConfirm.toolUseContext.options?.safeMode !== true
  const options = useMemo(
    () =>
      getExitPlanModeOptions({
        bypassAvailable,
      }),
    [bypassAvailable],
  )

  if (showRejectInput) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.permission}
        marginTop={1}
        paddingLeft={1}
        paddingRight={1}
        paddingBottom={1}
      >
        <PermissionRequestTitle title="No, keep planning" riskScore={null} />
        <Box flexDirection="column" paddingX={2} paddingY={1}>
          <Text dimColor>
            Type here to tell Kode Agent what to change (Enter submits, Esc
            cancels)
          </Text>
          {rejectError ? <Text color={theme.error}>{rejectError}</Text> : null}
          <TextInput
            value={rejectFeedback}
            onChange={value => {
              setRejectFeedback(value)
              setRejectError(null)
            }}
            onSubmit={() => {
              const trimmed = rejectFeedback.trim()
              if (!trimmed) {
                setRejectError('Please enter what you want changed.')
                return
              }
              toolUseConfirm.onReject(trimmed)
              onDone()
            }}
            onExit={() => {
              setShowRejectInput(false)
              setRejectFeedback('')
              setRejectError(null)
            }}
            columns={80}
            cursorOffset={rejectCursorOffset}
            onChangeCursorOffset={setRejectCursorOffset}
          />
        </Box>
      </Box>
    )
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.permission}
      marginTop={1}
      paddingLeft={1}
      paddingRight={1}
      paddingBottom={1}
    >
      <PermissionRequestTitle title="Ready to code?" riskScore={null} />

      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text>Here is Kode Agent&apos;s plan:</Text>
        <Box
          borderStyle="single"
          borderColor={theme.secondaryBorder}
          borderDimColor
          borderLeft={false}
          borderRight={false}
          paddingX={1}
          paddingY={0}
          marginBottom={1}
          flexDirection="column"
        >
          <Text>{planText}</Text>
        </Box>
      </Box>

      <Box flexDirection="column" paddingX={2}>
        <Text dimColor>
          Tip: Press ctrl+g to edit{' '}
          {planSource === 'file' ? `plan file: ${planFilePath}` : 'plan text'}
          {planSaved ? ' · Plan saved!' : ''}
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>Would you like to proceed?</Text>
        <Select
          options={options}
          onFocus={value => setFocusedOption(value as ExitPlanModeOptionValue)}
          onChange={value => {
            if (value === 'no') {
              setShowRejectInput(true)
              return
            }

            const nextMode =
              value === 'yes-bypass'
                ? 'bypassPermissions'
                : value === 'yes-accept'
                  ? 'acceptEdits'
                  : 'default'

            setMode(nextMode)

            toolUseConfirm.onAllow('temporary')
            onDone()
          }}
        />
      </Box>
    </Box>
  )
}
