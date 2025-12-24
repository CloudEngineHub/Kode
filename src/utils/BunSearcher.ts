import { stat } from 'fs/promises'
import { resolve } from 'path'
import { logError } from './log'

const d = (msg: string) => {
  if (process.env.DEBUG?.includes('kode:search')) {
    console.log(`[search] ${msg}`)
  }
}

/**
 * BunSearcher - Layered search using Bun.Glob first, then fallback
 *
 * Strategy:
 * 1. Fast: Try Bun.Glob for pattern matching (built-in, no dependencies)
 * 2. Powerful: Fall back to ripgrep if Bun.Glob fails or is insufficient
 * 3. Robust: Handle both file pattern matching and content searching
 */
export class BunSearcher {
  /**
   * Search for files matching a glob pattern
   * Uses Bun.Glob for native file matching
   */
  static async glob(
    pattern: string,
    cwd: string = process.cwd(),
    limit: number = 1000,
  ): Promise<string[]> {
    try {
      d(`Bun.glob: pattern="${pattern}" cwd="${cwd}" limit=${limit}`)
      const glob = new Bun.Glob(pattern)
      const results: string[] = []
      let count = 0

      // Scan files using Bun.Glob
      for await (const file of glob.scan({ cwd })) {
        if (count >= limit) break
        results.push(file)
        count++
      }

      d(`Bun.glob found ${results.length} files`)
      return results
    } catch (error) {
      d(
        `Bun.glob failed: ${error instanceof Error ? error.message : String(error)}`,
      )
      logError(`BunSearcher.glob error: ${error}`)
      return []
    }
  }

  /**
   * List all files in a directory (non-empty files)
   * Uses Bun.Glob to scan directory structure
   */
  static async listFiles(dir: string, limit: number = 1000): Promise<string[]> {
    try {
      d(`listFiles: dir="${dir}" limit=${limit}`)
      // Scan all files recursively
      return await this.glob('**/*', dir, limit)
    } catch (error) {
      d(
        `listFiles failed: ${error instanceof Error ? error.message : String(error)}`,
      )
      logError(`BunSearcher.listFiles error: ${error}`)
      return []
    }
  }

  /**
   * Filter glob results by file existence and properties
   */
  static async filterFiles(
    files: string[],
    cwd: string,
    filter?: (stats: { isFile: boolean; size: number }) => boolean,
  ): Promise<string[]> {
    const results: string[] = []

    for (const file of files) {
      try {
        const fullPath = resolve(cwd, file)
        const stats = await stat(fullPath)

        // Apply filter if provided
        if (filter && !filter({ isFile: stats.isFile(), size: stats.size })) {
          continue
        }

        results.push(file)
      } catch (error) {
        d(
          `filterFiles stat error for ${file}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }

    return results
  }
}

/**
 * Legacy ripgrep support
 * Import and use for content searching (when pattern matching is needed)
 */
export async function searchWithRipgrep(
  pattern: string,
  dir: string,
  abortSignal?: AbortSignal,
): Promise<string[]> {
  // Lazy import to avoid loading ripgrep unless needed
  const { ripGrep } = await import('./ripgrep')
  return ripGrep(
    ['-l', pattern],
    dir,
    abortSignal || new AbortController().signal,
  )
}
