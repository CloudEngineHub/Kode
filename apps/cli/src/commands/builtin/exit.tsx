import type { Command } from '../types'

import { Text } from 'ink'
import React from 'react'

const exit = {
  type: 'local-jsx',
  name: 'exit',
  description: 'Exit the CLI',
  isEnabled: true,
  isHidden: false,
  async call() {
    setTimeout(() => {
      process.exit(0)
    }, 150)

    return <Text>Exiting…</Text>
  },
  userFacingName() {
    return 'exit'
  },
} satisfies Command

export default exit
