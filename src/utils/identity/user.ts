import { getGlobalConfig, getOrCreateUserID } from '@utils/config'
import { memoize } from 'lodash-es'
import { env } from '@utils/config/env'
import { execFileNoThrow } from '@utils/system/execFileNoThrow'
import { logError, SESSION_ID } from '@utils/log'
import { MACRO } from '@constants/macros'
export const getGitEmail = memoize(async (): Promise<string | undefined> => {
  const result = await execFileNoThrow('git', ['config', '--get', 'user.email'])
  if (result.code !== 0) {
    const stdout = result.stdout.trim()
    const stderr = result.stderr.trim()
    if (stdout || stderr || result.code !== 1) {
      logError(`Failed to get git email: ${stdout} ${stderr}`.trim())
    }
    return undefined
  }
  return result.stdout.trim() || undefined
})

type SimpleUser = {
  customIDs?: Record<string, string>
  userID: string
  appVersion?: string
  userAgent?: string
  email?: string
  custom?: Record<string, unknown>
}

export const getUser = memoize(async (): Promise<SimpleUser> => {
  const userID = getOrCreateUserID()
  const config = getGlobalConfig()
  const email = undefined
  return {
    customIDs: {
      sessionId: SESSION_ID,
    },
    userID,
    appVersion: MACRO.VERSION,
    userAgent: env.platform,
    email,
    custom: {
      nodeVersion: env.nodeVersion,
      userType: process.env.USER_TYPE,
      organizationUuid: config.oauthAccount?.organizationUuid,
      accountUuid: config.oauthAccount?.accountUuid,
    },
  }
})
