import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import { logError } from '#core/utils/log'

export function handleHashCommand(interpreted: string): void {
  // Appends the AI-interpreted content to AGENTS.md.
  // If a legacy CLAUDE.md exists, it is also updated for compatibility.
  try {
    const cwd = process.cwd()
    const agentsPath = join(cwd, 'AGENTS.md')
    const legacyPath = join(cwd, 'CLAUDE.md')

    const filesToUpdate: Array<{ path: string; name: string }> = []

    // Always try to update AGENTS.md (create if not exists)
    filesToUpdate.push({ path: agentsPath, name: 'AGENTS.md' })

    // Update legacy CLAUDE.md only if it exists
    try {
      readFileSync(legacyPath, 'utf-8')
      filesToUpdate.push({ path: legacyPath, name: 'CLAUDE.md' })
    } catch {
      // CLAUDE.md doesn't exist, skip it
    }

    const now = new Date()
    const timezoneMatch = now.toString().match(/\(([A-Z]+)\)/)
    const timezone = timezoneMatch
      ? timezoneMatch[1]
      : now
          .toLocaleTimeString('en-us', { timeZoneName: 'short' })
          .split(' ')
          .pop()

    const timestamp = interpreted.includes(now.getFullYear().toString())
      ? ''
      : `\n\n_Added on ${now.toLocaleString()} ${timezone}_`

    const updatedFiles: string[] = []

    for (const file of filesToUpdate) {
      try {
        let existingContent = ''
        try {
          existingContent = readFileSync(file.path, 'utf-8').trim()
        } catch {
          // File doesn't exist yet, that's fine
        }

        const separator = existingContent ? '\n\n' : ''
        const newContent = `${existingContent}${separator}${interpreted}${timestamp}`
        writeFileSync(file.path, newContent, 'utf-8')
        updatedFiles.push(file.name)
      } catch (error) {
        logError(error)
      }
    }
  } catch (e) {
    logError(e)
  }
}
