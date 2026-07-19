import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  createContrastAwareTheme,
  getAvailableThemes,
  getReadableTextColor,
  getTheme,
  getThemeContrastBackgroundColor,
  getThemeContrastRatio,
  setThemeContrastBackgroundColor,
} from '#core/utils/theme'

const TERMINAL_BACKGROUNDS = [
  '#000000',
  '#101010',
  '#1e1e2e',
  '#fdf6e3',
  '#f7f7f7',
  '#ffffff',
] as const

const CONTRAST_FIELD_GROUPS = [
  {
    fields: ['text', 'primary'],
    minRatio: 4.5,
    maxRatio: 10,
  },
  {
    fields: ['permission', 'success', 'error', 'warning'],
    minRatio: 4.5,
    maxRatio: 9,
  },
  {
    fields: [
      'bashBorder',
      'kode',
      'notingBorder',
      'autoAccept',
      'planMode',
      'suggestion',
    ],
    minRatio: 3.6,
    maxRatio: 6.4,
  },
  {
    fields: ['noting', 'secondaryText', 'secondary'],
    minRatio: 3,
    maxRatio: 4.2,
  },
  {
    fields: ['inputBorder'],
    minRatio: 3,
    maxRatio: 5.5,
  },
  {
    fields: ['secondaryBorder'],
    minRatio: 2,
    maxRatio: 3.2,
  },
] as const

function expectContrastAtLeast(
  foreground: string,
  background: string,
  minRatio: number,
): void {
  const ratio = getThemeContrastRatio(foreground, background)

  expect(ratio).toBeNumber()
  expect(ratio ?? 0).toBeGreaterThanOrEqual(minRatio)
}

function expectContrastBetween(
  foreground: string,
  background: string,
  minRatio: number,
  maxRatio: number,
): void {
  const ratio = getThemeContrastRatio(foreground, background)

  expect(ratio).toBeNumber()
  expect(ratio ?? 0).toBeGreaterThanOrEqual(minRatio)
  expect(ratio ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(maxRatio)
}

describe('theme contrast adaptation', () => {
  beforeEach(() => {
    setThemeContrastBackgroundColor(undefined)
  })

  afterEach(() => {
    setThemeContrastBackgroundColor(undefined)
  })

  it('keeps visual hierarchy against dark terminal backgrounds', () => {
    const base = getTheme('dark')
    const theme = createContrastAwareTheme(base, '#000000')

    expect(theme.noting).not.toBe(base.noting)
    expect(theme.diff).toEqual(base.diff)
    expectContrastAtLeast(theme.text, '#000000', 4.5)
    expectContrastBetween(theme.kode, '#000000', 3.6, 6.4)
    expectContrastBetween(theme.secondaryText, '#000000', 3, 4.2)
    expectContrastBetween(theme.noting, '#000000', 3, 4.2)
    expectContrastBetween(theme.secondaryBorder, '#000000', 2, 3.2)
  })

  it('preserves primary and muted levels against light terminal backgrounds', () => {
    const base = getTheme('dark')
    const theme = createContrastAwareTheme(base, '#ffffff')

    expect(theme.text).not.toBe(base.text)
    expect(theme.kode).not.toBe(base.kode)
    expectContrastAtLeast(theme.text, '#ffffff', 4.5)
    expectContrastBetween(theme.kode, '#ffffff', 3.6, 6.4)
    expectContrastBetween(theme.secondaryText, '#ffffff', 3, 4.2)
    expectContrastAtLeast(theme.inputBorder, '#ffffff', 3)
  })

  it('applies the detected terminal background through getTheme', () => {
    setThemeContrastBackgroundColor('#fff')

    const theme = getTheme('dark')

    expect(getThemeContrastBackgroundColor()).toBe('#ffffff')
    expectContrastAtLeast(theme.text, '#ffffff', 4.5)
    expectContrastBetween(theme.secondaryText, '#ffffff', 3, 4.2)

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

  it('keeps all theme roles inside their contrast hierarchy', () => {
    for (const themeName of getAvailableThemes()) {
      const base = getTheme(themeName)

      for (const background of TERMINAL_BACKGROUNDS) {
        const theme = createContrastAwareTheme(base, background)

        for (const group of CONTRAST_FIELD_GROUPS) {
          for (const field of group.fields) {
            expectContrastBetween(
              theme[field],
              background,
              group.minRatio,
              group.maxRatio,
            )
          }
        }
      }
    }
  })

  it('selects readable text for colored component backgrounds', () => {
    for (const themeName of getAvailableThemes()) {
      const base = getTheme(themeName)

      for (const background of TERMINAL_BACKGROUNDS) {
        const theme = createContrastAwareTheme(base, background)

        for (const componentBackground of [theme.permission, theme.warning]) {
          expectContrastAtLeast(
            getReadableTextColor(componentBackground, theme.text),
            componentBackground,
            4.5,
          )
        }
      }
    }
  })
})
