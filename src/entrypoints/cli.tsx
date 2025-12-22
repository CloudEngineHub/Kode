#!/usr/bin/env bun
import '@utils/sanitizeAnthropicEnv'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { initSentry } from '@services/sentry'
import { PRODUCT_COMMAND, PRODUCT_NAME } from '@constants/product'
initSentry() // Initialize Sentry as early as possible

// Default-on safety: enable the Bash LLM gate for agent calls unless explicitly disabled.
if (process.env.KODE_BASH_LLM_GATE === undefined) {
  process.env.KODE_BASH_LLM_GATE = '1'
}

// Ensure YOGA_WASM_PATH is set for Ink across run modes (wrapper/dev)
// Resolve yoga.wasm relative to this file when missing using ESM-friendly APIs
try {
  if (!process.env.YOGA_WASM_PATH) {
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = dirname(__filename)
    const devCandidate = join(__dirname, '../../yoga.wasm')
    const distCandidate = join(__dirname, './yoga.wasm')
    const resolved = existsSync(distCandidate)
      ? distCandidate
      : existsSync(devCandidate)
        ? devCandidate
        : undefined
    if (resolved) {
      process.env.YOGA_WASM_PATH = resolved
    }
  }
} catch {}

// XXX: Without this line (and the Object.keys, even though it seems like it does nothing!),
// there is a bug in Bun only on Win32 that causes this import to be removed, even though
// its use is solely because of its side-effects.
import * as dontcare from '@anthropic-ai/sdk/shims/node'
Object.keys(dontcare)

import React from 'react'
import { ReadStream } from 'tty'
import { openSync } from 'fs'
// ink and REPL are imported lazily to avoid top-level awaits during module init
import type { RenderOptions } from 'ink'
import { addToHistory } from '@history'
import { getContext, setContext, removeContext } from '@context'
import { Command } from '@commander-js/extra-typings'
import { hasPermissionsToUseTool } from '@permissions'
import {
  getGlobalConfig,
  getCurrentProjectConfig,
  getProjectMcpServerDefinitions,
  saveGlobalConfig,
  saveCurrentProjectConfig,
  getCustomApiKeyStatus,
  normalizeApiKeyForConfig,
  setConfigForCLI,
  deleteConfigForCLI,
  getConfigForCLI,
  listConfigForCLI,
  enableConfigs,
  validateAndRepairAllGPT5Profiles,
} from '@utils/config'
import { cwd } from 'process'
import { dateToFilename, logError, parseLogFilename } from '@utils/log'
import { initDebugLogger } from '@utils/debugLogger'
import { Onboarding } from '@components/Onboarding'
import { Doctor } from '@screens/Doctor'
import { TrustDialog } from '@components/TrustDialog'
import { checkHasTrustDialogAccepted, McpServerConfig } from '@utils/config'
import { isDefaultSlowAndCapableModel } from '@utils/model'
import {
  applyModelConfigYamlImport,
  formatModelConfigYamlForSharing,
} from '@utils/modelConfigYaml'
import { LogList } from '@screens/LogList'
import { ResumeConversation } from '@screens/ResumeConversation'
import { startMCPServer } from './mcp'
import { env } from '@utils/env'
import { getCwd, setCwd, setOriginalCwd } from '@utils/state'
import { getNextAvailableLogForkNumber, loadLogList } from '@utils/log'
import { loadMessagesFromLog } from '@utils/conversationRecovery'
import { cleanupOldMessageFilesInBackground } from '@utils/cleanup'
import {
  handleListApprovedTools,
  handleRemoveApprovedTool,
} from '@commands/approvedTools'
import {
  addMcpServer,
  getMcpServer,
  listMCPServers,
  parseEnvVars,
  removeMcpServer,
  getClients,
  getMcprcServerStatus,
  ensureConfigScope,
} from '@services/mcpClient'
import {
  looksLikeMcpUrl,
  normalizeMcpScopeForCli,
  normalizeMcpTransport,
  parseMcpHeaders,
} from '@services/mcpCliUtils'
import { handleMcprcServerApprovals } from '@services/mcpServerApproval'
 
import { cursorShow } from 'ansi-escapes'
import { assertMinVersion } from '@utils/autoUpdater'
import { CACHE_PATHS } from '@utils/log'
// import { checkAndNotifyUpdate } from '@utils/autoUpdater'
import { BunShell } from '@utils/BunShell'
import { clearTerminal } from '@utils/terminal'
import { showInvalidConfigDialog } from '@components/InvalidConfigDialog'
import { ConfigParseError } from '@utils/errors'
import { grantReadPermissionForOriginalDir } from '@utils/permissions/filesystem'
import { MACRO } from '@constants/macros'
export function completeOnboarding(): void {
  const config = getGlobalConfig()
  saveGlobalConfig({
    ...config,
    hasCompletedOnboarding: true,
    lastOnboardingVersion: MACRO.VERSION,
  })
}

async function showSetupScreens(
  safeMode?: boolean,
  print?: boolean,
): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    return
  }

  const config = getGlobalConfig()
  if (
    !config.theme ||
    !config.hasCompletedOnboarding // always show onboarding at least once
  ) {
    await clearTerminal()
    const { render } = await import('ink')
    await new Promise<void>(resolve => {
      render(
        <Onboarding
          onDone={async () => {
            completeOnboarding()
            await clearTerminal()
            resolve()
          }}
        />,
        {
          exitOnCtrlC: false,
        },
      )
    })
  }

  

  // In non-interactive mode, only show trust dialog in safe mode
  if (!print) {
    if (safeMode) {
      if (!checkHasTrustDialogAccepted()) {
        await new Promise<void>(resolve => {
          const onDone = () => {
            // Grant read permission to the current working directory
            grantReadPermissionForOriginalDir()
            resolve()
          }
          ;(async () => {
            const { render } = await import('ink')
            render(<TrustDialog onDone={onDone} />, {
              exitOnCtrlC: false,
            })
          })()
        })
      }
    }

    // Prompt for project-file MCP servers (.mcp.json / .mcprc) that require approval.
    await handleMcprcServerApprovals()
  }
}

function logStartup(): void {
  const config = getGlobalConfig()
  saveGlobalConfig({
    ...config,
    numStartups: (config.numStartups ?? 0) + 1,
  })
}

function omitKeys<T extends Record<string, any>>(
  input: T,
  ...keys: (keyof T | string)[]
): Partial<T> {
  const result = { ...input } as Partial<T>
  for (const key of keys) {
    delete (result as any)[key as any]
  }
  return result
}

async function setup(cwd: string, safeMode?: boolean): Promise<void> {
  // Set both current and original working directory if --cwd was provided
  if (cwd !== process.cwd()) {
    setOriginalCwd(cwd)
  }
  await setCwd(cwd)

  // Always grant read permissions for original working dir
  grantReadPermissionForOriginalDir()
  
  // Start watching agent configuration files for changes
  // Try ESM-friendly path first (compiled dist), then fall back to extensionless (dev/tsx)
  let agentLoader: any
  try {
    agentLoader = await import('@utils/agentLoader')
  } catch {
    agentLoader = await import('@utils/agentLoader')
  }
  const { startAgentWatcher, clearAgentCache } = agentLoader
  await startAgentWatcher(() => {
    // Cache is already cleared in the watcher, just log
    console.log('✅ Agent configurations hot-reloaded')
  })

  // If --safe mode is enabled, prevent root/sudo usage for security
  if (safeMode) {
    // Check if running as root/sudo on Unix-like systems
    if (
      process.platform !== 'win32' &&
      typeof process.getuid === 'function' &&
      process.getuid() === 0
    ) {
      console.error(
        `--safe mode cannot be used with root/sudo privileges for security reasons`,
      )
      process.exit(1)
    }
  }

  if (process.env.NODE_ENV === 'test') {
    return
  }

  cleanupOldMessageFilesInBackground()
  getContext() // Pre-fetch all context data at once

  // Check for last session's cost and duration
  const projectConfig = getCurrentProjectConfig()
  if (
    projectConfig.lastCost !== undefined &&
    projectConfig.lastDuration !== undefined
  ) {
        
    // Clear the values after logging
    // saveCurrentProjectConfig({
    //   ...projectConfig,
    //   lastCost: undefined,
    //   lastAPIDuration: undefined,
    //   lastDuration: undefined,
    //   lastSessionId: undefined,
    // })
  }

  // Skip interactive auto-updater permission prompts during startup
  // Users can still run the doctor command manually if desired.
}

async function main() {
  // 初始化调试日志系统
  initDebugLogger()

  // Validate configs are valid and enable configuration system
  try {
    enableConfigs()
    
    // 🔧 Validate and auto-repair GPT-5 model profiles (best-effort, non-blocking)
    // Avoid printing during interactive render; log to file on failure.
    queueMicrotask(() => {
      try {
        validateAndRepairAllGPT5Profiles()
      } catch (repairError) {
        logError(`GPT-5 configuration validation failed: ${repairError}`)
      }
    })
  } catch (error: unknown) {
    if (error instanceof ConfigParseError) {
      // Show the invalid config dialog with the error object
      await showInvalidConfigDialog({ error })
      return // Exit after handling the config error
    }
  }

  // Disabled background notifier to avoid mid-screen logs during REPL

  let inputPrompt = ''
  let renderContext: RenderOptions | undefined = {
    exitOnCtrlC: false,
  
    onFlicker() {},
  } as any

  const wantsStreamJsonStdin =
    process.argv.some(
      (arg, idx, all) => arg === '--input-format' && all[idx + 1] === 'stream-json',
    ) || process.argv.some(arg => arg.startsWith('--input-format=stream-json'))

  if (
    !process.stdin.isTTY &&
    !process.env.CI &&
    // Input hijacking breaks MCP.
    !process.argv.includes('mcp') &&
    !wantsStreamJsonStdin
  ) {
    inputPrompt = await stdin()
    if (process.platform !== 'win32') {
      try {
        const ttyFd = openSync('/dev/tty', 'r')
        renderContext = { ...renderContext, stdin: new ReadStream(ttyFd) }
      } catch (err) {
        logError(`Could not open /dev/tty: ${err}`)
      }
    }
  }
  await parseArgs(inputPrompt, renderContext)
}

