import { getGlobalConfig } from '#core/utils/config'
import { addNotification } from '#core/services/notificationCenter'

export type NotificationOptions = {
  message: string
  title?: string
}

function writeControlSequence(sequence: string): void {
  try {
    const originalWrite = (globalThis as any).__KODE_ORIGINAL_STDOUT_WRITE__ as
      | ((chunk: Uint8Array | string) => boolean)
      | undefined
    if (typeof originalWrite === 'function') {
      originalWrite(sequence)
      return
    }
  } catch {
    // ignore
  }

  try {
    process.stdout.write(sequence)
  } catch {
    // ignore
  }
}

function sendITerm2Notification({ message, title }: NotificationOptions): void {
  const displayString = title ? `${title}:\n${message}` : message
  try {
    writeControlSequence(`\x1b]9;\n\n${displayString}\x07`)
  } catch {
    // Ignore errors
  }
}

function sendTerminalBell(): void {
  writeControlSequence('\x07')
}

export async function sendNotification(
  notif: NotificationOptions,
): Promise<void> {
  const channel = getGlobalConfig().preferredNotifChannel
  if (channel !== 'notifications_disabled') {
    addNotification({
      title: notif.title,
      message: notif.message,
      source: 'desktop',
      channel,
    })
  }
  switch (channel) {
    case 'iterm2':
      sendITerm2Notification(notif)
      break
    case 'terminal_bell':
      sendTerminalBell()
      break
    case 'iterm2_with_bell':
      sendITerm2Notification(notif)
      sendTerminalBell()
      break
    case 'notifications_disabled':
      // Do nothing
      break
  }
}
