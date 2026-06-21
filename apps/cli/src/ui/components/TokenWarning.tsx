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

type Props = {
  tokenUsage: number
  contextLimit?: number
}

const FALLBACK_CONTEXT_LIMIT = 190_000

function getActiveContextLimit(): number {
  try {
    const profile = getModelManager().getModel('main')
    if (
      typeof profile?.contextLength === 'number' &&
      Number.isFinite(profile.contextLength) &&
      profile.contextLength > 0
    ) {
      return profile.contextLength
    }
  } catch {
    // fall through
  }
  return FALLBACK_CONTEXT_LIMIT
}

export function TokenWarning({
  tokenUsage,
  contextLimit: contextLimitProp,
}: Props): React.ReactNode {
  const theme = getTheme()
  const contextLimit =
    typeof contextLimitProp === 'number' &&
    Number.isFinite(contextLimitProp) &&
    contextLimitProp > 0
      ? contextLimitProp
      : getActiveContextLimit()
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

  return (
    <Box flexDirection="row">
      <Text color={isError ? theme.error : theme.warning} wrap="truncate-end">
        Context low ({percentRemaining}% remaining) &middot; Run /compact to
        compact & continue
      </Text>
    </Box>
  )
}
