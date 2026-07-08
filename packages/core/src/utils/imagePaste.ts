import { execFile, execFileSync } from 'child_process'
import { readFileSync, unlinkSync } from 'fs'
import { readFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'
import {
  detectImageMediaType,
  normalizeSupportedImageMediaType,
  type ClipboardImage,
  type SupportedImageMediaType,
} from '#core/utils/image/media'

const CLIPBOARD_MAX_BUFFER = 20 * 1024 * 1024
const execFileAsync = promisify(execFile)

export const CLIPBOARD_ERROR_MESSAGE =
  'No compatible image found in clipboard. Copy a PNG, JPEG, GIF, or WebP image; on Linux install wl-paste or xclip.'

const WINDOWS_CLIPBOARD_SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$files = [System.Windows.Forms.Clipboard]::GetFileDropList()
if ($files -and $files.Count -gt 0) {
  $path = [string]$files[0]
  if ([System.IO.File]::Exists($path)) {
    [Console]::Out.Write([Convert]::ToBase64String([System.IO.File]::ReadAllBytes($path)))
    exit 0
  }
}

$image = [System.Windows.Forms.Clipboard]::GetImage()
if ($null -eq $image) {
  exit 2
}

$stream = New-Object System.IO.MemoryStream
try {
  $image.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  [Console]::Out.Write([Convert]::ToBase64String($stream.ToArray()))
} finally {
  $stream.Dispose()
  $image.Dispose()
}
`

export function getImageFromClipboard(): ClipboardImage | null {
  switch (process.platform) {
    case 'darwin':
      return getImageFromMacClipboard()
    case 'win32':
      return getImageFromWindowsClipboard()
    case 'linux':
      return getImageFromLinuxClipboard()
    default:
      return null
  }
}

export async function getImageFromClipboardAsync(): Promise<ClipboardImage | null> {
  switch (process.platform) {
    case 'darwin':
      return getImageFromMacClipboardAsync()
    case 'win32':
      return getImageFromWindowsClipboardAsync()
    case 'linux':
      return getImageFromLinuxClipboardAsync()
    default:
      return null
  }
}

async function execFileText(
  command: string,
  args: string[],
  options: Record<string, unknown>,
): Promise<string> {
  const { stdout } = await execFileAsync(command, args, options as never)
  return typeof stdout === 'string' ? stdout : stdout.toString('utf8')
}

async function execFileBuffer(
  command: string,
  args: string[],
  options: Record<string, unknown>,
): Promise<Buffer> {
  const { stdout } = await execFileAsync(command, args, {
    ...options,
    encoding: 'buffer',
  } as never)
  return Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout)
}

function getImageFromMacClipboard(): ClipboardImage | null {
  const screenshotPath = join(
    tmpdir(),
    `kode-cli-clipboard-${process.pid}-${Date.now()}.png`,
  )

  try {
    execFileSync(
      'osascript',
      [
        '-e',
        'set png_data to (the clipboard as \u00abclass PNGf\u00bb)',
        '-e',
        `set fp to open for access POSIX file "${escapeAppleScriptString(
          screenshotPath,
        )}" with write permission`,
        '-e',
        'write png_data to fp',
        '-e',
        'close access fp',
      ],
      { stdio: 'ignore', timeout: 3000 },
    )

    const imageBuffer = readFileSync(screenshotPath)
    return imageFromBuffer(imageBuffer)
  } catch {
    return null
  } finally {
    try {
      unlinkSync(screenshotPath)
    } catch {}
  }
}

async function getImageFromMacClipboardAsync(): Promise<ClipboardImage | null> {
  const screenshotPath = join(
    tmpdir(),
    `kode-cli-clipboard-${process.pid}-${Date.now()}.png`,
  )

  try {
    await execFileAsync(
      'osascript',
      [
        '-e',
        'set png_data to (the clipboard as \u00abclass PNGf\u00bb)',
        '-e',
        `set fp to open for access POSIX file "${escapeAppleScriptString(
          screenshotPath,
        )}" with write permission`,
        '-e',
        'write png_data to fp',
        '-e',
        'close access fp',
      ],
      { stdio: 'ignore', timeout: 3000 } as never,
    )

    const imageBuffer = await readFile(screenshotPath)
    return imageFromBuffer(imageBuffer)
  } catch {
    return null
  } finally {
    try {
      await unlink(screenshotPath)
    } catch {}
  }
}

