import type { Message } from './query'

type MessageState = Message[]
type MessageStateUpdater = MessageState | ((prev: MessageState) => MessageState)
type MessageStateSetter = (update: MessageStateUpdater) => void

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
