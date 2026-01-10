export type {
  PreToolUseHookOutcome,
  StopHookOutcome,
  UserPromptHookOutcome,
} from './types'

export {
  drainHookSystemPromptAdditions,
  getHookTranscriptPath,
  queueHookAdditionalContexts,
  queueHookSystemMessages,
  runPostToolUseHooks,
  runPreToolUseHooks,
  updateHookTranscriptForMessages,
} from './tool'

export {
  getSessionStartAdditionalContext,
  runSessionEndHooks,
  runStopHooks,
  runUserPromptSubmitHooks,
} from './lifecycle'

import { __resetHookRegistryCacheForTests } from './registry'
import { __resetSessionStartCacheForTests } from './lifecycle'

export function __resetKodeHooksCacheForTests(): void {
  __resetHookRegistryCacheForTests()
  __resetSessionStartCacheForTests()
}
