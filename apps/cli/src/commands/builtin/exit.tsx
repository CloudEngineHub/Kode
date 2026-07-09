import type { Command } from '../types'

import { Text } from 'ink'
import React from 'react'
import { requestCliExit } from '#cli-utils/exit'

const exit = {
  type: 'local-jsx',
  name: 'exit',
  description: 'Exit the CLI',
  isEnabled: true,
  isHidden: false,
  async call() {
    setTimeout(() => {
      requestCliExit(0)
    }, 150)

    return <Text>Exiting…</Text>
  },
  userFacingName() {
    return 'exit'
  },
} satisfies Command

export default exit
