import type { ModelProfile } from '#config'

import type { SwitchResult, SwitchWithContextCheckResult } from './types'

function budgetForModel(
  model: ModelProfile,
  currentContextTokens: number,
): {
  budgetTokens: number | null
  usagePercentage: number
  compatible: boolean
} {
  const contextLength = Number(model.contextLength)
  if (!Number.isFinite(contextLength) || contextLength <= 0) {
    return { budgetTokens: null, usagePercentage: 0, compatible: true }
  }
  const budgetTokens = Math.floor(contextLength * 0.9)
  const usagePercentage =
    budgetTokens > 0 ? (currentContextTokens / budgetTokens) * 100 : 0
  return {
    budgetTokens,
    usagePercentage,
    compatible: budgetTokens > 0 ? currentContextTokens <= budgetTokens : true,
  }
}

function formatTokens(tokens: number): string {
  if (!Number.isFinite(tokens)) return 'unknown'
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}k`
  return String(Math.round(tokens))
}

export function chooseNextModelWithContextCheck(args: {
  modelProfiles: ModelProfile[]
  currentMainModelName: string | undefined
  currentContextTokens: number
}): { selected: ModelProfile | null; result: SwitchWithContextCheckResult } {
  const allProfiles = [...args.modelProfiles]
  const currentContextTokens = args.currentContextTokens

  if (allProfiles.length === 0) {
    return {
      selected: null,
      result: {
        success: false,
        modelName: null,
        previousModelName: null,
        contextOverflow: false,
        usagePercentage: 0,
        currentContextTokens,
      },
    }
  }

  allProfiles.sort((a, b) => a.createdAt - b.createdAt)

  const currentModel = args.currentMainModelName
    ? (allProfiles.find(p => p.modelName === args.currentMainModelName) ?? null)
    : null
  const previousModelName = currentModel?.name || null

  if (allProfiles.length === 1) {
    return {
      selected: null,
      result: {
        success: false,
        modelName: null,
        previousModelName,
        contextOverflow: false,
        usagePercentage: 0,
        currentContextTokens,
      },
    }
  }

  const currentIndex =
    args.currentMainModelName !== undefined
      ? allProfiles.findIndex(p => p.modelName === args.currentMainModelName)
      : -1
  const startIndex = currentIndex >= 0 ? currentIndex : -1
  const maxOffsets =
    startIndex === -1 ? allProfiles.length : allProfiles.length - 1

  const skippedModels: NonNullable<
    SwitchWithContextCheckResult['skippedModels']
  > = []

  let selected: ModelProfile | null = null
  let selectedUsagePercentage = 0

  for (let offset = 1; offset <= maxOffsets; offset++) {
    const candidateIndex =
      (startIndex + offset + allProfiles.length) % allProfiles.length
    const candidate = allProfiles[candidateIndex]
    if (!candidate) continue

    const { budgetTokens, usagePercentage, compatible } = budgetForModel(
      candidate,
      currentContextTokens,
    )
    if (compatible) {
      selected = candidate
      selectedUsagePercentage = usagePercentage
      break
    }
    skippedModels.push({
      name: candidate.name,
      provider: candidate.provider,
      contextLength: candidate.contextLength,
      budgetTokens,
      usagePercentage,
    })
  }

  if (!selected) {
    const firstSkipped = skippedModels[0]
    return {
      selected: null,
      result: {
        success: false,
        modelName: null,
        previousModelName,
        contextOverflow: true,
        usagePercentage: firstSkipped?.usagePercentage ?? 0,
        currentContextTokens,
        skippedModels,
      },
    }
  }

  return {
    selected,
    result: {
      success: true,
      modelName: selected.name,
      previousModelName,
      contextOverflow: false,
      usagePercentage: selectedUsagePercentage,
      currentContextTokens,
      skippedModels,
    },
  }
}

export function formatSwitchResult(args: {
  detailed: SwitchWithContextCheckResult
  modelProfiles: ModelProfile[]
  currentMainModelName: string | undefined
}): SwitchResult {
  const result = args.detailed
  const allModels = args.modelProfiles

  if (allModels.length === 0) {
    return {
      success: false,
      modelName: null,
      blocked: false,
      message: 'No models configured. Use /model to add models.',
    }
  }

  if (allModels.length === 1) {
    return {
      success: false,
      modelName: null,
      blocked: false,
      message: `Only one model configured (${allModels[0].modelName}). Use /model to add more models for switching.`,
    }
  }

  const currentModel = args.currentMainModelName
    ? (allModels.find(p => p.modelName === args.currentMainModelName) ?? null)
    : null

  const modelsSorted = [...allModels].sort((a, b) => a.createdAt - b.createdAt)
  const currentIndex = modelsSorted.findIndex(
    m => m.modelName === currentModel?.modelName,
  )
  const totalModels = modelsSorted.length

  if (result.success && result.modelName) {
    const skippedCount = result.skippedModels?.length ?? 0
    const skippedSuffix =
      skippedCount > 0 ? ` · skipped ${skippedCount} incompatible` : ''
    const contextSuffix =
      currentModel?.contextLength && result.currentContextTokens
        ? ` · context ~${formatTokens(result.currentContextTokens)}/${formatTokens(currentModel.contextLength)}`
        : ''

    return {
      success: true,
      modelName: result.modelName,
      blocked: false,
      message: `Switched to ${result.modelName} (${currentIndex + 1}/${totalModels})${currentModel?.provider ? ` [${currentModel.provider}]` : ''}${skippedSuffix}${contextSuffix}`,
    }
  }

  if (result.contextOverflow) {
    const attempted = result.skippedModels?.[0]
    const attemptedContext = attempted?.contextLength
    const attemptedBudget = attempted?.budgetTokens
    const currentLabel =
      currentModel?.name || currentModel?.modelName || 'current model'

    const attemptedText = attempted
      ? `Can't switch to ${attempted.name}: current ~${formatTokens(result.currentContextTokens)} tokens exceeds safe budget (~${formatTokens(attemptedBudget ?? 0)} tokens, 90% of ${formatTokens(attemptedContext ?? 0)}).`
      : `Can't switch models due to context size (~${formatTokens(result.currentContextTokens)} tokens).`

    return {
      success: false,
      modelName: null,
      blocked: true,
      message: `${attemptedText} Keeping ${currentLabel}.`,
    }
  }

  return {
    success: false,
    modelName: null,
    blocked: false,
    message: 'Failed to switch models',
  }
}
