import type { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js'
import type {
  ClientRequest,
  Result,
  ServerCapabilities,
} from '@modelcontextprotocol/sdk/types.js'
import { ResultSchema } from '@modelcontextprotocol/sdk/types.js'

import { logMCPError } from '#core/utils/log'

import { getClients } from './clients'
import { getMcpToolTimeoutMs } from './settings'
import {
  createTimeoutSignal,
  mergeAbortSignals,
  type TimeoutSignal,
} from './timeouts'
import type { ConnectedClient } from './types'

export async function requestAll<
  ResultT extends Result,
  ResultSchemaT extends typeof ResultSchema,
>(
  req: ClientRequest,
  resultSchema: ResultSchemaT,
  requiredCapability: keyof ServerCapabilities,
): Promise<{ client: ConnectedClient; result: ResultT }[]> {
  const timeoutMs = getMcpToolTimeoutMs()
  const clients = await getClients()
  const results = await Promise.allSettled(
    clients.map(async client => {
      if (client.type !== 'connected') return null

      let timeoutSignal: TimeoutSignal | null = null
      let mergedSignal: TimeoutSignal | null = null

      try {
        let capabilities = client.capabilities ?? null

        if (!capabilities) {
          try {
            capabilities = client.client.getServerCapabilities() ?? null
          } catch {
            capabilities = null
          }
          client.capabilities = capabilities
        }

        if (!capabilities?.[requiredCapability]) {
          return null
        }

        timeoutSignal = timeoutMs ? createTimeoutSignal(timeoutMs) : null
        mergedSignal = mergeAbortSignals([timeoutSignal?.signal])

        const options: RequestOptions | undefined = mergedSignal?.signal
          ? { signal: mergedSignal.signal }
          : undefined

        return {
          client,
          result: (await client.client.request(
            req,
            resultSchema,
            options,
          )) as ResultT,
        }
      } catch (error) {
        logMCPError(
          client.name,
          `Failed to request '${req.method}': ${error instanceof Error ? error.message : String(error)}`,
        )
        return null
      } finally {
        mergedSignal?.cleanup()
        timeoutSignal?.cleanup()
      }
    }),
  )

  return results
    .filter(
      (
        result,
      ): result is PromiseFulfilledResult<{
        client: ConnectedClient
        result: ResultT
      } | null> => result.status === 'fulfilled',
    )
    .map(result => result.value)
    .filter(
      (result): result is { client: ConnectedClient; result: ResultT } =>
        result !== null,
    )
}
