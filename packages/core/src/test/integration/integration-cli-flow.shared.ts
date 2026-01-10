import { expect } from 'bun:test'
import type { ModelProfile } from '../../utils/config'
import {
  productionTestModels,
  getChatCompletionsModels,
  getResponsesAPIModels,
} from '../testAdapters'

function loadDotEnvForIntegrationTests(): void {
  if (process.env.NODE_ENV === 'production') return

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path')
    const envPath = path.join(process.cwd(), '.env')
    if (!fs.existsSync(envPath)) return

    const envContent = fs.readFileSync(envPath, 'utf8')
    envContent.split('\n').forEach((line: string) => {
      const [key, ...valueParts] = line.split('=')
      if (!key || valueParts.length === 0) return
      const value = valueParts.join('=')
      const trimmedKey = key.trim()
      if (!trimmedKey) return
      if (!process.env[trimmedKey]) {
        process.env[trimmedKey] = value.trim()
      }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log('⚠️  Could not load .env file:', message)
  }
}

loadDotEnvForIntegrationTests()

export const ACTIVE_PRODUCTION_MODELS = productionTestModels.filter(
  model => model.isActive,
)
export const CHAT_COMPLETIONS_MODELS = getChatCompletionsModels(
  ACTIVE_PRODUCTION_MODELS,
)
export const RESPONSES_API_MODELS = getResponsesAPIModels(
  ACTIVE_PRODUCTION_MODELS,
)

export const TEST_MODEL = process.env.TEST_MODEL || 'gpt5'

export function getActiveProfile(): ModelProfile {
  if (ACTIVE_PRODUCTION_MODELS.length === 0) {
    throw new Error(
      `No active production models found in testAdapters. Please set environment variables:\n` +
        `TEST_GPT5_API_KEY, TEST_MINIMAX_API_KEY, TEST_DEEPSEEK_API_KEY, TEST_CLAUDE_API_KEY, or TEST_GLM_API_KEY`,
    )
  }

  if (TEST_MODEL === 'gpt5' || !TEST_MODEL || TEST_MODEL === '') {
    if (RESPONSES_API_MODELS.length === 0) {
      throw new Error(
        `No active Responses API production models found. Available active models: ${ACTIVE_PRODUCTION_MODELS.map(
          m => `${m.name} (${m.modelName})`,
        ).join(', ')}`,
      )
    }
    return RESPONSES_API_MODELS[0]
  }

  if (TEST_MODEL === 'minimax') {
    if (CHAT_COMPLETIONS_MODELS.length === 0) {
      throw new Error(
        `No active Chat Completions production models found. Available active models: ${ACTIVE_PRODUCTION_MODELS.map(
          m => `${m.name} (${m.modelName})`,
        ).join(', ')}`,
      )
    }
    return CHAT_COMPLETIONS_MODELS[0]
  }

  const foundModel = ACTIVE_PRODUCTION_MODELS.find(
    m =>
      m.modelName === TEST_MODEL ||
      m.name.toLowerCase().includes(TEST_MODEL.toLowerCase()),
  )

  if (!foundModel) {
    throw new Error(
      `Model '${TEST_MODEL}' not found in active production models. Available models: ${ACTIVE_PRODUCTION_MODELS.map(
        m => `${m.name} (${m.modelName})`,
      ).join(', ')}`,
    )
  }

  return foundModel
}

export function expectUnifiedUsage(usage: any) {
  expect(usage).toBeDefined()
  expect(typeof usage.promptTokens).toBe('number')
  expect(typeof usage.completionTokens).toBe('number')
  expect(typeof usage.input_tokens).toBe('number')
  expect(typeof usage.output_tokens).toBe('number')
  expect(typeof usage.totalTokens).toBe('number')
  expect(usage.totalTokens).toBe(usage.promptTokens + usage.completionTokens)
}
