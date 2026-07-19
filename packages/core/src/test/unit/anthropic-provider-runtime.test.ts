import { afterEach, describe, expect, test } from 'bun:test'
import { LEGACY_ENV } from '#core/compat/legacyEnv'
import {
  getAnthropicProviderRuntime,
  isTruthyAnthropicProviderEnv,
} from '#core/utils/anthropicProviderRuntime'
import {
  isBedrockRuntimeEnabled,
  isVertexRuntimeEnabled,
} from '#core/utils/model'

const ENV_KEYS = [
  'KODE_USE_BEDROCK',
  'KODE_USE_VERTEX',
  'KODE_USE_FOUNDRY',
  LEGACY_ENV.codeUseBedrock,
  LEGACY_ENV.codeUseVertex,
  LEGACY_ENV.codeUseFoundry,
]

const originalEnv = Object.fromEntries(
  ENV_KEYS.map(key => [key, process.env[key]]),
)

function clearRuntimeEnv(): void {
  for (const key of ENV_KEYS) {
    delete process.env[key]
  }
}

describe('Anthropic provider runtime flags', () => {
  afterEach(() => {
    clearRuntimeEnv()
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  })

  test('treats only explicit truthy values as enabled', () => {
    expect(isTruthyAnthropicProviderEnv(undefined)).toBe(false)
    expect(isTruthyAnthropicProviderEnv('')).toBe(false)
    expect(isTruthyAnthropicProviderEnv('false')).toBe(false)
    expect(isTruthyAnthropicProviderEnv('0')).toBe(false)
    expect(isTruthyAnthropicProviderEnv('true')).toBe(true)
    expect(isTruthyAnthropicProviderEnv('YES')).toBe(true)
    expect(isTruthyAnthropicProviderEnv(' on ')).toBe(true)
  })

  test('does not enable Vertex for a false-like environment value', () => {
    clearRuntimeEnv()
    process.env.KODE_USE_VERTEX = 'false'

    expect(getAnthropicProviderRuntime()).toBe('firstParty')
    expect(isVertexRuntimeEnabled()).toBe(false)
  })

  test('resolves runtime flags from current environment values', () => {
    clearRuntimeEnv()
    process.env.KODE_USE_BEDROCK = '1'

    expect(getAnthropicProviderRuntime()).toBe('bedrock')
    expect(isBedrockRuntimeEnabled()).toBe(true)

    clearRuntimeEnv()
    process.env.KODE_USE_VERTEX = 'yes'

    expect(getAnthropicProviderRuntime()).toBe('vertex')
    expect(isVertexRuntimeEnabled()).toBe(true)
  })
})
