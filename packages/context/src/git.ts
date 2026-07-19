import { memoize } from 'lodash-es'

import { execFileNoThrow } from '@kode/context/execFileNoThrow'

export const getIsGit = memoize(async (): Promise<boolean> => {
  const { code } = await execFileNoThrow('git', [
    'rev-parse',
    '--is-inside-work-tree',
  ])
  return code === 0
})

export const getGitEmail = memoize(async (): Promise<string | undefined> => {
  const result = await execFileNoThrow('git', ['config', '--get', 'user.email'])
  return result.code === 0 ? result.stdout.trim() || undefined : undefined
})
