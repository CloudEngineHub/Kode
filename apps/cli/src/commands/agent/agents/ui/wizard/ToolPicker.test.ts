import { describe, expect, test } from 'bun:test'
import {
  __getFocusableToolPickerIndexForTests,
  __getToolPickerMaxVisibleItemsForTests,
} from './ToolPicker'

describe('ToolPicker viewport sizing', () => {
  test('keeps a useful minimum in small terminals', () => {
    expect(__getToolPickerMaxVisibleItemsForTests(10)).toBe(5)
  })

  test('caps rendered rows in large terminals', () => {
    expect(__getToolPickerMaxVisibleItemsForTests(80)).toBe(14)
  })

  test('uses available space between the min and max', () => {
    expect(__getToolPickerMaxVisibleItemsForTests(22)).toBe(12)
  })
})

describe('ToolPicker focus movement', () => {
  const items = [{}, { isHeader: true }, {}, {}, { isHeader: true }, {}]

  test('skips headers while moving down', () => {
    expect(__getFocusableToolPickerIndexForTests(items, 1, 1)).toBe(2)
  })

  test('skips headers while moving up', () => {
    expect(__getFocusableToolPickerIndexForTests(items, 4, -1)).toBe(3)
  })

  test('falls back when the target edge is a header', () => {
    expect(
      __getFocusableToolPickerIndexForTests([{ isHeader: true }, {}], 0, -1),
    ).toBe(1)
  })
})
