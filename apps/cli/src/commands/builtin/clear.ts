import type { Command } from '../types'
import { getMessagesSetter } from '#core/messages'
import { getContext } from '#core/context'
import { getCodeStyle } from '#core/utils/style'
import { clearTerminal } from '#cli-utils/terminal'
import { getOriginalCwd, setCwd } from '#core/utils/state'
import { Message } from '#core/query'
import { resetReminderSession } from '#core/services/systemReminder'
import { resetFileFreshnessSession } from '#core/services/fileFreshness'

export async function clearConversation(context: {
  setForkConvoWithMessagesOnTheNextRender: (
    forkConvoWithMessages: Message[],
  ) => void
}) {
  await clearTerminal()
  getMessagesSetter()([])
  context.setForkConvoWithMessagesOnTheNextRender([])
  getContext.cache.clear?.()
  getCodeStyle.cache.clear?.()
  await setCwd(getOriginalCwd())

  // Reset reminder and file freshness sessions to clean up state
  resetReminderSession()
  resetFileFreshnessSession()
}

const clear = {
  type: 'local',
  name: 'clear',
  description: 'Clear conversation history and free up context',
  isEnabled: true,
  isHidden: false,
  async call(_, context) {
    clearConversation(context)
    return ''
  },
  userFacingName() {
    return 'clear'
  },
} satisfies Command

export default clear
