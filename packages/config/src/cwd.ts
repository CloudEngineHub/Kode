import { cwd as processCwd } from 'node:process'

let cwdProvider: () => string = processCwd

export function setCwdProvider(provider: () => string): void {
  cwdProvider = provider
}

export function resetCwdProviderForTesting(): void {
  cwdProvider = processCwd
}

export function getCwd(): string {
  return cwdProvider()
}
