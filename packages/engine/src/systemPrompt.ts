import { getSystemPrompt } from '#core/constants/prompts'

export async function buildSystemPromptForSession(args: {
  disableSlashCommands?: boolean
  systemPromptOverride?: string
  appendSystemPrompt?: string
  jsonSchema?: Record<string, unknown> | null
  outputStyleActive?: boolean
  keepCodingInstructions?: boolean
}): Promise<string[]> {
  const baseSystemPrompt =
    typeof args.systemPromptOverride === 'string' &&
    args.systemPromptOverride.trim()
      ? [args.systemPromptOverride]
      : await getSystemPrompt({
          disableSlashCommands: args.disableSlashCommands === true,
          outputStyleActive: args.outputStyleActive,
          keepCodingInstructions: args.keepCodingInstructions,
        })

  const systemPrompt =
    typeof args.appendSystemPrompt === 'string' &&
    args.appendSystemPrompt.trim()
      ? [...baseSystemPrompt, args.appendSystemPrompt]
      : baseSystemPrompt

  if (args.jsonSchema) {
    systemPrompt.push(
      [
        'You MUST respond with ONLY valid JSON.',
        'The JSON MUST validate against the following JSON Schema.',
        'Do not wrap the JSON in markdown code fences and do not add extra commentary.',
        '',
        `<json_schema>${JSON.stringify(args.jsonSchema)}</json_schema>`,
      ].join('\n'),
    )
  }

  return systemPrompt
}
