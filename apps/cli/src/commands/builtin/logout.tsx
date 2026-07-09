import * as React from 'react'
import type { Command } from '../types'
import { getGlobalConfig, saveGlobalConfig } from '#core/utils/config'
import { clearTerminal } from '#cli-utils/terminal'
import { requestCliExit } from '#cli-utils/exit'
import { Text } from 'ink'

export default {
  type: 'local-jsx',
  name: 'logout',
  description: 'Sign out from your ShareAI Lab account',
  isEnabled: true,
  isHidden: false,
  async call() {
    await clearTerminal()

    const config = getGlobalConfig()

    config.oauthAccount = undefined
    config.hasCompletedOnboarding = false

    if (config.customApiKeyResponses?.approved) {
      config.customApiKeyResponses.approved = []
    }

    saveGlobalConfig(config)

    const message = (
      <Text>Successfully logged out from your ShareAI Lab account.</Text>
    )

    setTimeout(() => {
      requestCliExit(0)
    }, 200)

    return message
  },
  userFacingName() {
    return 'logout'
  },
} satisfies Command
