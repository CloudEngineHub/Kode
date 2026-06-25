import { readdir, stat } from 'node:fs/promises'
import { delimiter, join } from 'node:path'
import { useEffect, useState } from 'react'

import { debug as debugLogger } from '#core/utils/debugLogger'
import { logError } from '#core/utils/log'
import {
  getEssentialCommands,
  getMinimalFallbackCommands,
} from '#cli-utils/completion/commonUnixCommands'

const COMMAND_SCAN_BATCH_SIZE = 64
type CommandDirent = {
  name: string | Buffer
  isFile(): boolean
  isSymbolicLink(): boolean
}

async function yieldToEventLoop(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
}

async function loadCommandsFromPath(
  pathValue: string,
  shouldStop: () => boolean = () => false,
): Promise<string[]> {
  const pathDirs = Array.from(
    new Set(
      pathValue
        .split(delimiter)
        .map(dir => dir.trim())
        .filter(Boolean),
    ),
  )
  const commandSet = new Set<string>(getEssentialCommands())

  for (const dir of pathDirs) {
    if (shouldStop()) break

    let entries: CommandDirent[]
    try {
      entries = (await readdir(dir, {
        withFileTypes: true,
      })) as CommandDirent[]
    } catch {
      continue
    }

    for (let i = 0; i < entries.length; i += COMMAND_SCAN_BATCH_SIZE) {
      if (shouldStop()) break

      const batch = entries.slice(i, i + COMMAND_SCAN_BATCH_SIZE)
      const commandNames = await Promise.all(
        batch.map(async entry => {
          try {
            if (!entry.isFile() && !entry.isSymbolicLink()) return null

            const entryName = String(entry.name)
            const fullPath = join(dir, entryName)
            const stats = await stat(fullPath)
            const isExecutable =
              process.platform === 'win32' || (stats.mode & 0o111) !== 0
            return stats.isFile() && isExecutable ? entryName : null
          } catch {
            return null
          }
        }),
      )

      for (const commandName of commandNames) {
        if (commandName) commandSet.add(commandName)
      }

      await yieldToEventLoop()
    }
  }

  return Array.from(commandSet).sort()
}

export function useSystemCommands(): {
  systemCommands: string[]
  isLoadingCommands: boolean
} {
  const [systemCommands, setSystemCommands] = useState<string[]>(() =>
    getEssentialCommands(),
  )
  const [isLoadingCommands, setIsLoadingCommands] = useState(false)

  useEffect(() => {
    let cancelled = false
    const shouldStop = () => cancelled

    async function loadSystemCommands(): Promise<void> {
      setIsLoadingCommands(true)
      try {
        const next = await loadCommandsFromPath(
          process.env.PATH || '',
          shouldStop,
        )
        if (!shouldStop()) setSystemCommands(next)
      } catch (error) {
        logError(error)
        debugLogger.warn('UNIFIED_COMPLETION_SYSTEM_COMMANDS_LOAD_FAILED', {
          error: error instanceof Error ? error.message : String(error),
        })
        if (!shouldStop()) setSystemCommands(getMinimalFallbackCommands())
      } finally {
        if (!shouldStop()) setIsLoadingCommands(false)
      }
    }

    void loadSystemCommands()
    return () => {
      cancelled = true
    }
  }, [])

  return { systemCommands, isLoadingCommands }
}

export const __loadCommandsFromPathForTests = loadCommandsFromPath