function getImageFromWindowsClipboard(): ClipboardImage | null {
  try {
    const output = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-STA',
        '-Command',
        WINDOWS_CLIPBOARD_SCRIPT,
      ],
      {
        encoding: 'utf8',
        maxBuffer: CLIPBOARD_MAX_BUFFER,
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 5000,
      },
    ).trim()

    if (!output) {
      return null
    }

    return imageFromBuffer(Buffer.from(output, 'base64'))
  } catch {
    return null
  }
}

async function getImageFromWindowsClipboardAsync(): Promise<ClipboardImage | null> {
  try {
    const output = (
      await execFileText(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-STA',
          '-Command',
          WINDOWS_CLIPBOARD_SCRIPT,
        ],
        {
          encoding: 'utf8',
          maxBuffer: CLIPBOARD_MAX_BUFFER,
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: 5000,
        },
      )
    ).trim()

    if (!output) {
      return null
    }

    return imageFromBuffer(Buffer.from(output, 'base64'))
  } catch {
    return null
  }
}

function getImageFromLinuxClipboard(): ClipboardImage | null {
  return getImageFromWlPaste() ?? getImageFromXclip()
}

async function getImageFromLinuxClipboardAsync(): Promise<ClipboardImage | null> {
  return (await getImageFromWlPasteAsync()) ?? (await getImageFromXclipAsync())
}

function getImageFromWlPaste(): ClipboardImage | null {
  try {
    const types = execFileSync('wl-paste', ['--list-types'], {
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split(/\r?\n/)
      .filter(Boolean)

    const picked = pickClipboardMimeType(types)
    if (!picked) {
      return null
    }

    const buffer = execFileSync(
      'wl-paste',
      ['--no-newline', '--type', picked.target],
      {
        maxBuffer: CLIPBOARD_MAX_BUFFER,
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    )
    return imageFromBuffer(buffer)
  } catch {
    return null
  }
}

async function getImageFromWlPasteAsync(): Promise<ClipboardImage | null> {
  try {
    const types = (
      await execFileText('wl-paste', ['--list-types'], {
        encoding: 'utf8',
        timeout: 3000,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
    )
      .split(/\r?\n/)
      .filter(Boolean)

    const picked = pickClipboardMimeType(types)
    if (!picked) {
      return null
    }

    const buffer = await execFileBuffer(
      'wl-paste',
      ['--no-newline', '--type', picked.target],
      {
        maxBuffer: CLIPBOARD_MAX_BUFFER,
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    )
    return imageFromBuffer(buffer)
  } catch {
    return null
  }
}

function getImageFromXclip(): ClipboardImage | null {
  try {
    const targets = execFileSync(
      'xclip',
      ['-selection', 'clipboard', '-t', 'TARGETS', '-o'],
      {
        encoding: 'utf8',
        timeout: 3000,
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    )
      .split(/\r?\n/)
      .filter(Boolean)

    const picked = pickClipboardMimeType(targets)
    if (!picked) {
      return null
    }

    const buffer = execFileSync(
      'xclip',
      ['-selection', 'clipboard', '-t', picked.target, '-o'],
      {
        maxBuffer: CLIPBOARD_MAX_BUFFER,
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    )
    return imageFromBuffer(buffer)
  } catch {
    return null
  }
}

async function getImageFromXclipAsync(): Promise<ClipboardImage | null> {
  try {
    const targets = (
      await execFileText(
        'xclip',
        ['-selection', 'clipboard', '-t', 'TARGETS', '-o'],
        {
          encoding: 'utf8',
          timeout: 3000,
          stdio: ['ignore', 'pipe', 'ignore'],
        },
      )
    )
      .split(/\r?\n/)
      .filter(Boolean)

    const picked = pickClipboardMimeType(targets)
    if (!picked) {
      return null
    }

    const buffer = await execFileBuffer(
      'xclip',
      ['-selection', 'clipboard', '-t', picked.target, '-o'],
      {
        maxBuffer: CLIPBOARD_MAX_BUFFER,
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    )
    return imageFromBuffer(buffer)
  } catch {
    return null
  }
}

function imageFromBuffer(buffer: Buffer): ClipboardImage | null {
  const mediaType = detectImageMediaType(buffer)
  if (!mediaType) {
    return null
  }

  return {
    data: buffer.toString('base64'),
    mediaType,
  }
}

function pickClipboardMimeType(
  types: string[],
): { target: string; mediaType: SupportedImageMediaType } | null {
  for (const target of types) {
    const mediaType = normalizeSupportedImageMediaType(target)
    if (mediaType) {
      return { target, mediaType }
    }
  }
  return null
}

function escapeAppleScriptString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}
