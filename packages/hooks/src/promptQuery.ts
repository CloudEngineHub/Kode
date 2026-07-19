export type PromptHookQuery = (args: {
  systemPrompt?: string[]
  userPrompt: string
  signal?: AbortSignal
}) => Promise<unknown>

let promptHookQueryProvider: PromptHookQuery | null = null

export function setPromptHookQueryProvider(
  provider: PromptHookQuery | null,
): void {
  promptHookQueryProvider = provider
}

export function getPromptHookQueryProvider(): PromptHookQuery | null {
  return promptHookQueryProvider
}

export function __resetPromptHookQueryProviderForTests(): void {
  promptHookQueryProvider = null
}
