export type TerminalRendererMode = 'ink' | 'experimental'

export const EXPERIMENTAL_TUI_RENDERER_ENV = 'KODE_EXPERIMENTAL_TUI_RENDERER'

function isEnabled(value: string | undefined): boolean {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

export function getTerminalRendererMode(
  env: Record<string, string | undefined> = process.env,
): TerminalRendererMode {
  return isEnabled(env[EXPERIMENTAL_TUI_RENDERER_ENV]) ? 'experimental' : 'ink'
}
