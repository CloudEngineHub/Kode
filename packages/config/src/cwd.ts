import { BunShell } from '#runtime/shell'

export function getCwd(): string {
  return BunShell.getInstance().pwd()
}
