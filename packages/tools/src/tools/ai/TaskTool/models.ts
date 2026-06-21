import type { TaskModel } from './schema'

export type ModelPointer = 'quick' | 'task' | 'main'

export function modelEnumToPointer(
  model?: TaskModel,
): ModelPointer | undefined {
  if (!model) return undefined
  switch (model) {
    case 'haiku':
      return 'quick'
    case 'sonnet':
      return 'task'
    case 'opus':
      return 'main'
  }
}

export function normalizeAgentModelName(
  model?: string,
): string | 'inherit' | ModelPointer | undefined {
  if (!model) return undefined
  if (model === 'inherit') return 'inherit'
  if (model === 'haiku' || model === 'sonnet' || model === 'opus') {
    return modelEnumToPointer(model)
  }
  return model
}
