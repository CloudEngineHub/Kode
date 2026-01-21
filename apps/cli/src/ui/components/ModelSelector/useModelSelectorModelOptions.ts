import { useMemo } from 'react'
import models from '#core/constants/models'
import type { ModelInfo } from './flow/types'

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(0)}K`
  return num.toString()
}

function getModelDetails(model: ModelInfo): string {
  const details = []
  if (model.context_length) {
    details.push(`${formatNumber(model.context_length)} tokens`)
  } else if (model.max_tokens) {
    details.push(`${formatNumber(model.max_tokens)} tokens`)
  }
  if (model.supports_vision) details.push('vision')
  if (model.supports_function_calling) details.push('tools')
  return details.length > 0 ? ` (${details.join(', ')})` : ''
}

function sortModelsByPriority(models: ModelInfo[]) {
  const priorityKeywords = [
    'claude',
    'kimi',
    'deepseek',
    'minimax',
    'o3',
    'gpt',
    'qwen',
  ]

  return models.sort((a, b) => {
    const aModelLower = a.model?.toLowerCase() || ''
    const bModelLower = b.model?.toLowerCase() || ''

    const aHasPriority = priorityKeywords.some(keyword =>
      aModelLower.includes(keyword),
    )
    const bHasPriority = priorityKeywords.some(keyword =>
      bModelLower.includes(keyword),
    )

    if (aHasPriority && !bHasPriority) return -1
    if (!aHasPriority && bHasPriority) return 1

    return a.model.localeCompare(b.model)
  })
}

export function useModelSelectorModelOptions(args: {
  selectedProvider: string
  availableModels: ModelInfo[]
  modelSearchQuery: string
}) {
  const ourModelNames = useMemo(() => {
    return new Set(
      (models[args.selectedProvider as keyof typeof models] || []).map(
        (model: any) => model.model,
      ),
    )
  }, [args.selectedProvider])

  const filteredModels = useMemo(() => {
    return args.modelSearchQuery
      ? args.availableModels.filter(model =>
          model.model
            ?.toLowerCase()
            .includes(args.modelSearchQuery.toLowerCase()),
        )
      : args.availableModels
  }, [args.availableModels, args.modelSearchQuery])

  const sortedFilteredModels = useMemo(
    () => sortModelsByPriority([...filteredModels]),
    [filteredModels],
  )

  const modelOptions = useMemo(
    () =>
      sortedFilteredModels.map(model => {
        const _isInOurModels = ourModelNames.has(model.model)
        return {
          label: `${model.model}${getModelDetails(model)}`,
          value: model.model,
        }
      }),
    [ourModelNames, sortedFilteredModels],
  )

  return { modelOptions }
}
