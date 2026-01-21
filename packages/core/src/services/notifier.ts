import { getGlobalConfig } from '#core/utils/config'
import { addNotification } from '#core/services/notificationCenter'
import { spawn } from 'node:child_process'

export type NotificationOptions = {
  message: string
  title?: string
}

function isWSL(): boolean {
  return Boolean(
    process.env.WSL_DISTRO_NAME ||
    process.env.WSLENV ||
    process.env.WSL_INTEROP,
  )
}

function inWindowsTerminalSession(): boolean {
  return Boolean(process.env.WT_SESSION)
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

function escapeForXml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function encodeArgument(value: string): string {
  return Buffer.from(escapeForXml(value), 'utf8').toString('base64')
}

function encodeScriptForPowershell(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64')
}

function buildWindowsToastScript(
  encodedTitle: string,
  encodedBody: string,
): string {
  return `
$encoding = [System.Text.Encoding]::UTF8
$titleText = $encoding.GetString([System.Convert]::FromBase64String("${encodedTitle}"))
$bodyText = $encoding.GetString([System.Convert]::FromBase64String("${encodedBody}"))
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
$doc = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$textNodes = $doc.GetElementsByTagName("text")
$textNodes.Item(0).AppendChild($doc.CreateTextNode($titleText)) | Out-Null
$textNodes.Item(1).AppendChild($doc.CreateTextNode($bodyText)) | Out-Null
$toast = [Windows.UI.Notifications.ToastNotification]::new($doc)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Kode').Show($toast)
`
}

async function trySpawnPowershell(encodedCommand: string): Promise<boolean> {
  const candidates = ['powershell.exe', 'pwsh', 'powershell']

  for (const command of candidates) {
    const ok = await new Promise<boolean>(resolve => {
      const child = spawn(
        command,
        ['-NoProfile', '-NoLogo', '-EncodedCommand', encodedCommand],
        { stdio: 'ignore', windowsHide: true },
      )

      child.on('error', () => resolve(false))
      child.on('exit', code => resolve(code === 0))
    })

    if (ok) return true
  }

  return false
}

async function sendWindowsToastNotification(
  notif: NotificationOptions,
): Promise<boolean> {
  const title = notif.title?.trim() || 'Kode'
  const message = notif.message?.trim() || ''
  if (!message) return false

  const encodedTitle = encodeArgument(title)
  const encodedBody = encodeArgument(message)
  const script = buildWindowsToastScript(encodedTitle, encodedBody)
  const encodedCommand = encodeScriptForPowershell(script)

  return await trySpawnPowershell(encodedCommand)
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
      if (
        process.platform === 'win32' ||
        (isWSL() && inWindowsTerminalSession())
      ) {
        const ok = await sendWindowsToastNotification(notif)
        if (!ok) sendITerm2Notification(notif)
        break
      }

      sendITerm2Notification(notif)
      break
    case 'terminal_bell':
      sendTerminalBell()
      break
    case 'iterm2_with_bell':
      if (
        process.platform === 'win32' ||
        (isWSL() && inWindowsTerminalSession())
      ) {
        const ok = await sendWindowsToastNotification(notif)
        if (!ok) sendITerm2Notification(notif)
        sendTerminalBell()
        break
      }

      sendITerm2Notification(notif)
      sendTerminalBell()
      break
    case 'notifications_disabled':
      // Do nothing
      break
  }
}
