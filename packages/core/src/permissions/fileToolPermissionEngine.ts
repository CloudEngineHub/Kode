export {
  expandSymlinkPaths,
  hasSuspiciousWindowsPathPattern,
  isPathInWorkingDirectories,
  isSensitiveFilePath,
  isWriteProtectedPath,
  resolveLikeCliPath,
} from './fileToolPermissionEngine/paths'

export { matchPermissionRuleForPath } from './fileToolPermissionEngine/rules'

export {
  getPlanFileWritePrivilegeForContext,
  getSpecialAllowedWriteReason,
  getSpecialAllowedReadReason,
  getWriteSafetyCheckForPath,
  isSpecialAllowedWritePathForContext,
  isPlanFileForContext,
} from './fileToolPermissionEngine/plan'

export { suggestFilePermissionUpdates } from './fileToolPermissionEngine/suggest'
