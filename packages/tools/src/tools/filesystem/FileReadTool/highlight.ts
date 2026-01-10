import { highlight, supportsLanguage } from 'cli-highlight'

export function highlightCode(code: string, language: string): string {
  try {
    if (supportsLanguage(language)) {
      return highlight(code, { language })
    }
    return highlight(code, { language: 'markdown' })
  } catch {
    return highlight(code, { language: 'markdown' })
  }
}
