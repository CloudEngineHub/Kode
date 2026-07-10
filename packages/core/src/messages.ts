import type { Message } from './query'

type MessageState = Message[]
type MessageStateUpdater = MessageState | ((prev: MessageState) => MessageState)

/**
 * Controls whether a state replacement is also a visual transcript reset.
 *
 * Ink's Static output is append-only in the terminal scrollback. Context-only
 * transforms, such as automatic compaction, must update the model state
 * without remounting that output and moving the user's scrollback anchor.
 */
export type MessageStateUpdateOptions = {
  preserveTranscript?: boolean
}

export type MessageStateSetter = (
  update: MessageStateUpdater,
  options?: MessageStateUpdateOptions,
) => void

let getMessages: () => Message[] = () => []
let setMessages: MessageStateSetter = () => {}

export function setMessagesGetter(getter: () => Message[]) {
  getMessages = getter
}

export function getMessagesGetter(): () => Message[] {
  return getMessages
}

export function setMessagesSetter(setter: MessageStateSetter) {
  setMessages = setter
}

export function getMessagesSetter(): MessageStateSetter {
  return setMessages
}

// Global UI refresh mechanism for model configuration changes
let onModelConfigChange: (() => void) | null = null

export function setModelConfigChangeHandler(handler: () => void) {
  onModelConfigChange = handler
}

export function triggerModelConfigChange() {
  if (onModelConfigChange) {
    onModelConfigChange()
  }
}
