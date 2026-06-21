import { Option, SelectProps } from '@inkjs/ui'
import chalk from 'chalk'
import { Box, Text } from 'ink'
import Link from 'ink-link'
import React, { useState } from 'react'
import { getTheme } from '#core/utils/theme'
import { Select } from '#ui-ink/components/CustomSelect/select'
import type { Tool } from '#core/tooling/Tool'
import type { NormalizedMessage } from '#core/utils/messages'
import { BinaryFeedbackOption } from './BinaryFeedbackOption'
import type { AssistantMessage } from '#core/query'
import type { BinaryFeedbackChoose } from './utils'
import { useExitOnCtrlCD } from '#ui-ink/hooks/useExitOnCtrlCD'
import { BinaryFeedbackChoice } from './utils'
import { PRODUCT_NAME } from '#core/constants/product'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { useTerminalSize } from '#ui-ink/hooks/useTerminalSize'
import { Divider } from '#ui-ink/primitives/components/Divider'

const HELP_URL = 'https://go/cli-feedback'

type BinaryFeedbackOption = Option & { value: BinaryFeedbackChoice }

// Make options a function to avoid early theme access during module initialization
export function getOptions(): BinaryFeedbackOption[] {
  return [
    {
      // This option combines the follow user intents:
      // - The two options look about equally good to me
      // - I don't feel confident enough to choose
      // - I don't want to choose right now
      label: 'Choose for me',
      value: 'no-preference',
    },
    {
      label: 'Left option looks better',
      value: 'prefer-left',
    },
    {
      label: 'Right option looks better',
      value: 'prefer-right',
    },
    {
      label: `Neither, and tell ${PRODUCT_NAME} what to do differently (${chalk.bold.hex(getTheme().warning)('esc')})`,
      value: 'neither',
    },
  ]
}

type Props = {
  m1: AssistantMessage
  m2: AssistantMessage
  onChoose?: BinaryFeedbackChoose
  debug: boolean
  erroredToolUseIDs: Set<string>
  inProgressToolUseIDs: Set<string>
  normalizedMessages: NormalizedMessage[]
  tools: Tool[]
  unresolvedToolUseIDs: Set<string>
  verbose: boolean
}

export function BinaryFeedbackView({
  m1,
  m2,
  onChoose,
  debug,
  erroredToolUseIDs,
  inProgressToolUseIDs,
  normalizedMessages,
  tools,
  unresolvedToolUseIDs,
  verbose,
}: Props) {
  const theme = getTheme()
  const { rows, columns } = useTerminalSize()
  const [focused, setFocus] = useState('no-preference')
  const [focusValue, setFocusValue] = useState<string | undefined>(undefined)
  const exitState = useExitOnCtrlCD(() => process.exit(1))

  // Keep a bottom margin to avoid terminal scroll/flicker when Ink re-renders near the last row.
  // Reserve 1 row for the exit/hint line rendered outside the bordered panel.
  const panelHeight = Math.max(1, rows - 2)

  useKeypress((_input, key) => {
    if (key.leftArrow) {
      setFocusValue('prefer-left')
    } else if (key.rightArrow) {
      setFocusValue('prefer-right')
    } else if (key.escape) {
      onChoose?.('neither')
    }
  })

  return (
    <>
      <Box
        flexDirection="column"
        height={panelHeight}
        width="100%"
        paddingX={1}
      >
        <Box width="100%" justifyContent="space-between">
          <Text bold color={theme.permission}>
            [ANT-ONLY] Help train {PRODUCT_NAME}
          </Text>
          <Text>
            <Link url={HELP_URL}>[?]</Link>
          </Text>
        </Box>
        <Divider width={Math.max(1, columns - 2)} />
        <Box flexDirection="row" width="100%" flexGrow={1} paddingTop={1}>
          <Box
            flexDirection="column"
            flexGrow={1}
            flexBasis={1}
            gap={1}
            borderStyle={focused === 'prefer-left' ? 'bold' : 'single'}
            borderColor={
              focused === 'prefer-left' ? theme.success : theme.secondaryBorder
            }
            marginRight={1}
            padding={1}
          >
            <BinaryFeedbackOption
              erroredToolUseIDs={erroredToolUseIDs}
              debug={debug}
              inProgressToolUseIDs={inProgressToolUseIDs}
              message={m1}
              normalizedMessages={normalizedMessages}
              tools={tools}
              unresolvedToolUseIDs={unresolvedToolUseIDs}
              verbose={verbose}
            />
          </Box>
          <Box
            flexDirection="column"
            flexGrow={1}
            flexBasis={1}
            gap={1}
            borderStyle={focused === 'prefer-right' ? 'bold' : 'single'}
            borderColor={
              focused === 'prefer-right' ? theme.success : theme.secondaryBorder
            }
            marginLeft={1}
            padding={1}
          >
            <BinaryFeedbackOption
              erroredToolUseIDs={erroredToolUseIDs}
              debug={debug}
              inProgressToolUseIDs={inProgressToolUseIDs}
              message={m2}
              normalizedMessages={normalizedMessages}
              tools={tools}
              unresolvedToolUseIDs={unresolvedToolUseIDs}
              verbose={verbose}
            />
          </Box>
        </Box>
        <Box flexDirection="column" paddingTop={1}>
          <Text>How do you want to proceed?</Text>
          <Select
            options={getOptions()}
            onFocus={setFocus}
            focusValue={focusValue}
            onChange={onChoose as SelectProps['onChange']}
          />
        </Box>
      </Box>
      {exitState.pending ? (
        <Box marginLeft={3}>
          <Text dimColor>Press {exitState.keyName} again to exit</Text>
        </Box>
      ) : (
        // Render a blank line so that the UI doesn't reflow when the exit message is shown
        <Text> </Text>
      )}
    </>
  )
}
