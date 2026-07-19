import * as React from 'react'
import type { Command } from '../types'
import { getGlobalConfig, saveGlobalConfig } from '#core/utils/config'
import { clearTerminal } from '#cli-utils/terminal'
import { requestCliExit } from '#cli-utils/exit'
import { Text } from 'ink'

export default {
  type: 'local-jsx',
  name: 'logout',
  description: 'Clear Kode account state (Codex credentials stay separate)',
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
      <Text>
        Cleared Kode account state. To sign out of Codex, run `codex logout`.
      </Text>
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
