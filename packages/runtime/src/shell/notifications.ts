import { getTaskOutputFilePath } from '../taskOutputStore'
import type { BackgroundShellStatusAttachment, BashNotification } from './types'

export function renderBackgroundShellStatusAttachment(
  attachment: BackgroundShellStatusAttachment,
): string {
  const parts: string[] = []
  if (attachment.stdoutLineDelta > 0) {
    const n = attachment.stdoutLineDelta
    parts.push(`${n} line${n > 1 ? 's' : ''} of stdout`)
  }
  if (attachment.stderrLineDelta > 0) {
    const n = attachment.stderrLineDelta
    parts.push(`${n} line${n > 1 ? 's' : ''} of stderr`)
  }
  if (parts.length === 0) return ''
  return `Background bash ${attachment.taskId} has new output: ${parts.join(', ')}. Read ${attachment.outputFile} to see output.`
}

// Transcript compatibility: `task-notification` payload for background task completion.
export function renderBashNotification(notification: BashNotification): string {
  const status = notification.status
  const exitCode = notification.exitCode
  const taskType = notification.taskType ?? 'local_bash'

  const summarySuffix =
    status === 'completed'
      ? `completed${exitCode !== undefined ? ` (exit code ${exitCode})` : ''}`
      : status === 'failed'
        ? `failed${exitCode !== undefined ? ` with exit code ${exitCode}` : ''}`
        : 'was killed'

  const outputFile =
    notification.outputFile || getTaskOutputFilePath(notification.taskId)

  return [
    '<task-notification>',
    `<task-id>${notification.taskId}</task-id>`,
    `<task-type>${taskType}</task-type>`,
    `<output-file>${outputFile}</output-file>`,
    `<status>${status}</status>`,
    `<summary>Background command "${notification.description}" ${summarySuffix}</summary>`,
    '</task-notification>',
    `Read the output file to retrieve the result: ${outputFile}`,
  ].join('\n')
}
