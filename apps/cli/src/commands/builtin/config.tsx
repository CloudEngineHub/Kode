import type { Command } from '../types'
import { Config } from '#ui-ink/components/Config'
import * as React from 'react'

const config = {
  type: 'local-jsx',
  name: 'config',
  description: 'Open config panel',
  isEnabled: true,
  isHidden: false,
  ui: { displayMode: 'fullscreen' },
  async call(onDone) {
    return <Config onClose={onDone} />
  },
  userFacingName() {
    return 'config'
  },
} satisfies Command

export default config
