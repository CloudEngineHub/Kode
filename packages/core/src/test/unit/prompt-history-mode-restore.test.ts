import { describe, expect, test } from 'bun:test'
import { __parsePromptHistoryDisplayForTests } from '#ui-ink/hooks/useArrowKeyHistory'

describe('prompt history mode restore', () => {
  test('does not treat bang-prefixed history as Bash mode', () => {
    expect(__parsePromptHistoryDisplayForTests('!ls')).toEqual({
      mode: 'prompt',
      text: '!ls',
    })
  })

  test('keeps background and koding history prefixes', () => {
    expect(__parsePromptHistoryDisplayForTests('&npm test')).toEqual({
      mode: 'background',
      text: 'npm test',
    })
    expect(__parsePromptHistoryDisplayForTests('#note')).toEqual({
      mode: 'koding',
      text: 'note',
    })
  })
})
