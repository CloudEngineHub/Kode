import { initDebugLogger } from '#core/utils/debugLogger'
import { logError } from '#core/utils/log'
import { enableConfigs } from '#config'

import {
  JsonRpcPeer,
  KodeAcpAgent,
  StdioTransport,
  installStdoutGuard,
} from './index'

export function runAcpStdio(): void {
  // ACP requires stdout to be protocol-only; guard early.
  const { writeAcpLine } = installStdoutGuard()

  // Initialize logging/config after the guard is in place.
  initDebugLogger()
  try {
    enableConfigs()
  } catch (error) {
    logError(error)
  }

  const peer = new JsonRpcPeer()
  new KodeAcpAgent(peer)

  const transport = new StdioTransport(peer, { writeLine: writeAcpLine })
  transport.start()
}
