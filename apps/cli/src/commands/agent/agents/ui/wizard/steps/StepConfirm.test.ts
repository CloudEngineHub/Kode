import { describe, expect, test } from 'bun:test'
import { __getConfirmFooterTextForTests } from './StepConfirm'

describe('StepConfirm footer text', () => {
  test('shows save actions while idle', () => {
    expect(__getConfirmFooterTextForTests(false)).toBe(
      'Press s/Enter to save - e to edit in your editor - Esc to cancel',
    )
  })

  test('shows saving state while save is in progress', () => {
    expect(__getConfirmFooterTextForTests(true)).toBe('Saving agent...')
  })
})
