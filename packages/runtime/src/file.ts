/**
 * BunFile - File operations using Node.js fs APIs.
 *
 * Note: The function names remain for compatibility, even though the
 * implementation is now Node-compatible (no Bun runtime required).
 */

import { existsSync } from 'node:fs'
import {
  appendFile,
  mkdir,
  open,
  readFile,
  stat,
  writeFile,
} from 'node:fs/promises'
import { dirname } from 'node:path'

function logError(message: string): void {
  if (process.env.NODE_ENV === 'test') {
    console.error(message)
  }
}

/**
 * Read file. Returns null if the file doesn't exist or can't be read.
 */
export async function readFileBun(filepath: string): Promise<string | null> {
  try {
    if (!existsSync(filepath)) {
      return null
    }
    return await readFile(filepath, 'utf8')
  } catch (error) {
    logError(`readFileBun error for ${filepath}: ${error}`)
    return null
  }
}

/**
 * Write file. Returns whether the write succeeded.
 */
export async function writeFileBun(
  filepath: string,
  content: string | Buffer,
): Promise<boolean> {
  try {
    await mkdir(dirname(filepath), { recursive: true })
    await writeFile(filepath, content)
    return true
  } catch (error) {
    logError(`writeFileBun error for ${filepath}: ${error}`)
    return false
  }
}

/**
 * Check if file exists.
 */
export function fileExistsBun(filepath: string): boolean {
  return existsSync(filepath)
}

/**
 * Get file size. Returns 0 if file doesn't exist.
 */
export async function getFileSizeBun(filepath: string): Promise<number> {
  try {
    if (!existsSync(filepath)) {
      return 0
    }
    const s = await stat(filepath)
    return s.size
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
    if (!existsSync(filepath)) {
      return null
    }
    if (!maxBytes) {
      return await readFile(filepath, 'utf8')
    }

    const handle = await open(filepath, 'r')
    try {
      const buffer = Buffer.alloc(maxBytes)
      const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0)
      return buffer.subarray(0, bytesRead).toString('utf8')
    } finally {
      await handle.close()
    }
  } catch (error) {
    logError(`readPartialFileBun error for ${filepath}: ${error}`)
    return null
  }
}

/**
 * Append to a file.
 */
export async function appendFileBun(
  filepath: string,
  content: string,
): Promise<boolean> {
  try {
    await appendFile(filepath, content, 'utf8')
    return true
  } catch (error) {
    logError(`appendFileBun error for ${filepath}: ${error}`)
    return false
  }
}
