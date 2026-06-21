import { describe, expect, test } from 'bun:test'
import * as React from 'react'
import type { ReactNode } from 'react'
import type { Command } from '#cli-commands'
import { processUserInput } from '#ui-ink/utils/processUserInput'
import type { Message } from '#core/query'
import type { SetToolJSXFn, ToolUseContext } from '#core/tooling/Tool'

function makeTestCommandContext(args: {
  commands: Command[]
}): ToolUseContext & {
  setForkConvoWithMessagesOnTheNextRender: (fork: Message[]) => void
} {
  return {
    abortController: new AbortController(),
    messageId: 'm',
    readFileTimestamps: {},
    options: {
      commands: args.commands,
      tools: [],
      verbose: false,
      safeMode: false,
      forkNumber: 0,
      messageLogName: 'test',
      maxThinkingTokens: 0,
      permissionMode: 'default',
    },
    setForkConvoWithMessagesOnTheNextRender: () => {},
  }
}

describe('interactive local-jsx command transcript behavior', () => {
  test('processUserInput returns [] when an interactive local-jsx command completes with no output', async () => {
    const setToolJSXCalls: Array<unknown> = []
    const setToolJSX: SetToolJSXFn<ReactNode> = value => {
      setToolJSXCalls.push(value)
    }

    const interactive = {
      type: 'local-jsx',
      name: 'ui',
      description: 'ui',
      isEnabled: true,
      isHidden: false,
      ui: { displayMode: 'fullscreen' },
      userFacingName() {
        return 'ui'
      },
      async call(onDone) {
        const jsx = React.createElement('div', null, 'hello')
        setTimeout(() => onDone(), 0)
        return jsx
      },
    } satisfies Command

    const ctx = makeTestCommandContext({ commands: [interactive] })
    const messages = await processUserInput(
      '/ui',
      'prompt',
      setToolJSX,
      ctx,
      null,
    )

    expect(messages).toHaveLength(0)
    expect(setToolJSXCalls.some(v => v && typeof v === 'object')).toBe(true)
    expect(setToolJSXCalls[setToolJSXCalls.length - 1]).toBe(null)
  })

  test('processUserInput returns only an assistant message when an interactive local-jsx command provides output', async () => {
    const setToolJSX: SetToolJSXFn<ReactNode> = () => {}

    const interactive = {
      type: 'local-jsx',
      name: 'ui-result',
      description: 'ui-result',
      isEnabled: true,
      isHidden: false,
      ui: { displayMode: 'fullscreen' },
      userFacingName() {
        return 'ui-result'
      },
      async call(onDone) {
        const jsx = React.createElement('div', null, 'hello')
        setTimeout(() => onDone('OK'), 0)
        return jsx
      },
    } satisfies Command

    const ctx = makeTestCommandContext({ commands: [interactive] })
    const messages = await processUserInput(
      '/ui-result',
      'prompt',
      setToolJSX,
      ctx,
      null,
    )

    expect(messages).toHaveLength(1)
    expect(messages[0]?.type).toBe('assistant')
  })
})
