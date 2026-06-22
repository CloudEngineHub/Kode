import { existsSync } from 'fs'

export function getShellStdioForPlatform(
  platform: NodeJS.Platform,
): ['ignore' | 'pipe', 'pipe' | 'overlapped', 'pipe' | 'overlapped'] {
  if (platform === 'win32') {
    return ['ignore', 'overlapped', 'overlapped']
  }
  return ['ignore', 'pipe', 'pipe']
}

export function getShellCmdForPlatform(
  platform: NodeJS.Platform,
  command: string,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  if (platform === 'win32') {
    const comspec =
      typeof env.ComSpec === 'string' && env.ComSpec.length > 0
        ? env.ComSpec
        : 'cmd'
    return [comspec, '/c', command]
  }
  const sh = existsSync('/bin/sh') ? '/bin/sh' : 'sh'
  return [sh, '-c', command]
}
