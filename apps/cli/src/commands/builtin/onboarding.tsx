import * as React from 'react'
import type { Command } from '../types'
import { Onboarding } from '#ui-ink/components/Onboarding'
import { clearTerminal } from '#cli-utils/terminal'
import { getGlobalConfig, saveGlobalConfig } from '#core/utils/config'
import { clearConversation } from './clear'

export default {
  type: 'local-jsx',
  name: 'onboarding',
  description: 'Run through the onboarding flow',
  isEnabled: true,
  isHidden: false,
  ui: { displayMode: 'fullscreen' },
  async call(onDone, context) {
    await clearTerminal()
    const config = getGlobalConfig()
    saveGlobalConfig({
      ...config,
      theme: 'dark',
    })

    return (
      <Onboarding
        onDone={async () => {
          clearConversation(context)
          onDone()
        }}
      />
    )
  },
  userFacingName() {
    return 'onboarding'
  },
} satisfies Command
