import type { SettingsDestination, SettingsFile } from '#config'
import {
  loadSettingsWithLegacyFallback,
  saveSettingsToPrimaryAndSyncLegacy,
} from '#config'
import { getCwd } from '#core/utils/state'

type SettingsWithDisableAllHooks = SettingsFile & {
  disableAllHooks?: unknown
}

function readDisableAllHooks(value: unknown): boolean | null {
  if (value === undefined) return null
  return value === true
}

export type DisableAllHooksState = {
  disabled: boolean
  source: SettingsDestination | null
}

// Compatibility: settings precedence is destination-layered; local overrides project overrides user.
export function getDisableAllHooksState(options?: {
  projectDir?: string
  homeDir?: string
}): DisableAllHooksState {
  const projectDir = options?.projectDir ?? getCwd()
  const destinations: SettingsDestination[] = [
    'userSettings',
    'projectSettings',
    'localSettings',
  ]

  let value: boolean | null = null
  let source: SettingsDestination | null = null

  for (const destination of destinations) {
    const loaded = loadSettingsWithLegacyFallback({
      destination,
      projectDir,
      homeDir: options?.homeDir,
      migrateToPrimary: true,
    })
    const settings = loaded.settings as SettingsWithDisableAllHooks | null
    const next = settings ? readDisableAllHooks(settings.disableAllHooks) : null
    if (next === null) continue
    value = next
    source = destination
  }

  return { disabled: value === true, source }
}

export function setDisableAllHooks(options: {
  destination: SettingsDestination
  disabled: boolean
  projectDir?: string
  homeDir?: string
}): void {
  const projectDir = options.projectDir ?? getCwd()
  const loaded = loadSettingsWithLegacyFallback({
    destination: options.destination,
    projectDir,
    homeDir: options.homeDir,
    migrateToPrimary: true,
  })
  const existing = (loaded.settings as SettingsWithDisableAllHooks | null) ?? {}

  const next: SettingsWithDisableAllHooks = { ...existing }
  next.disableAllHooks = options.disabled

  saveSettingsToPrimaryAndSyncLegacy({
    destination: options.destination,
    projectDir,
    homeDir: options.homeDir,
    settings: next,
    syncLegacyIfExists: true,
  })
}
