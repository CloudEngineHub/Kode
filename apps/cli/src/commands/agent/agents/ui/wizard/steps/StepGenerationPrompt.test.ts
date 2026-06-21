import { describe, expect, test } from 'bun:test'
import { __getGenerationPromptFooterTextForTests } from './StepGenerationPrompt'

describe('StepGenerationPrompt footer text', () => {
  test('shows generate action while idle', () => {
    expect(__getGenerationPromptFooterTextForTests(false)).toBe(
      'Enter to generate - Esc to go back',
    )
  })

  test('shows cancel action while generating', () => {
    expect(__getGenerationPromptFooterTextForTests(true)).toBe(
      'Esc to cancel generation',
    )
  })
})
