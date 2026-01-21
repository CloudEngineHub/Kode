import type { Command } from '../types'

import React from 'react'

import { StatusScreen } from '#ui-ink/screens/overlays/StatusScreen'

const status = {
  type: 'local-jsx',
  name: 'status',
  description:
    'Show status including version, model, account, API connectivity, and tool statuses',
  isEnabled: true,
  isHidden: false,
  ui: { displayMode: 'fullscreen' },
  disableNonInteractive: true,
  async call(onDone, context) {
    return React.createElement(StatusScreen, { context, onDone })
  },
  userFacingName() {
    return 'status'
  },
} satisfies Command

export default status
