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

// Compatibility: bash-notification payload.
export function renderBashNotification(notification: BashNotification): string {
  const status = notification.status
  const exitCode = notification.exitCode

  const summarySuffix =
    status === 'completed'
      ? `completed${exitCode !== undefined ? ` (exit code ${exitCode})` : ''}`
      : status === 'failed'
        ? `failed${exitCode !== undefined ? ` with exit code ${exitCode}` : ''}`
        : 'was killed'

  return [
    '<bash-notification>',
    `<shell-id>${notification.taskId}</shell-id>`,
    `<output-file>${notification.outputFile || getTaskOutputFilePath(notification.taskId)}</output-file>`,
    `<status>${status}</status>`,
    `<summary>Background command "${notification.description}" ${summarySuffix}.</summary>`,
    'Read the output file to retrieve the output.',
    '</bash-notification>',
  ].join('\n')
}
