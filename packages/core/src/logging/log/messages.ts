import { dirname } from 'path'
import { MACRO } from '#core/constants/macros'
import { getPlanSlugForConversationKey } from '#core/utils/planMode'

import { safeMkdir, safeWriteFile } from './filesystem'
import { SESSION_ID } from './paths'

export function overwriteLog(
  path: string,
  messages: object[],
  options?: { conversationKey?: string },
): void {
  if (process.env.USER_TYPE === 'external') {
    return
  }

  if (!messages.length) {
    return
  }

  const dir = dirname(path)
  if (!safeMkdir(dir)) {
    return
  }

  const slug = options?.conversationKey
    ? getPlanSlugForConversationKey(options.conversationKey)
    : null

  const messagesWithMetadata = messages.map(message => ({
    ...message,
    ...(slug ? { slug } : {}),
    cwd: process.cwd(),
    userType: process.env.USER_TYPE,
    sessionId: SESSION_ID,
    timestamp: new Date().toISOString(),
    version: MACRO.VERSION,
  }))

  safeWriteFile(path, JSON.stringify(messagesWithMetadata, null, 2))
}
