import type { ToolPermissionContextUpdate } from '#core/types/toolPermissionContext'

export type PermissionResult =
  | { result: true }
  | {
      result: false
      message: string
      shouldPromptUser?: boolean
      suggestions?: ToolPermissionContextUpdate[]
      /**
       * Optional path that drove the permission decision (e.g. file path / directory).
       * Used for permission UX explainers and structured-stdio prompts.
       */
      blockedPath?: string
      /**
       * Optional human-readable reason for why this permission prompt/deny occurred.
       * Keep this concise; UIs may render it inline.
       */
      decisionReason?: string
      /**
       * Optional risk score for UI labeling (0–100). Null/undefined means unknown.
       */
      riskScore?: number | null
    }
