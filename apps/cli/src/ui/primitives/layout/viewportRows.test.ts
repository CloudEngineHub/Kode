import { describe, expect, it } from 'bun:test'

import {
  computeAvailableRows,
  computeFrameHeight,
  computeResponsiveRows,
  computeScreenFrameReservedRows,
  getViewportHeightClass,
  normalizeTerminalDimension,
} from './viewportRows'

describe('viewport row budget helpers', () => {
  it('preserves zero-sized terminal dimensions for minimized windows', () => {
    expect(normalizeTerminalDimension(0, 24)).toBe(0)
    expect(normalizeTerminalDimension(undefined, 24)).toBe(24)
    expect(normalizeTerminalDimension(Number.NaN, 24)).toBe(24)
  })

  it('classifies minimized and compact terminal heights', () => {
    expect(getViewportHeightClass(0)).toBe('minimized')
    expect(getViewportHeightClass(10)).toBe('micro')
    expect(getViewportHeightClass(18)).toBe('tight')
    expect(getViewportHeightClass(22)).toBe('compact')
    expect(getViewportHeightClass(30)).toBe('normal')
    expect(getViewportHeightClass(40)).toBe('tall')
  })

  it('keeps frame height bounded when a terminal shrinks to zero rows', () => {
    expect(computeFrameHeight(0)).toBe(1)
    expect(computeFrameHeight(1)).toBe(1)
    expect(computeFrameHeight(24)).toBe(23)
  })

  it('computes frame chrome rows consistently', () => {
    expect(
      computeScreenFrameReservedRows({
        paddingY: 1,
        gap: 1,
        exitPromptRows: 1,
      }),
    ).toBe(7)
    expect(
      computeScreenFrameReservedRows({
        paddingY: 0,
        gap: 0,
        showDivider: false,
      }),
    ).toBe(1)
  })

  it('shrinks available content rows instead of exceeding tiny viewports', () => {
    expect(
      computeAvailableRows({
        rows: 12,
        reservedRows: 8,
        safeMarginRows: 1,
        minRows: 6,
      }),
    ).toBe(3)
    expect(
      computeAvailableRows({
        rows: 0,
        reservedRows: 8,
        minRows: 6,
      }),
    ).toBe(1)
  })

  it('applies ratio and max limits while respecting remaining viewport space', () => {
    expect(
      computeResponsiveRows({
        rows: 30,
        reservedRows: 6,
        minRows: 2,
        maxRows: 14,
        ratio: 0.35,
      }),
    ).toBe(10)
    expect(
      computeResponsiveRows({
        rows: 10,
        reservedRows: 8,
        minRows: 6,
        maxRows: 14,
        ratio: 0.4,
      }),
    ).toBe(2)
  })
})
