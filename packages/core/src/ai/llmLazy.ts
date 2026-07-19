import type {
  queryLLM as queryLLMImpl,
  queryQuick as queryQuickImpl,
} from '#core/ai/llm'
import { setPromptHookQueryProvider } from '@kode/hooks/promptQuery'

type QueryLLM = typeof queryLLMImpl
type QueryQuick = typeof queryQuickImpl

type QueryLLMLoader = () => Promise<QueryLLM>
type QueryQuickLoader = () => Promise<QueryQuick>

const defaultQueryLLMLoader: QueryLLMLoader = async () => {
  const { queryLLM } = await import('#core/ai/llm')
  return queryLLM
}

const defaultQueryQuickLoader: QueryQuickLoader = async () => {
  const { queryQuick } = await import('#core/ai/llm')
  return queryQuick
}

let queryLLMLoader = defaultQueryLLMLoader
let queryQuickLoader = defaultQueryQuickLoader

export function __setLlmLazyQueryLLMLoaderForTests(
  loader: QueryLLMLoader | null,
): void {
  queryLLMLoader = loader ?? defaultQueryLLMLoader
}

export function __setLlmLazyQueryQuickLoaderForTests(
  loader: QueryQuickLoader | null,
): void {
  queryQuickLoader = loader ?? defaultQueryQuickLoader
}

export async function queryLLM(
  ...args: Parameters<QueryLLM>
): ReturnType<QueryLLM> {
  const inner = await queryLLMLoader()
  return inner(...args)
}

export async function queryQuick(
  ...args: Parameters<QueryQuick>
): ReturnType<QueryQuick> {
  const inner = await queryQuickLoader()
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

setPromptHookQueryProvider(args => queryQuick(args))
