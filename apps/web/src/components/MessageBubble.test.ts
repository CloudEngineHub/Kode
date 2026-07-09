import { describe, expect, test } from 'bun:test'

import { __messageBubbleForTests } from './MessageBubble'

describe('MessageBubble terminal transcript helpers', () => {
  test('maps message kinds to terminal role markers', () => {
    expect(__messageBubbleForTests.terminalKindMeta('user')).toMatchObject({
      label: 'user',
      marker: '$',
    })
    expect(__messageBubbleForTests.terminalKindMeta('assistant')).toMatchObject(
      {
        label: 'kode',
        marker: '>',
      },
    )
    expect(__messageBubbleForTests.terminalKindMeta('error')).toMatchObject({
      label: 'error',
      marker: '!',
    })
  })
})
