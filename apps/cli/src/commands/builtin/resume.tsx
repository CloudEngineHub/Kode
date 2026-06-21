import * as React from 'react'
import type { Command } from '../types'

import { execFileSync } from 'node:child_process'
import { resolve as resolvePath, sep } from 'node:path'
import { quote } from 'shell-quote'

import { PRODUCT_COMMAND } from '#core/constants/product'
import { getOriginalCwd } from '#core/utils/state'
import { ResumeSessionSelector } from '#ui-ink/components/ResumeSessionSelector'
import {
  listKodeAgentSessions,
  resolveResumeSessionIdentifier,
} from '#protocol/utils/kodeAgentSessionResume'
import { loadKodeAgentSessionMessagesForResume } from '#protocol/utils/kodeAgentSessionLoad'
import { setSessionId } from '#core/utils/sessionId'
import { setKodeAgentSessionForkInfo } from '#protocol/utils/kodeAgentSessionForkInfo'
import { copyTextToClipboard } from '#cli-utils/clipboard'
import { switchCwdForResume } from '#cli-utils/switchCwdForResume'

function getGitWorktreeRootsBestEffort(cwd: string): string[] {
  try {
    const stdout = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1000,
    })

    const roots: string[] = []
    for (const line of stdout.toString('utf8').split('\n')) {
      if (!line.startsWith('worktree ')) continue
      const path = line.slice('worktree '.length).trim()
      if (path) roots.push(path)
    }

    return Array.from(new Set(roots.map(p => resolvePath(p))))
  } catch {
    return []
  }
}

function isPathWithinRoot(path: string, root: string): boolean {
  const resolvedPath = resolvePath(path)
  const resolvedRoot = resolvePath(root)
  return (
    resolvedPath === resolvedRoot || resolvedPath.startsWith(resolvedRoot + sep)
  )
}

export default {
  type: 'local-jsx',
  name: 'resume',
  description: 'Resume a previous conversation',
  isEnabled: true,
  isHidden: false,
  ui: { displayMode: 'fullscreen' },
  argumentHint: '[session-id|slug|title|search]',
  userFacingName() {
    return 'resume'
  },
  async call(onDone, context, args) {
    const cwd = getOriginalCwd()
    const sessions = listKodeAgentSessions({ cwd })
    if (sessions.length === 0) {
      onDone('No conversation found to resume')
      return null
    }

    const rawArgs = (args ?? '').trim()
    if (rawArgs) {
      const resolved = resolveResumeSessionIdentifier({
        cwd,
        identifier: rawArgs,
      })

      if (resolved.kind === 'ok') {
        setKodeAgentSessionForkInfo(null)
        setSessionId(resolved.sessionId)
        const messages = loadKodeAgentSessionMessagesForResume({
          cwd,
          sessionId: resolved.sessionId,
        })
        context.setForkConvoWithMessagesOnTheNextRender(messages, {
          clearViewport: true,
          resetInput: true,
        })
        onDone()
        return null
      }

      if (resolved.kind === 'different_directory') {
        const otherCwd = resolved.otherCwd
        const command = otherCwd
          ? `cd ${quote([otherCwd])} && ${PRODUCT_COMMAND} --resume ${resolved.sessionId}`
          : `${PRODUCT_COMMAND} --resume ${resolved.sessionId}`

        if (otherCwd) {
          const worktreeRoots = getGitWorktreeRootsBestEffort(cwd)
          const isSameRepoWorktree = worktreeRoots.some(root =>
            isPathWithinRoot(otherCwd, root),
          )

          if (isSameRepoWorktree) {
            await switchCwdForResume(otherCwd)

            setKodeAgentSessionForkInfo(null)
            setSessionId(resolved.sessionId)
            const messages = loadKodeAgentSessionMessagesForResume({
              cwd: otherCwd,
              sessionId: resolved.sessionId,
            })
            context.setForkConvoWithMessagesOnTheNextRender(messages, {
              clearViewport: true,
              resetInput: true,
            })
            onDone()
            return null
          }
        }

        try {
          await copyTextToClipboard(command)
        } catch {
          // best-effort
        }
        onDone(
          otherCwd
            ? [
                'This conversation is from a different directory.',
                '',
                'To resume, run:',
                `  ${command}`,
                '',
                '(Command copied to clipboard)',
              ].join('\n')
            : `That session belongs to a different directory.`,
        )
        return null
      }
    }

    return (
      <ResumeSessionSelector
        cwd={cwd}
        sessions={sessions}
        initialQuery={rawArgs || undefined}
        onCancel={() => onDone()}
        onSelect={async session => {
          const effectiveCwd = session.cwd ?? cwd
          if (session.cwd && resolvePath(session.cwd) !== resolvePath(cwd)) {
            await switchCwdForResume(effectiveCwd)
          }

          setKodeAgentSessionForkInfo(null)
          setSessionId(session.sessionId)
          const messages = loadKodeAgentSessionMessagesForResume({
            cwd: effectiveCwd,
            sessionId: session.sessionId,
          })
          context.setForkConvoWithMessagesOnTheNextRender(messages, {
            clearViewport: true,
            resetInput: true,
          })
          onDone()
        }}
      />
    )
  },
} satisfies Command
