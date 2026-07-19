/**
 * Command source tracking for dual-mode security.
 *
 * - user_bash_mode: User-initiated Shell input
 * - agent_call: Tool use via the LLM
 */
export type CommandSource = 'user_bash_mode' | 'agent_call'
