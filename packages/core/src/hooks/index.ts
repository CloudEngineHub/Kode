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
  runPreCompactHooks,
  runSessionEndHooks,
  runStopHooks,
  runUserPromptSubmitHooks,
} from './lifecycle'

export { getDisableAllHooksState, setDisableAllHooks } from './disableAllHooks'
export type { HookConfigEntry, HookConfigSource } from './registry'
export { listHookConfigurations } from './registry'

import { __resetHookRegistryCacheForTests } from './registry'
import { __resetSessionStartCacheForTests } from './lifecycle'

export function __resetKodeHooksCacheForTests(): void {
  __resetHookRegistryCacheForTests()
  __resetSessionStartCacheForTests()
}
