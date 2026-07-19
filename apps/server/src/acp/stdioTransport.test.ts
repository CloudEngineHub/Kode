import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'

import { createDefaultToolPermissionContext } from '#core/types/toolPermissionContext'
import {
  getCwd,
  getOriginalCwd,
  setCwd,
  setOriginalCwd,
} from '#core/utils/state'

import type { SessionState } from './agent/types'
import { JsonRpcPeer } from './jsonrpc'
import { KodeAcpAgent } from './kodeAcpAgent'
import { AcpSessionManager } from './sessionManager'
import { StdioTransport } from './stdioTransport'

type OutboundMessage = {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  result?: Record<string, unknown> | null
  error?: {
    code: number
    message: string
    data?: Record<string, unknown>
  }
}

const originalEcho = process.env.KODE_ACP_ECHO
const originalConfigDir = process.env.KODE_CONFIG_DIR
const originalCwd = getCwd()
const originalOriginalCwd = getOriginalCwd()
const temporaryDirectories: string[] = []

function makeTemporaryDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix))
  temporaryDirectories.push(directory)
  return directory
}

function createSession(sessionId: string, cwd: string): SessionState {
  const toolPermissionContext = createDefaultToolPermissionContext()
  return {
    sessionId,
    cwd,
    mcpServers: [],
    mcpClients: [],
    sessionOwnedMcpClients: [],
    commands: [],
    tools: [],
    systemPrompt: [],
    context: {},
    messages: [],
    toolPermissionContext,
    readFileTimestamps: {},
    responseState: {},
    currentModeId: toolPermissionContext.mode,
    activeAbortController: null,
    toolCalls: new Map(),
  }
}

async function createHarness(sessions: SessionState[]) {
  const input = new PassThrough()
  const outbound: OutboundMessage[] = []
  const manager = new AcpSessionManager<SessionState>()
  for (const session of sessions) {
    await manager.set(session.sessionId, session)
  }

  let resolveClosed: (() => void) | undefined
  const closed = new Promise<void>(resolve => {
    resolveClosed = resolve
  })

  const peer = new JsonRpcPeer()
  new KodeAcpAgent(peer, { sessionManager: manager })
  const transport = new StdioTransport(peer, {
    input,
    writeLine: line => outbound.push(JSON.parse(line)),
    onClose: () => resolveClosed?.(),
  })
  transport.start()

  const waitForResponse = async (
    id: string | number,
  ): Promise<OutboundMessage> => {
    const timeoutAt = Date.now() + 2_000
    while (Date.now() < timeoutAt) {
      const response = outbound.find(
        message =>
          message.id === id &&
          (Object.hasOwn(message, 'result') || Object.hasOwn(message, 'error')),
      )
      if (response) return response
      await new Promise(resolve => setTimeout(resolve, 1))
    }
    throw new Error(`Timed out waiting for JSON-RPC response ${String(id)}`)
  }

  return {
    manager,
    sendTogether: (...requests: Record<string, unknown>[]) => {
      input.write(
        `${requests.map(request => JSON.stringify(request)).join('\n')}\n`,
      )
    },
    waitForResponse,
    close: async () => {
      transport.stop()
      await closed
      input.destroy()
      manager.clear()
    },
  }
}

function promptRequest(
  id: number,
  sessionId: string,
  text: string,
): Record<string, unknown> {
  return {
    jsonrpc: '2.0',
    id,
    method: 'session/prompt',
    params: {
      sessionId,
      prompt: [{ type: 'text', text }],
    },
  }
}

afterEach(async () => {
  if (originalEcho === undefined) delete process.env.KODE_ACP_ECHO
  else process.env.KODE_ACP_ECHO = originalEcho
  if (originalConfigDir === undefined) delete process.env.KODE_CONFIG_DIR
  else process.env.KODE_CONFIG_DIR = originalConfigDir

  await setCwd(originalCwd)
  setOriginalCwd(originalOriginalCwd)
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true })
  }
})

