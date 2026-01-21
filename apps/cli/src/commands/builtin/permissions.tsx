import type { Command } from '../types'

import React from 'react'

import { PermissionsScreen } from '#ui-ink/screens/overlays/PermissionsScreen'

const permissions = {
  type: 'local-jsx',
  name: 'permissions',
  description: 'Manage allow & deny tool permission rules',
  isEnabled: true,
  isHidden: false,
  aliases: ['allowed-tools'],
  ui: { displayMode: 'fullscreen' },
  disableNonInteractive: true,
  async call(onDone, context) {
    return React.createElement(PermissionsScreen, {
      context,
      onDone,
    })
  },
  userFacingName() {
    return 'permissions'
  },
} satisfies Command

export default permissions
