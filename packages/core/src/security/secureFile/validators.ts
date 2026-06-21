import { isAbsolute, normalize, relative, resolve } from 'node:path'
import type { ValidateFileNameResult, ValidateFilePathResult } from './types'

export function validateFilePath(args: {
  allowedBasePaths: ReadonlySet<string>
  filePath: string
}): ValidateFilePathResult {
  const { filePath, allowedBasePaths } = args

  try {
    const normalizedPath = normalize(filePath)

    if (normalizedPath.length > 4096) {
      return {
        isValid: false,
        normalizedPath,
        error: 'Path too long (max 4096 characters)',
      }
    }

    if (normalizedPath.includes('..') || /^~([\\/]|$)/.test(normalizedPath)) {
      return {
        isValid: false,
        normalizedPath,
        error: 'Path contains traversal characters',
      }
    }

    const suspiciousPatterns = [
      /\.\./,
      /\$\{/,
      /`/,
      /\|/,
      /;/,
      /&/,
      />/,
      /</,
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

    const absolutePath = resolve(normalizedPath)
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
      error: `Path validation failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    }
  }
}

export function validateFileName(filename: string): ValidateFileNameResult {
  if (filename.length === 0) {
    return { isValid: false, error: 'Filename cannot be empty' }
  }

  if (filename.length > 255) {
    return { isValid: false, error: 'Filename too long (max 255 characters)' }
  }

  const invalidChars = /[<>:"/\\|?*\x00-\x1F]/
  if (invalidChars.test(filename)) {
    return { isValid: false, error: 'Filename contains invalid characters' }
  }

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

  if (filename.startsWith('.') || filename.endsWith('.')) {
    return {
      isValid: false,
      error: 'Filename cannot start or end with a dot',
    }
  }

  if (filename.startsWith(' ') || filename.endsWith(' ')) {
    return {
      isValid: false,
      error: 'Filename cannot start or end with spaces',
    }
  }

  return { isValid: true }
}
