import React from 'react'
import type { Command } from '../types'
import { LspStatus } from '#ui-ink/screens/LspStatus'

const lsp: Command = {
  name: 'lsp',
  description: 'Show Language Server Protocol (LSP) status and configuration',
  isEnabled: true,
  isHidden: false,
  ui: { displayMode: 'fullscreen' },
  userFacingName() {
    return 'lsp'
  },
  type: 'local-jsx',
  call(onDone) {
    return Promise.resolve(React.createElement(LspStatus, { onDone }))
  },
}

export default lsp
