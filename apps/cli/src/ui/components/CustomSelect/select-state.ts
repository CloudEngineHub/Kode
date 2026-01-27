import { Option } from '@inkjs/ui'
import OptionMap from './option-map'
import type { OptionHeader, OptionSubtree } from './select'

export type FlatOption = Option | OptionHeader

export type DefaultSelectState = {
  /**
   * Map where key is option's value and value is option's index.
   */
  optionMap: OptionMap

  /**
   * Number of visible options.
   */
  visibleOptionCount: number

  /**
   * Value of the currently focused option.
   */
  focusedValue: string | undefined

  /**
   * Index of the first visible option.
   */
  visibleFromIndex: number

  /**
   * Index of the last visible option.
   */
  visibleToIndex: number

  /**
   * Value of the previously selected option.
   */
  previousValue: string | undefined

  /**
   * Value of the selected option.
   */
  value: string | undefined
}

export const flattenOptions = (
  options: (Option | OptionSubtree)[],
): FlatOption[] =>
  options.flatMap(option => {
    if ('options' in option) {
      const flatSubtree = flattenOptions(option.options)
      const optionValues = flatSubtree.flatMap(o =>
        'value' in o ? o.value : [],
      )
      const header =
        option.header !== undefined
          ? [{ header: option.header, optionValues }]
          : []

      return [...header, ...flatSubtree]
    }

    return option
  })

export type CreateDefaultStateInput = {
  visibleOptionCount?: number
  options: (Option | OptionSubtree)[]
  defaultValue?: string
}

export const createDefaultState = ({
  visibleOptionCount: customVisibleOptionCount,
  defaultValue,
  options,
}: CreateDefaultStateInput): DefaultSelectState => {
  const flatOptions = flattenOptions(options)

  const visibleOptionCount =
    typeof customVisibleOptionCount === 'number'
      ? Math.min(customVisibleOptionCount, flatOptions.length)
      : flatOptions.length

  const optionMap = new OptionMap(flatOptions)
  const firstOption = optionMap.first

  // Use defaultValue for focusedValue if it exists and is valid, otherwise use first option
  let focusedValue: string | undefined
  if (defaultValue && optionMap.get(defaultValue)) {
    focusedValue = defaultValue
  } else {
    focusedValue =
      firstOption && 'value' in firstOption ? firstOption.value : undefined
  }

  // Calculate visible range based on focused value
  let visibleFromIndex = 0
  let visibleToIndex = visibleOptionCount

  if (focusedValue && optionMap.get(focusedValue)) {
    const focusedIndex = optionMap.get(focusedValue)!.index
    // Center the focused option in the visible area if possible
    const halfVisible = Math.floor(visibleOptionCount / 2)
    visibleFromIndex = Math.max(0, focusedIndex - halfVisible)
    visibleToIndex = Math.min(
      flatOptions.length,
      visibleFromIndex + visibleOptionCount,
    )

    // Adjust if we can't show enough items at the end
    if (visibleToIndex - visibleFromIndex < visibleOptionCount) {
      visibleFromIndex = Math.max(0, visibleToIndex - visibleOptionCount)
    }
  }

  return {
    optionMap,
    visibleOptionCount,
    focusedValue,
    visibleFromIndex,
    visibleToIndex,
    previousValue: undefined,
    value: undefined,
  }
}
