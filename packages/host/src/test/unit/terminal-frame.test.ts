import { describe, expect, test } from 'bun:test'
import {
  createBlankFrame,
  createFrameFromLines,
  diffTerminalFrames,
  frameToLines,
  getFrameCell,
  renderAnsiFrameDiff,
  setFrameCell,
  TerminalFrameRenderer,
} from '../../terminal'

describe('terminal frame', () => {
  test('creates padded fixed-size frames from lines', () => {
    const frame = createFrameFromLines(['abc', 'xy'], 4, 3)

    expect(frameToLines(frame)).toEqual(['abc ', 'xy  ', '    '])
    expect(getFrameCell(frame, 2, 0)).toBe('c')
  })

  test('setFrameCell returns a new frame', () => {
    const initial = createBlankFrame(3, 1)
    const next = setFrameCell(initial, 1, 0, 'x')

    expect(frameToLines(initial)).toEqual(['   '])
    expect(frameToLines(next)).toEqual([' x '])
  })

  test('sanitizes control characters at cell boundaries', () => {
    const frame = createFrameFromLines(['a\u001b'], 2, 1)
    const next = setFrameCell(frame, 1, 0, '\n')

    expect(frameToLines(frame)).toEqual(['a '])
    expect(frameToLines(next)).toEqual(['a '])
  })
})

describe('terminal frame diff', () => {
  test('returns no operations for equal frames', () => {
    const frame = createFrameFromLines(['abc'], 3, 1)

    expect(diffTerminalFrames(frame, frame)).toEqual([])
    expect(renderAnsiFrameDiff(frame, frame)).toBe('')
  })

  test('merges contiguous changes on the same row', () => {
    const previous = createFrameFromLines(['abcde'], 5, 1)
    const next = createFrameFromLines(['abXYe'], 5, 1)

    expect(diffTerminalFrames(previous, next)).toEqual([
      { row: 0, column: 2, text: 'XY' },
    ])
    expect(renderAnsiFrameDiff(previous, next)).toBe('\x1b[1;3HXY')
  })

  test('renders full frame when dimensions differ', () => {
    const previous = createFrameFromLines(['ab'], 2, 1)
    const next = createFrameFromLines(['abc', 'xy'], 3, 2)

    expect(diffTerminalFrames(previous, next)).toEqual([
      { row: 0, column: 0, text: 'abc' },
      { row: 1, column: 0, text: 'xy ' },
    ])
  })
})

describe('terminal frame renderer', () => {
  test('flushes full frame first, then only changed cells', () => {
    const writes: string[] = []
    const renderer = new TerminalFrameRenderer(chunk => {
      writes.push(chunk)
    })

    renderer.setFrame(createFrameFromLines(['abc'], 3, 1))
    expect(renderer.flush()).toBe('\x1b[1;1Habc')

    renderer.setFrame(createFrameFromLines(['abx'], 3, 1))
    expect(renderer.flush()).toBe('\x1b[1;3Hx')
    expect(writes).toEqual(['\x1b[1;1Habc', '\x1b[1;3Hx'])
  })

  test('reset makes next flush a full frame', () => {
    const writes: string[] = []
    const renderer = new TerminalFrameRenderer(chunk => {
      writes.push(chunk)
    })

    renderer.setFrame(createFrameFromLines(['abc'], 3, 1))
    renderer.flush()
    renderer.reset()

    renderer.setFrame(createFrameFromLines(['abc'], 3, 1))
    expect(renderer.flush()).toBe('\x1b[1;1Habc')
  })
})
