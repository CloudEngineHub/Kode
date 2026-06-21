import type { Tool } from '#core/tooling/Tool'
import { getAvailableAgentTypes } from '#core/utils/agentLoader'
import { getAgentTranscript } from '#core/utils/agentTranscripts'
import { getCwd } from '#core/utils/state'
import { getKodeAgentSessionId } from '#protocol/utils/kodeAgentSessionId'
import { loadKodeAgentSidechainMessagesForResume } from '#protocol/utils/kodeAgentSessionLoad'

import { TOOL_NAME } from './constants'
import { getPrompt } from './prompt'
import { callTaskTool } from './call'
import { inputSchema, type Input, type Output } from './schema'
import {
  renderTaskToolResultForAssistant,
  renderTaskToolResultMessage,
  renderTaskToolUseMessage,
} from './render'

export const TaskTool = {
  name: TOOL_NAME,
  inputSchema,
  async description() {
    return 'Launch a new task'
  },
  async prompt({ safeMode }: { safeMode?: boolean }) {
    return await getPrompt(safeMode)
  },
  userFacingName(input?: Partial<Input>) {
    if (input?.subagent_type && input.subagent_type !== 'general-purpose') {
      return input.subagent_type
    }
    return 'Task'
  },
  async isEnabled() {
    return true
  },
  isReadOnly() {
    return true
  },
  isConcurrencySafe() {
    return true
  },
  needsPermissions() {
    return false
  },
  async validateInput(input: Input) {
    if (!input.description || typeof input.description !== 'string') {
      return {
        result: false,
        message: 'Description is required and must be a string',
      }
    }
    if (!input.prompt || typeof input.prompt !== 'string') {
      return {
        result: false,
        message: 'Prompt is required and must be a string',
      }
    }

    const availableTypes = await getAvailableAgentTypes()
    if (!availableTypes.includes(input.subagent_type)) {
      return {
        result: false,
        message: `Agent type '${input.subagent_type}' not found. Available agents: ${availableTypes.join(', ')}`,
        meta: { subagent_type: input.subagent_type, availableTypes },
      }
    }

    if (input.resume) {
      const transcript = getAgentTranscript(input.resume)
      if (!transcript) {
        try {
          const disk = loadKodeAgentSidechainMessagesForResume({
            cwd: getCwd(),
            sessionId: getKodeAgentSessionId(),
            agentId: input.resume,
          })
          if (disk.length === 0) {
            return {
              result: false,
              message: `No transcript found for agent ID: ${input.resume}`,
              meta: { resume: input.resume },
            }
          }
        } catch {
          return {
            result: false,
            message: `No transcript found for agent ID: ${input.resume}`,
            meta: { resume: input.resume },
          }
        }
      }
    }

    return { result: true }
  },
  renderToolUseMessage: renderTaskToolUseMessage,
  renderToolResultMessage: renderTaskToolResultMessage,
  renderResultForAssistant: renderTaskToolResultForAssistant,
  call: callTaskTool,
} satisfies Tool<typeof inputSchema, Output>
