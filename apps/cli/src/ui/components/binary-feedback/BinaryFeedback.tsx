import { default as React, useCallback } from 'react'
import { useNotifyAfterTimeout } from '#ui-ink/hooks/useNotifyAfterTimeout'
import { AssistantMessage, BinaryFeedbackResult } from '#core/query'
import type { Tool } from '#core/tooling/Tool'
import type { NormalizedMessage } from '#core/utils/messages'
import { BinaryFeedbackView } from './BinaryFeedbackView'
import {
  type BinaryFeedbackChoose,
  getBinaryFeedbackResultForChoice,
  logBinaryFeedbackEvent,
} from './utils'
import { PRODUCT_NAME } from '#core/constants/product'

type Props = {
  m1: AssistantMessage
  m2: AssistantMessage
  resolve: (result: BinaryFeedbackResult) => void
  debug: boolean
  erroredToolUseIDs: Set<string>
  inProgressToolUseIDs: Set<string>
  normalizedMessages: NormalizedMessage[]
  tools: Tool[]
  unresolvedToolUseIDs: Set<string>
  verbose: boolean
}

export function BinaryFeedback({
  m1,
  m2,
  resolve,
  debug,
  erroredToolUseIDs,
  inProgressToolUseIDs,
  normalizedMessages,
  tools,
  unresolvedToolUseIDs,
  verbose,
}: Props): React.ReactNode {
  const onChoose = useCallback<BinaryFeedbackChoose>(
    choice => {
      logBinaryFeedbackEvent(m1, m2, choice)
      resolve(getBinaryFeedbackResultForChoice(m1, m2, choice))
    },
    [m1, m2, resolve],
  )
  useNotifyAfterTimeout(
    `${PRODUCT_NAME} needs your input on a response comparison`,
  )
  return (
    <BinaryFeedbackView
      debug={debug}
      erroredToolUseIDs={erroredToolUseIDs}
      inProgressToolUseIDs={inProgressToolUseIDs}
      m1={m1}
      m2={m2}
      normalizedMessages={normalizedMessages}
      tools={tools}
      unresolvedToolUseIDs={unresolvedToolUseIDs}
      verbose={verbose}
      onChoose={onChoose}
    />
  )
}
