import type { Command } from '../types'
import { Help } from '#ui-ink/components/Help'
import * as React from 'react'

const help = {
  type: 'local-jsx',
  name: 'help',
  description: 'Show help and available commands',
  isEnabled: true,
  isHidden: false,
  ui: { displayMode: 'fullscreen' },
  async call(onDone, context) {
    return <Help commands={context.options?.commands || []} onClose={onDone} />
  },
  userFacingName() {
    return 'help'
  },
} satisfies Command

export default help
