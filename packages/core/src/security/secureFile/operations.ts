import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  statSync,
  unlinkSync,
  renameSync,
} from 'node:fs'
import { dirname, extname, normalize, resolve } from 'node:path'

import type {
  SafeCreateDirectoryResult,
  SafeDeleteFileResult,
  SafeFileInfoResult,
  SafeReadFileOptions,
  SafeReadFileResult,
  SafeWriteFileOptions,
  SafeWriteFileResult,
  SecureFileConfig,
} from './types'
import { validateFilePath } from './validators'

export function safeExists(
  config: SecureFileConfig,
  filePath: string,
): boolean {
  const validation = validateFilePath({
    allowedBasePaths: config.allowedBasePaths,
    filePath,
  })
  if (!validation.isValid) {
    return false
  }

  try {
    return existsSync(validation.normalizedPath)
  } catch {
    return false
  }
}

export function safeReadFile(
  config: SecureFileConfig,
  filePath: string,
  options: SafeReadFileOptions = {},
): SafeReadFileResult {
  const validation = validateFilePath({
    allowedBasePaths: config.allowedBasePaths,
    filePath,
  })
  if (!validation.isValid) {
    return { success: false, error: validation.error }
  }

  try {
    const normalizedPath = validation.normalizedPath

    // 检查文件扩展名（如果启用）
    if (options.checkFileExtension !== false) {
      const ext = extname(normalizedPath).toLowerCase()
      const allowedExts =
        options.allowedExtensions ?? Array.from(config.allowedExtensions)

      if (allowedExts.length > 0 && !allowedExts.includes(ext)) {
        return {
          success: false,
          error: `File extension '${ext}' is not allowed`,
        }
      }
    }

    // 检查文件是否存在
    if (!existsSync(normalizedPath)) {
      return { success: false, error: 'File does not exist' }
    }

    // 获取文件信息
    const stats = statSync(normalizedPath)
    const maxSize = options.maxFileSize ?? config.maxFileSize

    // 检查文件大小
    if (stats.size > maxSize) {
      return {
        success: false,
        error: `File too large (${stats.size} bytes, max ${maxSize} bytes)`,
      }
    }

    // 检查文件类型
    if (!stats.isFile()) {
      return { success: false, error: 'Path is not a file' }
    }

    // 检查文件权限
    if ((stats.mode & parseInt('400', 8)) === 0) {
      // 检查读权限
      return { success: false, error: 'No read permission' }
    }

    // 读取文件内容
    const content = readFileSync(normalizedPath, {
      encoding: options.encoding ?? 'utf8',
    })

    return {
      success: true,
      content,
      stats: {
        size: stats.size,
        mtime: stats.mtime,
        atime: stats.atime,
        mode: stats.mode,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

export function safeWriteFile(
  config: SecureFileConfig,
  filePath: string,
  content: string | Buffer,
  options: SafeWriteFileOptions = {},
): SafeWriteFileResult {
  const validation = validateFilePath({
    allowedBasePaths: config.allowedBasePaths,
    filePath,
  })
  if (!validation.isValid) {
    return { success: false, error: validation.error }
  }

  try {
    const normalizedPath = validation.normalizedPath

    // 检查文件扩展名（如果启用）
    if (options.checkFileExtension !== false) {
      const ext = extname(normalizedPath).toLowerCase()
      const allowedExts =
        options.allowedExtensions ?? Array.from(config.allowedExtensions)

      if (allowedExts.length > 0 && !allowedExts.includes(ext)) {
        return {
          success: false,
          error: `File extension '${ext}' is not allowed`,
        }
      }
    }

    // 检查内容大小
    const encoding = options.encoding ?? 'utf8'
    const contentSize =
      typeof content === 'string'
        ? Buffer.byteLength(content, encoding)
        : content.length

    const maxSize = options.maxSize ?? config.maxFileSize
    if (contentSize > maxSize) {
      return {
        success: false,
        error: `Content too large (${contentSize} bytes, max ${maxSize} bytes)`,
      }
    }

    // 创建目录（如果需要）
    if (options.createDirectory) {
      const dir = dirname(normalizedPath)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true, mode: 0o755 })
      }
    }

    // 原子写入（如果启用）
    if (options.atomic) {
      const tempPath = `${normalizedPath}.tmp.${Date.now()}`

      try {
        // 写入临时文件
        writeFileSync(tempPath, content, {
          encoding,
          mode: options.mode ?? 0o644,
        })

        // 重命名为目标文件
        renameSync(tempPath, normalizedPath)
      } catch (renameError) {
        // 清理临时文件
        try {
          if (existsSync(tempPath)) {
            unlinkSync(tempPath)
          }
        } catch {
          // 忽略清理错误
        }
        throw renameError
      }
    } else {
      // 直接写入
      writeFileSync(normalizedPath, content, {
        encoding,
        mode: options.mode ?? 0o644,
      })
    }

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: `Failed to write file: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

export function safeDeleteFile(
  config: SecureFileConfig,
  filePath: string,
): SafeDeleteFileResult {
  const validation = validateFilePath({
    allowedBasePaths: config.allowedBasePaths,
    filePath,
  })
  if (!validation.isValid) {
    return { success: false, error: validation.error }
  }

  try {
    const normalizedPath = validation.normalizedPath

    // 检查文件是否存在
    if (!existsSync(normalizedPath)) {
      return { success: false, error: 'File does not exist' }
    }

    // 检查文件类型
    const stats = statSync(normalizedPath)
    if (!stats.isFile()) {
      return { success: false, error: 'Path is not a file' }
    }

    // 检查写权限
    if ((stats.mode & parseInt('200', 8)) === 0) {
      return { success: false, error: 'No write permission' }
    }

    // 安全删除
    unlinkSync(normalizedPath)
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: `Failed to delete file: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

export function safeCreateDirectory(
  config: SecureFileConfig,
  dirPath: string,
  mode: number = 0o755,
): SafeCreateDirectoryResult {
  const validation = validateFilePath({
    allowedBasePaths: config.allowedBasePaths,
    filePath: dirPath,
  })
  if (!validation.isValid) {
    return { success: false, error: validation.error }
  }

  try {
    const normalizedPath = validation.normalizedPath

    if (existsSync(normalizedPath)) {
      const stats = statSync(normalizedPath)
      if (!stats.isDirectory()) {
        return {
          success: false,
          error: 'Path already exists and is not a directory',
        }
      }
      return { success: true }
    }

    mkdirSync(normalizedPath, { recursive: true, mode })
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: `Failed to create directory: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

export function safeGetFileInfo(
  config: SecureFileConfig,
  filePath: string,
): SafeFileInfoResult {
  const validation = validateFilePath({
    allowedBasePaths: config.allowedBasePaths,
    filePath,
  })
  if (!validation.isValid) {
    return { success: false, error: validation.error }
  }

  try {
    const normalizedPath = validation.normalizedPath

    if (!existsSync(normalizedPath)) {
      return { success: false, error: 'File does not exist' }
    }

    const stats = statSync(normalizedPath)

    return {
      success: true,
      stats: {
        size: stats.size,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        mode: stats.mode,
        atime: stats.atime,
        mtime: stats.mtime,
        ctime: stats.ctime,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to get file info: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

export function normalizePathInput(path: string): string {
  return normalize(resolve(path))
}
