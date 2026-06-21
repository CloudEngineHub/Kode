import { execFileNoThrow } from './execFileNoThrow'

const BROWSER_OPEN_TIMEOUT_MS = 10_000

type BrowserCommand = {
  file: string
  args: string[]
}

function getOpenBrowserCommand(
  url: string,
  platform: NodeJS.Platform = process.platform,
): BrowserCommand {
  if (platform === 'win32') {
    return { file: 'rundll32.exe', args: ['url.dll,FileProtocolHandler', url] }
  }

  if (platform === 'darwin') {
    return { file: 'open', args: [url] }
  }

  return { file: 'xdg-open', args: [url] }
}

export const __getOpenBrowserCommandForTests = getOpenBrowserCommand

export async function openBrowser(url: string): Promise<boolean> {
  const command = getOpenBrowserCommand(url)

  try {
    const { code } = await execFileNoThrow(
      command.file,
      command.args,
      undefined,
      BROWSER_OPEN_TIMEOUT_MS,
      false,
    )
    return code === 0
  } catch (_) {
    return false
  }
}
