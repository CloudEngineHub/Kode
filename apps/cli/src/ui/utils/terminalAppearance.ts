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

export type TerminalBackgroundTone = 'dark' | 'light' | 'unknown'
export type TerminalContrastLevel = 'good' | 'low' | 'unknown'

export type TerminalReadabilityReport = {
  backgroundTone: TerminalBackgroundTone
  textContrastRatio?: number
  secondaryTextContrastRatio?: number
  accentContrastRatio?: number
  text: TerminalContrastLevel
  secondaryText: TerminalContrastLevel
  accent: TerminalContrastLevel
}

export type TerminalAppearanceSnapshot = {
  terminalName?: string
  terminalBackgroundColor?: string
  readability?: TerminalReadabilityReport
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

type ReadabilityInput = {
  terminalBackgroundColor?: string
  textColor: string
  secondaryTextColor: string
  accentColor: string
}

type Rgb = {
  r: number
  g: number
  b: number
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

function parseHexColor(value: string | undefined): Rgb | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  const match = trimmed.match(/^#([0-9a-fA-F]{3,8})$/)
  if (!match) return undefined

  const hex = match[1] ?? ''
  if (hex.length === 3 || hex.length === 4) {
    return {
      r: Number.parseInt(hex[0] + hex[0], 16),
      g: Number.parseInt(hex[1] + hex[1], 16),
      b: Number.parseInt(hex[2] + hex[2], 16),
    }
  }
  if (hex.length === 6 || hex.length === 8) {
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
    }
  }
  return undefined
}

function colorChannelToLinear(value: number): number {
  const normalized = value / 255
  if (normalized <= 0.04045) return normalized / 12.92
  return ((normalized + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(color: Rgb): number {
  return (
    0.2126 * colorChannelToLinear(color.r) +
    0.7152 * colorChannelToLinear(color.g) +
    0.0722 * colorChannelToLinear(color.b)
  )
}

function contrastRatio(left: Rgb, right: Rgb): number {
  const leftLuminance = relativeLuminance(left)
  const rightLuminance = relativeLuminance(right)
  const lighter = Math.max(leftLuminance, rightLuminance)
  const darker = Math.min(leftLuminance, rightLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

function contrastLevel(ratio: number | undefined): TerminalContrastLevel {
  if (ratio === undefined) return 'unknown'
  return ratio >= 4.5 ? 'good' : 'low'
}

function formatContrast(value: number | undefined): string {
  if (value === undefined) return 'unknown'
  return `${value.toFixed(1)}:1`
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

export function createTerminalReadabilityReport({
  terminalBackgroundColor,
  textColor,
  secondaryTextColor,
  accentColor,
}: ReadabilityInput): TerminalReadabilityReport {
  const background = parseHexColor(terminalBackgroundColor)
  const text = parseHexColor(textColor)
  const secondaryText = parseHexColor(secondaryTextColor)
  const accent = parseHexColor(accentColor)
  const backgroundLuminance = background
    ? relativeLuminance(background)
    : undefined

  const textContrastRatio =
    background && text ? contrastRatio(background, text) : undefined
  const secondaryTextContrastRatio =
    background && secondaryText
      ? contrastRatio(background, secondaryText)
      : undefined
  const accentContrastRatio =
    background && accent ? contrastRatio(background, accent) : undefined

  return {
    backgroundTone:
      backgroundLuminance === undefined
        ? 'unknown'
        : backgroundLuminance >= 0.5
          ? 'light'
          : 'dark',
    textContrastRatio,
    secondaryTextContrastRatio,
    accentContrastRatio,
    text: contrastLevel(textContrastRatio),
    secondaryText: contrastLevel(secondaryTextContrastRatio),
    accent: contrastLevel(accentContrastRatio),
  }
}

export function withTerminalReadability(
  snapshot: TerminalAppearanceSnapshot,
  colors: Omit<ReadabilityInput, 'terminalBackgroundColor'>,
): TerminalAppearanceSnapshot {
  return {
    ...snapshot,
    readability: createTerminalReadabilityReport({
      terminalBackgroundColor: snapshot.terminalBackgroundColor,
      ...colors,
    }),
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

function contrastLabel(value: TerminalContrastLevel): string {
  if (value === 'good') return 'good'
  if (value === 'low') return 'low'
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
  if (snapshot.readability) {
    const readability = snapshot.readability
    lines.push(
      `- Readability: bg=${readability.backgroundTone}; text=${contrastLabel(readability.text)} (${formatContrast(readability.textContrastRatio)}); secondary=${contrastLabel(readability.secondaryText)} (${formatContrast(readability.secondaryTextContrastRatio)}); accent=${contrastLabel(readability.accent)} (${formatContrast(readability.accentContrastRatio)})`,
    )
    if (
      readability.text === 'low' ||
      readability.secondaryText === 'low' ||
      readability.accent === 'low'
    ) {
      lines.push(
        '- Readability note: current theme colors may be low contrast on this terminal background.',
      )
    }
  }

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
