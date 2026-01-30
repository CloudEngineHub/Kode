import type { Command } from '../types'
import React from 'react'

import { McpServersScreen } from '#ui-ink/screens/overlays/McpServersScreen'

const mcp = {
  type: 'local-jsx',
  name: 'mcp',
  description: 'Manage MCP servers',
  isEnabled: true,
  isHidden: false,
  ui: { displayMode: 'fullscreen' },
  disableNonInteractive: true,
  async call(onDone) {
    return React.createElement(McpServersScreen, { onDone })
  },
  userFacingName() {
    return 'mcp'
  },
} satisfies Command

export default mcp
