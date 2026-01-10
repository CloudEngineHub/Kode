export const DESCRIPTION =
  'Consult an external AI model for a second opinion or specialized analysis.'

export const PROMPT = `Ask a question to a specific external AI model for expert analysis.

CRITICAL: The expert model receives ONLY your \`question\` (plus the prior messages in the same \`chat_session_id\`).
It does NOT have access to the user’s current repository context unless you include it in the question.

The \`question\` MUST be self-contained:
1) Background / context
2) Current situation / constraints
3) A clear, independent question

Use this tool when you want a different model’s perspective, not for task execution.`
