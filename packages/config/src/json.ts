export function safeParseJSON(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}
