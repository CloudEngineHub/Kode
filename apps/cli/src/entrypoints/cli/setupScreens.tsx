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
import { withEphemeralAlternateScreen } from '#cli-utils/terminal'
import { grantReadPermissionForOriginalDir } from '#core/utils/permissions/filesystem'
import {
  renderWithTuiStdio,
  type InkRenderInstance,
} from '#ui-ink/utils/inkRender'
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

  // Never show interactive setup screens in print mode.
  if (print) return

  const config = getGlobalConfig()
  if (!config.theme || !config.hasCompletedOnboarding) {
    const { render } = await import('ink')
    await withEphemeralAlternateScreen(async () => {
      await new Promise<void>(resolve => {
        let instance: InkRenderInstance | undefined
        instance = renderWithTuiStdio(
          render,
          <KeypressProvider>
            <Onboarding
              onDone={() => {
                completeOnboarding()
                instance?.unmount?.()
                resolve()
              }}
            />
          </KeypressProvider>,
          { exitOnCtrlC: false },
        )
      })
    })
  }

  if (safeMode && !checkHasTrustDialogAccepted()) {
    const { render } = await import('ink')
    await withEphemeralAlternateScreen(async () => {
      await new Promise<void>(resolve => {
        let instance: InkRenderInstance | undefined
        const onDone = () => {
          grantReadPermissionForOriginalDir()
          instance?.unmount?.()
          resolve()
        }
        instance = renderWithTuiStdio(
          render,
          <KeypressProvider>
            <TrustDialog onDone={onDone} />
          </KeypressProvider>,
          { exitOnCtrlC: false },
        )
      })
    })
  }

  await handleMcprcServerApprovals()
}
