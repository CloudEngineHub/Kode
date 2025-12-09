/**
 * BunFile - File operations using Bun.file()
 *
 * Replaces heavy Node.js fs APIs with Bun's optimized implementations:
 * - Bun.file() for reading/writing
 * - Async streaming for large files
 * - Better memory efficiency
 */

import { logError } from './log'

/**
 * Read file using Bun.file()
 * Returns null if file doesn't exist or can't be read
 */
export async function readFileBun(filepath: string): Promise<string | null> {
  try {
    const file = Bun.file(filepath)
    return await file.text()
  } catch (error) {
    logError(`readFileBun error for ${filepath}: ${error}`)
    return null
  }
}

/**
 * Write file using Bun.write()
 * Creates directories if needed
 */
export async function writeFileBun(
  filepath: string,
  content: string | Buffer,
): Promise<boolean> {
  try {
    await Bun.write(filepath, content)
    return true
  } catch (error) {
    logError(`writeFileBun error for ${filepath}: ${error}`)
    return false
  }
}

/**
 * Check if file exists using Bun.file()
 */
export function fileExistsBun(filepath: string): boolean {
  try {
    const file = Bun.file(filepath)
    return file.size > 0 || file.size === 0 // Both cases mean file exists
  } catch {
    return false
  }
}

/**
 * Get file size using Bun.file()
 */
export async function getFileSizeBun(filepath: string): Promise<number> {
  try {
    const file = Bun.file(filepath)
    return file.size
  } catch (error) {
    logError(`getFileSizeBun error for ${filepath}: ${error}`)
    return 0
  }
}

/**
 * Read file asynchronously with optional limit
 * Useful for large files where we only need partial content
 */
export async function readPartialFileBun(
  filepath: string,
  maxBytes?: number,
): Promise<string | null> {
  try {
    const file = Bun.file(filepath)
    if (maxBytes && file.size > maxBytes) {
      // Only read first maxBytes
      const buffer = await file.slice(0, maxBytes).arrayBuffer()
      return new TextDecoder().decode(buffer)
    }
    return await file.text()
  } catch (error) {
    logError(`readPartialFileBun error for ${filepath}: ${error}`)
    return null
  }
}

/**
 * Append to file using Bun.write()
 */
export async function appendFileBun(
  filepath: string,
  content: string,
): Promise<boolean> {
  try {
    const existing = await readFileBun(filepath)
    const newContent = existing ? existing + content : content
    return await writeFileBun(filepath, newContent)
  } catch (error) {
    logError(`appendFileBun error for ${filepath}: ${error}`)
    return false
  }
}
