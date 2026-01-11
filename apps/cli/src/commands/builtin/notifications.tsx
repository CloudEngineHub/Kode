import type { Command } from '../types'
import * as React from 'react'
import { TuiNotificationsDialog } from '#ui-ink/components/TuiNotificationsDialog'

const notifications = {
  type: 'local-jsx',
  name: 'notifications',
  description: 'View in-app notification history',
  isEnabled: true,
  isHidden: false,
  ui: { displayMode: 'fullscreen' },
  async call(onDone) {
    return <TuiNotificationsDialog onDone={onDone} />
  },
  userFacingName() {
    return 'notifications'
  },
  aliases: ['notifs'],
} satisfies Command

export default notifications
