import type { ToolPermissionContextUpdate } from '#core/types/toolPermissionContext'

export type DecisionReason =
  | { type: 'rule'; rule: string }
  | { type: 'other'; reason: string }
  | { type: 'subcommandResults'; reasons: Map<string, BashPermissionDecision> }

export type BashPermissionDecision =
  | {
      behavior: 'allow'
      updatedInput: { command: string }
      decisionReason?: DecisionReason
    }
  | {
      behavior: 'deny' | 'ask' | 'passthrough'
      message: string
      decisionReason?: DecisionReason
      blockedPath?: string
      suggestions?: ToolPermissionContextUpdate[]
    }

export type BashPermissionResult =
  | { result: true }
  | {
      result: false
      message: string
      shouldPromptUser?: boolean
      suggestions?: ToolPermissionContextUpdate[]
      blockedPath?: string
      decisionReason?: string
    }

export type Redirection = { target: string; operator: '>' | '>>' }

export type RedirectionParseResult = {
  commandWithoutRedirections: string
  redirections: Redirection[]
}

export type BashPathOp = 'read' | 'write' | 'create'

export type XiDecision =
  | { behavior: 'passthrough'; message: string }
  | { behavior: 'ask'; message: string }
