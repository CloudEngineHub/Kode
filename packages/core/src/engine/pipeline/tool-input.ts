import type { Tool } from '#core/tooling/Tool'
import { getCwd } from '#core/utils/state'

export function normalizeToolInput(
  tool: Tool,
  input: Record<string, unknown>,
): Record<string, unknown> {
  if (tool.name === 'Bash') {
    const parsed = tool.inputSchema.parse(input) as {
      command: unknown
      timeout?: unknown
      description?: unknown
      run_in_background?: unknown
      dangerouslyDisableSandbox?: unknown
    } // already validated upstream, won't throw
    const command = parsed.command
    const timeout = parsed.timeout
    const description = parsed.description
    const run_in_background = parsed.run_in_background
    const dangerouslyDisableSandbox = parsed.dangerouslyDisableSandbox
    return {
      command: String(command)
        .replace(`cd ${getCwd()} && `, '')
        .replace(/\\\\;/g, '\\;'),
      ...(typeof timeout === 'number' ? { timeout } : {}),
      ...(typeof description === 'string' && description
        ? { description }
        : {}),
      ...(typeof run_in_background === 'boolean' && run_in_background
        ? { run_in_background }
        : {}),
      ...(typeof dangerouslyDisableSandbox === 'boolean' &&
      dangerouslyDisableSandbox
        ? { dangerouslyDisableSandbox }
        : {}),
    }
  }

  return input
}

export function preprocessToolInput(
  tool: Tool,
  input: Record<string, unknown>,
): Record<string, unknown> {
  return input
}
