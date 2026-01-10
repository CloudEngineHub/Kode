import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

import { getCwd } from '#core/utils/state'
import { debug as debugLogger } from '#core/utils/debugLogger'
import { logError } from '#core/utils/log'

const execFileAsync = promisify(execFile)

export async function executeBashCommands(content: string): Promise<string> {
  const bashCommandRegex = /!\`([^`]+)\`/g
  const matches = [...content.matchAll(bashCommandRegex)]

  if (matches.length === 0) return content

  let result = content

  for (const match of matches) {
    const fullMatch = match[0]
    const command = match[1].trim()

    try {
      const parts = command.split(/\s+/)
      const cmd = parts[0]
      const args = parts.slice(1)

      const { stdout, stderr } = await execFileAsync(cmd, args, {
        timeout: 5000,
        encoding: 'utf8',
        cwd: getCwd(),
      })

      const output = stdout.trim() || stderr.trim() || '(no output)'
      result = result.replace(fullMatch, output)
    } catch (error) {
      logError(error)
      debugLogger.warn('CUSTOM_COMMAND_BASH_EXEC_FAILED', {
        command,
        error: error instanceof Error ? error.message : String(error),
      })
      result = result.replace(fullMatch, `(error executing: ${command})`)
    }
  }

  return result
}

export async function resolveFileReferences(content: string): Promise<string> {
  const fileRefRegex = /@([a-zA-Z0-9/._-]+(?:\.[a-zA-Z0-9]+)?)/g
  const matches = [...content.matchAll(fileRefRegex)]

  if (matches.length === 0) return content

  let result = content

  for (const match of matches) {
    const fullMatch = match[0]
    const filePath = match[1]

    if (filePath.startsWith('agent-')) continue

    try {
      const fullPath = join(getCwd(), filePath)

      if (existsSync(fullPath)) {
        const fileContent = readFileSync(fullPath, { encoding: 'utf-8' })
        const formattedContent = `\n\n## File: ${filePath}\n\`\`\`\n${fileContent}\n\`\`\`\n`
        result = result.replace(fullMatch, formattedContent)
      } else {
        result = result.replace(fullMatch, `(file not found: ${filePath})`)
      }
    } catch (error) {
      logError(error)
      debugLogger.warn('CUSTOM_COMMAND_FILE_READ_FAILED', {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      })
      result = result.replace(fullMatch, `(error reading: ${filePath})`)
    }
  }

  return result
}
