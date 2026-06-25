import { describe, expect, test } from 'bun:test'
import { getEssentialCommands } from './commonUnixCommands'
import { generateUnixCommandSuggestions } from './unixCommandSuggestions'

describe('generateUnixCommandSuggestions', () => {
  test('shows fallback command matches while full command scan is loading', () => {
    const suggestions = generateUnixCommandSuggestions({
      prefix: 'gi',
      systemCommands: getEssentialCommands(),
      isLoadingCommands: true,
    })

    expect(suggestions.map(s => s.value)).toContain('git')
    expect(suggestions.some(s => s.metadata?.isLoading)).toBe(false)
  })

  test('shows loading only when loading has no command match', () => {
    const suggestions = generateUnixCommandSuggestions({
      prefix: 'zzzz-no-match',
      systemCommands: getEssentialCommands(),
      isLoadingCommands: true,
    })

    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]?.metadata?.isLoading).toBe(true)
  })
})
