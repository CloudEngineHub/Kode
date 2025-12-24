#!/usr/bin/env bun
import '@utils/sanitizeAnthropicEnv'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { initSentry } from '@services/sentry'
import { PRODUCT_COMMAND, PRODUCT_NAME } from '@constants/product'
import {
  ensurePackagedRuntimeEnv,
  ensureYogaWasmPath,
} from './cli/bootstrapEnv'
import { runPrintMode } from './cli/printMode'
import { setup } from './cli/setup'
import { showSetupScreens } from './cli/setupScreens'
initSentry() // Initialize Sentry as early as possible
ensurePackagedRuntimeEnv()
ensureYogaWasmPath(import.meta.url)

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
import { getContext, setContext, removeContext } from '@context'
import { Command } from '@commander-js/extra-typings'
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
import { Doctor } from '@screens/Doctor'
import { McpServerConfig } from '@utils/config'
import { isDefaultSlowAndCapableModel } from '@utils/model'
import {
  applyModelConfigYamlImport,
  formatModelConfigYamlForSharing,
} from '@utils/modelConfigYaml'
import { LogList } from '@screens/LogList'
import { ResumeConversation } from '@screens/ResumeConversation'
import { startMCPServer } from './mcp'
import { env } from '@utils/env'
import { getCwd } from '@utils/state'
import { getNextAvailableLogForkNumber, loadLogList } from '@utils/log'
import { loadMessagesFromLog } from '@utils/conversationRecovery'
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
  getClientsForCliMcpConfig,
  getMcprcServerStatus,
  ensureConfigScope,
} from '@services/mcpClient'
import {
  looksLikeMcpUrl,
  normalizeMcpScopeForCli,
  normalizeMcpTransport,
  parseMcpHeaders,
} from '@services/mcpCliUtils'

