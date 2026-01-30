import type { Command } from '../types'

import React from 'react'

import { TasksScreen } from '#ui-ink/screens/overlays/TasksScreen'

const tasks = {
  type: 'local-jsx',
  name: 'tasks',
  description: 'Manage background tasks',
  isEnabled: true,
  isHidden: false,
  ui: { displayMode: 'fullscreen' },
  disableNonInteractive: true,
  aliases: ['task', 'bashes'],
  async call(onDone) {
    return React.createElement(TasksScreen, { onDone })
  },
  userFacingName() {
    return 'tasks'
  },
} satisfies Command

export default tasks
