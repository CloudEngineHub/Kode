const MCP_PROGRESS_MESSAGE_MAX_LENGTH = 240
const MCP_PROGRESS_LABEL_MAX_LENGTH = 80

function sanitizeMcpProgressText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return ''

  const cleaned = value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) return ''
  if (cleaned.length <= maxLength) return cleaned
  return `${cleaned.slice(0, maxLength)}...`
}

export function sanitizeMcpProgressMessage(
  value: unknown,
  fallback = 'working',
): string {
  const cleaned = sanitizeMcpProgressText(
    value,
    MCP_PROGRESS_MESSAGE_MAX_LENGTH,
  )
  return cleaned || fallback
}

export function sanitizeMcpProgressLabel(
  value: unknown,
  fallback = 'mcp',
): string {
  const cleaned = sanitizeMcpProgressText(value, MCP_PROGRESS_LABEL_MAX_LENGTH)
  return cleaned || fallback
}

export function formatMcpProgressNumber(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(2)))
}

export const __mcpProgressForTests = {
  MCP_PROGRESS_LABEL_MAX_LENGTH,
  MCP_PROGRESS_MESSAGE_MAX_LENGTH,
}
