import { useCallback, useEffect, useState } from 'react'

import { debug as debugLogger } from '#core/utils/debugLogger'
import { logError } from '#core/utils/log'
import {
  getEssentialCommands,
  getMinimalFallbackCommands,
} from '#cli-utils/completion/commonUnixCommands'

export function useSystemCommands(): {
  systemCommands: string[]
  isLoadingCommands: boolean
} {
  const [systemCommands, setSystemCommands] = useState<string[]>([])
  const [isLoadingCommands, setIsLoadingCommands] = useState(false)

  const loadSystemCommands = useCallback(async () => {
    if (systemCommands.length > 0 || isLoadingCommands) return

    setIsLoadingCommands(true)
    try {
      const { readdirSync, statSync } = await import('fs')
      const pathDirs = (process.env.PATH || '').split(':').filter(Boolean)
      const commandSet = new Set<string>()

      getEssentialCommands().forEach(cmd => commandSet.add(cmd))

      for (const dir of pathDirs) {
        try {
          if (readdirSync && statSync) {
            const entries = readdirSync(dir)
            for (const entry of entries) {
              try {
                const fullPath = `${dir}/${entry}`
                const stats = statSync(fullPath)
                if (stats.isFile() && (stats.mode & 0o111) !== 0) {
                  commandSet.add(entry)
                }
              } catch {
                // Skip files we can't stat
              }
            }
          }
        } catch {
          // Skip directories we can't read
        }
      }

      const next = Array.from(commandSet).sort()
      setSystemCommands(next)
    } catch (error) {
      logError(error)
      debugLogger.warn('UNIFIED_COMPLETION_SYSTEM_COMMANDS_LOAD_FAILED', {
        error: error instanceof Error ? error.message : String(error),
      })
      setSystemCommands(getMinimalFallbackCommands())
    } finally {
      setIsLoadingCommands(false)
    }
  }, [systemCommands.length, isLoadingCommands])

  useEffect(() => {
    loadSystemCommands()
  }, [loadSystemCommands])

  return { systemCommands, isLoadingCommands }
}
