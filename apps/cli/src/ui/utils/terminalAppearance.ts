export type SupportState = 'yes' | 'no' | 'unknown'

export type WindowsTerminalVersion = {
  raw: string
  major: number
  minor: number
  patch: number
}

export type WindowsTerminalFeatureSupport = {
  fontObject: SupportState
  legacyFontFields: SupportState
  opacity: SupportState
  acrylicOpacity: SupportState
  adjacentSettingsAssets: SupportState
  backgroundImage: SupportState
  adjustIndistinguishableColors: SupportState
}

export type TerminalAppearanceSnapshot = {
  terminalName?: string
  terminalBackgroundColor?: string
  env: {
    term?: string
    colorterm?: string
    termProgram?: string
    termProgramVersion?: string
    wtSession?: string
    wtProfileId?: string
  }
  windowsTerminal: {
    detected: boolean
    version?: WindowsTerminalVersion
    versionSource?: 'TERM_PROGRAM_VERSION'
    featureSupport: WindowsTerminalFeatureSupport
    canQueryCustomBackground: false
    canQueryProfileOpacity: false
  }
}

type SnapshotInput = {
  terminalName?: string
  terminalBackgroundColor?: string
  env?: NodeJS.ProcessEnv
}

function readEnv(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function isWindowsTerminalEnv(env: TerminalAppearanceSnapshot['env']): boolean {
  if (env.wtSession || env.wtProfileId) return true
  return env.termProgram?.toLowerCase() === 'windows_terminal'
}

function compareVersion(
  left: WindowsTerminalVersion,
  major: number,
  minor: number,
): number {
  if (left.major !== major) return left.major - major
  return left.minor - minor
}

function supportAtLeast(
  version: WindowsTerminalVersion | undefined,
  major: number,
  minor: number,
): SupportState {
  if (!version) return 'unknown'
  return compareVersion(version, major, minor) >= 0 ? 'yes' : 'no'
}

export function parseWindowsTerminalVersion(
  value: string | undefined,
): WindowsTerminalVersion | undefined {
  if (!value) return undefined
  const match = value.match(/(\d+)\.(\d+)(?:\.(\d+))?/)
  if (!match) return undefined

  const major = Number.parseInt(match[1] ?? '0', 10)
  const minor = Number.parseInt(match[2] ?? '0', 10)
  const patch = Number.parseInt(match[3] ?? '0', 10)
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return undefined

  return {
    raw: value,
    major,
    minor,
    patch: Number.isFinite(patch) ? patch : 0,
  }
}

export function getWindowsTerminalFeatureSupport(
  version: WindowsTerminalVersion | undefined,
): WindowsTerminalFeatureSupport {
  const fontObject = supportAtLeast(version, 1, 10)
  const opacity = supportAtLeast(version, 1, 12)
  const adjacentSettingsAssets = supportAtLeast(version, 1, 24)

  return {
    fontObject,
    legacyFontFields:
      fontObject === 'unknown'
        ? 'unknown'
        : fontObject === 'yes'
          ? 'no'
          : 'yes',
    opacity,
    acrylicOpacity: 'yes',
    adjacentSettingsAssets,
    backgroundImage: 'yes',
    adjustIndistinguishableColors: 'yes',
  }
}

export function createTerminalAppearanceSnapshot({
  terminalName,
  terminalBackgroundColor,
  env = process.env,
}: SnapshotInput): TerminalAppearanceSnapshot {
  const envSnapshot: TerminalAppearanceSnapshot['env'] = {
    term: readEnv(env, 'TERM'),
    colorterm: readEnv(env, 'COLORTERM'),
    termProgram: readEnv(env, 'TERM_PROGRAM'),
    termProgramVersion: readEnv(env, 'TERM_PROGRAM_VERSION'),
    wtSession: readEnv(env, 'WT_SESSION'),
    wtProfileId: readEnv(env, 'WT_PROFILE_ID'),
  }
  const version = parseWindowsTerminalVersion(envSnapshot.termProgramVersion)

  return {
    terminalName,
    terminalBackgroundColor,
    env: envSnapshot,
    windowsTerminal: {
      detected: isWindowsTerminalEnv(envSnapshot),
      version,
      versionSource: version ? 'TERM_PROGRAM_VERSION' : undefined,
      featureSupport: getWindowsTerminalFeatureSupport(version),
      canQueryCustomBackground: false,
      canQueryProfileOpacity: false,
    },
  }
}

function supportLabel(value: SupportState): string {
  if (value === 'yes') return 'yes'
  if (value === 'no') return 'no'
  return 'unknown'
}

export function formatTerminalAppearanceLines(
  snapshot: TerminalAppearanceSnapshot,
): string[] {
  const wt = snapshot.windowsTerminal
  const support = wt.featureSupport
  const lines: string[] = []

  lines.push('Appearance')
  lines.push(
    `- Windows Terminal: ${wt.detected ? 'yes' : 'no'}${
      wt.version
        ? ` (${wt.version.major}.${wt.version.minor}.${wt.version.patch})`
        : ''
    }`,
  )
  lines.push(
    `- OSC 11 background: ${snapshot.terminalBackgroundColor ?? '(unknown)'}`,
  )

  if (wt.detected) {
    lines.push(
      `- WT env: session=${snapshot.env.wtSession ? 'yes' : 'no'}; profile=${snapshot.env.wtProfileId ? 'yes' : 'no'}; version=${wt.version ? wt.version.raw : '(unknown)'}`,
    )
    lines.push(
      `- WT features: font=${supportLabel(support.fontObject)}; opacity=${supportLabel(support.opacity)}; adjacent assets=${supportLabel(support.adjacentSettingsAssets)}`,
    )
    lines.push(
      '- WT profile image/opacity settings are not queryable from the running app; settings.json is not inspected.',
    )
    lines.push(
      `- WT readability: adjustIndistinguishableColors=${supportLabel(support.adjustIndistinguishableColors)} is recommended for custom backgrounds.`,
    )
  }

  return lines
}
