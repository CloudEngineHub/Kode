/**
 * Command source tracking for dual-mode security.
 *
 * - user_bash_mode: User-initiated `!` commands (relaxed)
 * - agent_call: Tool use via the LLM (strict)
 */
export type CommandSource = 'user_bash_mode' | 'agent_call'

/**
 * Context for bash command validation.
 */
export interface BashValidationContext {
  source: CommandSource
}

/**
 * Get validation context from a tool context object.
 */
export function getCommandSource(context: any): CommandSource {
  if (context?.commandSource === 'user_bash_mode') {
    return 'user_bash_mode'
  }
  return 'agent_call'
}
