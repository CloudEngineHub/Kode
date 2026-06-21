import { splitBashCommandIntoSubcommands, xi } from './bashToolPermissionEngine'

// Compatibility: read-only allowlist (reduced, conservative subset).
// Goal: classify truly read-only commands as concurrency-safe and plan-mode-safe.
const READ_ONLY_PATTERNS: RegExp[] = [
  /^pwd$/,
  /^whoami$/,
  /^ls(?:\s|$)[^<>()$`|{}&;>\n\r]*$/,
  /^cat(?:\s|$)[^<>()$`|{}&;>\n\r]*$/,
  /^git status(?:\s|$)[^<>()$`|{}&;>\n\r]*$/,
  /^git diff(?:\s|$)[^<>()$`|{}&;>\n\r]*$/,
  /^git log(?:\s|$)[^<>()$`|{}&;>\n\r]*$/,
  /^git show(?:\s|$)[^<>()$`|{}&;>\n\r]*$/,
]

function isReadOnlySubcommand(command: string): boolean {
  const trimmed = command.trim()
  if (!trimmed) return false

  // Compatibility: allowlist requires passthrough semantics (security checks).
  if (xi(trimmed).behavior !== 'passthrough') return false

  // Compatibility: block certain git flags even if command matches allowlist.
  if (trimmed.includes('git')) {
    if (/\\s-c[\\s=]/.test(trimmed)) return false
    if (/\\s--exec-path[\\s=]/.test(trimmed)) return false
    if (/\\s--config-env[\\s=]/.test(trimmed)) return false
  }

  return READ_ONLY_PATTERNS.some(re => re.test(trimmed))
}

export function isBashCommandReadOnly(command: string): boolean {
  const trimmed = command.trim()
  if (!trimmed) return false

  let subcommands: string[] = []
  try {
    // Conservative: pipes/&&/||/;/newlines create multiple subcommands => not read-only.
    subcommands = splitBashCommandIntoSubcommands(trimmed)
  } catch {
    return false
  }

  if (subcommands.length !== 1) return false
  return isReadOnlySubcommand(subcommands[0] ?? '')
}
