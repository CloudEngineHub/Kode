export function formatDuration(ms: number): string {
  if (ms < 60_000) {
    if (ms === 0) return '0s'
    if (ms < 1) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.round(ms / 1000).toString()}s`
  }

  let hours = Math.floor(ms / 3_600_000)
  let minutes = Math.floor((ms % 3_600_000) / 60_000)
  let seconds = Math.round((ms % 60_000) / 1000)

  if (seconds === 60) {
    seconds = 0
    minutes++
  }
  if (minutes === 60) {
    minutes = 0
    hours++
  }

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

export function countNewlines(text: string): number {
  let count = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') count++
  }
  return count
}
