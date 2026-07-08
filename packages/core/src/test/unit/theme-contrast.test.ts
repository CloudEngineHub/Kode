import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  createContrastAwareTheme,
  getTheme,
  getThemeContrastBackgroundColor,
  getThemeContrastRatio,
  setThemeContrastBackgroundColor,
} from '#core/utils/theme'

function expectContrastAtLeast(
  foreground: string,
  background: string,
  minRatio: number,
): void {
  const ratio = getThemeContrastRatio(foreground, background)

  expect(ratio).toBeNumber()
  expect(ratio ?? 0).toBeGreaterThanOrEqual(minRatio)
}

describe('theme contrast adaptation', () => {
  beforeEach(() => {
    setThemeContrastBackgroundColor(undefined)
  })

  afterEach(() => {
    setThemeContrastBackgroundColor(undefined)
  })

  it('raises text and border contrast against dark terminal backgrounds', () => {
    const base = getTheme('dark')
    const theme = createContrastAwareTheme(base, '#000000')

    expect(theme.secondaryText).not.toBe(base.secondaryText)
    expect(theme.noting).not.toBe(base.noting)
    expect(theme.diff).toEqual(base.diff)
    expectContrastAtLeast(theme.text, '#000000', 4.5)
    expectContrastAtLeast(theme.secondaryText, '#000000', 4.5)
    expectContrastAtLeast(theme.noting, '#000000', 4.5)
    expectContrastAtLeast(theme.secondaryBorder, '#000000', 3)
  })

  it('darkens low contrast theme colors against light terminal backgrounds', () => {
    const base = getTheme('dark')
    const theme = createContrastAwareTheme(base, '#ffffff')

    expect(theme.text).not.toBe(base.text)
    expect(theme.kode).not.toBe(base.kode)
    expectContrastAtLeast(theme.text, '#ffffff', 4.5)
    expectContrastAtLeast(theme.kode, '#ffffff', 4.5)
    expectContrastAtLeast(theme.inputBorder, '#ffffff', 3)
  })

  it('applies the detected terminal background through getTheme', () => {
    setThemeContrastBackgroundColor('#fff')

    const theme = getTheme('dark')

    expect(getThemeContrastBackgroundColor()).toBe('#ffffff')
    expectContrastAtLeast(theme.text, '#ffffff', 4.5)
    expectContrastAtLeast(theme.secondaryText, '#ffffff', 4.5)

    setThemeContrastBackgroundColor(undefined)
    expect(getTheme('dark').secondaryText).toBe('#606060')
  })

  it('ignores invalid background colors', () => {
    const base = getTheme('dark')

    expect(createContrastAwareTheme(base, 'not-a-color')).toBe(base)

    setThemeContrastBackgroundColor('not-a-color')

    expect(getThemeContrastBackgroundColor()).toBeUndefined()
    expect(getTheme('dark')).toBe(base)
  })
})
