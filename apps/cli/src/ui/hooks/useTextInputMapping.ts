export function mapInput<T>(
  inputMap: Array<[string, (input: string) => T]>,
  defaultHandler: (input: string) => T,
): (input: string) => T {
  const handlers = new Map(inputMap)
  return (input: string) => (handlers.get(input) ?? defaultHandler)(input)
}
