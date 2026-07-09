import { basename, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  type ClientCapabilities,
  ListRootsRequestSchema,
  type Root,
} from '@modelcontextprotocol/sdk/types.js'

import { checkHasTrustDialogAccepted } from '#core/utils/config'
import { logMCPError } from '#core/utils/log'
import { getCwd, subscribeCwdChanged } from '#core/utils/state'

let exposeRootsOverrideForTests: boolean | null = null
const rootsClients = new Set<Client>()
let unsubscribeCwdChanged: (() => void) | null = null

export function createMcpRootsForCwd(cwd: string): Root[] {
  const rootPath = resolve(cwd)
  return [
    {
      uri: pathToFileURL(rootPath).toString(),
      name: basename(rootPath) || rootPath,
    },
  ]
}

export function getMcpRoots(): Root[] {
  return createMcpRootsForCwd(getCwd())
}

export function shouldExposeMcpRoots(): boolean {
  if (process.env.NODE_ENV === 'test' && exposeRootsOverrideForTests !== null) {
    return exposeRootsOverrideForTests
  }
  return checkHasTrustDialogAccepted()
}

export function getMcpClientCapabilities(): ClientCapabilities {
  if (!shouldExposeMcpRoots()) return {}
  return {
    roots: { listChanged: true },
  }
}

function ensureCwdChangedSubscription(): void {
  if (unsubscribeCwdChanged) return

  unsubscribeCwdChanged = subscribeCwdChanged(() => {
    notifyMcpRootsListChanged()
  })
}

export function notifyMcpRootsListChanged(): void {
  for (const client of rootsClients) {
    void client.sendRootsListChanged().catch(error => {
      rootsClients.delete(client)
      logMCPError(
        'roots',
        `Failed to notify MCP roots list change: ${error instanceof Error ? error.message : String(error)}`,
      )
    })
  }
}

export function registerMcpClientRequestHandlers(client: Client): void {
  if (!shouldExposeMcpRoots()) return

  client.setRequestHandler(ListRootsRequestSchema, async () => ({
    roots: getMcpRoots(),
  }))

  rootsClients.add(client)
  ensureCwdChangedSubscription()
}

export function unregisterMcpClientRequestHandlers(client: Client): void {
  rootsClients.delete(client)
}

export function __setMcpRootsTrustOverrideForTests(
  value: boolean | null,
): void {
  exposeRootsOverrideForTests = value
}

export function __resetMcpRootsForTests(): void {
  exposeRootsOverrideForTests = null
  rootsClients.clear()
  unsubscribeCwdChanged?.()
  unsubscribeCwdChanged = null
}
