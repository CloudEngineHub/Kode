export type HeadlessModeArgs = {
  print?: boolean
  headless?: boolean
  outputFormat?: string
  inputFormat?: string
  stdoutIsTTY?: boolean
  prompt?: string
  stdinContent?: string
}

function normalizedFormat(value: string | undefined, fallback: string): string {
  return String(value || fallback)
    .toLowerCase()
    .trim()
}

function hasPromptInput(args: HeadlessModeArgs): boolean {
  return [args.prompt, args.stdinContent].some(
    value => typeof value === 'string' && value.trim().length > 0,
  )
}

export function shouldRunHeadlessMode(args: HeadlessModeArgs): boolean {
  if (args.print === true || args.headless === true) return true
  if (normalizedFormat(args.inputFormat, 'text') === 'stream-json') return true

  const outputFormat = normalizedFormat(args.outputFormat, 'text')
  if (outputFormat === 'json' || outputFormat === 'stream-json') return true

  return args.stdoutIsTTY === false && hasPromptInput(args)
}
