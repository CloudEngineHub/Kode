import { existsSync } from 'fs'
import { stat as statAsync } from 'fs/promises'
import { resolve } from 'path'
import { glob as globLib } from 'glob'
import { BunSearcher } from '#runtime/searcher'

import { logError } from '../log'

export async function glob(
  filePattern: string,
  cwd: string,
  { limit, offset }: { limit: number; offset: number },
  abortSignal: AbortSignal,
): Promise<{ files: string[]; truncated: boolean }> {
  try {
    // Try fast globbing first (previously Bun globbing)
    const allFiles = await BunSearcher.glob(
      filePattern,
      cwd,
      limit + offset + 100,
    )

    // Sort by modification time (newest first for relevance)
    const resolvedFiles = allFiles
      .map(f => resolve(cwd, f))
      .filter(f => existsSync(f))
    const stats = await Promise.all(
      resolvedFiles.map(async file => {
        try {
          return await statAsync(file)
        } catch {
          return null
        }
      }),
    )
    const sortedFiles = resolvedFiles
      .map((file, i) => [file, stats[i]] as const)
      .filter(([, stat]) => stat !== null)
      .sort((a, b) => {
        const timeComparison = (b[1]!.mtimeMs ?? 0) - (a[1]!.mtimeMs ?? 0)
        if (timeComparison !== 0) return timeComparison
        return a[0].localeCompare(b[0])
      })
      .map(([file]) => file)

    const truncated = sortedFiles.length > offset + limit
    return {
      files: sortedFiles.slice(offset, offset + limit),
      truncated,
    }
  } catch (error) {
    // Fallback to glob library if the primary matcher fails
    logError(`BunSearcher failed, falling back to glob: ${error}`)
    const paths = await globLib([filePattern], {
      cwd,
      nocase: true,
      nodir: true,
      signal: abortSignal,
      stat: true,
      withFileTypes: true,
    })
    const sortedPaths = paths.sort(
      (a, b) => (b.mtimeMs ?? 0) - (a.mtimeMs ?? 0),
    )
    const truncated = sortedPaths.length > offset + limit
    return {
      files: sortedPaths
        .slice(offset, offset + limit)
        .map(path => path.fullpath()),
      truncated,
    }
  }
}
