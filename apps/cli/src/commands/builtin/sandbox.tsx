import React from 'react'
import type { Command } from '../types'

import { relative } from 'node:path'
import { getBunShellSandboxPlan } from '#core/sandbox/bunShellSandboxPlan'
import { PRODUCT_NAME } from '#core/constants/product'
import {
  getSettingsFileCandidates,
  loadSettingsWithLegacyFallback,
  saveSettingsToPrimaryAndSyncLegacy,
} from '#config'
import { getCwd } from '#core/utils/state'
import { SandboxScreen } from '#ui-ink/screens/overlays/SandboxScreen'

function isSupportedPlatform(platform: NodeJS.Platform): boolean {
  return platform === 'darwin' || platform === 'linux'
}

function getSandboxStatusDescription(): string {
  if (!isSupportedPlatform(process.platform)) {
    return `sandbox unavailable on ${process.platform}`
  }

  const plan = getBunShellSandboxPlan({ command: 'echo sandbox status' })
  const enabled = plan.settings.enabled
  const autoAllow = plan.settings.autoAllowBashIfSandboxed
  const fallbackAllowed = plan.settings.allowUnsandboxedCommands
  const managed = false

  const icon = enabled ? '✓' : '○'
  let summary = enabled ? 'sandbox enabled' : 'sandbox disabled'
  if (enabled && autoAllow) summary += ' (auto-allow)'
  if (enabled && fallbackAllowed) summary += ', fallback allowed'
  if (enabled && !plan.sandboxAvailable) summary += ' (unavailable)'
  if (managed) summary += ' (managed)'

  return `${icon} ${summary} (⏎ to configure)`
}

function stripOuterQuotes(value: string): string {
  return value.replace(/^["']|["']$/g, '')
}

function parseSandboxExcludeArg(args: string): string | null {
  const trimmed = args.trim()
  if (!trimmed.toLowerCase().startsWith('exclude')) return null
  const rest = trimmed.slice('exclude'.length).trim()
  if (!rest) return ''
  return stripOuterQuotes(rest)
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((v): v is string => typeof v === 'string')
    .map(v => v.trim())
    .filter(Boolean)
}

function persistExcludedCommandPattern(pattern: string): string {
  const projectDir = getCwd()
  const loaded = loadSettingsWithLegacyFallback({
    destination: 'localSettings',
    projectDir,
    migrateToPrimary: true,
  })
  const current = (loaded.settings ?? {}) as Record<string, unknown>
  const sandbox =
    typeof current.sandbox === 'object' && current.sandbox !== null
      ? (current.sandbox as Record<string, unknown>)
      : {}
  const existing = normalizeStringArray(sandbox.excludedCommands)
  const nextExcluded = existing.includes(pattern)
    ? existing
    : [...existing, pattern]

  const next: Record<string, unknown> = {
    ...current,
    sandbox: {
      ...sandbox,
      excludedCommands: nextExcluded,
    },
  }

  saveSettingsToPrimaryAndSyncLegacy({
    destination: 'localSettings',
    projectDir,
    settings: next,
  })

  const candidates = getSettingsFileCandidates({
    destination: 'localSettings',
    projectDir,
  })
  const relativePath = candidates?.primary
    ? `./${relative(projectDir, candidates.primary)}`
    : './.kode/settings.local.json'

  return `Added "${pattern}" to excluded commands in ${relativePath}`
}

const sandbox = {
  type: 'local-jsx',
  name: 'sandbox',
  argumentHint: 'exclude "command pattern"',
  get description() {
    return getSandboxStatusDescription()
  },
  isEnabled: true,
  isHidden: !isSupportedPlatform(process.platform),
  ui: { displayMode: 'fullscreen' },
  disableNonInteractive: true,
  async call(onDone, context, args) {
    if (!isSupportedPlatform(process.platform)) {
      onDone(`Error: Sandboxing is currently only supported on macOS and Linux`)
      return null
    }

    const plan = getBunShellSandboxPlan({
      command: 'echo sandbox dependency probe',
      toolUseContext: context,
    })
    if (!plan.sandboxAvailable) {
      const msg =
        process.platform === 'linux'
          ? `Error: Sandbox requires socat and bubblewrap. Please install these packages.`
          : `Error: Sandbox dependencies are not available on this system.`
      onDone(msg)
      return null
    }

    const trimmed = (args ?? '').trim()
    if (trimmed) {
      const excludePattern = parseSandboxExcludeArg(trimmed)
      if (excludePattern !== null) {
        if (!excludePattern) {
          onDone(
            `Error: Please provide a command pattern to exclude (e.g., /sandbox exclude "npm run test:*")`,
          )
          return null
        }
        onDone(persistExcludedCommandPattern(excludePattern))
        return null
      }

      const unknownSubcommand = trimmed.split(/\s+/)[0] ?? trimmed
      onDone(
        `Error: Unknown subcommand "${unknownSubcommand}". Available subcommand: exclude`,
      )
      return null
    }

    return React.createElement(SandboxScreen, {
      context,
      onDone: result =>
        onDone(result ?? `${PRODUCT_NAME} sandbox dialog dismissed`),
    })
  },
  userFacingName() {
    return 'sandbox'
  },
} satisfies Command

export default sandbox
