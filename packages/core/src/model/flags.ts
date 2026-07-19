import {
  getAnthropicProviderRuntime,
  isTruthyAnthropicProviderEnv,
} from '#core/utils/anthropicProviderRuntime'

export function isBedrockRuntimeEnabled(): boolean {
  return getAnthropicProviderRuntime() === 'bedrock'
}

export function isVertexRuntimeEnabled(): boolean {
  return getAnthropicProviderRuntime() === 'vertex'
}

export const USE_BEDROCK = isBedrockRuntimeEnabled()
export const USE_VERTEX = isVertexRuntimeEnabled()
export { isTruthyAnthropicProviderEnv }
