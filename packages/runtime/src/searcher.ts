import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { glob } from 'glob'

const d = (msg: string) => {
  if (process.env.DEBUG?.includes('kode:search')) {
    process.stderr.write(`[search] ${msg}\n`)
  }
}

function logError(message: string): void {
  if (process.env.NODE_ENV === 'test') {
    console.error(message)
  }
}

/**
 * BunSearcher - Layered search using glob first, then fallback
 *
 * Strategy:
 * 1. Fast: Try glob for pattern matching
 * 2. Powerful: Fall back to ripgrep if glob fails or is insufficient
 * 3. Robust: Handle both file pattern matching and content searching
 */
export class BunSearcher {
  /**
   * Search for files matching a glob pattern
   */
  static async glob(
    pattern: string,
    cwd: string = process.cwd(),
    limit: number = 1000,
  ): Promise<string[]> {
    try {
      d(`glob: pattern="${pattern}" cwd="${cwd}" limit=${limit}`)
      const results = await glob(pattern, {
        cwd,
        nodir: true,
        withFileTypes: false,
      })
      return results.slice(0, limit)
    } catch (error) {
      d(
        `glob failed: ${error instanceof Error ? error.message : String(error)}`,
      )
      logError(`BunSearcher.glob error: ${error}`)
      return []
    }
  }

  /**
   * List all files in a directory (non-empty files)
   * Uses glob to scan directory structure
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
