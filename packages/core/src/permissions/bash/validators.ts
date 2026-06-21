import { PRODUCT_NAME } from '#core/constants/product'
import type { BashPermissionDecision, DecisionReason } from './types'
import { parseShellTokens } from './shellTokens'

export { validateBashCommandPaths } from './paths'
export { checkSedCommandSafety } from './sed'
export { xi } from './xi'

export function checkBashCommandSyntax(
  command: string,
): BashPermissionDecision {
  const parsed = parseShellTokens(command)
  if ('error' in parsed) {
    const reason: DecisionReason = {
      type: 'other',
      reason: `Command contains malformed syntax that cannot be parsed: ${parsed.error}`,
    }
    return {
      behavior: 'ask',
      message: `${PRODUCT_NAME} requested permissions to use Bash, but you haven't granted it yet.`,
      decisionReason: reason,
    }
  }
  return { behavior: 'passthrough', message: 'Command parsed successfully' }
}
