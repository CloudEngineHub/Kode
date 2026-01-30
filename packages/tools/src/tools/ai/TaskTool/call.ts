import { getAgentPrompt } from '#core/constants/prompts'
import { getContext } from '#core/context'
import { query } from '#core/query'
import type { ToolUseContext } from '#core/tooling/Tool'
import { getAvailableAgentTypes, getAgentByType } from '#core/utils/agentLoader'
import { generateAgentId } from '#core/utils/agentStorage'
import {
  getAgentTranscript,
  saveAgentTranscript,
} from '#core/utils/agentTranscripts'
import { getCwd } from '#core/utils/state'
import { getMaxThinkingTokens } from '#core/utils/thinking'
import { createDefaultToolPermissionContext } from '#core/types/toolPermissionContext'
import { LEGACY_ENV } from '#core/compat/legacyEnv'
import { getKodeAgentSessionId } from '#protocol/utils/kodeAgentSessionId'
import { loadKodeAgentSidechainMessagesForResume } from '#protocol/utils/kodeAgentSessionLoad'

import { getTaskTools } from './prompt'
import { buildForkContextForAgent } from './forkContext'
import { normalizeAgentModelName, modelEnumToPointer } from './models'
import { getToolNameFromSpec } from './toolSpec'
import {
  applyAgentPermissionMode,
  normalizeAgentPermissionMode,
} from './permissions'
import { callTaskToolBackground } from './callBackground'
import { callTaskToolForeground } from './callForeground'
import type { Input, Output } from './schema'
import type {
  PreparedTaskToolRun,
  QueryFn,
  TaskToolQueryOptions,
} from './callTypes'

type TaskToolUseContext = ToolUseContext & {
  __testQuery?: QueryFn
}

export async function* callTaskTool(
  input: Input,
  toolUseContext: TaskToolUseContext,
): AsyncGenerator<
  | {
      type: 'progress'
      content: any
      normalizedMessages?: any[]
      tools?: any[]
    }
  | {
      type: 'result'
      data: Output
      resultForAssistant?: string | any[]
      newMessages?: unknown[]
      contextModifier?: {
        modifyContext: (ctx: ToolUseContext) => ToolUseContext
      }
    },
  void,
  unknown
