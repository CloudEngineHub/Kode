export function getStringFromInput(
  input: Record<string, unknown>,
  key: string,
): string {
  const value = input[key]
  return typeof value === 'string' ? value : ''
}

export function getBooleanFromInput(
  input: Record<string, unknown>,
  key: string,
): boolean {
  return input[key] === true
}
