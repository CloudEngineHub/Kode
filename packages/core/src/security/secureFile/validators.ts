import { normalize, resolve, relative, isAbsolute, parse } from 'node:path'
import type { ValidateFileNameResult, ValidateFilePathResult } from './types'

export function validateFilePath(args: {
  allowedBasePaths: ReadonlySet<string>
  filePath: string
}): ValidateFilePathResult {
  const { filePath, allowedBasePaths } = args

  try {
    // 规范化路径
    const normalizedPath = normalize(filePath)

    // 检查路径长度
    if (normalizedPath.length > 4096) {
      return {
        isValid: false,
        normalizedPath,
        error: 'Path too long (max 4096 characters)',
      }
    }

    // 检查是否包含路径遍历字符
    if (normalizedPath.includes('..') || normalizedPath.includes('~')) {
      return {
        isValid: false,
        normalizedPath,
        error: 'Path contains traversal characters',
      }
    }

    // 检查是否包含可疑的字符序列
    const suspiciousPatterns = [
      /\.\./, // 父目录
      /~/, // 用户目录
      /\$\{/, // 环境变量
      /`/, // 命令执行
      /\|/, // 管道符
      /;/, // 命令分隔符
      /&/, // 后台执行
      />/, // 输出重定向
      /</, // 输入重定向
    ]

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(normalizedPath)) {
        return {
          isValid: false,
          normalizedPath,
          error: `Path contains suspicious pattern: ${pattern}`,
        }
      }
    }

    // 解析为绝对路径
    const absolutePath = resolve(normalizedPath)

    // 检查是否在允许的基础路径中
    const isInAllowedPath = Array.from(allowedBasePaths).some(basePath => {
      const base = resolve(basePath)
      const rel = relative(base, absolutePath)
      if (!rel || rel === '') return true
      if (rel.startsWith('..')) return false
      if (isAbsolute(rel)) return false
      return true
    })

    if (!isInAllowedPath) {
      return {
        isValid: false,
        normalizedPath,
        error: 'Path is outside allowed directories',
      }
    }

    return { isValid: true, normalizedPath: absolutePath }
  } catch (error) {
    return {
      isValid: false,
      normalizedPath: filePath,
      error: `Path validation failed: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

export function validateFileName(filename: string): ValidateFileNameResult {
  // 检查文件名长度
  if (filename.length === 0) {
    return { isValid: false, error: 'Filename cannot be empty' }
  }

  if (filename.length > 255) {
    return { isValid: false, error: 'Filename too long (max 255 characters)' }
  }

  // 检查文件名字符
  const invalidChars = /[<>:"/\\|?*\x00-\x1F]/
  if (invalidChars.test(filename)) {
    return { isValid: false, error: 'Filename contains invalid characters' }
  }

  // 检查保留文件名
  const reservedNames = [
    'CON',
    'PRN',
    'AUX',
    'NUL',
    'COM1',
    'COM2',
    'COM3',
    'COM4',
    'COM5',
    'COM6',
    'COM7',
    'COM8',
    'COM9',
    'LPT1',
    'LPT2',
    'LPT3',
    'LPT4',
    'LPT5',
    'LPT6',
    'LPT7',
    'LPT8',
    'LPT9',
  ]

  const baseName = filename.split('.')[0].toUpperCase()
  if (reservedNames.includes(baseName)) {
    return { isValid: false, error: 'Filename is reserved' }
  }

  // 检查是否以点开头或结尾
  if (filename.startsWith('.') || filename.endsWith('.')) {
    return {
      isValid: false,
      error: 'Filename cannot start or end with a dot',
    }
  }

  // 检查是否以空格开头或结尾
  if (filename.startsWith(' ') || filename.endsWith(' ')) {
    return {
      isValid: false,
      error: 'Filename cannot start or end with spaces',
    }
  }

  return { isValid: true }
}
