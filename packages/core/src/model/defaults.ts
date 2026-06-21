import type { ModelConfig } from './types'

const DEFAULT_MODEL_CONFIG: ModelConfig = {
  bedrock: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
  vertex: 'claude-3-7-sonnet@20250219',
  firstParty: 'claude-sonnet-4-20250514',
}

export async function getModelConfig(): Promise<ModelConfig> {
  return DEFAULT_MODEL_CONFIG
}
