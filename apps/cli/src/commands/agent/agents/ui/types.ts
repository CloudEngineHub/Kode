import type { AgentConfig, AgentSource } from '#core/utils/agentLoader'

export type AgentSourceFilter =
  | 'all'
  | 'built-in'
  | 'userSettings'
  | 'projectSettings'
  | 'policySettings'
  | 'flagSettings'
  | 'plugin'

export type AgentWithOverride = AgentConfig & { overriddenBy?: AgentSource }

export const DEFAULT_AGENT_MODEL = 'sonnet'

export const COLOR_OPTIONS = [
  'automatic',
  'red',
  'blue',
  'green',
  'yellow',
  'purple',
  'orange',
  'pink',
  'cyan',
] as const

export type AgentColor = (typeof COLOR_OPTIONS)[number]

export type ModeState =
  | { mode: 'list-agents'; source: AgentSourceFilter }
  | {
      mode: 'create-agent'
      previousMode: { mode: 'list-agents'; source: AgentSourceFilter }
    }
  | {
      mode: 'agent-menu'
      agent: AgentWithOverride
      previousMode: { mode: 'list-agents'; source: AgentSourceFilter }
    }
  | {
      mode: 'view-agent'
      agent: AgentWithOverride
      previousMode: {
        mode: 'agent-menu'
        agent: AgentWithOverride
        previousMode: { mode: 'list-agents'; source: AgentSourceFilter }
      }
    }
  | {
      mode: 'edit-agent'
      agent: AgentWithOverride
      previousMode: {
        mode: 'agent-menu'
        agent: AgentWithOverride
        previousMode: { mode: 'list-agents'; source: AgentSourceFilter }
      }
    }
  | {
      mode: 'delete-confirm'
      agent: AgentWithOverride
      previousMode: {
        mode: 'agent-menu'
        agent: AgentWithOverride
        previousMode: { mode: 'list-agents'; source: AgentSourceFilter }
      }
    }
