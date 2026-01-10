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
  getSpecialAllowedReadReason,
  getWriteSafetyCheckForPath,
  isPlanFileForContext,
} from './fileToolPermissionEngine/plan'

export { suggestFilePermissionUpdates } from './fileToolPermissionEngine/suggest'
