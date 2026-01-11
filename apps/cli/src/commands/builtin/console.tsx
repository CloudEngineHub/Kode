import type { Command } from '../types'
import * as React from 'react'
import { TuiConsoleDialog } from '#ui-ink/components/TuiConsoleDialog'

const consoleCommand = {
  type: 'local-jsx',
  name: 'console',
  description: 'View captured stdout/stderr writes during TUI rendering',
  isEnabled: true,
  isHidden: false,
  ui: { displayMode: 'fullscreen' },
  async call(onDone) {
    return <TuiConsoleDialog onDone={onDone} />
  },
  userFacingName() {
    return 'console'
  },
} satisfies Command

export default consoleCommand
