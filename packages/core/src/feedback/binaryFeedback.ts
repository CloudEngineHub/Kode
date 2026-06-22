import type {
  ContentBlock,
  TextBlock,
  ToolUseBlock,
} from '@anthropic-ai/sdk/resources/index.mjs'
import type { AssistantMessage, BinaryFeedbackResult } from '#core/query'
import { isEqual, zip } from 'lodash-es'

export type BinaryFeedbackChoice =
  | 'prefer-left'
  | 'prefer-right'
  | 'neither'
  | 'no-preference'

export type BinaryFeedbackChoose = (choice: BinaryFeedbackChoice) => void

type BinaryFeedbackConfig = {
  sampleFrequency: number
}

async function getBinaryFeedbackConfig(): Promise<BinaryFeedbackConfig> {
  return { sampleFrequency: 0 }
}

function getMessageBlockSequence(m: AssistantMessage) {
  return m.message.content.map(cb => {
    if (cb.type === 'text') return 'text'
    if (cb.type === 'tool_use') return cb.name
    return cb.type // Handle other block types like 'thinking' or 'redacted_thinking'
  })
}

// Logging removed to minimize runtime surface area; behavior unaffected

function textContentBlocksEqual(cb1: TextBlock, cb2: TextBlock): boolean {
  return cb1.text === cb2.text
}

function contentBlocksEqual(cb1: ContentBlock, cb2: ContentBlock): boolean {
  if (cb1.type !== cb2.type) {
    return false
  }
  if (cb1.type === 'text') {
    return textContentBlocksEqual(cb1, cb2 as TextBlock)
  }
  if (cb1.type === 'tool_use') {
    const toolUseBlock = cb2 as ToolUseBlock
    return (
      cb1.name === toolUseBlock.name && isEqual(cb1.input, toolUseBlock.input)
    )
  }
  return isEqual(cb1, cb2)
}

function allContentBlocksEqual(
  content1: ContentBlock[],
  content2: ContentBlock[],
): boolean {
  if (content1.length !== content2.length) {
    return false
  }
  return zip(content1, content2).every(([cb1, cb2]) =>
    contentBlocksEqual(cb1!, cb2!),
  )
}

export async function shouldUseBinaryFeedback(): Promise<boolean> {
  if (process.env.DISABLE_BINARY_FEEDBACK) {
    return false
  }
  if (process.env.FORCE_BINARY_FEEDBACK) {
    return true
  }
  if (process.env.USER_TYPE !== 'ant') {
    return false
  }
  if (process.env.NODE_ENV === 'test') {
    // Binary feedback breaks a couple tests related to checking for permission,
    // so we have to disable it in tests at the risk of hiding bugs
    return false
  }

  const config = await getBinaryFeedbackConfig()
  if (config.sampleFrequency === 0) {
    return false
  }
  if (Math.random() > config.sampleFrequency) {
    return false
  }
  return true
}

export function messagePairValidForBinaryFeedback(
  m1: AssistantMessage,
  m2: AssistantMessage,
): boolean {
  const logPass = () => {}
  const logFail = (_reason: string) => {}

  // Ignore thinking blocks, on the assumption that users don't find them very relevant
  // compared to other content types
  const nonThinkingBlocks1 = m1.message.content.filter(
    b => b.type !== 'thinking' && b.type !== 'redacted_thinking',
  )
  const nonThinkingBlocks2 = m2.message.content.filter(
    b => b.type !== 'thinking' && b.type !== 'redacted_thinking',
  )
  const hasToolUse =
    nonThinkingBlocks1.some(b => b.type === 'tool_use') ||
    nonThinkingBlocks2.some(b => b.type === 'tool_use')

  // If they're all text blocks, compare those
  if (!hasToolUse) {
    if (allContentBlocksEqual(nonThinkingBlocks1, nonThinkingBlocks2)) {
      logFail('contents_identical')
      return false
    }
    logPass()
    return true
  }

  // If there are tools, they're the most material difference between the messages.
  // Only show binary feedback if there's a tool use difference, ignoring text.
  if (
    allContentBlocksEqual(
      nonThinkingBlocks1.filter(b => b.type === 'tool_use'),
      nonThinkingBlocks2.filter(b => b.type === 'tool_use'),
    )
  ) {
    logFail('contents_identical')
    return false
  }

  logPass()
  return true
}

export function getBinaryFeedbackResultForChoice(
  m1: AssistantMessage,
  m2: AssistantMessage,
  choice: BinaryFeedbackChoice,
): BinaryFeedbackResult {
  switch (choice) {
    case 'prefer-left':
      return { message: m1, shouldSkipPermissionCheck: true }
    case 'prefer-right':
      return { message: m2, shouldSkipPermissionCheck: true }
    case 'no-preference':
      return {
        message: Math.random() < 0.5 ? m1 : m2,
        shouldSkipPermissionCheck: false,
      }
    case 'neither':
      return { message: null, shouldSkipPermissionCheck: false }
  }
}
// Keep a minimal exported stub to satisfy imports without side effects
export async function logBinaryFeedbackEvent(
  _m1: AssistantMessage,
  _m2: AssistantMessage,
  _choice: BinaryFeedbackChoice,
): Promise<void> {}
