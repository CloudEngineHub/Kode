import { cwd } from 'node:process'

export function getCwd(): string {
  return cwd()
}
