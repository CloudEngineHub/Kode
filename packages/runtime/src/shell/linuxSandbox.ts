import { existsSync, realpathSync, statSync } from 'fs'
import { homedir } from 'os'
import { dirname, isAbsolute, resolve } from 'path'
import type {
  BunShellSandboxReadConfig,
  BunShellSandboxWriteConfig,
} from './types'
import { buildSandboxEnvAssignments } from './sandboxEnv'

export function hasGlobPattern(value: string): boolean {
  return (
    value.includes('*') ||
    value.includes('?') ||
    value.includes('[') ||
    value.includes(']')
  )
}

// Compatibility: Linux sandbox path normalization.
export function normalizeLinuxSandboxPath(
  input: string,
  options?: { cwd?: string; homeDir?: string },
): string {
  const cwd = options?.cwd ?? process.cwd()
  const homeDir = options?.homeDir ?? homedir()

  let resolved = input
  if (input === '~') resolved = homeDir
  else if (input.startsWith('~/')) resolved = homeDir + input.slice(1)
  else if (input.startsWith('./') || input.startsWith('../'))
    resolved = resolve(cwd, input)
  else if (!isAbsolute(input)) resolved = resolve(cwd, input)

  if (hasGlobPattern(resolved)) {
    const prefix = resolved.split(/[*?[\]]/)[0]
    if (prefix && prefix !== '/') {
      const dir = prefix.endsWith('/') ? prefix.slice(0, -1) : dirname(prefix)
      try {
        const real = realpathSync(dir)
        const suffix = resolved.slice(dir.length)
        return real + suffix
      } catch {
        // fall through
      }
    }
    return resolved
  }

  try {
    resolved = realpathSync(resolved)
  } catch {
    // ignore
  }

  return resolved
}

export function buildLinuxBwrapFilesystemArgs(options: {
  cwd?: string
  homeDir?: string
  readConfig?: BunShellSandboxReadConfig
  writeConfig?: BunShellSandboxWriteConfig
  extraDenyWithinAllow?: string[]
}): string[] {
  const cwd = options.cwd ?? process.cwd()
  const homeDir = options.homeDir ?? homedir()

  const args: string[] = []

  const writeConfig = options.writeConfig
  if (writeConfig) {
    args.push('--ro-bind', '/', '/')

    const allowedRoots: string[] = []

    // Dedicated temp directory for sandboxed runs.
    // Bind it explicitly so tools can create temp files even when '/' is ro-bound.
    if (existsSync('/tmp/kode')) {
      args.push('--bind', '/tmp/kode', '/tmp/kode')
      allowedRoots.push('/tmp/kode')
    }
    for (const raw of writeConfig.allowOnly ?? []) {
      const resolved = normalizeLinuxSandboxPath(raw, { cwd, homeDir })
      if (resolved.startsWith('/dev/')) continue
      if (!existsSync(resolved)) continue
      args.push('--bind', resolved, resolved)
      allowedRoots.push(resolved)
    }

    const denyWithinAllow = [
      ...(writeConfig.denyWithinAllow ?? []),
      ...(options.extraDenyWithinAllow ?? []),
    ]
    for (const raw of denyWithinAllow) {
      const resolved = normalizeLinuxSandboxPath(raw, { cwd, homeDir })
      if (resolved.startsWith('/dev/')) continue
      if (!existsSync(resolved)) continue
      const withinAllowed = allowedRoots.some(
        root => resolved === root || resolved.startsWith(root + '/'),
      )
      if (!withinAllowed) continue
      args.push('--ro-bind', resolved, resolved)
    }
  } else {
    args.push('--bind', '/', '/')
  }

  const denyRead = [...(options.readConfig?.denyOnly ?? [])]
  if (existsSync('/etc/ssh/ssh_config.d'))
    denyRead.push('/etc/ssh/ssh_config.d')

  for (const raw of denyRead) {
    const resolved = normalizeLinuxSandboxPath(raw, { cwd, homeDir })
    if (resolved.startsWith('/dev/')) continue
    if (!existsSync(resolved)) continue
    if (statSync(resolved).isDirectory()) args.push('--tmpfs', resolved)
    else args.push('--ro-bind', '/dev/null', resolved)
  }

  return args
}

export function buildLinuxBwrapCommand(options: {
  bwrapPath: string
  command: string
  needsNetworkRestriction?: boolean
  httpProxyPort?: number
  socksProxyPort?: number
  linuxBridge?: { httpSocketPath: string; socksSocketPath: string }
  linuxSeccomp?: { applySeccompPath: string; bpfPath: string }
  readConfig?: BunShellSandboxReadConfig
  writeConfig?: BunShellSandboxWriteConfig
  enableWeakerNestedSandbox?: boolean
  binShellPath: string
  cwd?: string
  homeDir?: string
}): string[] {
  const args: string[] = []

  const bridge =
    options.needsNetworkRestriction === true ? options.linuxBridge : undefined

  const shQuote = (value: string): string =>
    `'${value.replace(/'/g, `'\"'\"'`)}'`

  const seccompCommand = options.linuxSeccomp
    ? [
        shQuote(options.linuxSeccomp.applySeccompPath),
        shQuote(options.linuxSeccomp.bpfPath),
        shQuote(options.binShellPath),
        '-c',
        shQuote(options.command),
      ].join(' ')
    : options.command

  const command = bridge
    ? [
        `socat TCP-LISTEN:${options.httpProxyPort ?? 3128},fork,reuseaddr UNIX-CONNECT:${bridge.httpSocketPath} >/dev/null 2>&1 &`,
        `socat TCP-LISTEN:${options.socksProxyPort ?? 1080},fork,reuseaddr UNIX-CONNECT:${bridge.socksSocketPath} >/dev/null 2>&1 &`,
        'trap "kill %1 %2 2>/dev/null; exit" EXIT',
        seccompCommand,
      ].join('\n')
    : seccompCommand

  // Safer defaults: isolate namespaces and ensure sandbox dies with the parent.
  args.push(
    '--die-with-parent',
    '--new-session',
    '--unshare-pid',
    '--unshare-uts',
    '--unshare-ipc',
  )
  if (options.needsNetworkRestriction) args.push('--unshare-net')

  args.push(
    ...buildLinuxBwrapFilesystemArgs({
      cwd: options.cwd,
      homeDir: options.homeDir,
      readConfig: options.readConfig,
      writeConfig: options.writeConfig,
    }),
  )

  // Provide a minimal /dev and compatibility env.
  args.push('--dev', '/dev')

  const envAssignments = buildSandboxEnvAssignments({
    httpProxyPort: bridge ? options.httpProxyPort : undefined,
    socksProxyPort: bridge ? options.socksProxyPort : undefined,
    platform: 'linux',
  })
  for (const entry of envAssignments) {
    const idx = entry.indexOf('=')
    if (idx === -1) continue
    const key = entry.slice(0, idx)
    const value = entry.slice(idx + 1)
    args.push('--setenv', key, value)
  }
  if (!options.enableWeakerNestedSandbox) args.push('--proc', '/proc')

  args.push('--', options.binShellPath, '-c', command)

  return [options.bwrapPath, ...args]
}
