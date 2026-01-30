import { spawn, spawnSync } from 'child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  disableLineWrapping,
  enableLineWrapping,
  withEphemeralAlternateScreen,
} from '#cli-utils/terminal'
import { writeToStdout } from '#cli-utils/stdio'
import { getInkInstanceForStdout } from '#ui-ink/utils/inkInstanceStore'
import { terminalCapabilityManager } from '#ui-ink/utils/terminalCapabilityManager'

type EditorCommand = {
  command: string
  args: string[]
  displayName: string
  shell?: boolean
}

const isWindows = process.platform === 'win32'

function showTerminalCursor(): void {
  if (!process.stdout?.isTTY) return
  // Reset styles + show cursor for full-screen editors.
  writeToStdout('\x1b[0m\x1b[?25h')
}

function hideTerminalCursor(): void {
  if (!process.stdout?.isTTY) return
  writeToStdout('\x1b[?25l')
}

async function withSuspendedInk<T>(fn: () => Promise<T> | T): Promise<T> {
  const stdout = process.stdout as NodeJS.WriteStream
  const instance = getInkInstanceForStdout(stdout)
  const hasInk = Boolean(instance)
  const screenReaderEnv =
    process.env.KODE_SCREEN_READER ?? process.env.SCREENREADER

  try {
    instance?.pause?.()
    instance?.suspendStdin?.()
    terminalCapabilityManager.disableAllModes()
    enableLineWrapping()
    showTerminalCursor()
    return await withEphemeralAlternateScreen(fn)
  } finally {
    if (hasInk) {
      hideTerminalCursor()
      if (!screenReaderEnv) {
        disableLineWrapping()
      }
    }
    terminalCapabilityManager.enableSupportedModes()
    instance?.resumeStdin?.()
    instance?.resume?.()
  }
}

function isCommandAvailable(command: string): boolean {
  const checker = isWindows ? 'where' : 'which'
  const result = spawnSync(checker, [command], { stdio: 'ignore' })
  return result.status === 0
}

function resolveEditorCommand(): EditorCommand | null {
  const envEditor = process.env.VISUAL || process.env.EDITOR
  if (envEditor?.trim()) {
    return {
      command: envEditor.trim(),
      args: [],
      displayName: envEditor.trim(),
      shell: true, // Allow quoted paths or extra flags
    }
  }

  const candidates: EditorCommand[] = []

  if (isCommandAvailable('code')) {
    candidates.push({
      command: 'code',
      args: ['-w'],
      displayName: 'code -w',
      shell: isWindows, // Windows needs shell for code.cmd
    })
  }

  if (!isWindows) {
    if (isCommandAvailable('nano')) {
      candidates.push({
        command: 'nano',
        args: [],
        displayName: 'nano',
      })
    }
    if (isCommandAvailable('vim')) {
      candidates.push({
        command: 'vim',
        args: [],
        displayName: 'vim',
      })
    }
    if (isCommandAvailable('open')) {
      candidates.push({
        command: 'open',
        args: ['-W', '-t'],
        displayName: 'open -W -t',
      })
    }
  } else {
    // Windows: check for VS Code first, then fallback to notepad
    if (candidates.length > 0) {
      const found = candidates.find(c => isCommandAvailable(c.command))
      if (found) return found
    }
    // notepad is always available on Windows
    return {
      command: 'notepad.exe',
      args: [],
      displayName: 'notepad',
      shell: true,
    }
  }

  return (
    candidates.find(candidate => isCommandAvailable(candidate.command)) ?? null
  )
}

export function getExternalEditorLabel(): string | null {
  return resolveEditorCommand()?.displayName ?? null
}

function restoreStdinState(previouslyRaw: boolean): void {
  if (!process.stdin.isTTY) return
  process.stdin.resume()
  if (previouslyRaw && process.stdin.setRawMode) {
    process.stdin.setRawMode(true)
  }
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n')
}

export type ExternalEditorResult =
  | { text: string; editorLabel: string }
  | { text: null; editorLabel?: string; error: Error }

export async function launchExternalEditor(
  initialText: string,
): Promise<ExternalEditorResult> {
  const editorCommand = resolveEditorCommand()
  if (!editorCommand) {
    return {
      text: null,
      error: new Error(
        'No editor found. Set $VISUAL or $EDITOR, or install code, nano, vim, or notepad.',
      ),
    }
  }

  const dir = mkdtempSync(join(tmpdir(), 'kode-edit-'))
  const filePath = join(dir, 'message.txt')
  writeFileSync(filePath, initialText, 'utf-8')

  const wasRaw = Boolean(process.stdin.isTTY && process.stdin.isRaw)
  if (process.stdin.isTTY) {
    process.stdin.pause()
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(false)
    }
  }

  try {
    await withSuspendedInk(async () => {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          editorCommand.command,
          [...editorCommand.args, filePath],
          {
            stdio: 'inherit',
            shell: editorCommand.shell ?? false,
          },
        )

        child.on('error', reject)
        child.on('exit', (code, signal) => {
          if (code === 0 || code === null) {
            resolve()
          } else {
            reject(
              new Error(
                `Editor exited with code ${code}${signal ? ` (signal ${signal})` : ''}`,
              ),
            )
          }
        })
      })
    })
  } catch (error) {
    restoreStdinState(wasRaw)
    rmSync(dir, { recursive: true, force: true })
    return {
      text: null,
      editorLabel: editorCommand.displayName,
      error: error as Error,
    }
  }

  restoreStdinState(wasRaw)

  try {
    const edited = normalizeNewlines(readFileSync(filePath, 'utf-8'))
    rmSync(dir, { recursive: true, force: true })
    return { text: edited, editorLabel: editorCommand.displayName }
  } catch (error) {
    rmSync(dir, { recursive: true, force: true })
    return {
      text: null,
      editorLabel: editorCommand.displayName,
      error: error as Error,
    }
  }
}

export type ExternalEditorFileResult =
  | { ok: true; editorLabel: string }
  | { ok: false; editorLabel?: string; error: Error }

export async function launchExternalEditorForFilePath(
  filePath: string,
): Promise<ExternalEditorFileResult> {
  const editorCommand = resolveEditorCommand()
  if (!editorCommand) {
    return {
      ok: false,
      error: new Error(
        'No editor found. Set $VISUAL or $EDITOR, or install code, nano, vim, or notepad.',
      ),
    }
  }

  const wasRaw = Boolean(process.stdin.isTTY && process.stdin.isRaw)
  if (process.stdin.isTTY) {
    process.stdin.pause()
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(false)
    }
  }

  try {
    await withSuspendedInk(async () => {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          editorCommand.command,
          [...editorCommand.args, filePath],
          {
            stdio: 'inherit',
            shell: editorCommand.shell ?? false,
          },
        )

        child.on('error', reject)
        child.on('exit', (code, signal) => {
          if (code === 0 || code === null) {
            resolve()
          } else {
            reject(
              new Error(
                `Editor exited with code ${code}${signal ? ` (signal ${signal})` : ''}`,
              ),
            )
          }
        })
      })
    })
  } catch (error) {
    restoreStdinState(wasRaw)
    return {
      ok: false,
      editorLabel: editorCommand.displayName,
      error: error as Error,
    }
  }

  restoreStdinState(wasRaw)
  return { ok: true, editorLabel: editorCommand.displayName }
}
