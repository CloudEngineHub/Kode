import React from 'react'
import { render } from 'ink'
import { MCPServerMultiselectDialog } from '#ui-ink/components/MCPServerMultiselectDialog'
import { MCPServerApprovalDialog } from '#ui-ink/components/MCPServerApprovalDialog'
import { KeypressProvider } from '#ui-ink/contexts/KeypressContext'
import { getMcprcServerStatus } from '#core/mcp/client'
import { getProjectMcpServerDefinitions } from '#core/utils/config'

export async function handleMcprcServerApprovals(): Promise<void> {
  const { servers } = getProjectMcpServerDefinitions()
  const pendingServers = Object.keys(servers).filter(
    serverName => getMcprcServerStatus(serverName) === 'pending',
  )

  if (pendingServers.length === 0) {
    return
  }

  await new Promise<void>(resolve => {
    const clearScreenAndResolve = () => {
      // Clear screen after dialog
      process.stdout.write('\x1b[2J\x1b[3J\x1b[H', () => {
        resolve()
      })
    }

    if (pendingServers.length === 1 && pendingServers[0] !== undefined) {
      const result = render(
        <KeypressProvider>
          <MCPServerApprovalDialog
            serverName={pendingServers[0]}
            onDone={() => {
              result.unmount?.()
              clearScreenAndResolve()
            }}
          />
        </KeypressProvider>,
        { exitOnCtrlC: false },
      )
    } else {
      const result = render(
        <KeypressProvider>
          <MCPServerMultiselectDialog
            serverNames={pendingServers}
            onDone={() => {
              result.unmount?.()
              clearScreenAndResolve()
            }}
          />
        </KeypressProvider>,
        { exitOnCtrlC: false },
      )
    }
  })
}
