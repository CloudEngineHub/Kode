#!/usr/bin/env bun
import '@utils/sanitizeAnthropicEnv'
import { initSentry } from '@services/sentry'
import { ensurePackagedRuntimeEnv } from './cli/bootstrapEnv'
import { initDebugLogger } from '@utils/debugLogger'
import { enableConfigs } from '@utils/config'
import { logError } from '@utils/log'

import { JsonRpcPeer } from '../acp/jsonrpc'
import { StdioTransport } from '../acp/stdioTransport'
import { installStdoutGuard } from '../acp/stdoutGuard'
import { KodeAcpAgent } from '../acp/kodeAcpAgent'

initSentry()
ensurePackagedRuntimeEnv()

// ACP requires stdout to be protocol-only; guard early.
const { writeAcpLine } = installStdoutGuard()

// Initialize logging/config after the guard is in place.
initDebugLogger()
try {
  enableConfigs()
} catch (e) {
  logError(e)
}

const peer = new JsonRpcPeer()
new KodeAcpAgent(peer)

const transport = new StdioTransport(peer, { writeLine: writeAcpLine })
transport.start()

