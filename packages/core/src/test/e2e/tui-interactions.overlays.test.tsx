import { afterEach, describe, expect, test, mock } from 'bun:test'
import React from 'react'
import { KeypressProvider } from '#ui-ink/contexts/KeypressContext'
import { ModelPickerScreen } from '#ui-ink/screens/overlays/ModelPickerScreen'
import { ThinkingToggleScreen } from '#ui-ink/screens/overlays/ThinkingToggleScreen'
import { WorkTasksScreen } from '#ui-ink/screens/overlays/WorkTasksScreen'
import { TranscriptScreen } from '#ui-ink/screens/overlays/TranscriptScreen'
import { createInkHarnessManager, createInkTestHarness } from './inkTestHarness'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const harnessManager = createInkHarnessManager()

afterEach(async () => {
  await harnessManager.cleanup()
})

describe('TUI E2E regression (Ink render): Overlays', () => {
  test('TranscriptScreen: Ctrl+C closes', async () => {
    let closed = false
    const h = createInkTestHarness(
      <KeypressProvider>
        <TranscriptScreen
          label="test"
          onDone={() => {
            closed = true
          }}
        />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await h.wait(25)
    h.stdin.write('\x03')
    await h.wait(25)

    expect(closed).toBe(true)
  })

  test('WorkTasksScreen: Ctrl+T closes', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'kode-worktasks-overlay-'))
    const previousConfigDir = process.env.KODE_CONFIG_DIR
    const previousTaskListId = process.env.KODE_TASK_LIST_ID
    process.env.KODE_CONFIG_DIR = tmpRoot
    process.env.KODE_TASK_LIST_ID = 'overlay-test'

    let closed = false
    try {
      const h = createInkTestHarness(
        <KeypressProvider>
          <WorkTasksScreen
            onDone={() => {
              closed = true
            }}
          />
        </KeypressProvider>,
      )
      harnessManager.track(h)

      await h.wait(25)
      h.stdin.write('\x14')
      await h.wait(25)

      expect(closed).toBe(true)
    } finally {
      if (previousConfigDir === undefined) delete process.env.KODE_CONFIG_DIR
      else process.env.KODE_CONFIG_DIR = previousConfigDir

      if (previousTaskListId === undefined) delete process.env.KODE_TASK_LIST_ID
      else process.env.KODE_TASK_LIST_ID = previousTaskListId

      rmSync(tmpRoot, { recursive: true, force: true })
    }
  })

  test('ModelPickerScreen: Alt+P closes', async () => {
    let closed = false
    const h = createInkTestHarness(
      <KeypressProvider>
        <ModelPickerScreen
          onDone={() => {
            closed = true
          }}
          onSelectModel={() => {}}
        />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await h.wait(25)
    h.stdin.write('\x1bp')
    await h.wait(25)

    expect(closed).toBe(true)
  })

  test('ThinkingToggleScreen: Alt+T closes', async () => {
    let closed = false
    const h = createInkTestHarness(
      <KeypressProvider>
        <ThinkingToggleScreen
          currentValue={false}
          isMidConversation={false}
          onSelect={() => {}}
          onDone={() => {
            closed = true
          }}
        />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await h.wait(25)
    h.stdin.write('\x1bt')
    await h.wait(25)

    expect(closed).toBe(true)
  })

  test('HistorySearchScreen: Enter triggers accept', async () => {
    try {
      mock.module('#core/history', () => {
        return {
          getGlobalHistoryWithPastes: () => [
            { display: 'hello', pastedTexts: [] },
            { display: '!ls', pastedTexts: [] },
          ],
        }
      })

      const { HistorySearchScreen } =
        await import('#ui-ink/screens/overlays/HistorySearchScreen')

      let result: any = null
      const h = createInkTestHarness(
        <KeypressProvider>
          <HistorySearchScreen onDone={r => (result = r)} />
        </KeypressProvider>,
      )
      harnessManager.track(h)

      await h.wait(25)
      h.stdin.write('\r')
      await h.wait(25)

      expect(result).toEqual({
        action: 'accept',
        value: 'hello',
        pastedTexts: [],
      })
    } finally {
      mock.restore()
    }
  })

  test('McpServersScreen: resources can be opened from a connected server', async () => {
    let reconnectCount = 0
    let getClientsCallCount = 0
    let resourceRevision = 0
    let listChangedListener:
      ((event: { kind: string; server: string }) => void) | null = null

    const readmeResource = {
      server: 'srv',
      uri: 'file:///project/README.md',
      name: 'README.md',
      title: 'Project README',
      description: 'Primary project documentation',
      mimeType: 'text/markdown',
      size: 2048,
      annotations: {
        audience: ['user'],
        priority: 0.7,
        lastModified: '2026-07-08T00:00:00Z',
      },
    }

    const guideResource = {
      server: 'srv',
      uri: 'file:///project/GUIDE.md',
      name: 'GUIDE.md',
      title: 'Project Guide',
      description: 'Updated project guide',
      mimeType: 'text/markdown',
      size: 1024,
    }

    try {
      mock.module('#core/mcp/client', () => {
        return {
          authenticateMcpServer: async () => {},
          clearMcpAuth: async () => {},
          getClients: async () => {
            getClientsCallCount += 1
            if (getClientsCallCount === 2) {
              await new Promise(resolve => setTimeout(resolve, 220))
              return [{ type: 'failed', name: 'srv' }]
            }
            if (getClientsCallCount === 3) {
              await new Promise(resolve => setTimeout(resolve, 20))
              return [{ type: 'connected', name: 'srv' }]
            }
            return [{ type: 'connected', name: 'srv' }]
          },
          getMcpAuthSnapshot: () => ({ isAuthenticated: false }),
          getMCPCommands: async () => [],
          getMCPResources: async () => {
            await new Promise(resolve => setTimeout(resolve, 220))
            return resourceRevision === 0
              ? [readmeResource]
              : [readmeResource, guideResource]
          },
          getMCPTools: async () => [],
          getMcprcServerStatus: () => 'approved',
          getMcpServer: () => ({
            scope: 'global',
            configLocation: 'test-config.json',
          }),
          listMCPServers: () => ({
            srv: { type: 'stdio', command: 'node', args: ['server.js'] },
          }),
          resetMcpConnections: async () => {
            reconnectCount += 1
          },
          subscribeMcpListChanged: (
            listener: (event: { kind: string; server: string }) => void,
          ) => {
            listChangedListener = listener
            return () => {
              if (listChangedListener === listener) listChangedListener = null
            }
          },
        }
      })
      mock.module('#core/utils/config', () => {
        return {
          getCurrentProjectConfig: () => ({ disabledMcpServers: [] }),
          getGlobalConfig: () => ({ disabledMcpServers: [] }),
          getProjectMcpServerDefinitions: () => ({
            mcprcPath: 'test-mcprc.json',
            mcpJsonPath: 'test-mcp.json',
          }),
          saveCurrentProjectConfig: () => {},
          saveGlobalConfig: () => {},
        }
      })
      mock.module('#core/utils/env', () => {
        return {
          getGlobalConfigFilePath: () => 'test-global-config.json',
        }
      })
      mock.module('#core/utils/state', () => {
        return {
          getCwd: () => 'C:\\test',
        }
      })

      const { McpServersScreen } =
        await import('#ui-ink/screens/overlays/McpServersScreen')

      const h = createInkTestHarness(
        <KeypressProvider>
          <McpServersScreen onDone={() => {}} />
        </KeypressProvider>,
      )
      harnessManager.track(h)

      await h.wait(250)
      expect(h.getOutput()).toContain('srv')

      h.stdin.write('\r')
      await h.wait(100)

      expect(h.getOutput()).toContain('Loading actions...')

      h.stdin.write('\x1b')
      await h.wait(250)
      expect(h.getOutput()).toContain('srv')

      h.clearOutput()
      h.stdin.write('\r')
      await h.wait(100)
      const reenteredLoadingOutput = h.getOutput()
      expect(reenteredLoadingOutput).toContain('Loading actions...')
      expect(reenteredLoadingOutput).toContain('Capabilities:')
      expect(reenteredLoadingOutput).toContain('loading...')
      expect(reenteredLoadingOutput).not.toContain('Resources: 1 resources')
      expect(reenteredLoadingOutput).not.toContain('1. View resources')

      h.stdin.write('\r')
      await h.wait(150)

      expect(h.getOutput()).toContain('Resources: 1 resources')
      expect(h.getOutput()).toContain('1. View resources')
      expect(reconnectCount).toBe(0)

      h.stdin.write('\r')
      await h.wait(300)
      expect(h.getOutput()).toContain('Resources for srv')
      expect(h.getOutput()).toContain('Project README')

      resourceRevision = 1
      listChangedListener?.({ kind: 'resources', server: 'srv' })
      await h.wait(300)
      expect(h.getOutput()).toContain('Project Guide')

      h.stdin.write('\r')
      await h.wait(80)
      const output = h.getOutput()
      expect(output).toContain('Resource name: README.md')
      expect(output).toContain('URI: file:///project/README.md')
      expect(output).toContain('MIME type: text/markdown')
      expect(output).toContain('Size: 2.0 KiB')
      expect(output).toContain('Primary project documentation')
      expect(output).toContain('audience: user')

      h.stdin.write('\x1b')
      await h.wait(80)
      h.stdin.write('\x1b')
      h.clearOutput()

      async function waitForStableReconnectAction(): Promise<string> {
        let lastOutput = ''
        for (let attempt = 0; attempt < 12; attempt += 1) {
          await h.wait(100)
          const output = h.getOutput()
          lastOutput = output

          if (output.includes('Loading actions...')) {
            h.clearOutput()
            continue
          }

          if (output.includes('Reconnect')) {
            h.clearOutput()
            await h.wait(100)
            const quietOutput = h.getOutput()
            if (quietOutput.includes('Loading actions...')) {
              h.clearOutput()
              continue
            }
            return output + quietOutput
          }
        }
        return lastOutput
      }

      async function reconnectOnce(): Promise<void> {
        const serverActionsOutput = await waitForStableReconnectAction()
        expect(serverActionsOutput).toContain('Reconnect')

        h.clearOutput()
        if (serverActionsOutput.includes('1. Reconnect')) {
          h.stdin.write('\r')
        } else {
          h.stdin.write('\x1B[B')
          await h.wait(80)
          expect(h.getOutput()).toContain('❯2. Reconnect')
          h.stdin.write('\r')
        }

        h.clearOutput()
        await h.wait(300)
      }

      await reconnectOnce()
      await reconnectOnce()

      const refreshedOutput = h.getOutput()
      const latestFrame = refreshedOutput.slice(
        refreshedOutput.lastIndexOf('Manage MCP servers'),
      )
      expect(latestFrame).toContain('connected')
      expect(latestFrame).not.toContain('failed')
      expect(latestFrame).toContain('❯2. Reconnect')
      expect(reconnectCount).toBe(2)
    } finally {
      mock.restore()
    }
  })
})
