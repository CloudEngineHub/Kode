import { describe, expect, test } from 'bun:test'
import {
  __getConfirmFooterTextForTests,
  __getToolSummaryForTests,
  __splitValidationWarningsForTests,
} from './StepConfirm'

describe('StepConfirm footer text', () => {
  test('shows save actions while idle', () => {
    expect(__getConfirmFooterTextForTests(false)).toBe(
      'Enter/s to save - e to save and edit - Esc to go back',
    )
  })

  test('shows saving state while save is in progress', () => {
    expect(__getConfirmFooterTextForTests(true)).toBe('Saving agent...')
  })
})

describe('StepConfirm tool summary', () => {
  test('describes the recommended all-tools default', () => {
    expect(__getToolSummaryForTests(undefined)).toBe(
      'All tools (recommended default)',
    )
  })

  test('describes a no-tools specialist', () => {
    expect(__getToolSummaryForTests([])).toBe('No tools (strict and limited)')
  })

  test('formats multiple selected tools', () => {
    expect(__getToolSummaryForTests(['Read', 'Bash', 'Edit'])).toBe(
      'Read, Bash, and Edit',
    )
  })
})

describe('StepConfirm validation message grouping', () => {
  test('shows tool access advisories as notes', () => {
    expect(
      __splitValidationWarningsForTests([
        'Agent has access to all tools',
        'Unrecognized tools: UnknownTool',
      ]),
    ).toEqual({
      notes: [
        'All tools are enabled. Limit tools only for stricter specialists.',
      ],
      warnings: ['Unrecognized tools: UnknownTool'],
    })
  })
})