async function parseArgs(
  stdinContent: string,
  renderContext: RenderOptions | undefined,
): Promise<Command> {
  const program = new Command()

  const renderContextWithExitOnCtrlC = {
    ...renderContext,
    exitOnCtrlC: true,
  }

  const wantsHelp = process.argv.includes('--help') || process.argv.includes('-h')
  const commandList = wantsHelp
    ? await (async () => {
        const { getCommands } = await import('@commands')
        const commands = await getCommands()
        return commands
          .filter(cmd => !cmd.isHidden)
          .map(cmd => `/${cmd.name} - ${cmd.description}`)
          .join('\n')
      })()
    : ''

  program
    .name(PRODUCT_COMMAND)
    .description(
      wantsHelp
        ? `${PRODUCT_NAME} - starts an interactive session by default, use -p/--print for non-interactive output

Slash commands available during an interactive session:
${commandList}`
        : `${PRODUCT_NAME} - starts an interactive session by default, use -p/--print for non-interactive output`,
    )
    .argument('[prompt]', 'Your prompt', String)
    .option('-c, --cwd <cwd>', 'The current working directory', String, cwd())
    .option('-d, --debug', 'Enable debug mode', () => true)
    .option(
      '--debug-verbose',
      'Enable verbose debug terminal output',
      () => true,
    )
    .option(
      '--verbose',
      'Override verbose mode setting from config',
      () => true,
    )
    .option('-e, --enable-architect', 'Enable the Architect tool', () => true)
    .option(
      '-p, --print',
      'Print response and exit (useful for pipes)',
      () => true,
    )
    .option(
      '--output-format <format>',
      'Output format (only works with --print): "text" (default), "json", or "stream-json"',
      String,
      'text',
    )
    .option(
      '--input-format <format>',
      'Input format (only works with --print): "text" (default) or "stream-json"',
      String,
      'text',
    )
    .option(
      '--include-partial-messages',
      'Include partial message chunks as they arrive (only works with --print and --output-format=stream-json)',
      () => true,
    )
    .option(
      '--replay-user-messages',
      'Re-emit user messages from stdin back on stdout for acknowledgment (only works with --input-format=stream-json and --output-format=stream-json)',
      () => true,
    )
    .option(
      '--permission-prompt-tool <tool>',
      'Permission prompt tool (only works with --print, --output-format=stream-json, and --input-format=stream-json): "stdio"',
      String,
    )
    .option(
      '--safe',
      'Enable strict permission checking mode (default is permissive)',
      () => true,
    )
    .option(
      '-r, --resume [value]',
      'Resume a conversation by session ID (optional value)',
    )
    .option(
      '--continue',
      'Continue the most recent conversation',
      () => true,
    )
    .option(
      '--fork-session',
      'When resuming/continuing, create a new session ID instead of reusing the original (use with --resume or --continue)',
      () => true,
    )
    .option(
      '--no-session-persistence',
      'Disable session persistence - sessions will not be saved to disk and cannot be resumed (only works with --print)',
    )
    .option(
      '--session-id <uuid>',
      'Use a specific session ID for the conversation (must be a valid UUID)',
      String,
    )
    .action(
      async (
        prompt,
        {
          cwd,
          debug,
          verbose,
          enableArchitect,
          print,
          outputFormat,
          inputFormat,
          includePartialMessages,
          replayUserMessages,
          permissionPromptTool,
          safe,
          resume,
          continue: continueConversation,
          forkSession,
          sessionId,
          sessionPersistence,
        },
      ) => {
        await setup(cwd, safe)
        await showSetupScreens(safe, print)

        assertMinVersion()

        const [{ ask }, { getTools }, { getCommands }] = await Promise.all([
          import('@utils/ask'),
          import('@tools'),
          import('@commands'),
        ])
        const commands = await getCommands()

        const [tools, mcpClients] = await Promise.all([
          getTools(enableArchitect ?? getCurrentProjectConfig().enableArchitectTool),
          getClients(),
        ])
        const inputPrompt = [prompt, stdinContent].filter(Boolean).join('\n')

        const {
          loadKodeAgentSessionMessages,
          findMostRecentKodeAgentSessionId,
        } = await import('@utils/kodeAgentSessionLoad')
        const { isUuid } = await import('@utils/uuid')
        const { setKodeAgentSessionId, getKodeAgentSessionId } = await import(
          '@utils/kodeAgentSessionId'
        )
        const { randomUUID } = await import('crypto')

        const wantsContinue = Boolean(continueConversation)
        const wantsResume = resume !== undefined
        const wantsFork = Boolean(forkSession)

        if (sessionId && !isUuid(String(sessionId))) {
          console.error(`Error: --session-id must be a valid UUID`)
          process.exit(1)
        }

        if (sessionId && (wantsContinue || wantsResume) && !wantsFork) {
          console.error(
            `Error: --session-id can only be used with --continue or --resume if --fork-session is also specified.`,
          )
          process.exit(1)
        }

        let initialMessages: any[] | undefined
        let resumedFromSessionId: string | null = null

        if (wantsContinue) {
          const latest = findMostRecentKodeAgentSessionId(cwd)
          if (!latest) {
            console.error('No conversation found to continue')
            process.exit(1)
          }
          initialMessages = loadKodeAgentSessionMessages({ cwd, sessionId: latest })
          resumedFromSessionId = latest
        } else if (wantsResume) {
          if (resume === true) {
            console.error('Error: --resume without a session ID is not supported in Kode yet.')
            process.exit(1)
          }
          const resumeId = String(resume)
          if (!isUuid(resumeId)) {
            console.error(`No conversation found with session ID: ${resumeId}`)
            process.exit(1)
          }
          initialMessages = loadKodeAgentSessionMessages({ cwd, sessionId: resumeId })
          resumedFromSessionId = resumeId
        }

        const effectiveSessionId = (() => {
          if (resumedFromSessionId) {
            if (wantsFork) return sessionId ? String(sessionId) : randomUUID()
            return resumedFromSessionId
          }
          if (sessionId) return String(sessionId)
          return getKodeAgentSessionId()
        })()

        setKodeAgentSessionId(effectiveSessionId)

        if (print) {
          const normalizedOutputFormat = String(outputFormat || 'text').toLowerCase().trim()
          const normalizedInputFormat = String(inputFormat || 'text').toLowerCase().trim()

          if (!['text', 'stream-json'].includes(normalizedInputFormat)) {
            console.error(
              `Error: Invalid --input-format "${inputFormat}". Expected one of: text, stream-json`,
            )
            process.exit(1)
          }

          if (!['text', 'json', 'stream-json'].includes(normalizedOutputFormat)) {
            console.error(
              `Error: Invalid --output-format "${outputFormat}". Expected one of: text, json, stream-json`,
            )
            process.exit(1)
          }

          if (normalizedOutputFormat === 'stream-json' && !verbose) {
            console.error(
              'Error: When using --print, --output-format=stream-json requires --verbose',
            )
            process.exit(1)
          }

          const normalizedPermissionPromptTool = permissionPromptTool
            ? String(permissionPromptTool).trim()
            : null

          if (normalizedPermissionPromptTool) {
            if (normalizedPermissionPromptTool !== 'stdio') {
              console.error(
                `Error: Unsupported --permission-prompt-tool "${normalizedPermissionPromptTool}". Only "stdio" is supported in Kode right now.`,
              )
              process.exit(1)
            }
            if (normalizedInputFormat !== 'stream-json') {
              console.error(
                'Error: --permission-prompt-tool=stdio requires --input-format=stream-json',
              )
              process.exit(1)
            }
            if (normalizedOutputFormat !== 'stream-json') {
              console.error(
                'Error: --permission-prompt-tool=stdio requires --output-format=stream-json',
              )
              process.exit(1)
            }
          }

          if (normalizedInputFormat === 'stream-json' && normalizedOutputFormat !== 'stream-json') {
            console.error(
              'Error: --input-format=stream-json requires --output-format=stream-json',
            )
            process.exit(1)
          }

          if (replayUserMessages) {
            if (
              normalizedInputFormat !== 'stream-json' ||
              normalizedOutputFormat !== 'stream-json'
            ) {
              console.error(
                'Error: --replay-user-messages requires --input-format=stream-json and --output-format=stream-json',
              )
              process.exit(1)
            }
          }

          if (normalizedInputFormat === 'stream-json') {
            if (prompt) {
              console.error(
                'Error: --input-format=stream-json cannot be used with a prompt argument',
              )
              process.exit(1)
            }
            if (stdinContent) {
              console.error(
                'Error: --input-format=stream-json cannot be used with stdin prompt text',
              )
              process.exit(1)
            }
          } else {
            if (!inputPrompt) {
              console.error(
                'Error: Input must be provided either through stdin or as a prompt argument when using --print',
              )
              process.exit(1)
            }
          }

          if (normalizedOutputFormat === 'text') {
            addToHistory(inputPrompt)
            const { resultText: response } = await ask({
              commands,
              hasPermissionsToUseTool,
              messageLogName: dateToFilename(new Date()),
              prompt: inputPrompt,
              cwd,
              tools,
              safeMode: safe,
              initialMessages,
              persistSession: sessionPersistence !== false,
            })
            console.log(response)
            process.exit(0)
          }

          const { createUserMessage } = await import('@utils/messages')
          const { getSystemPrompt } = await import('@constants/prompts')
          const { getContext } = await import('@context')
          const { getTotalCost } = await import('@costTracker')
          const { query } = await import('@query')
          const { getKodeAgentSessionId } = await import('@utils/kodeAgentSessionId')
          const {
            kodeMessageToSdkMessage,
            makeSdkInitMessage,
            makeSdkResultMessage,
          } = await import('@utils/kodeAgentStreamJson')
          const { KodeAgentStructuredStdio } = await import(
            '@utils/kodeAgentStructuredStdio',
          )
          const {
            loadToolPermissionContextFromDisk,
            persistToolPermissionUpdateToDisk,
          } = await import('@utils/permissions/toolPermissionSettings')
          const { applyToolPermissionContextUpdates } = await import(
            '@kode-types/toolPermissionContext',
          )

          const sessionIdForSdk = getKodeAgentSessionId()
          const startedAt = Date.now()
          const sdkMessages: any[] = []

          const systemPrompt = await getSystemPrompt()
          const ctx = await getContext()

          const toolPermissionContext = loadToolPermissionContextFromDisk({
            projectDir: cwd,
            includeKodeProjectConfig: true,
            isBypassPermissionsModeAvailable: !safe,
          })

          const printOptions = {
            commands,
            tools,
            verbose: true,
            safeMode: safe,
            forkNumber: 0,
            messageLogName: 'unused',
            maxThinkingTokens: 0,
            persistSession: sessionPersistence !== false,
            toolPermissionContext,
            model: undefined as any,
          }

          const availableTools = tools.map(t => t.name)
          const initMsg = makeSdkInitMessage({
            sessionId: sessionIdForSdk,
            cwd,
            tools: availableTools,
          })

          const writeSdkLine = (obj: any) => {
            process.stdout.write(JSON.stringify(obj) + '\n')
          }

          if (normalizedOutputFormat === 'stream-json') {
            writeSdkLine(initMsg)
          } else {
            sdkMessages.push(initMsg)
          }

          let activeTurnAbortController: AbortController | null = null
          const structured =
            normalizedInputFormat === 'stream-json'
              ? new KodeAgentStructuredStdio(process.stdin, process.stdout, {
                  onInterrupt: () => {
                    activeTurnAbortController?.abort()
                  },
                  onControlRequest: async msg => {
                    const subtype = msg.request?.subtype

                    if (subtype === 'initialize') {
                      return
                    }

                    if (subtype === 'set_permission_mode') {
                      const mode = (msg.request as any)?.mode
                      if (
                        mode === 'default' ||
                        mode === 'acceptEdits' ||
                        mode === 'plan' ||
                        mode === 'dontAsk' ||
                        mode === 'bypassPermissions'
                      ) {
                        if (printOptions.toolPermissionContext) {
                          printOptions.toolPermissionContext.mode = mode
                        }
                      }
                      return
                    }

                    if (subtype === 'set_model') {
                      const requested = (msg.request as any)?.model
                      if (requested === 'default') {
                        printOptions.model = undefined as any
                      } else if (typeof requested === 'string' && requested.trim()) {
                        printOptions.model = requested.trim()
                      }
                      return
                    }

                    if (subtype === 'set_max_thinking_tokens') {
                      const value = (msg.request as any)?.max_thinking_tokens
                      if (value === null) {
                        printOptions.maxThinkingTokens = 0
                      } else if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
                        printOptions.maxThinkingTokens = value
                      }
                      return
                    }

                    if (subtype === 'mcp_status') {
                      return {
                        mcpServers: mcpClients.map(c => ({
                          name: c.name,
                          status: c.type,
                          ...(c.type === 'connected' && c.capabilities
                            ? { serverInfo: c.capabilities }
                            : {}),
                        })),
                      }
                    }

                    if (subtype === 'mcp_message') {
                      const serverName = (msg.request as any)?.server_name
                      const message = (msg.request as any)?.message
                      if (typeof serverName === 'string' && serverName) {
                        const found = mcpClients.find(c => c.name === serverName)
                        if (found && found.type === 'connected') {
                          const transport = (found.client as any)?.transport
                          if (transport && typeof transport.onmessage === 'function') {
                            transport.onmessage(message)
                          }
                        }
                      }
                      return
                    }

                    if (subtype === 'mcp_set_servers') {
                      return { ok: true, sdkServersChanged: false }
                    }

                    if (subtype === 'rewind_files') {
                      throw new Error('rewind_files is not supported in Kode yet.')
                    }

                    throw new Error(`Unsupported control request subtype: ${String(subtype)}`)
                  },
                })
              : null

          if (structured) structured.start()

          const permissionTimeoutMs = (() => {
            const raw = process.env.KODE_STDIO_PERMISSION_TIMEOUT_MS
            const n = raw ? Number(raw) : NaN
            return Number.isFinite(n) && n > 0 ? n : 30_000
          })()

	          const canUseTool =
	            normalizedPermissionPromptTool === 'stdio' && structured
	              ? (async (tool: any, input: any, toolUseContext: any, assistantMessage: any) => {
	                  const base = await hasPermissionsToUseTool(
	                    tool,
	                    input,
	                    toolUseContext,
	                    assistantMessage,
	                  )

                  if (base.result === true) return { result: true as const }

                  const denied = base as Extract<typeof base, { result: false }>
                  if (denied.shouldPromptUser === false) {
                    return { result: false as const, message: denied.message }
                  }

	                  try {
	                    const blockedPath =
	                      typeof (denied as any).blockedPath === 'string'
	                        ? String((denied as any).blockedPath)
	                        : typeof (input as any)?.file_path === 'string'
	                          ? String((input as any).file_path)
	                          : typeof (input as any)?.notebook_path === 'string'
	                            ? String((input as any).notebook_path)
	                            : typeof (input as any)?.path === 'string'
	                              ? String((input as any).path)
	                              : undefined

	                    const decisionReason =
	                      typeof (denied as any).decisionReason === 'string'
	                        ? String((denied as any).decisionReason)
	                        : undefined

	                    const response = await structured.sendRequest<
	                      | {
	                          behavior: 'allow'
	                          updatedInput: Record<string, unknown>
	                          updatedPermissions?: unknown
	                          toolUseID?: string
	                        }
	                      | {
	                          behavior: 'deny'
	                          message: string
	                          interrupt?: boolean
	                          toolUseID?: string
	                        }
	                    >(
	                      {
	                        subtype: 'can_use_tool',
	                        tool_name: tool.name,
	                        input,
	                        ...(typeof toolUseContext?.toolUseId === 'string' && toolUseContext.toolUseId
	                          ? { tool_use_id: toolUseContext.toolUseId }
	                          : {}),
	                        ...(typeof toolUseContext?.agentId === 'string' && toolUseContext.agentId
	                          ? { agent_id: toolUseContext.agentId }
	                          : {}),
	                        ...(Array.isArray((denied as any).suggestions)
	                          ? { permission_suggestions: (denied as any).suggestions }
	                          : {}),
	                        ...(blockedPath ? { blocked_path: blockedPath } : {}),
	                        ...(decisionReason ? { decision_reason: decisionReason } : {}),
	                      },
	                      {
	                        signal: toolUseContext.abortController.signal,
	                        timeoutMs: permissionTimeoutMs,
	                      },
	                    )

	                    if (response && (response as any).behavior === 'allow') {
	                      const updatedInput =
	                        (response as any).updatedInput &&
                        typeof (response as any).updatedInput === 'object'
                          ? (response as any).updatedInput
                          : null
	                      if (updatedInput) {
	                        Object.assign(input, updatedInput)
	                      }

	                      const updatedPermissionsRaw = (response as any).updatedPermissions
	                      const updatedPermissions =
	                        Array.isArray(updatedPermissionsRaw) &&
	                        updatedPermissionsRaw.every(
	                          u => u && typeof u === 'object' && typeof (u as any).type === 'string',
	                        )
	                          ? (updatedPermissionsRaw as any[])
	                          : null

	                      if (updatedPermissions && printOptions.toolPermissionContext) {
	                        const next = applyToolPermissionContextUpdates(
	                          printOptions.toolPermissionContext,
	                          updatedPermissions as any,
	                        )
	                        printOptions.toolPermissionContext = next
	                        if (toolUseContext?.options) {
	                          toolUseContext.options.toolPermissionContext = next
	                        }
	                        for (const update of updatedPermissions as any) {
	                          persistToolPermissionUpdateToDisk({ update, projectDir: cwd })
	                        }
	                      }

	                      return { result: true as const }
	                    }

	                    if (response && (response as any).behavior === 'deny') {
	                      if ((response as any).interrupt === true) {
	                        toolUseContext.abortController.abort()
	                      }
	                    }

	                    return {
	                      result: false as const,
	                      message:
	                        typeof (response as any)?.message === 'string'
	                          ? String((response as any).message)
	                          : denied.message,
                    }
                  } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e)
                    return {
                      result: false as const,
                      message: `Permission prompt failed: ${msg}`,
                      shouldPromptUser: false,
                    }
                  }
                }) as any
              : hasPermissionsToUseTool

          if (normalizedInputFormat === 'stream-json') {
            if (!structured) {
              console.error('Error: Structured stdin is not available')
              process.exit(1)
            }

            const { runKodeAgentStreamJsonSession } = await import(
              '@utils/kodeAgentStreamJsonSession',
            )

            await runKodeAgentStreamJsonSession({
              structured,
              query,
              writeSdkLine,
              sessionId: sessionIdForSdk,
              systemPrompt,
              context: ctx,
              canUseTool,
              toolUseContextBase: {
                options: printOptions,
                messageId: undefined,
                readFileTimestamps: {},
                setToolJSX: () => {},
              },
              replayUserMessages: Boolean(replayUserMessages),
              getTotalCostUsd: () => getTotalCost(),
              onActiveTurnAbortControllerChanged: controller => {
                activeTurnAbortController = controller
              },
              initialMessages: initialMessages as any,
            })

            process.exit(0)
          }

          const abortController = new AbortController()
          const userMsg = await (async () => {
            if (normalizedInputFormat !== 'stream-json') {
              addToHistory(inputPrompt)
              return createUserMessage(inputPrompt)
            }
            if (!structured) {
              console.error('Error: Structured stdin is not available')
              process.exit(1)
            }

            const sdkUser = await structured.nextUserMessage({
              signal: abortController.signal,
              timeoutMs: 30_000,
            })

            if (!sdkUser || typeof sdkUser !== 'object') {
              console.error('Error: Invalid stream-json input (missing user message)')
              process.exit(1)
            }

            const sdkMessage = (sdkUser as any).message
            const sdkContent = sdkMessage?.content
            if (typeof sdkContent !== 'string' && !Array.isArray(sdkContent)) {
              console.error('Error: Invalid stream-json user message content')
              process.exit(1)
            }

            const m = createUserMessage(sdkContent as any)
            if (typeof (sdkUser as any).uuid === 'string' && (sdkUser as any).uuid) {
              ;(m as any).uuid = String((sdkUser as any).uuid)
            }
            return m
          })()

          const baseMessages = [...(initialMessages ?? []), userMsg]

          const sdkUser = kodeMessageToSdkMessage(userMsg as any, sessionIdForSdk)
          if (sdkUser) {
            if (normalizedOutputFormat === 'stream-json') {
              writeSdkLine(sdkUser)
            } else {
              sdkMessages.push(sdkUser)
            }
          }

          let lastAssistant: any | null = null
          let queryError: unknown = null
	          try {
	            for await (const m of query(
	              baseMessages,
	              systemPrompt,
	              ctx,
	              canUseTool,
	              {
	                options: printOptions,
	                abortController,
	                messageId: undefined,
	                readFileTimestamps: {},
	                setToolJSX: () => {},
	              },
            )) {
              if (m.type === 'assistant') lastAssistant = m
              const sdk = kodeMessageToSdkMessage(m, sessionIdForSdk)
              if (!sdk) continue

              if (normalizedOutputFormat === 'stream-json') {
                writeSdkLine(sdk)
              } else {
                sdkMessages.push(sdk)
              }
            }
          } catch (e) {
            abortController.abort()
            queryError = e
          }

          const textFromAssistant =
            lastAssistant?.message?.content?.find((c: any) => c.type === 'text')?.text
          const text =
            typeof textFromAssistant === 'string'
              ? textFromAssistant
              : queryError instanceof Error
                ? queryError.message
                : queryError
                  ? String(queryError)
                  : ''

          const usage = lastAssistant?.message?.usage
          const totalCostUsd = getTotalCost()
          const durationMs = Date.now() - startedAt
          const resultMsg = makeSdkResultMessage({
            sessionId: sessionIdForSdk,
            result: String(text),
            numTurns: 1,
            usage,
            totalCostUsd,
            durationMs,
            durationApiMs: 0,
            isError: Boolean(queryError),
          })

          if (normalizedOutputFormat === 'stream-json') {
            writeSdkLine(resultMsg)
            process.exit(0)
          }

          // json
          sdkMessages.push(resultMsg)
          if (verbose) {
            console.log(JSON.stringify(sdkMessages, null, 2))
          } else {
            console.log(JSON.stringify(resultMsg, null, 2))
          }
          process.exit(0)
        } else {
          if (sessionPersistence === false) {
            console.error('Error: --no-session-persistence only works with --print')
            process.exit(1)
          }
          const isDefaultModel = await isDefaultSlowAndCapableModel()

          // Prefetch update info before first render to place banner at top
          const updateInfo = await (async () => {
            try {
              const [{ getLatestVersion, getUpdateCommandSuggestions }, semverMod] =
                await Promise.all([import('@utils/autoUpdater'), import('semver')])
              const semver: any = (semverMod as any)?.default ?? semverMod
              const gt = semver?.gt
              if (typeof gt !== 'function') return { version: null as string | null, commands: null as string[] | null }

              const latest = await getLatestVersion()
              if (latest && gt(latest, MACRO.VERSION)) {
                const cmds = await getUpdateCommandSuggestions()
                return { version: latest as string, commands: cmds as string[] }
              }
            } catch {}
            return { version: null as string | null, commands: null as string[] | null }
          })()

          {
            const { render } = await import('ink')
            const { REPL } = await import('@screens/REPL')
            render(
              <REPL
              commands={commands}
              debug={debug}
              initialPrompt={inputPrompt}
              messageLogName={dateToFilename(new Date())}
              shouldShowPromptInput={true}
              verbose={verbose}
              tools={tools}
              safeMode={safe}
              mcpClients={mcpClients}
              isDefaultModel={isDefaultModel}
              initialUpdateVersion={updateInfo.version}
              initialUpdateCommands={updateInfo.commands}
              initialMessages={initialMessages}
            />,
            renderContext,
            )
          }
        }
      },
    )
    .version(MACRO.VERSION, '-v, --version')

  // Enable melon mode for ants if --melon is passed
  // For bun tree shaking to work, this has to be a top level --define, not inside MACRO
  // if (process.env.USER_TYPE === 'ant') {
  //   program
  //     .option('--melon', 'Enable melon mode')
  //     .hook('preAction', async () => {
  //       if ((program.opts() as { melon?: boolean }).melon) {
  //         const { runMelonWrapper } = await import('../utils/melonWrapper')
  //         const melonArgs = process.argv.slice(
  //           process.argv.indexOf('--melon') + 1,
  //         )
  //         const exitCode = runMelonWrapper(melonArgs)
  //         process.exit(exitCode)
  //       }
  //     })
  // }

  // Config
  const config = program
    .command('config')
    .description(
      `Manage configuration (eg. ${PRODUCT_COMMAND} config set -g theme dark)`,
    )

  config
    .command('get <key>')
    .description('Get a config value')
    .option('-c, --cwd <cwd>', 'The current working directory', String, cwd())
    .option('-g, --global', 'Use global config')
    .action(async (key, { cwd, global }) => {
      await setup(cwd, false)
      console.log(getConfigForCLI(key, global ?? false))
      process.exit(0)
    })

  config
    .command('set <key> <value>')
    .description('Set a config value')
    .option('-c, --cwd <cwd>', 'The current working directory', String, cwd())
    .option('-g, --global', 'Use global config')
    .action(async (key, value, { cwd, global }) => {
      await setup(cwd, false)
      setConfigForCLI(key, value, global ?? false)
      console.log(`Set ${key} to ${value}`)
      process.exit(0)
    })

  config
    .command('remove <key>')
    .description('Remove a config value')
    .option('-c, --cwd <cwd>', 'The current working directory', String, cwd())
    .option('-g, --global', 'Use global config')
    .action(async (key, { cwd, global }) => {
      await setup(cwd, false)
      deleteConfigForCLI(key, global ?? false)
      console.log(`Removed ${key}`)
      process.exit(0)
    })

  config
    .command('list')
    .description('List all config values')
    .option('-c, --cwd <cwd>', 'The current working directory', String, cwd())
    .option('-g, --global', 'Use global config', false)
    .action(async ({ cwd, global }) => {
      await setup(cwd, false)
      console.log(
        JSON.stringify(global ? listConfigForCLI(true) : listConfigForCLI(false), null, 2),
      )
      process.exit(0)
    })

  // Models (YAML import/export)

  const modelsCmd = program
    .command('models')
    .description('Import/export model profiles and pointers (YAML)')

  modelsCmd
    .command('export')
    .description(
      'Export shareable model config as YAML (does not include plaintext API keys)',
    )
    .option('-c, --cwd <cwd>', 'The current working directory', String, cwd())
    .option('-o, --output <path>', 'Write YAML to file instead of stdout')
    .action(async ({ cwd, output }) => {
      try {
        await setup(cwd, false)
        const yamlText = formatModelConfigYamlForSharing(getGlobalConfig())
        if (output) {
          writeFileSync(output, yamlText, 'utf-8')
          console.log(`Wrote model config YAML to ${output}`)
        } else {
          console.log(yamlText)
        }
        process.exit(0)
      } catch (error) {
        console.error((error as Error).message)
        process.exit(1)
      }
    })

  modelsCmd
    .command('import <file>')
    .description('Import model config YAML (merges by default)')
    .option('-c, --cwd <cwd>', 'The current working directory', String, cwd())
    .option('--replace', 'Replace existing model profiles instead of merging')
    .action(async (file: string, { cwd, replace }) => {
      try {
        await setup(cwd, false)

        const yamlText = readFileSync(file, 'utf-8')
        const { nextConfig, warnings } = applyModelConfigYamlImport(
          getGlobalConfig(),
          yamlText,
          { replace: !!replace },
        )
        saveGlobalConfig(nextConfig)

        // Force ModelManager reload after config change
        await import('@utils/model').then(({ reloadModelManager }) => {
          reloadModelManager()
        })

        if (warnings.length > 0) {
          console.error(warnings.join('\n'))
        }
        console.log(`Imported model config YAML from ${file}`)
        process.exit(0)
      } catch (error) {
        console.error((error as Error).message)
        process.exit(1)
      }
    })

  // Approved tools

  const allowedTools = program
    .command('approved-tools')
    .description('Manage approved tools')

  allowedTools
    .command('list')
    .description('List all approved tools')
    .action(async () => {
      const result = handleListApprovedTools(getCwd())
      console.log(result)
      process.exit(0)
    })

  allowedTools
    .command('remove <tool>')
    .description('Remove a tool from the list of approved tools')
    .action(async (tool: string) => {
      const result = handleRemoveApprovedTool(tool)
      console.log(result.message)
      process.exit(result.success ? 0 : 1)
    })

  // MCP

  const mcp = program
    .command('mcp')
    .description('Configure and manage MCP servers')

  mcp
    .command('serve')
    .description(`Start the ${PRODUCT_NAME} MCP server`)
    .action(async () => {
      const providedCwd = (program.opts() as { cwd?: string }).cwd ?? cwd()

      // Verify the directory exists
      if (!existsSync(providedCwd)) {
        console.error(`Error: Directory ${providedCwd} does not exist`)
        process.exit(1)
      }

      try {
        await setup(providedCwd, false)
        await startMCPServer(providedCwd)
      } catch (error) {
        console.error('Error: Failed to start MCP server:', error)
        process.exit(1)
      }
    })

  mcp
    .command('add-sse <name> <url>')
    .description('Add an SSE server')
    .option(
      '-s, --scope <scope>',
      'Configuration scope (local, user, or project)',
      'local',
    )
    .option(
      '-H, --header <header...>',
      'Set headers (e.g. -H "X-Api-Key: abc123" -H "X-Custom: value")',
    )
    .action(async (name, url, options) => {
      try {
        const scopeInfo = normalizeMcpScopeForCli(options.scope)
        const headers = parseMcpHeaders(options.header)

        addMcpServer(name, { type: 'sse', url, ...(headers ? { headers } : {}) }, scopeInfo.scope)
        console.log(
          `Added SSE MCP server ${name} with URL: ${url} to ${scopeInfo.display} config`,
        )
        if (headers) {
          console.log(`Headers: ${JSON.stringify(headers, null, 2)}`)
        }
        process.exit(0)
      } catch (error) {
        console.error((error as Error).message)
        process.exit(1)
      }
    })

  mcp
    .command('add-http <name> <url>')
    .description('Add a Streamable HTTP MCP server')
    .option(
      '-s, --scope <scope>',
      'Configuration scope (local, user, or project)',
      'local',
    )
    .option(
      '-H, --header <header...>',
      'Set headers (e.g. -H "X-Api-Key: abc123" -H "X-Custom: value")',
    )
    .action(async (name, url, options) => {
      try {
        const scopeInfo = normalizeMcpScopeForCli(options.scope)
        const headers = parseMcpHeaders(options.header)
        addMcpServer(name, { type: 'http', url, ...(headers ? { headers } : {}) }, scopeInfo.scope)
        console.log(
          `Added HTTP MCP server ${name} with URL: ${url} to ${scopeInfo.display} config`,
        )
        if (headers) {
          console.log(`Headers: ${JSON.stringify(headers, null, 2)}`)
        }
        process.exit(0)
      } catch (error) {
        console.error((error as Error).message)
        process.exit(1)
      }
    })

  mcp
    .command('add-ws <name> <url>')
    .description('Add a WebSocket MCP server')
    .option(
      '-s, --scope <scope>',
      'Configuration scope (local, user, or project)',
      'local',
    )
    .action(async (name, url, options) => {
      try {
        const scopeInfo = normalizeMcpScopeForCli(options.scope)
        addMcpServer(name, { type: 'ws', url }, scopeInfo.scope)
        console.log(
          `Added WebSocket MCP server ${name} with URL ${url} to ${scopeInfo.display} config`,
        )
        process.exit(0)
      } catch (error) {
        console.error((error as Error).message)
        process.exit(1)
      }
    })

  mcp
    .command('add [name] [commandOrUrl] [args...]')
    .description('Add a server (run without arguments for interactive wizard)')
    .option(
      '-s, --scope <scope>',
      'Configuration scope (local, user, or project)',
      'local',
    )
    .option('-t, --transport <transport>', 'MCP transport (stdio, sse, or http)')
    .option(
      '-H, --header <header...>',
      'Set headers (e.g. -H "X-Api-Key: abc123" -H "X-Custom: value")',
    )
    .option(
      '-e, --env <env...>',
      'Set environment variables (e.g. -e KEY=value)',
    )
    .action(async (name, commandOrUrl, args, options) => {
      try {
        // If name is not provided, start interactive wizard
        if (!name) {
          console.log('Interactive wizard mode: Enter the server details')
          const { createInterface } = await import('readline')
          const rl = createInterface({
            input: process.stdin,
            output: process.stdout,
          })

          const question = (query: string) =>
            new Promise<string>(resolve => rl.question(query, resolve))

          // Get server name
          const serverName = await question('Server name: ')
          if (!serverName) {
            console.error('Error: Server name is required')
            rl.close()
            process.exit(1)
          }

          // Get server type
          const serverType = await question(
            'Server type (stdio, http, sse, ws) [stdio]: ',
          )
          const type =
            serverType && ['stdio', 'http', 'sse', 'ws'].includes(serverType)
              ? serverType
              : 'stdio'

          // Get command or URL
          const prompt = type === 'stdio' ? 'Command: ' : 'URL: '
          const commandOrUrlValue = await question(prompt)
          if (!commandOrUrlValue) {
            console.error(
              `Error: ${type === 'stdio' ? 'Command' : 'URL'} is required`,
            )
            rl.close()
            process.exit(1)
          }

          // Get args and env if stdio
          let serverArgs: string[] = []
          let serverEnv: Record<string, string> = {}

          if (type === 'stdio') {
            const argsStr = await question(
              'Command arguments (space-separated): ',
            )
            serverArgs = argsStr ? argsStr.split(' ').filter(Boolean) : []

            const envStr = await question(
              'Environment variables (format: KEY1=value1,KEY2=value2): ',
            )
            if (envStr) {
              const envPairs = envStr.split(',').map(pair => pair.trim())
              serverEnv = parseEnvVars(envPairs.map(pair => pair))
            }
          }

          // Get scope
          const scopeStr = await question(
            'Configuration scope (local, user, or project) [local]: ',
          )
          const scopeInfo = normalizeMcpScopeForCli(scopeStr)
          const serverScope = scopeInfo.scope

          rl.close()

          // Add the server
          if (type === 'http') {
            addMcpServer(
              serverName,
              { type: 'http', url: commandOrUrlValue },
              serverScope,
            )
            console.log(
              `Added HTTP MCP server ${serverName} with URL ${commandOrUrlValue} to ${scopeInfo.display} config`,
            )
          } else if (type === 'sse') {
            addMcpServer(
              serverName,
              { type: 'sse', url: commandOrUrlValue },
              serverScope,
            )
            console.log(
              `Added SSE MCP server ${serverName} with URL ${commandOrUrlValue} to ${scopeInfo.display} config`,
            )
          } else if (type === 'ws') {
            addMcpServer(
              serverName,
              { type: 'ws', url: commandOrUrlValue },
              serverScope,
            )
            console.log(
              `Added WebSocket MCP server ${serverName} with URL ${commandOrUrlValue} to ${scopeInfo.display} config`,
            )
          } else {
            addMcpServer(
              serverName,
              {
                type: 'stdio',
                command: commandOrUrlValue,
                args: serverArgs,
                env: serverEnv,
              },
              serverScope,
            )

            console.log(
              `Added stdio MCP server ${serverName} with command: ${commandOrUrlValue} ${serverArgs.join(' ')} to ${scopeInfo.display} config`,
            )
          }
        } else if (name && commandOrUrl) {
          // Regular non-interactive flow
          const scopeInfo = normalizeMcpScopeForCli(options.scope)
          const transportInfo = normalizeMcpTransport(options.transport)

          if (transportInfo.transport === 'stdio') {
            if (options.header?.length) {
              throw new Error(
                '--header can only be used with --transport http or --transport sse',
              )
            }

            const env = parseEnvVars(options.env)
            if (!transportInfo.explicit && looksLikeMcpUrl(commandOrUrl)) {
              console.warn(
                `Warning: "${commandOrUrl}" looks like a URL. Default transport is stdio, so it will be treated as a command.`,
              )
              console.warn(
                `If you meant to add an HTTP MCP server, run: ${PRODUCT_COMMAND} mcp add ${name} ${commandOrUrl} --transport http`,
              )
              console.warn(
                `If you meant to add a legacy SSE MCP server, run: ${PRODUCT_COMMAND} mcp add ${name} ${commandOrUrl} --transport sse`,
              )
            }

            addMcpServer(
              name,
              { type: 'stdio', command: commandOrUrl, args: args || [], env },
              scopeInfo.scope,
            )

            console.log(
              `Added stdio MCP server ${name} with command: ${commandOrUrl} ${(args || []).join(' ')} to ${scopeInfo.display} config`,
            )
          } else {
            if (options.env?.length) {
              throw new Error('--env is only supported for stdio MCP servers')
            }
            if (args?.length) {
              throw new Error(
                'Unexpected arguments. URL-based MCP servers do not accept command args.',
              )
            }

            const headers = parseMcpHeaders(options.header)
            addMcpServer(
              name,
              {
                type: transportInfo.transport,
                url: commandOrUrl,
                ...(headers ? { headers } : {}),
              },
              scopeInfo.scope,
            )

            const kind = transportInfo.transport.toUpperCase()
            console.log(
              `Added ${kind} MCP server ${name} with URL: ${commandOrUrl} to ${scopeInfo.display} config`,
            )
            if (headers) {
              console.log(`Headers: ${JSON.stringify(headers, null, 2)}`)
            }
          }
        } else {
          console.error(
            'Error: Missing required arguments. Either provide no arguments for interactive mode or specify name and command/URL.',
          )
          process.exit(1)
        }

        process.exit(0)
      } catch (error) {
        console.error((error as Error).message)
        process.exit(1)
      }
    })
  mcp
    .command('remove <name>')
    .description('Remove an MCP server')
    .option(
      '-s, --scope <scope>',
      'Configuration scope (local, user, or project)',
    )
    .action(async (name: string, options: { scope?: string }) => {
      try {
        if (options.scope) {
          const scopeInfo = normalizeMcpScopeForCli(options.scope)
          removeMcpServer(name, scopeInfo.scope)
          console.log(
            `Removed MCP server ${name} from ${scopeInfo.display} config`,
          )
          process.exit(0)
        }

        const matches: Array<{ scope: ReturnType<typeof ensureConfigScope>; display: string }> = []

        const projectConfig = getCurrentProjectConfig()
        if (projectConfig.mcpServers?.[name]) {
          matches.push({ scope: ensureConfigScope('project'), display: 'local' })
        }

        const globalConfig = getGlobalConfig()
        if (globalConfig.mcpServers?.[name]) {
          matches.push({ scope: ensureConfigScope('global'), display: 'user' })
        }

        const projectFileDefinitions = getProjectMcpServerDefinitions()
        if (projectFileDefinitions.servers[name]) {
          const source = projectFileDefinitions.sources[name]
          if (source === '.mcp.json') {
            matches.push({ scope: ensureConfigScope('mcpjson'), display: 'project' })
          } else {
            matches.push({ scope: ensureConfigScope('mcprc'), display: 'mcprc' })
          }
        }

        if (matches.length === 0) {
          throw new Error(`No MCP server found with name: ${name}`)
        }

        if (matches.length > 1) {
          console.error(
            `MCP server "${name}" exists in multiple scopes: ${matches
              .map(m => m.display)
              .join(', ')}`,
          )
          console.error('Please specify which scope to remove from:')
          for (const match of matches) {
            console.error(
              `  ${PRODUCT_COMMAND} mcp remove ${name} --scope ${match.display}`,
            )
          }
          process.exit(1)
        }

        const match = matches[0]!
        removeMcpServer(name, match.scope)
        console.log(`Removed MCP server ${name} from ${match.display} config`)
        process.exit(0)
      } catch (error) {
        console.error((error as Error).message)
        process.exit(1)
      }
    })

  mcp
    .command('list')
    .description('List configured MCP servers')
    .action(async () => {
      try {
        const servers = listMCPServers()
        if (Object.keys(servers).length === 0) {
          console.log(
            `No MCP servers configured. Use \`${PRODUCT_COMMAND} mcp add\` to add a server.`,
          )
          process.exit(0)
        }

        const projectFileServers = getProjectMcpServerDefinitions()
        const clients = await getClients()
        const clientByName = new Map<string, (typeof clients)[number]>()
        for (const client of clients) {
          clientByName.set(client.name, client)
        }

        const names = Object.keys(servers).sort((a, b) => a.localeCompare(b))
        for (const name of names) {
          const server = servers[name]!

          const client = clientByName.get(name)
          const status =
            client?.type === 'connected'
              ? 'connected'
              : client?.type === 'failed'
                ? 'failed'
                : projectFileServers.servers[name]
                  ? (() => {
                      const approval = getMcprcServerStatus(name)
                      if (approval === 'pending') return 'pending'
                      if (approval === 'rejected') return 'rejected'
                      return 'disconnected'
                    })()
                  : 'disconnected'

          const summary = (() => {
            switch (server.type) {
              case 'http':
                return `${server.url} (http)`
              case 'sse':
                return `${server.url} (sse)`
              case 'sse-ide':
                return `${server.url} (sse-ide)`
              case 'ws':
                return `${server.url} (ws)`
              case 'ws-ide':
                return `${server.url} (ws-ide)`
              case 'stdio':
              default:
                return `${server.command} ${(server.args || []).join(' ')} (stdio)`
            }
          })()

          console.log(`${name}: ${summary} [${status}]`)
        }

        process.exit(0)
      } catch (error) {
        console.error((error as Error).message)
        process.exit(1)
      }
    })

  mcp
    .command('add-json <name> <json>')
    .description('Add an MCP server with a JSON string')
    .option(
      '-s, --scope <scope>',
      'Configuration scope (project, global, or mcprc)',
      'project',
    )
    .action(async (name, jsonStr, options) => {
      try {
        const scope = ensureConfigScope(options.scope)

        // Parse JSON string
        let serverConfig
        try {
          serverConfig = JSON.parse(jsonStr)
        } catch (e) {
          console.error('Error: Invalid JSON string')
          process.exit(1)
        }

        // Validate the server config
        if (
          !serverConfig.type ||
          !['stdio', 'sse', 'http', 'ws', 'sse-ide', 'ws-ide'].includes(
            serverConfig.type,
          )
        ) {
          console.error(
            'Error: Server type must be one of: "stdio", "http", "sse", "ws", "sse-ide", "ws-ide"',
          )
          process.exit(1)
        }

        if (
          ['sse', 'http', 'ws', 'sse-ide', 'ws-ide'].includes(
            serverConfig.type,
          ) &&
          !serverConfig.url
        ) {
          console.error('Error: URL-based MCP servers must have a URL')
          process.exit(1)
        }

        if (serverConfig.type === 'stdio' && !serverConfig.command) {
          console.error('Error: stdio server must have a command')
          process.exit(1)
        }

        if (
          ['sse-ide', 'ws-ide'].includes(serverConfig.type) &&
          !serverConfig.ideName
        ) {
          console.error('Error: IDE MCP servers must include ideName')
          process.exit(1)
        }

        // Add server with the provided config
        
        addMcpServer(name, serverConfig, scope)

        switch (serverConfig.type) {
          case 'http':
            console.log(
              `Added HTTP MCP server ${name} with URL ${serverConfig.url} to ${scope} config`,
            )
            break
          case 'sse':
            console.log(
              `Added SSE MCP server ${name} with URL ${serverConfig.url} to ${scope} config`,
            )
            break
          case 'sse-ide':
            console.log(
              `Added SSE-IDE MCP server ${name} with URL ${serverConfig.url} to ${scope} config`,
            )
            break
          case 'ws':
            console.log(
              `Added WS MCP server ${name} with URL ${serverConfig.url} to ${scope} config`,
            )
            break
          case 'ws-ide':
            console.log(
              `Added WS-IDE MCP server ${name} with URL ${serverConfig.url} to ${scope} config`,
            )
            break
          case 'stdio':
          default:
            console.log(
              `Added stdio MCP server ${name} with command: ${serverConfig.command} ${(
                serverConfig.args || []
              ).join(' ')} to ${scope} config`,
            )
            break
        }

        process.exit(0)
      } catch (error) {
        console.error((error as Error).message)
        process.exit(1)
      }
    })

  mcp
    .command('get <name>')
    .description('Get details about an MCP server')
    .action(async (name: string) => {
      try {
        const server = getMcpServer(name)
        if (!server) {
          console.error(`No MCP server found with name: ${name}`)
          process.exit(1)
        }

        const projectFileServers = getProjectMcpServerDefinitions()
        const clients = await getClients()
        const client = clients.find(c => c.name === name)

        const status =
          client?.type === 'connected'
            ? 'connected'
            : client?.type === 'failed'
              ? 'failed'
              : projectFileServers.servers[name]
                ? (() => {
                    const approval = getMcprcServerStatus(name)
                    if (approval === 'pending') return 'pending'
                    if (approval === 'rejected') return 'rejected'
                    return 'disconnected'
                  })()
                : 'disconnected'

        const scopeDisplay = (() => {
          switch (server.scope) {
            case 'project':
              return 'local'
            case 'global':
              return 'user'
            case 'mcpjson':
              return 'project'
            case 'mcprc':
              return 'mcprc'
            default:
              return server.scope
          }
        })()

        console.log(`${name}:`)
        console.log(`  Status: ${status}`)
        console.log(`  Scope: ${scopeDisplay}`)

        const printHeaders = (headers: Record<string, string> | undefined) => {
          if (!headers || Object.keys(headers).length === 0) return
          console.log('  Headers:')
          for (const [key, value] of Object.entries(headers)) {
            console.log(`    ${key}: ${value}`)
          }
        }

        switch (server.type) {
          case 'http':
            console.log(`  Type: http`)
            console.log(`  URL: ${server.url}`)
            printHeaders(server.headers)
            break
          case 'sse':
            console.log(`  Type: sse`)
            console.log(`  URL: ${server.url}`)
            printHeaders(server.headers)
            break
          case 'sse-ide':
            console.log(`  Type: sse-ide`)
            console.log(`  URL: ${server.url}`)
            console.log(`  IDE: ${server.ideName}`)
            printHeaders(server.headers)
            break
          case 'ws':
            console.log(`  Type: ws`)
            console.log(`  URL: ${server.url}`)
            break
          case 'ws-ide':
            console.log(`  Type: ws-ide`)
            console.log(`  URL: ${server.url}`)
            console.log(`  IDE: ${server.ideName}`)
            break
          case 'stdio':
          default:
            console.log(`  Type: stdio`)
            console.log(`  Command: ${server.command}`)
            console.log(`  Args: ${(server.args || []).join(' ')}`)
            if (server.env) {
              console.log('  Environment:')
              for (const [key, value] of Object.entries(server.env)) {
                console.log(`    ${key}=${value}`)
              }
            }
            break
        }
        process.exit(0)
      } catch (error) {
        console.error((error as Error).message)
        process.exit(1)
      }
    })

  // Import servers from Claude Desktop
  mcp
    .command('add-from-claude-desktop')
    .description(
      'Import MCP servers from Claude Desktop (Mac, Windows and WSL)',
    )
    .option(
      '-s, --scope <scope>',
      'Configuration scope (project, global, or mcprc)',
      'project',
    )
    .action(async options => {
      try {
        const scope = ensureConfigScope(options.scope)
        const platform = process.platform

        // Import fs and path modules
        const { existsSync, readFileSync } = await import('fs')
        const { join } = await import('path')
        const { exec } = await import('child_process')

        // Determine if running in WSL
        const isWSL =
          platform === 'linux' &&
          existsSync('/proc/version') &&
          readFileSync('/proc/version', 'utf-8')
            .toLowerCase()
            .includes('microsoft')

        if (platform !== 'darwin' && platform !== 'win32' && !isWSL) {
          console.error(
            'Error: This command is only supported on macOS, Windows, and WSL',
          )
          process.exit(1)
        }

        // Get Claude Desktop config path
        let configPath
        if (platform === 'darwin') {
          configPath = join(
            process.env.HOME || '~',
            'Library/Application Support/Claude/claude_desktop_config.json',
          )
        } else if (platform === 'win32') {
          configPath = join(
            process.env.APPDATA || '',
            'Claude/claude_desktop_config.json',
          )
        } else if (isWSL) {
          // Get Windows username
          const whoamiCommand = await new Promise<string>((resolve, reject) => {
            exec(
              'powershell.exe -Command "whoami"',
              (err: Error, stdout: string) => {
                if (err) reject(err)
                else resolve(stdout.trim().split('\\').pop() || '')
              },
            )
          })

          configPath = `/mnt/c/Users/${whoamiCommand}/AppData/Roaming/Claude/claude_desktop_config.json`
        }

        // Check if config file exists
        if (!existsSync(configPath)) {
          console.error(
            `Error: Claude Desktop config file not found at ${configPath}`,
          )
          process.exit(1)
        }

        // Read config file
        let config
        try {
          const configContent = readFileSync(configPath, 'utf-8')
          config = JSON.parse(configContent)
        } catch (err) {
          console.error(`Error reading config file: ${err}`)
          process.exit(1)
        }

        // Extract MCP servers
        const mcpServers = config.mcpServers || {}
        const serverNames = Object.keys(mcpServers)
        const numServers = serverNames.length

        if (numServers === 0) {
          console.log('No MCP servers found in Claude Desktop config')
          process.exit(0)
        }

        // Create server information for display
        const serversInfo = serverNames.map(name => {
          const server = mcpServers[name]
          let description = ''

          switch (server.type) {
            case 'http':
              description = `HTTP: ${server.url}`
              break
            case 'sse':
              description = `SSE: ${server.url}`
              break
            case 'sse-ide':
              description = `SSE-IDE (${server.ideName}): ${server.url}`
              break
            case 'ws':
              description = `WS: ${server.url}`
              break
            case 'ws-ide':
              description = `WS-IDE (${server.ideName}): ${server.url}`
              break
            case 'stdio':
            default:
              description = `stdio: ${server.command} ${(server.args || []).join(' ')}`
              break
          }

          return { name, description, server }
        })

        // First import all required modules outside the component
        // Import modules separately to avoid any issues
        const ink = await import('ink')
        const reactModule = await import('react')
        const inkjsui = await import('@inkjs/ui')
        const utilsTheme = await import('@utils/theme')

        const { render } = ink
        const React = reactModule // React is already the default export when imported this way
        const { MultiSelect } = inkjsui
        const { Box, Text } = ink
        const { getTheme } = utilsTheme

        // Use Ink to render a nice UI for selection
        await new Promise<void>(resolve => {
          // Create a component for the server selection
          function ClaudeDesktopImport() {
            const { useState } = reactModule
            const [isFinished, setIsFinished] = useState(false)
            const [importResults, setImportResults] = useState([] as { name: string; success: boolean }[])
            const [isImporting, setIsImporting] = useState(false)
            const theme = getTheme()

            // Function to import selected servers
            const importServers = async (selectedServers: string[]) => {
              setIsImporting(true)
              const results = []

              for (const name of selectedServers) {
                try {
                  const server = mcpServers[name]

                  // Check if server already exists
                  const existingServer = getMcpServer(name)
                  if (existingServer) {
                    // Skip duplicates - we'll handle them in the confirmation step
                    continue
                  }

                  addMcpServer(name, server as McpServerConfig, scope)
                  results.push({ name, success: true })
                } catch (err) {
                  results.push({ name, success: false })
                }
              }

              setImportResults(results)
              setIsImporting(false)
              setIsFinished(true)

              // Give time to show results
              setTimeout(() => {
                resolve()
              }, 1000)
            }

            // Handle confirmation of selections
            const handleConfirm = async (selectedServers: string[]) => {
              // Check for existing servers and confirm overwrite
              const existingServers = selectedServers.filter(name =>
                getMcpServer(name),
              )

              if (existingServers.length > 0) {
                // We'll just handle it directly since we have a simple UI
                const results = []

                // Process non-existing servers first
                const newServers = selectedServers.filter(
                  name => !getMcpServer(name),
                )
                for (const name of newServers) {
                  try {
                    const server = mcpServers[name]
                    addMcpServer(name, server as McpServerConfig, scope)
                    results.push({ name, success: true })
                  } catch (err) {
                    results.push({ name, success: false })
                  }
                }

                // Now handle existing servers by prompting for each one
                for (const name of existingServers) {
                  try {
                    const server = mcpServers[name]
                    // Overwrite existing server - in a real interactive UI you'd prompt here
                    addMcpServer(name, server as McpServerConfig, scope)
                    results.push({ name, success: true })
                  } catch (err) {
                    results.push({ name, success: false })
                  }
                }

                setImportResults(results)
                setIsImporting(false)
                setIsFinished(true)

                // Give time to show results before resolving
                setTimeout(() => {
                  resolve()
                }, 1000)
              } else {
                // No existing servers, proceed with import
                await importServers(selectedServers)
              }
            }

            return (
              <Box flexDirection="column" padding={1}>
                <Box
                  flexDirection="column"
                  borderStyle="round"
                borderColor={theme.kode}
                  padding={1}
                  width={'100%'}
                >
                  <Text bold color={theme.kode}>
                    Import MCP Servers from Claude Desktop
                  </Text>

                  <Box marginY={1}>
                    <Text>
                      Found {numServers} MCP servers in Claude Desktop.
                    </Text>
                  </Box>

                  <Text>Please select the servers you want to import:</Text>

                  <Box marginTop={1}>
                    <MultiSelect
                      options={serverNames.map(name => ({
                        label: name,
                        value: name,
                      }))}
                      defaultValue={serverNames}
                      onSubmit={handleConfirm}
                    />
                  </Box>
                </Box>

                <Box marginTop={0} marginLeft={3}>
                  <Text dimColor>
                    Space to select · Enter to confirm · Esc to cancel
                  </Text>
                </Box>

                {isFinished && (
                  <Box marginTop={1}>
                    <Text color={theme.success}>
                      Successfully imported{' '}
                      {importResults.filter(r => r.success).length} MCP server
                      to local config.
                    </Text>
                  </Box>
                )}
              </Box>
            )
          }

          // Render the component
          const { unmount } = render(<ClaudeDesktopImport />)

          // Clean up when done
          setTimeout(() => {
            unmount()
            resolve()
          }, 30000) // Timeout after 30 seconds as a fallback
        })

        process.exit(0)
      } catch (error) {
        console.error(`Error: ${(error as Error).message}`)
        process.exit(1)
      }
    })

  // Function to reset MCP server choices
  const resetMcpChoices = () => {
    const config = getCurrentProjectConfig()
    saveCurrentProjectConfig({
      ...config,
      approvedMcprcServers: [],
      rejectedMcprcServers: [],
    })
    console.log(
      'All project-file MCP server approvals/rejections (.mcp.json/.mcprc) have been reset.',
    )
    console.log(
      `You will be prompted for approval next time you start ${PRODUCT_NAME}.`,
    )
    process.exit(0)
  }

  // New command name to match Kode
  mcp
    .command('reset-project-choices')
    .description(
      'Reset approvals for project-file MCP servers (.mcp.json/.mcprc) in this project',
    )
    .action(() => {
      
      resetMcpChoices()
    })

  // Keep old command for backward compatibility.
  mcp
    .command('reset-mcprc-choices')
    .description('Reset approvals for project-file MCP servers (.mcp.json/.mcprc) in this project')
    .action(() => {
      
      resetMcpChoices()
    })

  // Doctor command - simple installation health check (no auto-update)
  program
    .command('doctor')
    .description(`Check the health of your ${PRODUCT_NAME} installation`)
    .action(async () => {
      

      await new Promise<void>(resolve => {
        ;(async () => {
          const { render } = await import('ink')
          render(<Doctor onDone={() => resolve()} doctorMode={true} />)
        })()
      })
      process.exit(0)
    })

  // ant-only commands

  // Update
  program
    .command('update')
    .description('Show manual upgrade commands (no auto-install)')
    .action(async () => {
      
      console.log(`Current version: ${MACRO.VERSION}`)
      console.log('Checking for updates...')

      const { getLatestVersion, getUpdateCommandSuggestions } = await import(
        '@utils/autoUpdater'
      )
      const latestVersion = await getLatestVersion()

      if (!latestVersion) {
        console.error('Failed to check for updates')
        process.exit(1)
      }

      if (latestVersion === MACRO.VERSION) {
        console.log(`${PRODUCT_NAME} is up to date`)
        process.exit(0)
      }

      console.log(`New version available: ${latestVersion}`)
      const cmds = await getUpdateCommandSuggestions()
      console.log('\nRun one of the following commands to update:')
      for (const c of cmds) console.log(`  ${c}`)
      if (process.platform !== 'win32') {
        console.log('\nNote: you may need to prefix with "sudo" on macOS/Linux.')
      }
      process.exit(0)
    })

  // Logs
  program
    .command('log')
    .description('Manage conversation logs.')
    .argument(
      '[number]',
      'A number (0, 1, 2, etc.) to display a specific log',
      parseInt,
    )
    .option('-c, --cwd <cwd>', 'The current working directory', String, cwd())
    .action(async (number, { cwd }) => {
      await setup(cwd, false)
      
      const context: { unmount?: () => void } = {}
      ;(async () => {
        const { render } = await import('ink')
        const { unmount } = render(
          <LogList context={context} type="messages" logNumber={number} />,
          renderContextWithExitOnCtrlC,
        )
        context.unmount = unmount
      })()
    })

  // Resume
  program
    .command('resume')
    .description(
      'Resume a previous conversation. Optionally provide a number (0, 1, 2, etc.) or file path to resume a specific conversation.',
    )
    .argument(
      '[identifier]',
      'A number (0, 1, 2, etc.) or file path to resume a specific conversation',
    )
    .option('-c, --cwd <cwd>', 'The current working directory', String, cwd())
    .option('-e, --enable-architect', 'Enable the Architect tool', () => true)
    .option('-v, --verbose', 'Do not truncate message output', () => true)
    .option(
      '--safe',
      'Enable strict permission checking mode (default is permissive)',
      () => true,
    )
    .action(async (identifier, { cwd, enableArchitect, safe, verbose }) => {
      await setup(cwd, safe)
      assertMinVersion()

      const [{ getTools }, { getCommands }] = await Promise.all([
        import('@tools'),
        import('@commands'),
      ])
      const [tools, commands, logs, mcpClients] = await Promise.all([
        getTools(
          enableArchitect ?? getCurrentProjectConfig().enableArchitectTool,
        ),
        getCommands(),
        loadLogList(CACHE_PATHS.messages()),
        getClients(),
      ])

      // If a specific conversation is requested, load and resume it directly
      if (identifier !== undefined) {
        // Check if identifier is a number or a file path
        const number = Math.abs(parseInt(identifier))
        const isNumber = !isNaN(number)
        let messages, date, forkNumber
        try {
          if (isNumber) {
            
            const log = logs[number]
            if (!log) {
              console.error('No conversation found at index', number)
              process.exit(1)
            }
            messages = await loadMessagesFromLog(log.fullPath, tools)
            ;({ date, forkNumber } = log)
          } else {
            // Handle file path case
            
            if (!existsSync(identifier)) {
              console.error('File does not exist:', identifier)
              process.exit(1)
            }
            messages = await loadMessagesFromLog(identifier, tools)
            const pathSegments = identifier.split('/')
            const filename = pathSegments[pathSegments.length - 1] ?? 'unknown'
            ;({ date, forkNumber } = parseLogFilename(filename))
          }
          const fork = getNextAvailableLogForkNumber(date, forkNumber ?? 1, 0)
          const isDefaultModel = await isDefaultSlowAndCapableModel()
          {
            const { render } = await import('ink')
            const { REPL } = await import('@screens/REPL')
            render(
              <REPL
              initialPrompt=""
              messageLogName={date}
              initialForkNumber={fork}
              shouldShowPromptInput={true}
              verbose={verbose}
              commands={commands}
              tools={tools}
              safeMode={safe}
              initialMessages={messages}
              mcpClients={mcpClients}
              isDefaultModel={isDefaultModel}
            />,
            { exitOnCtrlC: false },
            )
          }
        } catch (error) {
          logError(`Failed to load conversation: ${error}`)
          process.exit(1)
        }
      } else {
        // Show the conversation selector UI
        const context: { unmount?: () => void } = {}
        ;(async () => {
          const { render } = await import('ink')
          const { unmount } = render(
            <ResumeConversation
              context={context}
              commands={commands}
              logs={logs}
              tools={tools}
              verbose={verbose}
            />,
            renderContextWithExitOnCtrlC,
          )
          context.unmount = unmount
        })()
      }
    })

  // Error logs
  program
    .command('error')
    .description(
      'View error logs. Optionally provide a number (0, -1, -2, etc.) to display a specific log.',
    )
    .argument(
      '[number]',
      'A number (0, 1, 2, etc.) to display a specific log',
      parseInt,
    )
    .option('-c, --cwd <cwd>', 'The current working directory', String, cwd())
    .action(async (number, { cwd }) => {
      await setup(cwd, false)
      
      const context: { unmount?: () => void } = {}
      ;(async () => {
        const { render } = await import('ink')
        const { unmount } = render(
          <LogList context={context} type="errors" logNumber={number} />,
          renderContextWithExitOnCtrlC,
        )
        context.unmount = unmount
      })()
    })

  // legacy context (TODO: deprecate)
  const context = program
    .command('context')
    .description(
      `Set static context (eg. ${PRODUCT_COMMAND} context add-file ./src/*.py)`,
    )

  context
    .command('get <key>')
    .option('-c, --cwd <cwd>', 'The current working directory', String, cwd())
    .description('Get a value from context')
    .action(async (key, { cwd }) => {
      await setup(cwd, false)
      
      const context = omitKeys(
        await getContext(),
        'codeStyle',
        'directoryStructure',
      )
      console.log(context[key])
      process.exit(0)
    })

  context
    .command('set <key> <value>')
    .description('Set a value in context')
    .option('-c, --cwd <cwd>', 'The current working directory', String, cwd())
    .action(async (key, value, { cwd }) => {
      await setup(cwd, false)
      
      setContext(key, value)
      console.log(`Set context.${key} to "${value}"`)
      process.exit(0)
    })

  context
    .command('list')
    .description('List all context values')
    .option('-c, --cwd <cwd>', 'The current working directory', String, cwd())
    .action(async ({ cwd }) => {
      await setup(cwd, false)
      
      const context = omitKeys(
        await getContext(),
        'codeStyle',
        'directoryStructure',
        'gitStatus',
      )
      console.log(JSON.stringify(context, null, 2))
      process.exit(0)
    })

  context
    .command('remove <key>')
    .description('Remove a value from context')
    .option('-c, --cwd <cwd>', 'The current working directory', String, cwd())
    .action(async (key, { cwd }) => {
      await setup(cwd, false)
      
      removeContext(key)
      console.log(`Removed context.${key}`)
      process.exit(0)
    })

  await program.parseAsync(process.argv)
  return program
}

// TODO: stream?
async function stdin() {
  if (process.stdin.isTTY) {
    return ''
  }

  let data = ''
  for await (const chunk of process.stdin) data += chunk
  return data
}

process.on('exit', () => {
  resetCursor()
  BunShell.getInstance().close()
})

function gracefulExit(code = 0) {
  try { resetCursor() } catch {}
  try { BunShell.getInstance().close() } catch {}
  process.exit(code)
}

process.on('SIGINT', () => gracefulExit(0))
process.on('SIGTERM', () => gracefulExit(0))
// Windows CTRL+BREAK
process.on('SIGBREAK', () => gracefulExit(0))
process.on('unhandledRejection', err => {
  console.error('Unhandled rejection:', err)
  gracefulExit(1)
})
process.on('uncaughtException', err => {
  console.error('Uncaught exception:', err)
  gracefulExit(1)
})

function resetCursor() {
  const terminal = process.stderr.isTTY
    ? process.stderr
    : process.stdout.isTTY
      ? process.stdout
      : undefined
  terminal?.write(`\u001B[?25h${cursorShow}`)
}

main()
