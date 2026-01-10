import type { RenderOptions } from 'ink'

import { runPrintMode } from '../print/runPrintMode'
import { setup } from '../setup'
import { showSetupScreens } from '../setupScreens'
import { clearOutputStyleCache } from '#cli-services/outputStyles'
import { isDefaultSlowAndCapableModel } from '#core/utils/model'
import { dateToFilename } from '#core/utils/log'
import { assertMinVersion } from '#core/utils/autoUpdater'
import { MACRO } from '#core/constants/macros'
import {
  clearAgentCache,
  setFlagAgentsFromCliJson,
} from '#core/utils/agentLoader'
import {
  setEnabledSettingSourcesFromCli,
  getCurrentProjectConfig,
} from '#config'
import { getClients, getClientsForCliMcpConfig } from '#core/mcp/client'

import {
  renderRepl,
  renderResumeConversationSelector,
} from '../interactive/renderers'

import { fetchUpdateInfo } from './rootAction/updateInfo'
import type { Message } from '#core/query'

type RootCommandOptions = {
  cwd?: string
  debug?: unknown
  verbose?: boolean
  enableArchitect?: boolean
  print?: boolean
  outputFormat?: string
  jsonSchema?: string
  inputFormat?: string
  mcpDebug?: boolean
  dangerouslySkipPermissions?: boolean
  allowDangerouslySkipPermissions?: boolean
  maxBudgetUsd?: string
  includePartialMessages?: boolean
  replayUserMessages?: boolean
  allowedTools?: unknown
  tools?: unknown
  disallowedTools?: unknown
  mcpConfig?: unknown
  systemPrompt?: string
  appendSystemPrompt?: string
  permissionMode?: string
  permissionPromptTool?: string
  safe?: boolean
  disableSlashCommands?: boolean
  pluginDir?: unknown
  model?: string
  addDir?: unknown
  web?: boolean
  webHost?: string
  webPort?: string
  strictMcpConfig?: boolean
  agents?: string
  settingSources?: string
  resume?: unknown
  continue?: boolean
  forkSession?: boolean
  sessionId?: string
  sessionPersistence: boolean
}

