export type ChatProvider = {
  readonly id: string
}

export function createChatProvider(): ChatProvider {
  return { id: 'kode.chat' }
}
