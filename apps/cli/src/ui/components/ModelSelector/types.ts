import type { ModelPointerType } from '#core/utils/config'

export type ModelSelectorProps = {
  onDone: () => void
  abortController?: AbortController
  targetPointer?: ModelPointerType
  isOnboarding?: boolean
  onCancel?: () => void
  skipModelType?: boolean
}
