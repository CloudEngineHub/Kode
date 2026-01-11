import * as React from 'react'
import type { Command } from '../types'
import { ResumeConversation } from '#ui-ink/screens/ResumeConversation'
import { render } from 'ink'
import { renderWithTuiStdio } from '#ui-ink/utils/inkRender'
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
    const inkContext: { unmount?: () => void } = {}
    const instance = renderWithTuiStdio(
      render,
      <ResumeConversation
        cwd={cwd}
        commands={commands}
        context={inkContext}
        sessions={sessions}
        tools={tools}
        verbose={verbose}
      />,
      { exitOnCtrlC: false },
    )
    inkContext.unmount = instance.unmount
    // This return is here for type only
    return null
  },
} satisfies Command