describe('ACP stdio prompt concurrency', () => {
  test('rejects a concurrent prompt for the same session and releases the lease', async () => {
    process.env.KODE_ACP_ECHO = '1'
    process.env.KODE_CONFIG_DIR = makeTemporaryDirectory('kode-acp-config-')
    const project = makeTemporaryDirectory('kode-acp-project-')
    const harness = await createHarness([createSession('session-a', project)])

    try {
      harness.sendTogether(
        promptRequest(1, 'session-a', 'first'),
        promptRequest(2, 'session-a', 'second'),
      )

      const [first, second] = await Promise.all([
        harness.waitForResponse(1),
        harness.waitForResponse(2),
      ])
      expect(first.result?.stopReason).toBe('end_turn')
      expect(second.error?.code).toBe(-32000)
      expect(second.error?.data).toEqual({
        kind: 'session_busy',
        retryable: true,
        sessionId: 'session-a',
      })

      harness.sendTogether(promptRequest(3, 'session-a', 'after busy'))
      expect((await harness.waitForResponse(3)).result?.stopReason).toBe(
        'end_turn',
      )
    } finally {
      await harness.close()
    }
  })

  test('serializes different sessions and identifies the global turn owner', async () => {
    process.env.KODE_ACP_ECHO = '1'
    process.env.KODE_CONFIG_DIR = makeTemporaryDirectory('kode-acp-config-')
    const firstProject = makeTemporaryDirectory('kode-acp-project-a-')
    const secondProject = makeTemporaryDirectory('kode-acp-project-b-')
    const harness = await createHarness([
      createSession('session-a', firstProject),
      createSession('session-b', secondProject),
    ])

    try {
      harness.sendTogether(
        promptRequest(1, 'session-a', 'first'),
        promptRequest(2, 'session-b', 'second'),
      )

      const [first, second] = await Promise.all([
        harness.waitForResponse(1),
        harness.waitForResponse(2),
      ])
      expect(first.result?.stopReason).toBe('end_turn')
      expect(second.error?.code).toBe(-32000)
      expect(second.error?.data).toEqual({
        kind: 'global_turn_busy',
        retryable: true,
        sessionId: 'session-b',
        activeSessionId: 'session-a',
      })

      harness.sendTogether(promptRequest(3, 'session-b', 'after busy'))
      expect((await harness.waitForResponse(3)).result?.stopReason).toBe(
        'end_turn',
      )
    } finally {
      await harness.close()
    }
  })

  test('lets cancel win during setup and releases the turn lease', async () => {
    process.env.KODE_ACP_ECHO = '1'
    process.env.KODE_CONFIG_DIR = makeTemporaryDirectory('kode-acp-config-')
    const project = makeTemporaryDirectory('kode-acp-project-')
    const harness = await createHarness([createSession('session-a', project)])

    try {
      harness.sendTogether(promptRequest(1, 'session-a', 'cancel me'), {
        jsonrpc: '2.0',
        id: 2,
        method: 'session/cancel',
        params: { sessionId: 'session-a' },
      })

      const [prompt, cancel] = await Promise.all([
        harness.waitForResponse(1),
        harness.waitForResponse(2),
      ])
      expect(cancel.result).toBeNull()
      expect(prompt.result?.stopReason).toBe('cancelled')

      harness.sendTogether(promptRequest(3, 'session-a', 'after cancel'))
      expect((await harness.waitForResponse(3)).result?.stopReason).toBe(
        'end_turn',
      )
    } finally {
      await harness.close()
    }
  })

  test('releases the turn lease when prompt setup throws', async () => {
    process.env.KODE_ACP_ECHO = '1'
    process.env.KODE_CONFIG_DIR = makeTemporaryDirectory('kode-acp-config-')
    const project = makeTemporaryDirectory('kode-acp-project-')
    const missingProject = join(project, 'missing')
    const harness = await createHarness([
      createSession('session-a', missingProject),
    ])

    try {
      harness.sendTogether(promptRequest(1, 'session-a', 'first failure'))
      const first = await harness.waitForResponse(1)
      expect(first.error?.code).toBe(-32603)
      expect(first.error?.message).toContain('does not exist')

      harness.sendTogether(promptRequest(2, 'session-a', 'second failure'))
      const second = await harness.waitForResponse(2)
      expect(second.error?.code).toBe(-32603)
      expect(second.error?.data?.kind).not.toBe('session_busy')
    } finally {
      await harness.close()
    }
  })
})
