import type { ModelPointerType, ModelProfile } from '#config'

export interface ModelConfig {
  bedrock: string
  vertex: string
  firstParty: string
}

export type SwitchWithContextCheckResult = {
  success: boolean
  modelName: string | null
  previousModelName: string | null
  contextOverflow: boolean
  usagePercentage: number
  currentContextTokens: number
  skippedModels?: Array<{
    name: string
    provider: string
    contextLength: number
    budgetTokens: number | null
    usagePercentage: number
  }>
}

export type SwitchResult = {
  success: boolean
  modelName: string | null
  blocked?: boolean
  message?: string
}

export type ContextCompatibility = {
  compatible: boolean
  severity: 'safe' | 'warning' | 'critical'
  usagePercentage: number
  recommendation: string
}

export type SwitchWithAnalysisResult = {
  modelName: string | null
  contextAnalysis: ContextCompatibility | null
  requiresCompression: boolean
  estimatedTokensAfterSwitch: number
}

export type ResolvedModelInfo = {
  success: boolean
  profile: ModelProfile | null
  error?: string
}

export type ModelParam = string | ModelPointerType
