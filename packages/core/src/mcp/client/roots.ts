import { basename, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  type ClientCapabilities,
  ListRootsRequestSchema,
  type Root,
} from '@modelcontextprotocol/sdk/types.js'

import { checkHasTrustDialogAccepted } from '#core/utils/config'
import { getCwd } from '#core/utils/state'

let exposeRootsOverrideForTests: boolean | null = null

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
    roots: {},
  }
}

export function registerMcpClientRequestHandlers(client: Client): void {
  if (!shouldExposeMcpRoots()) return

  client.setRequestHandler(ListRootsRequestSchema, async () => ({
    roots: getMcpRoots(),
  }))
}

export function __setMcpRootsTrustOverrideForTests(
  value: boolean | null,
): void {
  exposeRootsOverrideForTests = value
}