import { cursorShow } from 'ansi-escapes'
import { assertMinVersion } from '@utils/autoUpdater'
import { CACHE_PATHS } from '@utils/log'
// import { checkAndNotifyUpdate } from '@utils/autoUpdater'
import { BunShell } from '@utils/BunShell'
import { showInvalidConfigDialog } from '@components/InvalidConfigDialog'
import { ConfigParseError } from '@utils/errors'
import { MACRO } from '@constants/macros'

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
      (arg, idx, all) =>
        arg === '--input-format' && all[idx + 1] === 'stream-json',
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

  program
    .name(PRODUCT_COMMAND)
    .description(
      `${PRODUCT_NAME} - starts an interactive session by default, use -p/--print for non-interactive output`,
    )
    .argument('[prompt]', 'Your prompt', String)
    .option('--cwd <cwd>', 'The current working directory', String, cwd())
    .option(
      '-d, --debug [filter]',
      'Enable debug mode with optional category filtering (e.g., "api,hooks" or "!statsig,!file")',
    )
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
      '--json-schema <schema>',
      'JSON Schema for structured output validation. Example: {"type":"object","properties":{"name":{"type":"string"}},"required":["name"]}',
      String,
    )
    .option(
      '--input-format <format>',
      'Input format (only works with --print): "text" (default) or "stream-json"',
      String,
      'text',
    )
    .option(
      '--mcp-debug',
      '[DEPRECATED. Use --debug instead] Enable MCP debug mode (shows MCP server errors)',
      () => true,
    )
    .option(
      '--dangerously-skip-permissions',
      'Bypass all permission checks. Recommended only for sandboxes with no internet access.',
      () => true,
    )
    .option(
      '--allow-dangerously-skip-permissions',
      'Enable bypassing all permission checks as an option, without it being enabled by default. Recommended only for sandboxes with no internet access.',
      () => true,
    )
    .option(
      '--max-budget-usd <amount>',
      'Maximum dollar amount to spend on API calls (only works with --print)',
      String,
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
      '--allowedTools, --allowed-tools <tools...>',
      'Comma or space-separated list of tool names to allow (e.g. "Bash(git:*) Edit")',
    )
    .option(
      '--tools <tools...>',
      'Specify the list of available tools from the built-in set. Use "" to disable all tools, "default" to use all tools, or specify tool names (e.g. "Bash,Edit,Read"). Only works with --print mode.',
    )
    .option(
      '--disallowedTools, --disallowed-tools <tools...>',
      'Comma or space-separated list of tool names to deny (e.g. "Bash(git:*) Edit")',
    )
    .option(
      '--mcp-config <configs...>',
      'Load MCP servers from JSON files or strings (space-separated)',
    )
    .option('--system-prompt <prompt>', 'System prompt to use for the session')
    .option(
      '--append-system-prompt <prompt>',
      'Append a system prompt to the default system prompt',
    )
    .option(
      '--permission-mode <mode>',
      'Permission mode to use for the session (choices: "acceptEdits", "bypassPermissions", "default", "delegate", "dontAsk", "plan")',
      String,
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
      '--disable-slash-commands',
      'Disable slash commands (treat /... as plain text)',
      () => true,
    )
    .option(
      '--plugin-dir <paths...>',
      'Load plugins from directories for this session only (repeatable)',
      (value, previous: string[] | undefined) => {
        const prev = Array.isArray(previous) ? previous : []
        const next = Array.isArray(value) ? value : [value]
        return [...prev, ...next].filter(Boolean)
      },
      [],
    )
    .option(
      '--model <model>',
      "Model for the current session. Provide an alias for the latest model (e.g. 'sonnet' or 'opus') or a model's full name.",
      String,
    )
    .option(
      '--agent <agent>',
      "Agent for the current session. Overrides the 'agent' setting.",
      String,
    )
    .option(
      '--betas <betas...>',
      'Beta headers to include in API requests (API key users only)',
    )
    .option(
      '--fallback-model <model>',
      'Enable automatic fallback to specified model when default model is overloaded (only works with --print)',
      String,
    )
    .option(
      '--settings <file-or-json>',
      'Path to a settings JSON file or a JSON string to load additional settings from',
      String,
    )
    .option(
      '--add-dir <directories...>',
      'Additional directories to allow tool access to',
    )
    .option(
      '--ide',
      'Automatically connect to IDE on startup if exactly one valid IDE is available',
      () => true,
    )
    .option(
      '--strict-mcp-config',
      'Only use MCP servers from --mcp-config, ignoring all other MCP configurations',
      () => true,
    )
    .option(
      '--agents <json>',
      `JSON object defining custom agents (e.g. '{"reviewer": {"description": "Reviews code", "prompt": "You are a code reviewer"}}')`,
      String,
    )
    .option(
      '--setting-sources <sources>',
      'Comma-separated list of setting sources to load (user, project, local).',
      String,
    )
    .option(
      '-r, --resume [value]',
      'Resume a conversation by session ID or session name (omit value to open selector)',
    )
    .option(
      '-c, --continue',
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
          jsonSchema,
          inputFormat,
          mcpDebug,
          dangerouslySkipPermissions,
          allowDangerouslySkipPermissions,
          maxBudgetUsd,
          includePartialMessages,
          replayUserMessages,
          allowedTools,
          tools: cliTools,
          disallowedTools,
          mcpConfig,
          systemPrompt: systemPromptOverride,
          appendSystemPrompt,
          permissionMode,
          permissionPromptTool,
          safe,
          disableSlashCommands,
          pluginDir,
          model,
          addDir,
          strictMcpConfig,
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

        {
          const requested =
            Array.isArray(pluginDir) && pluginDir.length > 0 ? pluginDir : []
          const { listEnabledInstalledPluginPackRoots } =
            await import('@services/skillMarketplace')
          const installed = listEnabledInstalledPluginPackRoots()

          const all = [...installed, ...requested].filter(Boolean)
          const deduped = Array.from(new Set(all))

          if (deduped.length > 0) {
            const { configureSessionPlugins } =
              await import('@services/pluginRuntime')
            const { errors } = await configureSessionPlugins({
              pluginDirs: deduped,
            })
            for (const err of errors) {
              console.warn(err)
            }
          }
        }

        const [{ ask }, { getTools }, { getCommands }] = await Promise.all([
          import('@utils/ask'),
          import('@tools'),
          import('@commands'),
        ])
        const commands = await getCommands()

        const mcpClientsPromise =
          (Array.isArray(mcpConfig) && mcpConfig.length > 0) ||
          strictMcpConfig === true
            ? getClientsForCliMcpConfig({
                mcpConfig: Array.isArray(mcpConfig) ? mcpConfig : [],
                strictMcpConfig: strictMcpConfig === true,
                projectDir: cwd,
              })
            : getClients()

        const [allTools, mcpClients] = await Promise.all([
          getTools(
            enableArchitect ?? getCurrentProjectConfig().enableArchitectTool,
          ),
          mcpClientsPromise,
        ])
        const tools =
          disableSlashCommands === true
            ? allTools.filter(t => t.name !== 'SlashCommand')
            : allTools
        const inputPrompt = [prompt, stdinContent].filter(Boolean).join('\n')

        const {
          loadKodeAgentSessionMessages,
          findMostRecentKodeAgentSessionId,
        } = await import('@utils/protocol/kodeAgentSessionLoad')
        const { listKodeAgentSessions, resolveResumeSessionIdentifier } =
          await import('@utils/protocol/kodeAgentSessionResume')
        const { isUuid } = await import('@utils/uuid')
        const { setKodeAgentSessionId, getKodeAgentSessionId } =
          await import('@utils/protocol/kodeAgentSessionId')
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
        let needsResumeSelector = false

        if (wantsContinue) {
          const latest = findMostRecentKodeAgentSessionId(cwd)
          if (!latest) {
            console.error('No conversation found to continue')
            process.exit(1)
          }
          initialMessages = loadKodeAgentSessionMessages({
            cwd,
            sessionId: latest,
          })
          resumedFromSessionId = latest
        } else if (wantsResume) {
          if (resume === true) {
            needsResumeSelector = true
          } else {
            const identifier = String(resume)
            const resolved = resolveResumeSessionIdentifier({ cwd, identifier })
            if (resolved.kind === 'ok') {
              initialMessages = loadKodeAgentSessionMessages({
                cwd,
                sessionId: resolved.sessionId,
              })
              resumedFromSessionId = resolved.sessionId
            } else if (resolved.kind === 'different_directory') {
              console.error(
                resolved.otherCwd
                  ? `Error: That session belongs to a different directory: ${resolved.otherCwd}`
                  : `Error: That session belongs to a different directory.`,
              )
              process.exit(1)
            } else if (resolved.kind === 'ambiguous') {
              console.error(
                `Error: Multiple sessions match "${identifier}": ${resolved.matchingSessionIds.join(
                  ', ',
                )}`,
              )
              process.exit(1)
            } else {
              console.error(
                `No conversation found with session ID or name: ${identifier}`,
              )
              process.exit(1)
            }
          }
        }

        if (needsResumeSelector && print) {
          console.error(
            'Error: --resume without a value requires interactive mode (no --print).',
          )
          process.exit(1)
        }

        if (!needsResumeSelector) {
          const effectiveSessionId = (() => {
            if (resumedFromSessionId) {
              if (wantsFork) return sessionId ? String(sessionId) : randomUUID()
              return resumedFromSessionId
            }
            if (sessionId) return String(sessionId)
            return getKodeAgentSessionId()
          })()

          setKodeAgentSessionId(effectiveSessionId)
        }

        if (print) {
          await runPrintMode({
            prompt,
            stdinContent,
            inputPrompt,
            cwd,
            safe,
            verbose,
            outputFormat,
            inputFormat,
            jsonSchema,
            permissionPromptTool,
            replayUserMessages,
            cliTools,
            tools,
            commands,
            ask,
            initialMessages,
            sessionPersistence,
            systemPromptOverride,
            appendSystemPrompt,
            disableSlashCommands,
            allowedTools,
            disallowedTools,
            addDir,
            permissionMode,
            dangerouslySkipPermissions,
            allowDangerouslySkipPermissions,
            model,
            mcpClients,
          })
          return
        } else {
          if (sessionPersistence === false) {
            console.error(
              'Error: --no-session-persistence only works with --print',
            )
            process.exit(1)
          }

          // Prefetch update info before first render to place banner at top
          const updateInfo = await (async () => {
            try {
              const [
                { getLatestVersion, getUpdateCommandSuggestions },
                semverMod,
              ] = await Promise.all([
                import('@utils/autoUpdater'),
                import('semver'),
              ])
              const semver: any = (semverMod as any)?.default ?? semverMod
              const gt = semver?.gt
              if (typeof gt !== 'function')
                return {
                  version: null as string | null,
                  commands: null as string[] | null,
                }

              const latest = await getLatestVersion()
              if (latest && gt(latest, MACRO.VERSION)) {
                const cmds = await getUpdateCommandSuggestions()
                return { version: latest as string, commands: cmds as string[] }
              }
            } catch {}
            return {
              version: null as string | null,
              commands: null as string[] | null,
            }
          })()

          if (needsResumeSelector) {
            const sessions = listKodeAgentSessions({ cwd })
            if (sessions.length === 0) {
              console.error('No conversation found to resume')
              process.exit(1)
            }

            const context: { unmount?: () => void } = {}
            ;(async () => {
              const { render } = await import('ink')
              const { unmount } = render(
                <ResumeConversation
                  cwd={cwd}
                  context={context}
                  commands={commands}
                  sessions={sessions}
                  tools={tools}
                  verbose={verbose}
                  safeMode={safe}
                  debug={Boolean(debug)}
                  disableSlashCommands={disableSlashCommands === true}
                  mcpClients={mcpClients}
                  initialPrompt={inputPrompt}
                  forkSession={wantsFork}
                  forkSessionId={sessionId ? String(sessionId) : null}
                  initialUpdateVersion={updateInfo.version}
                  initialUpdateCommands={updateInfo.commands}
                />,
                renderContextWithExitOnCtrlC,
              )
              context.unmount = unmount
            })()
            return
          }

          const isDefaultModel = await isDefaultSlowAndCapableModel()

          {
            const { render } = await import('ink')
            const { REPL } = await import('@screens/REPL')
            render(
              <REPL
                commands={commands}
                debug={Boolean(debug)}
                disableSlashCommands={disableSlashCommands === true}
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
    .option('--cwd <cwd>', 'The current working directory', String, cwd())
    .option('-g, --global', 'Use global config')
    .action(async (key, { cwd, global }) => {
      await setup(cwd, false)
      console.log(getConfigForCLI(key, global ?? false))
      process.exit(0)
    })

  config
    .command('set <key> <value>')
    .description('Set a config value')
    .option('--cwd <cwd>', 'The current working directory', String, cwd())
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
    .option('--cwd <cwd>', 'The current working directory', String, cwd())
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
    .option('--cwd <cwd>', 'The current working directory', String, cwd())
    .option('-g, --global', 'Use global config', false)
    .action(async ({ cwd, global }) => {
      await setup(cwd, false)
      console.log(
        JSON.stringify(
          global ? listConfigForCLI(true) : listConfigForCLI(false),
          null,
          2,
        ),
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
    .option('--cwd <cwd>', 'The current working directory', String, cwd())
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
    .option('--cwd <cwd>', 'The current working directory', String, cwd())
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

  // Plugins & marketplaces (legacy-compatible)

  const registerMarketplaceCommands = (marketplaceCmd: Command) => {
    marketplaceCmd
      .command('add <source>')
      .description('Add a marketplace from a URL, path, or GitHub repo')
      .action(async (source: string) => {
        try {
          const { addMarketplace } = await import('@services/skillMarketplace')
          console.log('Adding marketplace...')
          const { name } = await addMarketplace(source)
          console.log(`Successfully added marketplace: ${name}`)
          process.exit(0)
        } catch (error) {
          console.error((error as Error).message)
          process.exit(1)
        }
      })

    marketplaceCmd
      .command('list')
      .description('List all configured marketplaces')
      .option('--json', 'Output as JSON')
      .action(async (options: { json?: boolean }) => {
        try {
          const { listMarketplaces } =
            await import('@services/skillMarketplace')
          const marketplaces = listMarketplaces()

          if (options.json) {
            console.log(JSON.stringify(marketplaces, null, 2))
            process.exit(0)
          }

          const names = Object.keys(marketplaces).sort()
          if (names.length === 0) {
            console.log('No marketplaces configured')
            process.exit(0)
          }

          console.log('Configured marketplaces:\n')
          for (const name of names) {
            const entry = marketplaces[name] as any
            console.log(`  - ${name}`)
            const src = entry?.source
            if (src?.source === 'github') {
              console.log(`    Source: GitHub (${src.repo})`)
            } else if (src?.source === 'git') {
              console.log(`    Source: Git (${src.url})`)
            } else if (src?.source === 'url') {
              console.log(`    Source: URL (${src.url})`)
            } else if (src?.source === 'directory') {
              console.log(`    Source: Directory (${src.path})`)
            } else if (src?.source === 'file') {
              console.log(`    Source: File (${src.path})`)
            } else if (src?.source === 'npm') {
              console.log(`    Source: NPM (${src.package})`)
            }
            console.log('')
          }

          process.exit(0)
        } catch (error) {
          console.error((error as Error).message)
          process.exit(1)
        }
      })

    marketplaceCmd
      .command('remove <name>')
      .alias('rm')
      .description('Remove a configured marketplace')
      .action(async (name: string) => {
        try {
          const { removeMarketplace } =
            await import('@services/skillMarketplace')
          removeMarketplace(name)
          console.log(`Successfully removed marketplace: ${name}`)
          process.exit(0)
        } catch (error) {
          console.error((error as Error).message)
          process.exit(1)
        }
      })

    marketplaceCmd
      .command('update [name]')
      .description(
        'Update marketplace(s) from their source - updates all if no name specified',
      )
      .action(async (name: string | undefined, _options: any) => {
        try {
          const {
            listMarketplaces,
            refreshAllMarketplacesAsync,
            refreshMarketplaceAsync,
          } = await import('@services/skillMarketplace')

          const trimmed = typeof name === 'string' ? name.trim() : ''
          if (trimmed) {
            console.log(`Updating marketplace: ${trimmed}...`)
            await refreshMarketplaceAsync(trimmed)
            console.log(`Successfully updated marketplace: ${trimmed}`)
            process.exit(0)
          }

          const marketplaces = listMarketplaces()
          const names = Object.keys(marketplaces)
          if (names.length === 0) {
            console.log('No marketplaces configured')
            process.exit(0)
          }

          console.log(`Updating ${names.length} marketplace(s)...`)
          await refreshAllMarketplacesAsync(message => {
            console.log(message)
          })
          console.log(`Successfully updated ${names.length} marketplace(s)`)
          process.exit(0)
        } catch (error) {
          console.error((error as Error).message)
          process.exit(1)
        }
      })
  }

  const pluginCmd = program
    .command('plugin')
    .description('Manage plugins and marketplaces')

  const pluginMarketplaceCmd = pluginCmd
    .command('marketplace')
    .description(
      'Manage marketplaces (.kode-plugin/marketplace.json; legacy .claude-plugin supported)',
    )

  registerMarketplaceCommands(pluginMarketplaceCmd)

  const PLUGIN_SCOPES = ['user', 'project', 'local'] as const
  type PluginScope = (typeof PLUGIN_SCOPES)[number]

  const parsePluginScope = (value: unknown): PluginScope | null => {
    const normalized = String(value || 'user') as PluginScope
    return PLUGIN_SCOPES.includes(normalized) ? normalized : null
  }

  pluginCmd
    .command('install <plugin>')
    .alias('i')
    .description(
      'Install a plugin from available marketplaces (use plugin@marketplace for specific marketplace)',
    )
    .option('--cwd <cwd>', 'The current working directory', String, cwd())
    .option(
      '-s, --scope <scope>',
      'Installation scope: user, project, or local',
      'user',
    )
    .option('--force', 'Overwrite existing installed files', () => true)
    .action(async (plugin: string, options: any) => {
      try {
        const scope = parsePluginScope(options.scope)
        if (!scope) {
          console.error(
            `Invalid scope: ${String(options.scope)}. Must be one of: ${PLUGIN_SCOPES.join(', ')}`,
          )
          process.exit(1)
        }

        const { setCwd } = await import('@utils/state')
        await setCwd(options.cwd ?? cwd())

        const { installSkillPlugin } =
          await import('@services/skillMarketplace')
        const result = installSkillPlugin(plugin, {
          scope,
          force: options.force === true,
        })

        const skillList =
          result.installedSkills.length > 0
            ? `Skills: ${result.installedSkills.join(', ')}`
            : 'Skills: (none)'
        console.log(`Installed ${result.pluginSpec}\n${skillList}`)
        process.exit(0)
      } catch (error) {
        console.error((error as Error).message)
        process.exit(1)
      }
    })

  pluginCmd
    .command('uninstall <plugin>')
    .alias('remove')
    .alias('rm')
    .description('Uninstall an installed plugin')
    .option('--cwd <cwd>', 'The current working directory', String, cwd())
    .option(
      '-s, --scope <scope>',
      `Uninstall from scope: ${PLUGIN_SCOPES.join(', ')} (default: user)`,
      'user',
    )
    .action(async (plugin: string, options: any) => {
      try {
        const scope = parsePluginScope(options.scope)
        if (!scope) {
          console.error(
            `Invalid scope: ${String(options.scope)}. Must be one of: ${PLUGIN_SCOPES.join(', ')}`,
          )
          process.exit(1)
        }

        const { setCwd } = await import('@utils/state')
        await setCwd(options.cwd ?? cwd())

        const { uninstallSkillPlugin } =
          await import('@services/skillMarketplace')
        const result = uninstallSkillPlugin(plugin, { scope })
        const skillList =
          result.removedSkills.length > 0
            ? `Skills: ${result.removedSkills.join(', ')}`
            : 'Skills: (none)'
        console.log(`Uninstalled ${result.pluginSpec}\n${skillList}`)
        process.exit(0)
      } catch (error) {
        console.error((error as Error).message)
        process.exit(1)
      }
    })

  pluginCmd
    .command('list')
    .description('List installed plugins')
    .option('--cwd <cwd>', 'The current working directory', String, cwd())
    .option(
      '-s, --scope <scope>',
      `Filter by scope: ${PLUGIN_SCOPES.join(', ')} (default: user)`,
      'user',
    )
    .option('--json', 'Output as JSON')
    .action(async (options: any) => {
      try {
        const scope = parsePluginScope(options.scope)
        if (!scope) {
          console.error(
            `Invalid scope: ${String(options.scope)}. Must be one of: ${PLUGIN_SCOPES.join(', ')}`,
          )
          process.exit(1)
        }

        const { setCwd, getCwd } = await import('@utils/state')
        await setCwd(options.cwd ?? cwd())

        const { listInstalledSkillPlugins } =
          await import('@services/skillMarketplace')
        const all = listInstalledSkillPlugins()
        const filtered = Object.fromEntries(
          Object.entries(all).filter(([, record]) => {
            if ((record as any)?.scope !== scope) return false
            if (scope === 'user') return true
            return (record as any)?.projectPath === getCwd()
          }),
        )

        if (options.json) {
          console.log(JSON.stringify(filtered, null, 2))
          process.exit(0)
        }

        const names = Object.keys(filtered).sort()
        if (names.length === 0) {
          console.log('No plugins installed')
          process.exit(0)
        }
        console.log(`Installed plugins (scope=${scope}):\n`)
        for (const spec of names) {
          const record = filtered[spec] as any
          const enabled = record?.isEnabled === false ? 'disabled' : 'enabled'
          console.log(`  - ${spec} (${enabled})`)
        }
        process.exit(0)
      } catch (error) {
        console.error((error as Error).message)
        process.exit(1)
      }
    })

  pluginCmd
    .command('enable <plugin>')
    .description('Enable a disabled plugin')
    .option('--cwd <cwd>', 'The current working directory', String, cwd())
    .option(
      '-s, --scope <scope>',
      `Installation scope: ${PLUGIN_SCOPES.join(', ')} (default: user)`,
      'user',
    )
    .action(async (plugin: string, options: any) => {
      try {
        const scope = parsePluginScope(options.scope)
        if (!scope) {
          console.error(
            `Invalid scope: ${String(options.scope)}. Must be one of: ${PLUGIN_SCOPES.join(', ')}`,
          )
          process.exit(1)
        }

        const { setCwd } = await import('@utils/state')
        await setCwd(options.cwd ?? cwd())

        const { enableSkillPlugin } = await import('@services/skillMarketplace')
        const result = enableSkillPlugin(plugin, { scope })
        console.log(`Enabled ${result.pluginSpec}`)
        process.exit(0)
      } catch (error) {
        console.error((error as Error).message)
        process.exit(1)
      }
    })

  pluginCmd
    .command('disable <plugin>')
    .description('Disable an enabled plugin')
    .option('--cwd <cwd>', 'The current working directory', String, cwd())
    .option(
      '-s, --scope <scope>',
      `Installation scope: ${PLUGIN_SCOPES.join(', ')} (default: user)`,
      'user',
    )
    .action(async (plugin: string, options: any) => {
      try {
        const scope = parsePluginScope(options.scope)
        if (!scope) {
          console.error(
            `Invalid scope: ${String(options.scope)}. Must be one of: ${PLUGIN_SCOPES.join(', ')}`,
          )
          process.exit(1)
        }

        const { setCwd } = await import('@utils/state')
        await setCwd(options.cwd ?? cwd())

        const { disableSkillPlugin } =
          await import('@services/skillMarketplace')
        const result = disableSkillPlugin(plugin, { scope })
        console.log(`Disabled ${result.pluginSpec}`)
        process.exit(0)
      } catch (error) {
        console.error((error as Error).message)
        process.exit(1)
      }
    })

  pluginCmd
    .command('validate <path>')
    .description('Validate a plugin or marketplace manifest')
    .option('--cwd <cwd>', 'The current working directory', String, cwd())
    .action(async (path: string, options: any) => {
      try {
        const { setCwd } = await import('@utils/state')
        await setCwd(options.cwd ?? cwd())

        const { formatValidationResult, validatePluginOrMarketplacePath } =
          await import('@services/pluginValidation')

        const result = validatePluginOrMarketplacePath(path)
        console.log(
          `Validating ${result.fileType} manifest: ${result.filePath}\n`,
        )
        console.log(formatValidationResult(result))
        process.exit(result.success ? 0 : 1)
      } catch (error) {
        console.error(
          `Unexpected error during validation: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
        process.exit(2)
      }
    })

  // Skills (Agent Skills compatible)

  const skillsCmd = program
    .command('skills')
    .description('Manage skills and skill marketplaces')

  const marketplaceCmd = skillsCmd
    .command('marketplace')
    .description(
      'Manage skill marketplaces (.kode-plugin/marketplace.json; legacy .claude-plugin supported)',
    )

  registerMarketplaceCommands(marketplaceCmd)

  skillsCmd
    .command('install <plugin>')
    .description('Install a skill plugin pack (<plugin>@<marketplace>)')
    .option('--cwd <cwd>', 'The current working directory', String, cwd())
    .option('--project', 'Install into this project (.kode/...)', () => true)
    .option('--force', 'Overwrite existing installed files', () => true)
    .action(async (plugin: string, options: any) => {
      try {
        const { setCwd } = await import('@utils/state')
        await setCwd(options.cwd ?? cwd())

        const { installSkillPlugin } =
          await import('@services/skillMarketplace')
        const result = installSkillPlugin(plugin, {
          project: options.project === true,
          force: options.force === true,
        })
        const skillList =
          result.installedSkills.length > 0
            ? `Skills: ${result.installedSkills.join(', ')}`
            : 'Skills: (none)'
        console.log(`Installed ${plugin}\n${skillList}`)
        process.exit(0)
      } catch (error) {
        console.error((error as Error).message)
        process.exit(1)
      }
    })

  skillsCmd
    .command('uninstall <plugin>')
    .description('Uninstall a skill plugin pack (<plugin>@<marketplace>)')
    .option('--cwd <cwd>', 'The current working directory', String, cwd())
    .option('--project', 'Uninstall from this project (.kode/...)', () => true)
    .action(async (plugin: string, options: any) => {
      try {
        const { setCwd } = await import('@utils/state')
        await setCwd(options.cwd ?? cwd())

        const { uninstallSkillPlugin } =
          await import('@services/skillMarketplace')
        const result = uninstallSkillPlugin(plugin, {
          project: options.project === true,
        })
        const skillList =
          result.removedSkills.length > 0
            ? `Skills: ${result.removedSkills.join(', ')}`
            : 'Skills: (none)'
        console.log(`Uninstalled ${plugin}\n${skillList}`)
        process.exit(0)
      } catch (error) {
        console.error((error as Error).message)
        process.exit(1)
      }
    })

  skillsCmd
    .command('list-installed')
    .description('List installed skill plugins')
    .action(async () => {
      try {
        const { listInstalledSkillPlugins } =
          await import('@services/skillMarketplace')
        console.log(JSON.stringify(listInstalledSkillPlugins(), null, 2))
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

        addMcpServer(
          name,
          { type: 'sse', url, ...(headers ? { headers } : {}) },
          scopeInfo.scope,
        )
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
        addMcpServer(
          name,
          { type: 'http', url, ...(headers ? { headers } : {}) },
          scopeInfo.scope,
        )
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
    .option(
      '-t, --transport <transport>',
      'MCP transport (stdio, sse, or http)',
    )
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

        const matches: Array<{
          scope: ReturnType<typeof ensureConfigScope>
          display: string
        }> = []

        const projectConfig = getCurrentProjectConfig()
        if (projectConfig.mcpServers?.[name]) {
          matches.push({
            scope: ensureConfigScope('project'),
            display: 'local',
          })
        }

        const globalConfig = getGlobalConfig()
        if (globalConfig.mcpServers?.[name]) {
          matches.push({ scope: ensureConfigScope('global'), display: 'user' })
        }

        const projectFileDefinitions = getProjectMcpServerDefinitions()
        if (projectFileDefinitions.servers[name]) {
          const source = projectFileDefinitions.sources[name]
          if (source === '.mcp.json') {
            matches.push({
              scope: ensureConfigScope('mcpjson'),
              display: 'project',
            })
          } else {
            matches.push({
              scope: ensureConfigScope('mcprc'),
              display: 'mcprc',
            })
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

  // Import servers from a desktop MCP host config
  mcp
    .command('add-from-claude-desktop')
    .description(
      'Import MCP servers from a desktop MCP host config (macOS, Windows and WSL)',
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

        // Get desktop MCP host config path
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
          console.error(`Error: Config file not found at ${configPath}`)
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
          console.log('No MCP servers found in the desktop config')
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
            const [importResults, setImportResults] = useState(
              [] as { name: string; success: boolean }[],
            )
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
                    Import MCP Servers from Desktop Config
                  </Text>

                  <Box marginY={1}>
                    <Text>
                      Found {numServers} MCP servers in the desktop config.
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
    .description(
      'Reset approvals for project-file MCP servers (.mcp.json/.mcprc) in this project',
    )
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

      const { getLatestVersion, getUpdateCommandSuggestions } =
        await import('@utils/autoUpdater')
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
        console.log(
          '\nNote: you may need to prefix with "sudo" on macOS/Linux.',
        )
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
    .option('--cwd <cwd>', 'The current working directory', String, cwd())
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
      'Resume a previous conversation. Optionally provide a session ID or session name (legacy: log index or file path).',
    )
    .argument(
      '[identifier]',
      'A session ID or session name (legacy: log index or file path)',
    )
    .option('--cwd <cwd>', 'The current working directory', String, cwd())
    .option('-e, --enable-architect', 'Enable the Architect tool', () => true)
    .option('-v, --verbose', 'Do not truncate message output', () => true)
    .option(
      '--safe',
      'Enable strict permission checking mode (default is permissive)',
      () => true,
    )
    .option(
      '--disable-slash-commands',
      'Disable slash commands (treat /... as plain text)',
      () => true,
    )
    .action(
      async (
        identifier,
        { cwd, enableArchitect, safe, verbose, disableSlashCommands },
      ) => {
        await setup(cwd, safe)
        assertMinVersion()

        const [{ getTools }, { getCommands }] = await Promise.all([
          import('@tools'),
          import('@commands'),
        ])
        const [allTools, commands, mcpClients] = await Promise.all([
          getTools(
            enableArchitect ?? getCurrentProjectConfig().enableArchitectTool,
          ),
          getCommands(),
          getClients(),
        ])
        const tools =
          disableSlashCommands === true
            ? allTools.filter(t => t.name !== 'SlashCommand')
            : allTools

        // If a specific conversation is requested, load and resume it directly
        if (identifier !== undefined) {
          const { loadKodeAgentSessionMessages } =
            await import('@utils/protocol/kodeAgentSessionLoad')
          const { resolveResumeSessionIdentifier } =
            await import('@utils/protocol/kodeAgentSessionResume')
          const { setKodeAgentSessionId } =
            await import('@utils/protocol/kodeAgentSessionId')

          const rawIdentifier = String(identifier).trim()
          const isLegacyNumber = /^-?\\d+$/.test(rawIdentifier)
          const isLegacyPath = !isLegacyNumber && existsSync(rawIdentifier)

          let messages: any[] | undefined
          let messageLogName: string = dateToFilename(new Date())
          let initialForkNumber: number | undefined = undefined

          try {
            if (isLegacyNumber || isLegacyPath) {
              const logs = await loadLogList(CACHE_PATHS.messages())
              if (isLegacyNumber) {
                const number = Math.abs(parseInt(rawIdentifier, 10))
                const log = logs[number]
                if (!log) {
                  console.error('No conversation found at index', number)
                  process.exit(1)
                }
                messages = await loadMessagesFromLog(log.fullPath, tools)
                messageLogName = log.date
                initialForkNumber = getNextAvailableLogForkNumber(
                  log.date,
                  log.forkNumber ?? 1,
                  0,
                )
              } else {
                messages = await loadMessagesFromLog(rawIdentifier, tools)
                const pathSegments = rawIdentifier.split('/')
                const filename =
                  pathSegments[pathSegments.length - 1] ?? 'unknown'
                const { date, forkNumber } = parseLogFilename(filename)
                messageLogName = date
                initialForkNumber = getNextAvailableLogForkNumber(
                  date,
                  forkNumber ?? 1,
                  0,
                )
              }
            } else {
              const resolved = resolveResumeSessionIdentifier({
                cwd,
                identifier: rawIdentifier,
              })
              if (resolved.kind === 'ok') {
                setKodeAgentSessionId(resolved.sessionId)
                messages = loadKodeAgentSessionMessages({
                  cwd,
                  sessionId: resolved.sessionId,
                })
              } else if (resolved.kind === 'different_directory') {
                console.error(
                  resolved.otherCwd
                    ? `Error: That session belongs to a different directory: ${resolved.otherCwd}`
                    : `Error: That session belongs to a different directory.`,
                )
                process.exit(1)
              } else if (resolved.kind === 'ambiguous') {
                console.error(
                  `Error: Multiple sessions match "${rawIdentifier}": ${resolved.matchingSessionIds.join(
                    ', ',
                  )}`,
                )
                process.exit(1)
              } else {
                console.error(
                  `No conversation found with session ID or name: ${rawIdentifier}`,
                )
                process.exit(1)
              }
            }

            const isDefaultModel = await isDefaultSlowAndCapableModel()
            {
              const { render } = await import('ink')
              const { REPL } = await import('@screens/REPL')
              render(
                <REPL
                  initialPrompt=""
                  messageLogName={messageLogName}
                  initialForkNumber={initialForkNumber}
                  shouldShowPromptInput={true}
                  verbose={verbose}
                  commands={commands}
                  disableSlashCommands={disableSlashCommands === true}
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
          const { listKodeAgentSessions } =
            await import('@utils/protocol/kodeAgentSessionResume')
          const sessions = listKodeAgentSessions({ cwd })
          if (sessions.length === 0) {
            console.error('No conversation found to resume')
            process.exit(1)
          }

          const context: { unmount?: () => void } = {}
          ;(async () => {
            const { render } = await import('ink')
            const { unmount } = render(
              <ResumeConversation
                cwd={cwd}
                context={context}
                commands={commands}
                sessions={sessions}
                tools={tools}
                verbose={verbose}
                safeMode={safe}
                disableSlashCommands={disableSlashCommands === true}
                mcpClients={mcpClients}
                initialPrompt=""
              />,
              renderContextWithExitOnCtrlC,
            )
            context.unmount = unmount
          })()
        }
      },
    )

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
    .option('--cwd <cwd>', 'The current working directory', String, cwd())
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
    .option('--cwd <cwd>', 'The current working directory', String, cwd())
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
    .option('--cwd <cwd>', 'The current working directory', String, cwd())
    .action(async (key, value, { cwd }) => {
      await setup(cwd, false)

      setContext(key, value)
      console.log(`Set context.${key} to "${value}"`)
      process.exit(0)
    })

  context
    .command('list')
    .description('List all context values')
    .option('--cwd <cwd>', 'The current working directory', String, cwd())
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
    .option('--cwd <cwd>', 'The current working directory', String, cwd())
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

let isGracefulExitInProgress = false
async function gracefulExit(code = 0) {
  if (isGracefulExitInProgress) {
    process.exit(code)
    return
  }
  isGracefulExitInProgress = true

  try {
    const { runSessionEndHooks } = await import('@utils/kodeHooks')
    const { getKodeAgentSessionId } =
      await import('@utils/protocol/kodeAgentSessionId')
    const { tmpdir } = await import('os')
    const { join } = await import('path')

    const sessionId = getKodeAgentSessionId()
    const transcriptPath = join(
      tmpdir(),
      'kode-hooks-transcripts',
      `${sessionId}.transcript.txt`,
    )

    const { signal, cleanup } = (() => {
      if (
        typeof AbortSignal !== 'undefined' &&
        typeof (AbortSignal as any).timeout === 'function'
      ) {
        return {
          signal: (AbortSignal as any).timeout(5000) as AbortSignal,
          cleanup: () => {},
        }
      }
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 5000)
      return { signal: controller.signal, cleanup: () => clearTimeout(timer) }
    })()

    try {
      await runSessionEndHooks({
        reason: 'exit',
        cwd: cwd(),
        transcriptPath,
        signal,
      })
    } finally {
      cleanup()
    }
  } catch {
    // best-effort only
  }

  try {
    resetCursor()
  } catch {}
  try {
    BunShell.getInstance().close()
  } catch {}
  process.exit(code)
}

process.on('SIGINT', () => void gracefulExit(0))
process.on('SIGTERM', () => void gracefulExit(0))
// Windows CTRL+BREAK
process.on('SIGBREAK', () => void gracefulExit(0))
process.on('unhandledRejection', err => {
  console.error('Unhandled rejection:', err)
  void gracefulExit(1)
})
process.on('uncaughtException', err => {
  console.error('Uncaught exception:', err)
  void gracefulExit(1)
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
