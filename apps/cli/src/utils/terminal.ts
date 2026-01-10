import { safeParseJSON } from '#core/utils/json'
import { logError } from '#core/utils/log'

function writeToStdout(sequence: string): void {
  if (!process.stdout?.isTTY) return
  process.stdout.write(sequence)
}

export function setTerminalTitle(title: string): void {
  if (process.platform === 'win32') {
    process.title = title ? `✳ ${title}` : title
  } else {
    process.stdout.write(`\x1b]0;${title ? `✳ ${title}` : ''}\x07`)
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
  return new Promise(resolve => {
    process.stdout.write('\x1b[2J\x1b[3J\x1b[H', () => {
      resolve()
    })
  })
}

export function enableMouseEvents(): void {
  writeToStdout('\x1b[?1002h\x1b[?1006h')
}

export function disableMouseEvents(): void {
  writeToStdout('\x1b[?1006l\x1b[?1002l')
}

export function enableKittyKeyboardProtocol(): void {
  writeToStdout('\x1b[>1u')
}

export function disableKittyKeyboardProtocol(): void {
  writeToStdout('\x1b[<u')
}

export function enableModifyOtherKeys(): void {
  writeToStdout('\x1b[>4;2m')
}

export function disableModifyOtherKeys(): void {
  writeToStdout('\x1b[>4;0m')
}

export function enableBracketedPasteMode(): void {
  writeToStdout('\x1b[?2004h')
}

export function disableBracketedPasteMode(): void {
  writeToStdout('\x1b[?2004l')
}

export function enableLineWrapping(): void {
  writeToStdout('\x1b[?7h')
}

export function disableLineWrapping(): void {
  writeToStdout('\x1b[?7l')
}

export function enterAlternateScreen(): void {
  writeToStdout('\x1b[?1049h')
}

export function exitAlternateScreen(): void {
  writeToStdout('\x1b[?1049l')
}

export function shouldEnterAlternateScreen(
  useAlternateBuffer: boolean,
  isScreenReader: boolean,
): boolean {
  return useAlternateBuffer && !isScreenReader
}
