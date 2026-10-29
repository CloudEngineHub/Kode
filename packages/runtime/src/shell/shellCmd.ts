import { existsSync } from 'fs'

type ShellCommandSpec = {
  cmd: string[]
  env: NodeJS.ProcessEnv
  windowsVerbatimArguments?: boolean
}

export function quotePosixShellArg(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
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

// The command is trusted shell syntax; args are literal data. Keep filenames
// out of that syntax instead of relying on spawn(..., args, { shell: true }).
export function getShellCmdWithArgsForPlatform(
  platform: NodeJS.Platform,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): ShellCommandSpec {
  if (platform !== 'win32') {
    return {
      cmd: [
        ...getShellCmdForPlatform(platform, `${command} "$@"`, env),
        'kode-shell',
        ...args,
      ],
      env,
    }
  }

  const childEnv = { ...env }
  const references = args.map((arg, index) => {
    // These characters cannot occur in a valid Windows filename. A literal
    // quote would break cmd's quoting boundary when the variable expands.
    if (/["\0\r\n]/.test(arg))
      throw new Error('Unsupported character in Windows shell argument')
    const key = `__KODE_SHELL_ARG_${index}`
    childEnv[key] = arg
    return `"%${key}%"`
  })
  const comspec = env.ComSpec || 'cmd.exe'
  return {
    cmd: [
      comspec,
      '/d',
      '/v:off',
      '/s',
      '/c',
      `"${command} ${references.join(' ')}"`,
    ],
    env: childEnv,
    windowsVerbatimArguments: true,
  }
}

export function getOpenTargetCmdForPlatform(
  platform: NodeJS.Platform,
  target: string,
  env: NodeJS.ProcessEnv = process.env,
): ShellCommandSpec {
  if (platform === 'win32') {
    return getShellCmdWithArgsForPlatform(platform, 'start ""', [target], env)
  }
  return { cmd: [platform === 'darwin' ? 'open' : 'xdg-open', target], env }
}
