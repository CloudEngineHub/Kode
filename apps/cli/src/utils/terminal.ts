import { safeParseJSON } from '#core/utils/json'
import { logError } from '#core/utils/log'
import { writeToStdout as writeToRealStdout } from '#cli-utils/stdio'

type WriteToStdout = typeof writeToRealStdout

const defaultWriteToStdoutLoader = (): WriteToStdout => writeToRealStdout
let writeToStdoutLoader = defaultWriteToStdoutLoader

export function __setTerminalWriteToStdoutLoaderForTests(
  loader: (() => WriteToStdout) | null,
): void {
  writeToStdoutLoader = loader ?? defaultWriteToStdoutLoader
}

function writeToTty(sequence: string): void {
  if (!process.stdout?.isTTY) return
  writeToStdoutLoader()(sequence)
}

let alternateScreenRefCount = 0
let mouseEventsRefCount = 0
let mouseEventsSuspended = false

const ENABLE_MOUSE_EVENTS_SEQUENCE = '\x1b[?1006h\x1b[?1000h'
const DISABLE_MOUSE_EVENTS_SEQUENCE =
  '\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l'
const FALSE_ENV_VALUES = new Set(['0', 'false', 'off', 'no', 'disabled'])

export function isMouseEventsEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env.KODE_TUI_MOUSE
  if (!raw) return true
  return !FALSE_ENV_VALUES.has(raw.trim().toLowerCase())
}

export function setTerminalTitle(title: string): void {
  if (process.platform === 'win32') {
    process.title = title ? `✳ ${title}` : title
  } else {
    writeToTty(`\x1b]0;${title ? `✳ ${title}` : ''}\x07`)
  }
}

export async function updateTerminalTitle(message: string): Promise<void> {
  try {
    const { queryQuick } = await import('#core/ai/llm')
    const result = await queryQuick({
      systemPrompt: [
        "Analyze if this message indicates a new conversation topic. If it does, extract a 2-3 word title that captures the new topic. Format your response as a JSON object with two fields: 'isNewTopic' (boolean) and 'title' (string, or null if isNewTopic is false). Only include these fields, no other text.",
      ],
      userPrompt: message,
      enablePromptCaching: true,
    })

    const content = result.message.content
      .filter(_ => _.type === 'text')
      .map(_ => _.text)
      .join('')

    const response = safeParseJSON(content)
    if (
      response &&
      typeof response === 'object' &&
      'isNewTopic' in response &&
      'title' in response
    ) {
      if (response.isNewTopic && response.title) {
        setTerminalTitle(response.title as string)
      }
    }
  } catch (error) {
    logError(error)
  }
}

export function clearTerminal(): Promise<void> {
  return clearViewport()
}

export function clearViewport(): Promise<void> {
  if (!process.stdout?.isTTY) return Promise.resolve()
  return new Promise(resolve => {
    // Clear the viewport without wiping scrollback.
    // - CSI 2J: clear screen
    // - CSI H : move cursor to home
    //
    // Avoid CSI 3J (clear scrollback), so the user can still scroll up to see
    // prior shell output and earlier CLI output.
    writeToStdoutLoader()('\x1b[2J\x1b[H', () => resolve())
  })
}

export function clearScrollback(): Promise<void> {
  if (!process.stdout?.isTTY) return Promise.resolve()
  return new Promise(resolve => {
    // Clear the viewport AND wipe scrollback (useful for sensitive dialogs).
    // - CSI 2J: clear screen
    // - CSI 3J: clear scrollback
    // - CSI H : move cursor to home
    writeToStdoutLoader()('\x1b[2J\x1b[3J\x1b[H', () => resolve())
  })
}

export function enableMouseEvents(): void {
  if (!process.stdin?.isTTY || !process.stdout?.isTTY) return
  if (!isMouseEventsEnabled()) return
  mouseEventsRefCount += 1
  if (mouseEventsRefCount !== 1 || mouseEventsSuspended) return

  // SGR 1006 keeps coordinates numeric and unambiguous. Pair it with normal
  // tracking (1000) so we receive press/release/wheel events without enabling
  // high-volume motion tracking.
  writeToTty(ENABLE_MOUSE_EVENTS_SEQUENCE)
}

