import React from 'react'

import { MACRO } from '#core/constants/macros'
import { Onboarding } from '#ui-ink/components/Onboarding'
import { TrustDialog } from '#ui-ink/components/TrustDialog'
import { KeypressProvider } from '#ui-ink/contexts/KeypressContext'
import {
  checkHasTrustDialogAccepted,
  getGlobalConfig,
  saveGlobalConfig,
} from '#core/utils/config'
import { clearTerminal } from '#cli-utils/terminal'
import { grantReadPermissionForOriginalDir } from '#core/utils/permissions/filesystem'
import { handleMcprcServerApprovals } from './mcpServerApproval'

export function completeOnboarding(): void {
  const config = getGlobalConfig()
  saveGlobalConfig({
    ...config,
    hasCompletedOnboarding: true,
    lastOnboardingVersion: MACRO.VERSION,
  })
}

export async function showSetupScreens(
  safeMode?: boolean,
  print?: boolean,
): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    return
  }

  const config = getGlobalConfig()
  if (!config.theme || !config.hasCompletedOnboarding) {
    await clearTerminal()
    const { render } = await import('ink')
    await new Promise<void>(resolve => {
      render(
        <KeypressProvider>
          <Onboarding
            onDone={async () => {
              completeOnboarding()
              await clearTerminal()
              resolve()
            }}
          />
        </KeypressProvider>,
        {
          exitOnCtrlC: false,
        },
      )
    })
  }

  if (!print) {
    if (safeMode) {
      if (!checkHasTrustDialogAccepted()) {
        await new Promise<void>(resolve => {
          const onDone = () => {
            grantReadPermissionForOriginalDir()
            resolve()
          }
          ;(async () => {
            const { render } = await import('ink')
            render(
              <KeypressProvider>
                <TrustDialog onDone={onDone} />
              </KeypressProvider>,
              {
                exitOnCtrlC: false,
              },
            )
          })()
        })
      }
    }

    await handleMcprcServerApprovals()
  }
}
