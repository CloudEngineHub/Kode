import type { Command } from '../types'
import * as React from 'react'
import { OpenFileDialog } from '#ui-ink/components/OpenFileDialog'

const open = {
  type: 'local-jsx',
  name: 'open',
  description: 'Browse project files and open in $EDITOR',
  isEnabled: true,
  isHidden: false,
  ui: { displayMode: 'fullscreen' },
  async call(onDone) {
    return <OpenFileDialog onDone={onDone} />
  },
  userFacingName() {
    return 'open'
  },
} satisfies Command

export default open
