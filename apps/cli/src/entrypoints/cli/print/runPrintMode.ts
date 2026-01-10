import { addToHistory } from '#core/history'
import { hasPermissionsToUseTool } from '#core/permissions'
import { dateToFilename } from '#core/utils/log'

import type { WrappedClient } from '#core/mcp/client'
import type { Message } from '#core/query'
import type { Tool } from '#core/tooling/Tool'

export type RunPrintModeArgs = {
  prompt: string | undefined
  stdinContent: string
  inputPrompt: string

  cwd: string
  safe?: boolean
  verbose?: boolean

  outputFormat?: string
  inputFormat?: string
  jsonSchema?: string
  permissionPromptTool?: string | null
  replayUserMessages?: boolean

  cliTools?: unknown
  tools: Tool[]
  commands: Array<{ isHidden?: boolean; userFacingName: () => string }>
  ask: (args: unknown) => Promise<{ resultText: string }>

  initialMessages?: Message[]
  sessionPersistence?: boolean

  systemPromptOverride?: string
  appendSystemPrompt?: string
  disableSlashCommands?: boolean

  allowedTools?: unknown
  disallowedTools?: unknown
  addDir?: unknown
  permissionMode?: string
  dangerouslySkipPermissions?: boolean
  allowDangerouslySkipPermissions?: boolean

  model?: string
  mcpClients: WrappedClient[]
}

export async function runPrintMode({
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
}: RunPrintModeArgs): Promise<void> {
  const normalizedOutputFormat = String(outputFormat || 'text')
    .toLowerCase()
    .trim()
  const normalizedInputFormat = String(inputFormat || 'text')
    .toLowerCase()
    .trim()

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

  if (
    normalizedInputFormat === 'stream-json' &&
    normalizedOutputFormat !== 'stream-json'
  ) {
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

  const toolsForPrint = (() => {
    if (!cliTools) return tools
    const raw = Array.isArray(cliTools) ? cliTools : [cliTools]
    const flattened = raw
      .flatMap(v => String(v ?? '').split(','))
      .map(v => v.trim())
    if (flattened.length === 0) return tools

    if (flattened.length === 1 && flattened[0] === '') return []
    if (flattened.length === 1 && flattened[0] === 'default') return tools

    const wanted = new Set(flattened.filter(v => v && v !== 'default'))
    const unknown = [...wanted].filter(
      name => !tools.some(t => t.name === name),
    )
    if (unknown.length > 0) {
      console.error(`Error: Unknown tool(s) in --tools: ${unknown.join(', ')}`)
      process.exit(1)
    }

    return tools.filter(t => wanted.has(t.name))
  })()

  if (normalizedOutputFormat === 'text') {
    addToHistory(inputPrompt)
    const { resultText: response } = await ask({
      commands,
      hasPermissionsToUseTool,
      messageLogName: dateToFilename(new Date()),
      prompt: inputPrompt,
      cwd,
      tools: toolsForPrint,
      safeMode: safe,
      initialMessages,
      persistSession: sessionPersistence !== false,
    })
    process.stdout.write(`${response}\n`)
    process.exit(0)
  }

  if (
    normalizedOutputFormat !== 'json' &&
    normalizedOutputFormat !== 'stream-json'
  ) {
    console.error(
      `Error: Invalid --output-format "${outputFormat}". Expected one of: json, stream-json`,
    )
    process.exit(1)
  }

  if (
    normalizedInputFormat !== 'text' &&
    normalizedInputFormat !== 'stream-json'
  ) {
    console.error(
      `Error: Invalid --input-format "${inputFormat}". Expected one of: text, stream-json`,
    )
    process.exit(1)
  }

  const { runNonTextPrintMode } = await import('./runNonTextPrintMode')
  await runNonTextPrintMode({
    inputPrompt,
    cwd,
    safe,
    verbose,
    normalizedOutputFormat,
    normalizedInputFormat,
    normalizedPermissionPromptTool,
    replayUserMessages,
    toolsForPrint,
    commands,
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
    jsonSchema,
    model,
    mcpClients,
  })
}
