import { describe, expect, it } from 'bun:test'

import { __getSuggestionWindowForTests } from './PromptInputCompletionPanel'

describe('__getSuggestionWindowForTests', () => {
  it('never exceeds available rows in small terminals', () => {
    const rows = 12
    const reservedRows = 10
    const panelRows = Math.min(10, Math.max(1, rows - reservedRows))

    const window = __getSuggestionWindowForTests({
      rows,
      reservedRows,
      selectedIndex: 0,
      suggestionCount: 5,
    })

    const visibleCount = window.endIndex - window.startIndex
    const totalLines =
      visibleCount +
      (window.showTopEllipsis ? 1 : 0) +
      (window.showBottomEllipsis ? 1 : 0) +
      (window.showHelp ? 1 : 0)

    expect(totalLines).toBeLessThanOrEqual(panelRows)
    expect(visibleCount).toBeGreaterThanOrEqual(1)
  })

  it('keeps the selected index visible when scrolling', () => {
    const rows = 30
    const reservedRows = 10
    const panelRows = Math.min(10, Math.max(1, rows - reservedRows))

    const window = __getSuggestionWindowForTests({
      rows,
      reservedRows,
      selectedIndex: 10,
      suggestionCount: 50,
    })

    expect(window.startIndex).toBeLessThanOrEqual(10)
    expect(window.endIndex).toBeGreaterThan(10)

    const visibleCount = window.endIndex - window.startIndex
    const totalLines =
      visibleCount +
      (window.showTopEllipsis ? 1 : 0) +
      (window.showBottomEllipsis ? 1 : 0) +
      (window.showHelp ? 1 : 0)

    expect(totalLines).toBeLessThanOrEqual(panelRows)
  })
})
