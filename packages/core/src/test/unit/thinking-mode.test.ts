import { afterEach, describe, expect, test } from 'bun:test'
import { getGlobalConfig, saveGlobalConfig } from '#config'
import { createUserMessage } from '#core/utils/messages'
import { getMaxThinkingTokens } from '#core/utils/thinking'

function snapshotGlobalConfig() {
  return JSON.parse(JSON.stringify(getGlobalConfig())) as ReturnType<
    typeof getGlobalConfig
  >
}

describe('getMaxThinkingTokens (thinkingMode)', () => {
  const original = snapshotGlobalConfig()

  afterEach(() => {
    saveGlobalConfig(original)
    delete process.env.MAX_THINKING_TOKENS
    delete process.env.THINK_TOOL
  })

  test('auto: triggers on ultrathink', async () => {
    saveGlobalConfig({ ...getGlobalConfig(), thinkingMode: 'auto' })
    const tokens = await getMaxThinkingTokens([createUserMessage('ultrathink')])
    expect(tokens).toBe(31_999)
  })

  test('auto: does not trigger on plain "think"', async () => {
    saveGlobalConfig({ ...getGlobalConfig(), thinkingMode: 'auto' })
    expect(await getMaxThinkingTokens([createUserMessage('think')])).toBe(0)
  })

  test('disabled: returns 0 even when prompt contains ultrathink', async () => {
    saveGlobalConfig({ ...getGlobalConfig(), thinkingMode: 'disabled' })
    const tokens = await getMaxThinkingTokens([createUserMessage('ultrathink')])
    expect(tokens).toBe(0)
  })

  test('enabled: returns max tokens even without keywords', async () => {
    saveGlobalConfig({ ...getGlobalConfig(), thinkingMode: 'enabled' })
    const tokens = await getMaxThinkingTokens([createUserMessage('hello')])
    expect(tokens).toBe(31_999)
  })

  test('auto: treats ultrathinking as non-trigger (word boundary)', async () => {
    saveGlobalConfig({ ...getGlobalConfig(), thinkingMode: 'auto' })
    expect(
      await getMaxThinkingTokens([createUserMessage('ultrathinking')]),
    ).toBe(0)
  })
})
