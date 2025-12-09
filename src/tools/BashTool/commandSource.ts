/**
 * Command source tracking for dual-mode security
 *
 * This allows different permission levels for:
 * - user_bash_mode: User ! commands (relaxed)
 * - agent_call: Tool use via LLM (strict)
 */

export type CommandSource = 'user_bash_mode' | 'agent_call'

/**
 * Context for bash command validation
 */
export interface BashValidationContext {
  source: CommandSource
}

/**
 * Get validation context from tool context
 */
export function getCommandSource(context: any): CommandSource {
  // Check if this is a user-initiated bash mode command
  // marked in the abortController or context
  if (context?.commandSource === 'user_bash_mode') {
    return 'user_bash_mode'
  }

  // Default to agent_call for tool use
  return 'agent_call'
}
