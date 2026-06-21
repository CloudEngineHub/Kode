import type { ModelPointerType, ModelProfile } from '#core/utils/config'

export type ModelSelectorProps = {
  onDone: () => void
  abortController?: AbortController
  targetPointer?: ModelPointerType
  isOnboarding?: boolean
  onCancel?: () => void
  skipModelType?: boolean
  initialModelProfile?: ModelProfile
}
