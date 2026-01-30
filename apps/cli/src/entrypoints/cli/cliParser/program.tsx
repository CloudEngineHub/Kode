import { cwd } from 'process'

import type { RenderOptions } from 'ink'
import { Command, Option } from '@commander-js/extra-typings'

import { PRODUCT_COMMAND, PRODUCT_NAME } from '#core/constants/product'
import { MACRO } from '#core/constants/macros'

import { registerConfigCommands } from '../commands/config'
import { registerContextCommands } from '../commands/context'
import { registerMcpCommands } from '../commands/mcp'
import { registerModelsCommands } from '../commands/models'
import { registerAgentsCommands } from './commands/agents'
import { registerApprovedToolsCommands } from './commands/approvedTools'
import { registerDoctorCommand } from './commands/doctor'
import { registerLogCommands } from './commands/logs'
import { registerPluginCommands } from './commands/plugins'
import { registerUpdateCommand } from './commands/update'
import { createRootAction } from './rootAction'

export function createCliProgram(
  stdinContent: string,
  renderContext: RenderOptions | undefined,
): Command {
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
      'Print response and exit (useful for pipes). Note: non-interactive mode skips the trust dialog and defaults to bypassPermissions if no permission mode is configured (unless you set --safe or --permission-mode).',
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
    .addOption(
      new Option(
        '--max-thinking-tokens <tokens>',
        'Maximum number of thinking tokens.  (only works with --print)',
      )
        .argParser(Number)
        .hideHelp(),
    )
    .addOption(
      new Option(
        '--max-turns <turns>',
        'Maximum number of agentic turns in non-interactive mode. This will early exit the conversation after the specified number of turns. (only works with --print)',
      )
        .argParser(Number)
        .hideHelp(),
    )
    .option(
      '--max-budget-usd <amount>',
      'Maximum dollar amount to spend on API calls (only works with --print)',
      value => {
        const n = Number(value)
        if (!Number.isFinite(n) || n <= 0) {
          throw new Error(
            '--max-budget-usd must be a positive number greater than 0',
          )
        }
        return n
      },
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
    .addOption(
      new Option(
        '--system-prompt-file <file>',
        'Read system prompt from a file',
      )
        .argParser(String)
        .hideHelp(),
    )
    .option(
      '--append-system-prompt <prompt>',
      'Append a system prompt to the default system prompt',
    )
    .addOption(
      new Option(
        '--append-system-prompt-file <file>',
        'Read system prompt from a file and append to the default system prompt',
      )
        .argParser(String)
        .hideHelp(),
    )
    .option(
      '--permission-mode <mode>',
      'Permission mode to use for the session (choices: "acceptEdits", "bypassPermissions", "default", "delegate", "dontAsk", "plan")',
      String,
    )
    .addOption(
      new Option(
        '--plan-mode-required',
        'Require plan mode before implementation',
      ).hideHelp(),
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
    .addOption(
      new Option(
        '--web',
        'Start local daemon and show a WebUI URL (interactive mode only)',
      ).hideHelp(),
    )
    .addOption(
      new Option(
        '--web-host <host>',
        'WebUI daemon host (default: 127.0.0.1)',
      ).hideHelp(),
    )
    .addOption(
      new Option(
        '--web-port <port>',
        'WebUI daemon port (default: 0 for random free port)',
      ).hideHelp(),
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
      'Resume a conversation by session ID/name, or open interactive picker with optional search term',
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
      createRootAction({
        stdinContent,
        renderContext,
        renderContextWithExitOnCtrlC,
      }),
    )
    .version(MACRO.VERSION, '-v, --version')

  registerConfigCommands(program)
  registerModelsCommands(program)
  registerAgentsCommands(program)
  registerPluginCommands(program)
  registerApprovedToolsCommands(program)
  registerMcpCommands(program)
  registerDoctorCommand(program)
  registerUpdateCommand(program)
  registerLogCommands(program, renderContextWithExitOnCtrlC)
  registerContextCommands(program)

  return program
}
