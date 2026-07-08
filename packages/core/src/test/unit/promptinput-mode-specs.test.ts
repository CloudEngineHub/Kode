import { describe, expect, test } from 'bun:test'
import {
  getPromptModeForTypedPrefix,
  getPromptModePrefix,
  getPromptModeSpec,
  isShellPromptMode,
  shouldEmptyPromptModeExitToPrompt,
  shouldPromptModeReturnToPrompt,
} from '#ui-ink/components/PromptInput/promptModeSpecs'
import { getTheme } from '#core/utils/theme'

describe('PromptInput mode specs', () => {
  test('keeps display metadata as the single mode source of truth', () => {
    expect(getPromptModeSpec('prompt')).toMatchObject({
      label: 'Chat',
      prefix: '',
      statusText: 'Input: Chat',
      helperText: '/bash command · /note note · & background',
    })
    expect(getPromptModeSpec('background')).toMatchObject({
      label: 'Background shell',
      prefix: '&',
      statusText: 'Input: Background shell',
    })
  })

  test('maps typed prefixes only from chat mode', () => {
    expect(getPromptModeForTypedPrefix({ mode: 'prompt', value: '&' })).toBe(
      'background',
    )
    expect(getPromptModeForTypedPrefix({ mode: 'bash', value: '&' })).toBeNull()
  })

  test('centralizes mode transition rules', () => {
    expect(isShellPromptMode('bash')).toBe(true)
    expect(isShellPromptMode('background')).toBe(true)
    expect(isShellPromptMode('prompt')).toBe(false)

    expect(shouldPromptModeReturnToPrompt('bash')).toBe(false)
    expect(shouldPromptModeReturnToPrompt('background')).toBe(false)
    expect(shouldPromptModeReturnToPrompt('koding')).toBe(true)

    expect(shouldEmptyPromptModeExitToPrompt('prompt')).toBe(false)
    expect(shouldEmptyPromptModeExitToPrompt('koding')).toBe(true)
  })

  test('derives prompt glyphs from the mode spec', () => {
    const theme = getTheme('dark')

    expect(
      getPromptModePrefix({ mode: 'background', theme, isLoading: false }),
    ).toEqual({ text: '&\u00a0', color: theme.bashBorder })
    expect(
      getPromptModePrefix({ mode: 'koding', theme, isLoading: false }),
    ).toEqual({ text: '#\u00a0', color: theme.noting })
    expect(
      getPromptModePrefix({ mode: 'prompt', theme, isLoading: true }),
    ).toEqual({ text: '\u276F\u00a0', color: theme.secondaryText })
  })
})
