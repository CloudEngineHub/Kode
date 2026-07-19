import { Box, Text } from 'ink'
import * as React from 'react'
import {
  ERROR_MARGIN_TOKENS,
  WARNING_MARGIN_TOKENS,
  calculateAutoCompactThresholds,
  getEffectiveConversationContextLimit,
} from '#core/utils/autoCompactThreshold'
import { getModelManager } from '#core/utils/model'
import { getTheme } from '#core/utils/theme'
import {
  formatTokenCount,
  isRenderableContextLimit,
} from '#ui-ink/utils/tokenDisplay'

type Props = {
  tokenUsage: number
  contextLimit?: number
}

function getActiveContextLimit(): number | null {
  try {
    const profile = getModelManager().getModel('main')
    if (isRenderableContextLimit(profile?.contextLength)) {
      return profile.contextLength
    }
  } catch {
    // fall through
  }
  return null
}

export function TokenWarning({
  tokenUsage,
  contextLimit: contextLimitProp,
}: Props): React.ReactNode {
  const theme = getTheme()
  const contextLimit =
    contextLimitProp === undefined
      ? getActiveContextLimit()
      : isRenderableContextLimit(contextLimitProp)
        ? contextLimitProp
        : null
  if (contextLimit === null) return null

  const effectiveContextLimit =
    getEffectiveConversationContextLimit(contextLimit)
  const { autoCompactThreshold } = calculateAutoCompactThresholds(
    tokenUsage,
    effectiveContextLimit,
  )
  const safeThreshold = Math.max(1, Math.floor(autoCompactThreshold))

  const warningThreshold = Math.max(0, safeThreshold - WARNING_MARGIN_TOKENS)
  const errorThreshold = Math.max(0, safeThreshold - ERROR_MARGIN_TOKENS)

  if (tokenUsage < warningThreshold) {
    return null
  }

  const isError = tokenUsage >= errorThreshold
  const percentRemaining = Math.max(
    0,
    100 - Math.round((tokenUsage / safeThreshold) * 100),
  )
  const warningText =
    `Context low (${percentRemaining}% remaining, ` +
    `${formatTokenCount(tokenUsage)}/${formatTokenCount(contextLimit)}) ` +
    `- Run /compact to compact & continue`

  return (
    <Box flexDirection="row">
      <Text color={isError ? theme.error : theme.warning} wrap="truncate-end">
        {warningText}
      </Text>
    </Box>
  )
}
