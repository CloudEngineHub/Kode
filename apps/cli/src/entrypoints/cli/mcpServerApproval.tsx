import React from 'react'
import { render } from 'ink'
import { MCPServerMultiselectDialog } from '#ui-ink/components/MCPServerMultiselectDialog'
import { MCPServerApprovalDialog } from '#ui-ink/components/MCPServerApprovalDialog'
import { KeypressProvider } from '#ui-ink/contexts/KeypressContext'
import { getMcprcServerStatus } from '#core/mcp/client'
import { getProjectMcpServerDefinitions } from '#core/utils/config'
import { withEphemeralAlternateScreen } from '#cli-utils/terminal'
import { renderWithTuiStdio } from '#ui-ink/utils/inkRender'

export async function handleMcprcServerApprovals(): Promise<void> {
  const { servers } = getProjectMcpServerDefinitions()
  const pendingServers = Object.keys(servers).filter(
    serverName => getMcprcServerStatus(serverName) === 'pending',
  )

  if (pendingServers.length === 0) {
    return
  }

  await withEphemeralAlternateScreen(async () => {
    await new Promise<void>(resolve => {
      if (pendingServers.length === 1 && pendingServers[0] !== undefined) {
        const result = renderWithTuiStdio(
          render,
          <KeypressProvider>
            <MCPServerApprovalDialog
              serverName={pendingServers[0]}
              onDone={() => {
                result.unmount?.()
                resolve()
              }}
            />
          </KeypressProvider>,
          { exitOnCtrlC: false },
        )
      } else {
        const result = renderWithTuiStdio(
          render,
          <KeypressProvider>
            <MCPServerMultiselectDialog
              serverNames={pendingServers}
              onDone={() => {
                result.unmount?.()
                resolve()
              }}
            />
          </KeypressProvider>,
          { exitOnCtrlC: false },
        )
      }
    })
  })
}
