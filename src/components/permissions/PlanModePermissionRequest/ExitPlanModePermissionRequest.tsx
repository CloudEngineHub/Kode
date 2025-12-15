import { Box, Text, useInput } from 'ink'
import React, { useEffect, useMemo, useState } from 'react'
import { Select } from '@components/CustomSelect/select'
import TextInput from '@components/TextInput'
import { PermissionRequestTitle } from '@components/permissions/PermissionRequestTitle'
import type { ToolUseConfirm } from '@components/permissions/PermissionRequest'
import { getTheme } from '@utils/theme'
import { usePermissionContext } from '@context/PermissionContext'
import {
  getPlanConversationKey,
  getPlanFilePath,
  readPlanFile,
} from '@utils/planMode'
import {
  launchExternalEditor,
  launchExternalEditorForFilePath,
} from '@utils/externalEditor'
import { REJECT_MESSAGE_WITH_FEEDBACK_PREFIX } from '@utils/messages'
import { writeFileSync } from 'fs'

type Props = {
  toolUseConfirm: ToolUseConfirm
  onDone(): void
  verbose: boolean
}

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

  const [planText, setPlanText] = useState(() => {
    const { content, exists } = readPlanFile(undefined, conversationKey)
    return exists ? content : planPlaceholder()
  })
  const [planExists, setPlanExists] = useState(() => {
    const { exists } = readPlanFile(undefined, conversationKey)
    return exists
  })
  const [planSaved, setPlanSaved] = useState(false)
  const [showRejectInput, setShowRejectInput] = useState(false)
  const [rejectFeedback, setRejectFeedback] = useState('')
  const [rejectError, setRejectError] = useState<string | null>(null)
  const [rejectCursorOffset, setRejectCursorOffset] = useState(0)

  useEffect(() => {
    if (!planSaved) return
    const timeout = setTimeout(() => setPlanSaved(false), 5000)
    return () => clearTimeout(timeout)
  }, [planSaved])

  useInput((input, key) => {
    if (key.escape && !showRejectInput) {
      toolUseConfirm.onReject()
      onDone()
      return
    }

    if (!(key.ctrl && input.toLowerCase() === 'g')) return

    void (async () => {
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

  const bypassAvailable = toolUseConfirm.toolUseContext.options?.safeMode !== true

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
            Type here to tell Claude what to change (Enter submits, Esc cancels)
          </Text>
          {rejectError ? (
            <Text color={theme.error}>{rejectError}</Text>
          ) : null}
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
              toolUseConfirm.onReject(
                `${REJECT_MESSAGE_WITH_FEEDBACK_PREFIX}${trimmed}`,
              )
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
        <Text>Here is Claude's plan:</Text>
        <Box
          borderStyle="dashed"
          borderColor={theme.secondaryText}
          paddingX={1}
          paddingY={0}
        >
          <Text>{planText}</Text>
        </Box>
      </Box>

      <Box flexDirection="column" paddingX={2}>
        <Text dimColor>
          Tip: Press ctrl+g to edit plan file: {planFilePath}
          {planSaved ? ' · Plan saved!' : ''}
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text>Would you like to proceed?</Text>
        <Select
          options={[
            ...(bypassAvailable
              ? [{ label: 'Yes, and bypass permissions', value: 'yes-bypass' }]
              : [{ label: 'Yes, and auto-accept edits', value: 'yes-accept' }]),
            { label: 'Yes, and manually approve edits', value: 'yes-default' },
            { label: 'No, keep planning', value: 'no' },
          ]}
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
