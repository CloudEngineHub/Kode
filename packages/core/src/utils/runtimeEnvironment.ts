import { release as osRelease, type as osType } from 'os'

export type RuntimeEnvironmentInfo = {
  platform: NodeJS.Platform
  arch: string
  osType: string
  osRelease: string
  runtimeName: 'bun' | 'node'
  runtimeVersion: string
  shell: string | null
  terminal: string | null
}

type RuntimeEnv = Record<string, string | undefined>

function getBunVersion(): string | undefined {
  return (process.versions as NodeJS.ProcessVersions & { bun?: string }).bun
}

export function getPlatformLabel(platform: NodeJS.Platform): string {
  switch (platform) {
    case 'win32':
      return 'Windows'
    case 'darwin':
      return 'macOS'
    case 'linux':
      return 'Linux'
    default:
      return platform
  }
}

function basename(value: string): string {
  const normalized = value.replace(/\\/g, '/')
  return normalized.slice(normalized.lastIndexOf('/') + 1)
}

export function normalizeShellName(value: string | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null

  const name = basename(trimmed).toLowerCase()
  if (name === 'pwsh' || name === 'pwsh.exe') return 'PowerShell'
  if (name === 'powershell' || name === 'powershell.exe') return 'PowerShell'
  if (name === 'cmd' || name === 'cmd.exe') return 'cmd.exe'
  if (name === 'bash' || name === 'bash.exe') return 'bash'
  if (name === 'zsh') return 'zsh'
  if (name === 'fish') return 'fish'
  if (name === 'sh') return 'sh'

  return basename(trimmed)
}

export function detectShellName(
  runtimeEnv: RuntimeEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string | null {
  if (platform === 'win32') {
    if (runtimeEnv.PSModulePath || runtimeEnv.POWERSHELL_DISTRIBUTION_CHANNEL) {
      return 'PowerShell'
    }

    return (
      normalizeShellName(runtimeEnv.ComSpec) ??
      normalizeShellName(runtimeEnv.SHELL)
    )
  }

  return (
    normalizeShellName(runtimeEnv.SHELL) ??
    normalizeShellName(runtimeEnv.ComSpec)
  )
}

export function detectTerminalName(
  runtimeEnv: RuntimeEnv = process.env,
): string | null {
  if (runtimeEnv.TERM_PROGRAM) return runtimeEnv.TERM_PROGRAM
  if (runtimeEnv.WT_SESSION) return 'Windows Terminal'
  if (runtimeEnv.TERM) return runtimeEnv.TERM
  return null
}

export function getRuntimeEnvironmentInfo(): RuntimeEnvironmentInfo {
  const bunVersion = getBunVersion()
  return {
    platform: process.platform,
    arch: process.arch,
    osType: osType(),
    osRelease: osRelease(),
    runtimeName: bunVersion ? 'bun' : 'node',
    runtimeVersion: bunVersion ?? process.version,
    shell: detectShellName(),
    terminal: detectTerminalName(),
  }
}

export function buildRuntimeEnvironmentPrompt(
  info: RuntimeEnvironmentInfo = getRuntimeEnvironmentInfo(),
): string {
  const platformLabel = getPlatformLabel(info.platform)
  const shell = info.shell ?? 'unknown'
  const terminal = info.terminal ?? 'unknown'
  const runtime = `${info.runtimeName} ${info.runtimeVersion}`
  const base = `# Runtime environment
You are running on ${platformLabel} (${info.platform}, ${info.arch}); OS version: ${info.osType} ${info.osRelease}; runtime: ${runtime}; shell: ${shell}; terminal: ${terminal}.
- Match shell syntax to this environment. Do not assume POSIX/Bash syntax unless the detected shell is Bash-compatible.`

  if (info.platform === 'win32') {
    return `${base}
- On Windows/PowerShell, avoid Bash-only syntax such as heredocs (\`<<'EOF'\`), process substitution, POSIX-only env assignments, and fragile multiline inline arguments.
- For multiline Git commit messages, PR bodies, scripts, or generated text, prefer a temporary UTF-8 file and pass it with flags such as \`git commit --file <path>\` or \`gh pr create --body-file <path>\`.
- Prefer PowerShell-compatible commands, or use Node/Bun scripts when quoting would be complex.`
  }

  return `${base}
- If the shell is POSIX-compatible, heredocs and POSIX quoting are acceptable. Otherwise prefer temporary files for multiline text.`
}