export function createRootAction(args: {
  stdinContent: string
  renderContext: RenderOptions | undefined
  renderContextWithExitOnCtrlC: RenderOptions | undefined
}): (prompt: string | undefined, options: RootCommandOptions) => Promise<void> {
  return async (
    prompt,
    {
      cwd: maybeCwd,
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
      web,
      webHost,
      webPort,
      strictMcpConfig,
      agents,
      settingSources,
      resume,
      continue: continueConversation,
      forkSession,
      sessionId,
      sessionPersistence,
    },
  ) => {
    const cwd = maybeCwd ?? process.cwd()
    if (!process.env.CLAUDE_CODE_ENTRYPOINT) {
      const isNonInteractive =
        print === true ||
        outputFormat === 'stream-json' ||
        inputFormat === 'stream-json' ||
        !process.stdout.isTTY
      process.env.CLAUDE_CODE_ENTRYPOINT = isNonInteractive ? 'sdk-cli' : 'cli'
    }
    const normalizedPermissionMode =
      typeof permissionMode === 'string' ? permissionMode.trim() : ''
    const bypassPermissionsRequested =
      normalizedPermissionMode === 'bypassPermissions' ||
      dangerouslySkipPermissions === true

    if (bypassPermissionsRequested) {
      const isRoot =
        process.platform !== 'win32' &&
        typeof process.getuid === 'function' &&
        process.getuid() === 0
      const isSandboxed =
        process.env.IS_SANDBOX === '1' ||
        process.env.CLAUDE_CODE_BUBBLEWRAP === '1'
      if (isRoot && !isSandboxed) {
        console.error(
          '--dangerously-skip-permissions cannot be used with root/sudo privileges for security reasons',
        )
        process.exit(1)
      }
    }

    try {
      setEnabledSettingSourcesFromCli(settingSources)
    } catch (err) {
      process.stderr.write(
        `Error processing --setting-sources: ${err instanceof Error ? err.message : String(err)}\n`,
      )
      process.exit(1)
    }

    setFlagAgentsFromCliJson(agents)
    clearAgentCache()
    clearOutputStyleCache()

    if (web && print) {
      console.error('Error: --web and --print cannot be used together.')
      process.exit(1)
    }

    await setup(cwd, safe)

    if (web) {
      const { runWebOnlyMode } = await import('./rootAction/webOnlyMode')
      await runWebOnlyMode({ cwd, webHost, webPort })
      return
    }
    await showSetupScreens(safe, print)

    assertMinVersion()

    {
      const requested =
        Array.isArray(pluginDir) && pluginDir.length > 0 ? pluginDir : []
      const { listEnabledInstalledPluginPackRoots } =
        await import('#cli-services/skillMarketplace')
      const installed = listEnabledInstalledPluginPackRoots()

      const all = [...installed, ...requested].filter(Boolean)
      const deduped = Array.from(new Set(all))

      if (deduped.length > 0) {
        const { configureSessionPlugins } =
          await import('#cli-services/pluginRuntime')
        const { errors } = await configureSessionPlugins({
          pluginDirs: deduped,
        })
        for (const err of errors) {
          console.warn(err)
        }
      }
    }

    const [{ ask }, { getTools }, { getCommands }] = await Promise.all([
      import('#cli-utils/ask'),
      import('#tools'),
      import('#cli-commands'),
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
    const inputPrompt = [prompt, args.stdinContent].filter(Boolean).join('\n')

    const { loadKodeAgentSessionMessages, findMostRecentKodeAgentSessionId } =
      await import('#protocol/utils/kodeAgentSessionLoad')
    const { listKodeAgentSessions, resolveResumeSessionIdentifier } =
      await import('#protocol/utils/kodeAgentSessionResume')
    const { isUuid } = await import('#core/utils/uuid')
    const { setKodeAgentSessionId, getKodeAgentSessionId } =
      await import('#protocol/utils/kodeAgentSessionId')
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

    let initialMessages: Message[] | undefined
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
        stdinContent: args.stdinContent,
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
        permissionMode,
        systemPromptOverride,
        appendSystemPrompt,
        allowedTools,
        disallowedTools,
        dangerouslySkipPermissions,
        allowDangerouslySkipPermissions,
        sessionPersistence,
        model,
        addDir,
        mcpClients,
      })
      return
    }

    const updateInfo = await fetchUpdateInfo(MACRO.VERSION)

    if (needsResumeSelector) {
      const sessions = listKodeAgentSessions({ cwd })
      if (sessions.length === 0) {
        console.error('No conversation found to resume')
        process.exit(1)
      }

      renderResumeConversationSelector(
        {
          cwd,
          commands,
          sessions,
          tools,
          verbose,
          safeMode: safe,
          debug: Boolean(debug),
          disableSlashCommands: disableSlashCommands === true,
          mcpClients,
          initialPrompt: inputPrompt,
          forkSession: wantsFork,
          forkSessionId: sessionId ? String(sessionId) : null,
          initialUpdateVersion: updateInfo.version,
          initialUpdateCommands: updateInfo.commands,
        },
        args.renderContextWithExitOnCtrlC,
      )
      return
    }

    const isDefaultModel = await isDefaultSlowAndCapableModel()
    await renderRepl(
      {
        commands,
        debug: Boolean(debug),
        disableSlashCommands: disableSlashCommands === true,
        initialPrompt: inputPrompt,
        messageLogName: dateToFilename(new Date()),
        shouldShowPromptInput: true,
        verbose,
        tools,
        safeMode: safe,
        mcpClients,
        isDefaultModel,
        initialUpdateVersion: updateInfo.version,
        initialUpdateCommands: updateInfo.commands,
        initialMessages,
      },
      args.renderContext,
    )
  }
}
