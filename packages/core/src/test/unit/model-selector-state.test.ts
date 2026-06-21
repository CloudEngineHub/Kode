import { describe, expect, test } from 'bun:test'

import {
  createInitialScreenStack,
  getCurrentScreen,
  handleBackNavigation,
  pushScreen,
  type ModelSelectorScreenStack,
} from '#ui-ink/components/ModelSelector/flow/state'

describe('model selector navigation state machine', () => {
  test('initial stack starts on provider (skipModelType does not change)', () => {
    const stack = createInitialScreenStack({ skipModelType: true })
    expect(stack).toEqual(['provider'])
    expect(getCurrentScreen(stack)).toBe('provider')
  })

  test('pushScreen appends and current screen tracks last', () => {
    let stack: ModelSelectorScreenStack = createInitialScreenStack()
    stack = pushScreen(stack, 'partnerProviders')
    stack = pushScreen(stack, 'apiKey')
    expect(stack).toEqual(['provider', 'partnerProviders', 'apiKey'])
    expect(getCurrentScreen(stack)).toBe('apiKey')
  })

  test('back on provider yields exit effect and does not change stack', () => {
    const stack: ModelSelectorScreenStack = ['provider']
    const result = handleBackNavigation(stack)
    expect(result.stack).toBe(stack)
    expect(result.effect).toEqual({ type: 'exit' })
  })

  test('back from submenu resets to provider and requests provider focus reset', () => {
    const result = handleBackNavigation(['provider', 'partnerProviders'])
    expect(result.stack).toEqual(['provider'])
    expect(result.effect).toEqual({ type: 'resetProviderFocus' })
  })

  test('back pops screen for normal flows (apiKey from submenu returns to submenu)', () => {
    const result = handleBackNavigation([
      'provider',
      'partnerProviders',
      'apiKey',
    ])
    expect(result.stack).toEqual(['provider', 'partnerProviders'])
    expect(result.effect).toBeNull()
  })
})
