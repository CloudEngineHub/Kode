import type {
  ModelPointerType,
  ModelProfile,
  ProviderType,
} from '#core/utils/config'

export type ModelSelectorProps = {
  onDone: () => void
  abortController?: AbortController
  targetPointer?: ModelPointerType
  isOnboarding?: boolean
  onCancel?: () => void
  skipModelType?: boolean
  initialModelProfile?: ModelProfile
  /** Start the setup flow at this provider's API-key screen. */
  initialProvider?: ProviderType
}