export function disableMouseEvents(): void {
  if (!process.stdout?.isTTY) return
  if (mouseEventsRefCount <= 0) return
  mouseEventsRefCount -= 1
  if (mouseEventsRefCount !== 0) return
  const wasSuspended = mouseEventsSuspended
  mouseEventsSuspended = false
  if (wasSuspended) return

  // Also disable button/all-motion modes in case a previous build or terminal
  // session left them enabled.
  writeToTty(DISABLE_MOUSE_EVENTS_SEQUENCE)
}

export function resetMouseEvents(): void {
  if (!process.stdout?.isTTY) return
  mouseEventsRefCount = 0
  mouseEventsSuspended = false
  writeToTty(DISABLE_MOUSE_EVENTS_SEQUENCE)
}

export function suspendMouseEvents(): void {
  if (!process.stdout?.isTTY) return
  if (mouseEventsRefCount <= 0 || mouseEventsSuspended) return
  mouseEventsSuspended = true
  writeToTty(DISABLE_MOUSE_EVENTS_SEQUENCE)
}

export function resumeMouseEvents(): void {
  if (!process.stdin?.isTTY || !process.stdout?.isTTY) return
  if (!isMouseEventsEnabled()) return
  if (mouseEventsRefCount <= 0 || !mouseEventsSuspended) return
  mouseEventsSuspended = false
  writeToTty(ENABLE_MOUSE_EVENTS_SEQUENCE)
}

export function enableKittyKeyboardProtocol(): void {
  writeToTty('\x1b[>1u')
}

export function disableKittyKeyboardProtocol(): void {
  writeToTty('\x1b[<u')
}

export function enableModifyOtherKeys(): void {
  writeToTty('\x1b[>4;2m')
}

export function disableModifyOtherKeys(): void {
  writeToTty('\x1b[>4;0m')
}

export function enableBracketedPasteMode(): void {
  writeToTty('\x1b[?2004h')
}

export function disableBracketedPasteMode(): void {
  writeToTty('\x1b[?2004l')
}

export function enableLineWrapping(): void {
  writeToTty('\x1b[?7h')
}

export function disableLineWrapping(): void {
  writeToTty('\x1b[?7l')
}

export function isAlternateScreenActive(): boolean {
  return alternateScreenRefCount > 0
}

export function enterAlternateScreen(): void {
  if (!process.stdout?.isTTY) return
  // Make alternate screen idempotent and composable (nested uses won't break).
  alternateScreenRefCount += 1
  if (alternateScreenRefCount === 1) {
    writeToTty('\x1b[?1049h')
  }
}

export function exitAlternateScreen(): void {
  if (!process.stdout?.isTTY) return
  if (alternateScreenRefCount <= 0) return
  alternateScreenRefCount -= 1
  if (alternateScreenRefCount === 0) {
    writeToTty('\x1b[?1049l')
  }
}

export function shouldEnterAlternateScreen(
  useAlternateBuffer: boolean,
  isScreenReader: boolean,
): boolean {
  return useAlternateBuffer && !isScreenReader
}

function isScreenReaderEnabled(): boolean {
  return Boolean(process.env.KODE_SCREEN_READER ?? process.env.SCREENREADER)
}

export async function withEphemeralAlternateScreen<T>(
  fn: () => Promise<T> | T,
  options?: { enabled?: boolean; clearViewport?: boolean },
): Promise<T> {
  const enabled =
    options?.enabled ??
    (process.stdin.isTTY && process.stdout.isTTY && !isScreenReaderEnabled())
  if (!enabled) return await fn()

  enterAlternateScreen()
  try {
    if (options?.clearViewport !== false) {
      await clearTerminal()
    }
    return await fn()
  } finally {
    exitAlternateScreen()
  }
}
