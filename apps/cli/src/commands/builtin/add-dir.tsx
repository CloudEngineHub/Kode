import type { Command } from '../types'

import React from 'react'

import { PermissionsScreen } from '#ui-ink/screens/overlays/PermissionsScreen'

const addDir = {
  type: 'local-jsx',
  name: 'add-dir',
  description: 'Add a new working directory',
  argumentHint: '<path>',
  isEnabled: true,
  isHidden: false,
  ui: { displayMode: 'fullscreen' },
  disableNonInteractive: true,
  async call(onDone, context, args = '') {
    const directoryPath = String(args ?? '').trim()
    return React.createElement(PermissionsScreen, {
      context,
      onDone,
      initialView: 'addDir',
      initialDraftInput: directoryPath || undefined,
      initialDestination: 'localSettings',
    })
  },
  userFacingName() {
    return 'add-dir'
  },
} satisfies Command

export default addDir
