import OpenAI from 'openai'

export function isGPT5Model(modelName: string): boolean {
  return modelName.startsWith('gpt-5')
}

export function isMiMoModel(modelName: string): boolean {
  return modelName.toLowerCase().startsWith('mimo-')
}

export function buildOpenAIChatCompletionCreateParams(args: {
  model: string
  maxTokens: number
  messages: OpenAI.ChatCompletionMessageParam[]
  temperature: number
  stream: boolean
  toolSchemas: OpenAI.ChatCompletionTool[]
  stopSequences?: string[]
  reasoningEffort?: any
}): OpenAI.ChatCompletionCreateParams {
  const isGPT5 = isGPT5Model(args.model)
  const isMiMo = isMiMoModel(args.model)

  const opts: OpenAI.ChatCompletionCreateParams = {
    model: args.model,
    ...(isGPT5 || isMiMo
      ? { max_completion_tokens: args.maxTokens }
      : { max_tokens: args.maxTokens }),
    messages: args.messages,
    temperature: args.temperature,
  }
  if (args.stopSequences && args.stopSequences.length > 0) {
    opts.stop = args.stopSequences
  }
  if (args.stream) {
    ;(opts as OpenAI.ChatCompletionCreateParams).stream = true
    opts.stream_options = {
      include_usage: true,
    }
  }

  if (args.toolSchemas.length > 0) {
    opts.tools = args.toolSchemas
    opts.tool_choice = 'auto'
    if (isMiMo) {
      // MiMo documents incomplete tool_calls in reasoning_content when
      // thinking is enabled. Disable it for tool-capable turns so the model
      // returns standard OpenAI-compatible tool_calls.
      ;(
        opts as OpenAI.ChatCompletionCreateParams & {
          thinking?: { type: 'disabled' }
        }
      ).thinking = { type: 'disabled' }
    }
  }
  if (args.reasoningEffort) {
    opts.reasoning_effort = args.reasoningEffort
  }

  return opts
}
