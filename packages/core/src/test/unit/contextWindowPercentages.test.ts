import { describe, expect, test } from 'bun:test'
import { computeContextWindowPercentages } from '#core/utils/contextWindowPercentages'

describe('computeContextWindowPercentages', () => {
  test('returns nulls when usage is missing', () => {
    expect(
      computeContextWindowPercentages({
        currentUsage: null,
        contextWindowSize: 200_000,
      }),
    ).toEqual({ used_percentage: null, remaining_percentage: null })
  })

  test('returns nulls when context window size is missing or invalid', () => {
    expect(
      computeContextWindowPercentages({
        currentUsage: { input_tokens: 10 },
        contextWindowSize: null,
      }),
    ).toEqual({ used_percentage: null, remaining_percentage: null })

    expect(
      computeContextWindowPercentages({
        currentUsage: { input_tokens: 10 },
        contextWindowSize: 0,
      }),
    ).toEqual({ used_percentage: null, remaining_percentage: null })

    expect(
      computeContextWindowPercentages({
        currentUsage: { input_tokens: 10 },
        contextWindowSize: -1,
      }),
    ).toEqual({ used_percentage: null, remaining_percentage: null })
  })

  test('computes used/remaining percentages and clamps to 0-100', () => {
    expect(
      computeContextWindowPercentages({
        currentUsage: {
          input_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
        contextWindowSize: 100,
      }),
    ).toEqual({ used_percentage: 0, remaining_percentage: 100 })

    expect(
      computeContextWindowPercentages({
        currentUsage: {
          input_tokens: 50,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
        contextWindowSize: 200,
      }),
    ).toEqual({ used_percentage: 25, remaining_percentage: 75 })

    expect(
      computeContextWindowPercentages({
        currentUsage: {
          input_tokens: 199,
          cache_creation_input_tokens: 2,
          cache_read_input_tokens: 0,
        },
        contextWindowSize: 200,
      }),
    ).toEqual({ used_percentage: 100, remaining_percentage: 0 })

    expect(
      computeContextWindowPercentages({
        currentUsage: {
          input_tokens: -10,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
        contextWindowSize: 200,
      }),
    ).toEqual({ used_percentage: 0, remaining_percentage: 100 })
  })
})
