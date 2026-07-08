export type BuiltinInputCommandName = 'bash' | 'note'

export type BuiltinInputCommand = {
  name: BuiltinInputCommandName
  args: string
}

export function parseBuiltinInputCommand(
  inputTrimmedStart: string,
): BuiltinInputCommand | null {
  if (!inputTrimmedStart.startsWith('/')) return null

  const withoutSlash = inputTrimmedStart.slice(1)
  const commandMatch = withoutSlash.match(/^([^\s]+)(.*)$/)
  if (!commandMatch?.[1]) return null

  const name = commandMatch[1].toLowerCase()
  if (name !== 'bash' && name !== 'note') return null

  return {
    name,
    args: (commandMatch[2] ?? '').trimStart(),
  }
}

export function __parseBuiltinInputCommandForTests(
  inputTrimmedStart: string,
): BuiltinInputCommand | null {
  return parseBuiltinInputCommand(inputTrimmedStart)
}
