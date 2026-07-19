export function isInteractiveLoginEnabled(): boolean {
  // Keep the login/logout commands available for provider configuration and
  // external Codex sign-in discovery.
  return true
}
