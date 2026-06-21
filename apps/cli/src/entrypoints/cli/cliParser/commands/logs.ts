import { existsSync } from 'node:fs'
import { cwd as processCwd } from 'process'

import type { Command } from '@commander-js/extra-typings'
import type { RenderOptions } from 'ink'

import { getCurrentProjectConfig } from '#config'
import { assertMinVersion } from '#core/utils/autoUpdater'
import { isDefaultSlowAndCapableModel } from '#core/utils/model'
import {
  dateToFilename,
  getNextAvailableLogForkNumber,
  loadLogList,
  parseLogFilename,
  logError,
  CACHE_PATHS,
} from '#core/utils/log'
import { loadMessagesFromLog } from '#core/utils/conversationRecovery'

import { getClients } from '#core/mcp/client'
import { setup } from '../../setup'
import {
  renderLogListScreen,
  renderRepl,
  renderResumeConversationSelector,
} from '../../interactive/renderers'

type CwdOption = { cwd: string }

export function registerLogCommands(
  program: Command,
  renderContextWithExitOnCtrlC: RenderOptions | undefined,
): void {
  program
    .command('log')
    .description('Manage conversation logs.')
    .argument(
      '[number]',
      'A number (0, 1, 2, etc.) to display a specific log',
      parseInt,
    )
    .option(
      '--cwd <cwd>',
      'The current working directory',
      String,
      processCwd(),
    )
    .action(async (number: number | undefined, options: CwdOption) => {
      await setup(options.cwd, false)
      renderLogListScreen(
        { type: 'messages', logNumber: number },
        renderContextWithExitOnCtrlC,
      )
    })

  program
    .command('resume')
    .description(
      'Resume a previous conversation. Optionally provide a session ID or session name (legacy: log index or file path).',
    )
    .argument(
      '[identifier]',
      'A session ID or session name (legacy: log index or file path)',
    )
    .option(
      '--cwd <cwd>',
      'The current working directory',
      String,
      processCwd(),
    )
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
        identifier: string | undefined,
        options: {
          cwd?: string
          enableArchitect?: boolean
          safe?: boolean
          verbose?: boolean
          disableSlashCommands?: boolean
        },
      ) => {
        const cwd = options.cwd ?? processCwd()
        const enableArchitect = options.enableArchitect
        const safe = options.safe
        const verbose = options.verbose
        const disableSlashCommands = options.disableSlashCommands

        await setup(cwd, safe)
        assertMinVersion()

        const [{ getTools }, { getCommands }] = await Promise.all([
          import('#tools'),
          import('#cli-commands'),
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

        if (identifier !== undefined) {
          const { loadKodeAgentSessionMessages } =
            await import('#protocol/utils/kodeAgentSessionLoad')
          const { resolveResumeSessionIdentifier } =
            await import('#protocol/utils/kodeAgentSessionResume')
          const { setSessionId } = await import('#core/utils/sessionId')
          const { setKodeAgentSessionForkInfo } =
            await import('#protocol/utils/kodeAgentSessionForkInfo')

          const rawIdentifier = String(identifier).trim()
          const isLegacyNumber = /^-?\\d+$/.test(rawIdentifier)
          const isLegacyPath = !isLegacyNumber && existsSync(rawIdentifier)

          let messages: unknown[] | undefined
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
                setKodeAgentSessionForkInfo(null)
                setSessionId(resolved.sessionId)
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
            await renderRepl(
              {
                initialPrompt: '',
                messageLogName,
                initialForkNumber,
                shouldShowPromptInput: true,
                verbose,
                commands,
                disableSlashCommands: disableSlashCommands === true,
                tools,
                safeMode: safe,
                initialMessages: messages,
                mcpClients,
                isDefaultModel,
              },
              { exitOnCtrlC: false },
            )
          } catch (error) {
            logError(`Failed to load conversation: ${String(error)}`)
            process.exit(1)
          }
        } else {
          const { listKodeAgentSessions } =
            await import('#protocol/utils/kodeAgentSessionResume')
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
              disableSlashCommands: disableSlashCommands === true,
              mcpClients,
              initialPrompt: '',
            },
            renderContextWithExitOnCtrlC,
          )
        }
      },
    )

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
    .option(
      '--cwd <cwd>',
      'The current working directory',
      String,
      processCwd(),
    )
    .action(async (number: number | undefined, options: CwdOption) => {
      await setup(options.cwd, false)
      renderLogListScreen(
        { type: 'errors', logNumber: number },
        renderContextWithExitOnCtrlC,
      )
    })
}
