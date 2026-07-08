import { PRODUCT_NAME } from '#config/constants'

import {
  expandSymlinkPaths,
  hasSuspiciousWindowsPathPattern,
  isSensitiveFilePath,
  isWriteProtectedPath,
} from './paths'

export function getWriteSafetyCheckForPath(
  inputPath: string,
): { safe: true } | { safe: false; message: string } {
  const candidates = expandSymlinkPaths(inputPath)
  for (const candidate of candidates) {
    if (hasSuspiciousWindowsPathPattern(candidate)) {
      return {
        safe: false,
        message: `${PRODUCT_NAME} requested permissions to write to ${inputPath}, which contains a suspicious Windows path pattern that requires manual approval.`,
      }
    }
  }

  for (const candidate of candidates) {
    if (isWriteProtectedPath(candidate)) {
      return {
        safe: false,
        message: `${PRODUCT_NAME} requested permissions to write to ${inputPath}, but you haven't granted it yet.`,
      }
    }
  }

  for (const candidate of candidates) {
    if (isSensitiveFilePath(candidate)) {
      return {
        safe: false,
        message: `${PRODUCT_NAME} requested permissions to edit ${inputPath} which is a sensitive file.`,
      }
    }
  }

  return { safe: true }
}
