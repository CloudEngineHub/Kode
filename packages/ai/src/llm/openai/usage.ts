import { createAnthropicUsage } from '#core/utils/anthropic'

export function getMaxTokensFromProfile(modelProfile: any): number {
  return modelProfile?.maxTokens || 8000
}

export function normalizeUsage(usage?: any) {
  if (!usage) {
    return createAnthropicUsage({
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    })
  }

  return createAnthropicUsage({
    input_tokens:
      usage.input_tokens ??
      usage.prompt_tokens ??
      usage.promptTokens ??
      usage.inputTokens ??
      0,
    output_tokens:
      usage.output_tokens ??
      usage.completion_tokens ??
      usage.completionTokens ??
      usage.outputTokens ??
      0,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
    prompt_tokens:
      usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokens ?? 0,
    completion_tokens:
      usage.completion_tokens ??
      usage.output_tokens ??
      usage.completionTokens ??
      0,
    promptTokens:
      usage.promptTokens ?? usage.prompt_tokens ?? usage.input_tokens ?? 0,
    completionTokens:
      usage.completionTokens ??
      usage.completion_tokens ??
      usage.output_tokens ??
      0,
    totalTokens:
      usage.totalTokens ??
      (usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokens ?? 0) +
        (usage.completion_tokens ??
          usage.output_tokens ??
          usage.completionTokens ??
          0),
    reasoningTokens: usage.reasoningTokens,
  })
}
