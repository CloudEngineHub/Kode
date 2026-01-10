import * as React from 'react'
import type { Command } from '../types'
import { ResumeConversation } from '#ui-ink/screens/ResumeConversation'
import { render } from 'ink'
import { listKodeAgentSessions } from '#protocol/utils/kodeAgentSessionResume'

export default {
  type: 'local-jsx',
  name: 'resume',
  description: 'Resume a previous conversation',
  isEnabled: true,
  isHidden: false,
  userFacingName() {
    return 'resume'
  },
  async call(onDone, context) {
    const { commands = [], tools = [], verbose = false } = context.options || {}
    const cwd = process.cwd()
    const sessions = listKodeAgentSessions({ cwd })
    if (sessions.length === 0) {
      onDone('No conversation found to resume')
      return null
    }
    render(
      <ResumeConversation
        cwd={cwd}
        commands={commands}
        context={{ unmount: onDone }}
        sessions={sessions}
        tools={tools}
        verbose={verbose}
      />,
    )
    // This return is here for type only
    return null
  },
} satisfies Command
