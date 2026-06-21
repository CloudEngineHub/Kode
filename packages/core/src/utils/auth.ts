import { getGlobalConfig } from './config'

export function isAnthropicAuthEnabled(): boolean {
  // Kode supports interactive OAuth for managed accounts; expose login/logout commands
  // in the CLI command surface (they are still no-ops unless the user completes auth).
  return true
}

export function isLoggedInToAnthropic(): boolean {
  const config = getGlobalConfig()
  return Boolean(config.oauthAccount)
}
