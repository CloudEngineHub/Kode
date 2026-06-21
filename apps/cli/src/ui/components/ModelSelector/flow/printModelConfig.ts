import chalk from 'chalk'
import { getGlobalConfig } from '#core/utils/config'
import { isStdioPatchedForTui, writeToStdout } from '#cli-utils/stdio'

export function printModelConfig() {
  // Avoid corrupting Ink rendering. If a TUI stdio guard is active, skip
  // writing to the real terminal output and rely on in-UI feedback instead.
  if (isStdioPatchedForTui()) return

  const config = getGlobalConfig()
  const modelProfiles = config.modelProfiles || []
  const activeProfiles = modelProfiles.filter(p => p.isActive)

  if (activeProfiles.length === 0) {
    writeToStdout(`${chalk.gray('  ⎿  No active model profiles configured')}\n`)
    return
  }

  const profileSummary = activeProfiles
    .map(p => `${p.name} (${p.provider}: ${p.modelName})`)
    .join(' | ')
  writeToStdout(`${chalk.gray(`  ⎿  ${profileSummary}`)}\n`)
}