> {
  const startTime = Date.now()
  const options = toolUseContext.options ?? {}
  const safeMode = options.safeMode ?? false
  const forkNumber = options.forkNumber ?? 0
  const messageLogName = options.messageLogName ?? 'default'
  const verbose = options.verbose ?? false
  const parentModel = options.model

  const queryFn: QueryFn =
    typeof toolUseContext.__testQuery === 'function'
      ? toolUseContext.__testQuery
      : query

  const agentConfig = await getAgentByType(input.subagent_type)
  if (!agentConfig) {
    const available = await getAvailableAgentTypes()
    throw new Error(
      `Agent type '${input.subagent_type}' not found. Available agents: ${available.join(', ')}`,
    )
  }

  const effectivePrompt = input.prompt

  const normalizedAgentModel = normalizeAgentModelName(agentConfig.model)
  const defaultSubagentModel = 'task'
  const envSubagentModel =
    process.env.KODE_SUBAGENT_MODEL ?? process.env[LEGACY_ENV.codeSubagentModel]
  const modelToUse: string =
    (typeof envSubagentModel === 'string' && envSubagentModel.trim()
      ? envSubagentModel.trim()
      : undefined) ||
    modelEnumToPointer(input.model) ||
    (normalizedAgentModel === 'inherit'
      ? parentModel || defaultSubagentModel
      : normalizedAgentModel) ||
    defaultSubagentModel

  const toolFilter = agentConfig.tools
  let tools = await getTaskTools(safeMode)
  if (toolFilter) {
    const isAllArray =
      Array.isArray(toolFilter) &&
      toolFilter.length === 1 &&
      toolFilter[0] === '*'
    if (toolFilter === '*' || isAllArray) {
      // Keep all tools
    } else if (Array.isArray(toolFilter)) {
      const allowedToolNames = new Set(
        toolFilter.map(getToolNameFromSpec).filter(Boolean),
      )
      tools = tools.filter(t => allowedToolNames.has(t.name))
    }
  }

  const disallowedTools = Array.isArray(agentConfig.disallowedTools)
    ? agentConfig.disallowedTools
    : []
  if (disallowedTools.length > 0) {
    const disallowedToolNames = new Set(
      disallowedTools.map(getToolNameFromSpec).filter(Boolean),
    )
    tools = tools.filter(t => !disallowedToolNames.has(t.name))
  }

  const agentId = input.resume || generateAgentId()
  let baseTranscript: any[] = []
  if (input.resume) {
    const cached = getAgentTranscript(input.resume)
    if (cached) {
      baseTranscript = cached.filter(m => m.type !== 'progress')
    } else {
      const loaded = loadKodeAgentSidechainMessagesForResume({
        cwd: getCwd(),
        sessionId: getKodeAgentSessionId(),
        agentId: input.resume,
      })
      if (loaded.length === 0) {
        throw new Error(`No transcript found for agent ID: ${input.resume}`)
      }
      baseTranscript = loaded
      saveAgentTranscript(input.resume, loaded as any)
    }
  }

  const { forkContextMessages, promptMessages } = buildForkContextForAgent({
    enabled:
      agentConfig.forkContext === true || options.forceForkContext === true,
    prompt: effectivePrompt,
    toolUseId: toolUseContext.toolUseId,
    messageLogName,
    forkNumber,
  })

  const transcriptMessages = [...(baseTranscript || []), ...promptMessages]
  const messagesForQuery = [...forkContextMessages, ...transcriptMessages]

  const [baseSystemPrompt, context, maxThinkingTokens] = await Promise.all([
    getAgentPrompt(),
    getContext(),
    getMaxThinkingTokens(messagesForQuery, {
      thinkingMode: options.thinkingMode,
    }),
  ])
  const systemPrompt =
    agentConfig.systemPrompt && agentConfig.systemPrompt.length > 0
      ? [...baseSystemPrompt, agentConfig.systemPrompt]
      : baseSystemPrompt

  const agentPermissionMode = normalizeAgentPermissionMode(
    agentConfig.permissionMode,
  )
  const baseToolPermissionContext =
    options.toolPermissionContext ??
    createDefaultToolPermissionContext({
      isBypassPermissionsModeAvailable: !safeMode,
    })
  const toolPermissionContext =
    applyAgentPermissionMode(baseToolPermissionContext, {
      agentPermissionMode,
      safeMode,
    }) ?? baseToolPermissionContext

  const queryOptions: TaskToolQueryOptions = {
    safeMode,
    forkNumber,
    messageLogName,
    tools,
    commands: [],
    verbose,
    permissionMode: toolPermissionContext.mode,
    toolPermissionContext,
    commandAllowedTools: options.commandAllowedTools,
    maxThinkingTokens,
    model: modelToUse,
    mcpClients: options.mcpClients,
  }

  const prepared: PreparedTaskToolRun = {
    queryFn,
    agentId,
    effectivePrompt,
    systemPrompt,
    context,
    messagesForQuery,
    transcriptMessages,
    queryOptions,
    messageLogName,
    forkNumber,
    abortController: toolUseContext.abortController,
    readFileTimestamps: toolUseContext.readFileTimestamps,
    startTime,
  }

  if (input.run_in_background) {
    yield* callTaskToolBackground(input, prepared, {
      parentAgentId: toolUseContext.agentId,
      parentToolUseId: toolUseContext.toolUseId,
      subagentType: input.subagent_type,
      model: modelToUse,
    })
    return
  }

  const setToolJSXMaybe = (toolUseContext as any).setToolJSX as unknown
  const setToolJSX =
    typeof setToolJSXMaybe === 'function' ? (setToolJSXMaybe as any) : undefined

  for await (const chunk of callTaskToolForeground(input, prepared, {
    setToolJSX,
    backgroundMetadata: {
      parentAgentId: toolUseContext.agentId,
      parentToolUseId: toolUseContext.toolUseId,
      subagentType: input.subagent_type,
      model: modelToUse,
    },
  })) {
    if (chunk.type === 'result') {
      saveAgentTranscript(prepared.agentId, prepared.transcriptMessages)
    }
    yield chunk
  }
}
