import { describe, expect, test } from 'bun:test'

describe('base adapter parseStreamingResponse', () => {
  test('base adapter module can be imported', async () => {
    let importError: Error | null = null
    try {
      await import('#core/ai/adapters/base')
    } catch (e) {
      importError = e instanceof Error ? e : new Error(String(e))
    }
    expect(importError).toBeNull()
  })

  test('ModelAPIAdapter class exists and has expected structure', async () => {
    const mod = await import('#core/ai/adapters/base')
    expect(mod.ModelAPIAdapter).toBeDefined()
    expect(typeof mod.ModelAPIAdapter).toBe('function')
  })

  test('module exports expected symbols', async () => {
    const mod = await import('#core/ai/adapters/base')
    expect(mod.ModelAPIAdapter).toBeDefined()
    expect(typeof mod.normalizeTokens).toBe('function')
  })

  test('normalizeTokens is exported', async () => {
    const mod = await import('#core/ai/adapters/base')
    expect(typeof mod.normalizeTokens).toBe('function')
  })

  test('normalizeTokens handles null input', async () => {
    const mod = await import('#core/ai/adapters/base')
    const result = mod.normalizeTokens(null)
    expect(result).toEqual({ input: 0, output: 0 })
  })

  test('normalizeTokens handles standard API response', async () => {
    const mod = await import('#core/ai/adapters/base')
    const result = mod.normalizeTokens({
      prompt_tokens: 100,
      completion_tokens: 50,
    })
    expect(result.input).toBe(100)
    expect(result.output).toBe(50)
  })

  test('normalizeTokens handles alternative field names', async () => {
    const mod = await import('#core/ai/adapters/base')
    const result = mod.normalizeTokens({
      input_tokens: 200,
      output_tokens: 100,
    })
    expect(result.input).toBe(200)
    expect(result.output).toBe(100)
  })
})
