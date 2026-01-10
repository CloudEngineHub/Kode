export function getMaxTokensFromProfile(modelProfile: any): number {
  return modelProfile?.maxTokens || 8000
}
