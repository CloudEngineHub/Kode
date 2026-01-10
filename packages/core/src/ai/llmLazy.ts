import type {
  queryLLM as queryLLMImpl,
  queryQuick as queryQuickImpl,
} from '#core/ai/llm'

type QueryLLM = typeof queryLLMImpl
type QueryQuick = typeof queryQuickImpl

export async function queryLLM(
  ...args: Parameters<QueryLLM>
): ReturnType<QueryLLM> {
  const { queryLLM: inner } = await import('#core/ai/llm')
  return inner(...args)
}

export async function queryQuick(
  ...args: Parameters<QueryQuick>
): ReturnType<QueryQuick> {
  const { queryQuick: inner } = await import('#core/ai/llm')
  return inner(...args)
}

export async function verifyApiKey(
  apiKey: string,
  baseURL?: string,
  provider?: string,
): Promise<boolean> {
  const { verifyApiKey: inner } = await import('#core/ai/llm')
  return inner(apiKey, baseURL, provider)
}

export async function fetchAnthropicModels(
  apiKey: string,
  baseURL?: string,
): Promise<any[]> {
  const { fetchAnthropicModels: inner } = await import('#core/ai/llm')
  return inner(apiKey, baseURL)
}
