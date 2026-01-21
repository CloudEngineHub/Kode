import type { BunShellSandboxOptions } from './types'

const START_TAG = '<sandbox_violations>'
const END_TAG = '</sandbox_violations>'

function stripEmptyLines(lines: string[]): string[] {
  return lines.map(line => line.trim()).filter(Boolean)
}

function extractSandboxViolationLines(args: {
  stderr: string
  sandbox: BunShellSandboxOptions
}): string[] {
  const platform = args.sandbox.__platformOverride ?? process.platform
  if (platform !== 'darwin') return []

  // macOS sandbox-exec profile denies are tagged with `KODE_SANDBOX` via `(with message "KODE_SANDBOX")`.
  // Use those tagged lines as a deterministic "violation list" to attach to stderr.
  const tagged = args.stderr
    .split(/\r?\n/)
    .filter(line => line.includes('KODE_SANDBOX'))

  return [...new Set(stripEmptyLines(tagged))]
}

export function annotateStderrWithSandboxViolations(args: {
  command: string
  stderr: string
  sandbox: BunShellSandboxOptions | undefined
}): string {
  if (!args.sandbox || args.sandbox.enabled !== true) return args.stderr
  if (!args.stderr) return args.stderr
  if (args.stderr.includes(START_TAG)) return args.stderr

  const violations = extractSandboxViolationLines({
    stderr: args.stderr,
    sandbox: args.sandbox,
  })
  if (violations.length === 0) return args.stderr

  let out = args.stderr
  out += `\n${START_TAG}\n`
  out += `${violations.join('\n')}\n`
  out += END_TAG
  return out
}

export function stripSandboxViolations(stderr: string): string {
  if (!stderr) return stderr
  const cleaned = stderr.replace(
    new RegExp(`${START_TAG}[\\s\\S]*?${END_TAG}`, 'g'),
    '',
  )
  if (cleaned === stderr) return stderr
  return cleaned.trim()
}
