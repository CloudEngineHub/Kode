import { existsSync } from 'fs'
import { dirname } from 'path'
import { hasGlobPattern, normalizeLinuxSandboxPath } from './linuxSandbox'
import type {
  BunShellSandboxReadConfig,
  BunShellSandboxWriteConfig,
} from './types'

function buildSandboxEnvAssignments(options?: {
  httpProxyPort?: number
  socksProxyPort?: number
  platform?: NodeJS.Platform
}): string[] {
  const httpProxyPort = options?.httpProxyPort
  const socksProxyPort = options?.socksProxyPort
  const platform = options?.platform ?? process.platform

  const env: string[] = ['SANDBOX_RUNTIME=1', 'TMPDIR=/tmp/kode']
  if (!httpProxyPort && !socksProxyPort) return env

  const noProxy = [
    'localhost',
    '127.0.0.1',
    '::1',
    '*.local',
    '.local',
    '169.254.0.0/16',
    '10.0.0.0/8',
    '172.16.0.0/12',
    '192.168.0.0/16',
  ].join(',')
  env.push(`NO_PROXY=${noProxy}`)
  env.push(`no_proxy=${noProxy}`)

  if (httpProxyPort) {
    env.push(`HTTP_PROXY=http://localhost:${httpProxyPort}`)
    env.push(`HTTPS_PROXY=http://localhost:${httpProxyPort}`)
    env.push(`http_proxy=http://localhost:${httpProxyPort}`)
    env.push(`https_proxy=http://localhost:${httpProxyPort}`)
  }

  if (socksProxyPort) {
    env.push(`ALL_PROXY=socks5h://localhost:${socksProxyPort}`)
    env.push(`all_proxy=socks5h://localhost:${socksProxyPort}`)
    if (platform === 'darwin') {
      env.push(
        `GIT_SSH_COMMAND="ssh -o ProxyCommand='nc -X 5 -x localhost:${socksProxyPort} %h %p'"`,
      )
    }
    env.push(`FTP_PROXY=socks5h://localhost:${socksProxyPort}`)
    env.push(`ftp_proxy=socks5h://localhost:${socksProxyPort}`)
    env.push(`RSYNC_PROXY=localhost:${socksProxyPort}`)
    env.push(
      `DOCKER_HTTP_PROXY=http://localhost:${httpProxyPort || socksProxyPort}`,
    )
    env.push(
      `DOCKER_HTTPS_PROXY=http://localhost:${httpProxyPort || socksProxyPort}`,
    )
    if (httpProxyPort) {
      env.push('CLOUDSDK_PROXY_TYPE=https')
      env.push('CLOUDSDK_PROXY_ADDRESS=localhost')
      env.push(`CLOUDSDK_PROXY_PORT=${httpProxyPort}`)
    }
    env.push(`GRPC_PROXY=socks5h://localhost:${socksProxyPort}`)
    env.push(`grpc_proxy=socks5h://localhost:${socksProxyPort}`)
  }

  return env
}

function escapeRegexForSandboxGlobPattern(pattern: string): string {
  return (
    '^' +
    pattern
      .replace(/[.^$+{}()|\\]/g, '\\$&')
      .replace(/\[([^\]]*?)$/g, '\\[$1')
      .replace(/\*\*\//g, '__GLOBSTAR_SLASH__')
      .replace(/\*\*/g, '__GLOBSTAR__')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]')
      .replace(/__GLOBSTAR_SLASH__/g, '(.*/)?')
      .replace(/__GLOBSTAR__/g, '.*') +
    '$'
  )
}

function getMacosTmpDirWriteAllowPaths(): string[] {
  const tmpdirValue = process.env.TMPDIR
  if (!tmpdirValue) return []
  if (!tmpdirValue.match(/^\/(private\/)?var\/folders\/[^/]{2}\/[^/]+\/T\/?$/))
    return []
  const base = tmpdirValue.replace(/\/T\/?$/, '')
  if (base.startsWith('/private/var/'))
    return [base, base.replace('/private', '')]
  if (base.startsWith('/var/')) return [base, '/private' + base]
  return [base]
}

function buildMacosSandboxDenyUnlinkRules(
  paths: string[],
  logTag: string,
): string[] {
  const lines: string[] = []
  for (const raw of paths) {
    const normalized = normalizeLinuxSandboxPath(raw)
    if (hasGlobPattern(normalized)) {
      const regex = escapeRegexForSandboxGlobPattern(normalized)
      lines.push(
        '(deny file-write-unlink',
        `  (regex ${JSON.stringify(regex)})`,
        `  (with message "${logTag}"))`,
      )

      const prefix = normalized.split(/[*?[\]]/)[0]
      if (prefix && prefix !== '/') {
        const literal = prefix.endsWith('/')
          ? prefix.slice(0, -1)
          : dirname(prefix)
        lines.push(
          '(deny file-write-unlink',
          `  (literal ${JSON.stringify(literal)})`,
          `  (with message "${logTag}"))`,
        )
      }
      continue
    }

    lines.push(
      '(deny file-write-unlink',
      `  (subpath ${JSON.stringify(normalized)})`,
      `  (with message "${logTag}"))`,
    )
  }
  return lines
}

function buildMacosSandboxFileReadRules(
  readConfig: BunShellSandboxReadConfig | undefined,
  logTag: string,
): string[] {
  if (!readConfig) return ['(allow file-read*)']

  const lines: string[] = ['(allow file-read*)']
  for (const raw of readConfig.denyOnly ?? []) {
    const normalized = normalizeLinuxSandboxPath(raw)
    if (hasGlobPattern(normalized)) {
      const regex = escapeRegexForSandboxGlobPattern(normalized)
      lines.push(
        '(deny file-read*',
        `  (regex ${JSON.stringify(regex)})`,
        `  (with message "${logTag}"))`,
      )
    } else {
      lines.push(
        '(deny file-read*',
        `  (subpath ${JSON.stringify(normalized)})`,
        `  (with message "${logTag}"))`,
      )
    }
  }

  lines.push(
    ...buildMacosSandboxDenyUnlinkRules(readConfig.denyOnly ?? [], logTag),
  )
  return lines
}

function buildMacosSandboxFileWriteRules(
  writeConfig: BunShellSandboxWriteConfig | undefined,
  logTag: string,
): string[] {
  if (!writeConfig) return ['(allow file-write*)']

  const lines: string[] = []

  // Common safe sink used by shells and CLI tools.
  lines.push(
    '(allow file-write*',
    `  (literal "/dev/null")`,
    `  (with message "${logTag}"))`,
  )

  for (const raw of getMacosTmpDirWriteAllowPaths()) {
    const normalized = normalizeLinuxSandboxPath(raw)
    lines.push(
      '(allow file-write*',
      `  (subpath ${JSON.stringify(normalized)})`,
      `  (with message "${logTag}"))`,
    )
  }

  for (const raw of writeConfig.allowOnly ?? []) {
    const normalized = normalizeLinuxSandboxPath(raw)
    if (hasGlobPattern(normalized)) {
      const regex = escapeRegexForSandboxGlobPattern(normalized)
      lines.push(
        '(allow file-write*',
        `  (regex ${JSON.stringify(regex)})`,
        `  (with message "${logTag}"))`,
      )
    } else {
      lines.push(
        '(allow file-write*',
        `  (subpath ${JSON.stringify(normalized)})`,
        `  (with message "${logTag}"))`,
      )
    }
  }

  for (const raw of writeConfig.denyWithinAllow ?? []) {
    const normalized = normalizeLinuxSandboxPath(raw)
    if (hasGlobPattern(normalized)) {
      const regex = escapeRegexForSandboxGlobPattern(normalized)
      lines.push(
        '(deny file-write*',
        `  (regex ${JSON.stringify(regex)})`,
        `  (with message "${logTag}"))`,
      )
    } else {
      lines.push(
        '(deny file-write*',
        `  (subpath ${JSON.stringify(normalized)})`,
        `  (with message "${logTag}"))`,
      )
    }
  }

  lines.push(
    ...buildMacosSandboxDenyUnlinkRules(
      writeConfig.denyWithinAllow ?? [],
      logTag,
    ),
  )
  return lines
}

export function buildMacosSandboxExecCommand(options: {
  sandboxExecPath: string
  binShellPath: string
  command: string
  needsNetworkRestriction: boolean
  httpProxyPort?: number
  socksProxyPort?: number
  allowUnixSockets?: string[]
  allowAllUnixSockets?: boolean
  allowLocalBinding?: boolean
  readConfig?: BunShellSandboxReadConfig
  writeConfig?: BunShellSandboxWriteConfig
}): string[] {
  const logTag = 'KODE_SANDBOX'

  const profileLines: string[] = [
    '(version 1)',
    `(deny default (with message "${logTag}"))`,
    '',
    '; Kode sandbox-exec profile (compatibility mode)',
    '',
    // Keep this permissive enough for typical CLI tools (git, node, etc).
    '(allow process*)',
    '(allow sysctl-read)',
    '(allow mach-lookup)',
    '',
    '; Network',
  ]

  const allowUnixSockets = options.allowUnixSockets ?? []
  if (!options.needsNetworkRestriction) {
    profileLines.push('(allow network*)')
  } else {
    if (options.allowLocalBinding) {
      profileLines.push('(allow network-bind (local ip "localhost:*"))')
      profileLines.push('(allow network-inbound (local ip "localhost:*"))')
      profileLines.push('(allow network-outbound (local ip "localhost:*"))')
    }
    if (options.allowAllUnixSockets) {
      profileLines.push('(allow network* (subpath "/"))')
    } else if (allowUnixSockets.length > 0) {
      for (const socketPath of allowUnixSockets) {
        const normalized = normalizeLinuxSandboxPath(socketPath)
        profileLines.push(
          `(allow network* (subpath ${JSON.stringify(normalized)}))`,
        )
      }
    }
    if (options.httpProxyPort !== undefined) {
      profileLines.push(
        `(allow network-bind (local ip "localhost:${options.httpProxyPort}"))`,
      )
      profileLines.push(
        `(allow network-inbound (local ip "localhost:${options.httpProxyPort}"))`,
      )
      profileLines.push(
        `(allow network-outbound (remote ip "localhost:${options.httpProxyPort}"))`,
      )
    }
    if (options.socksProxyPort !== undefined) {
      profileLines.push(
        `(allow network-bind (local ip "localhost:${options.socksProxyPort}"))`,
      )
      profileLines.push(
        `(allow network-inbound (local ip "localhost:${options.socksProxyPort}"))`,
      )
      profileLines.push(
        `(allow network-outbound (remote ip "localhost:${options.socksProxyPort}"))`,
      )
    }
  }

  profileLines.push('')
  profileLines.push('; File read')
  profileLines.push(
    ...buildMacosSandboxFileReadRules(options.readConfig, logTag),
  )
  profileLines.push('')
  profileLines.push('; File write')
  profileLines.push(
    ...buildMacosSandboxFileWriteRules(options.writeConfig, logTag),
  )

  const profile = profileLines.join('\n')
  const envAssignments = buildSandboxEnvAssignments({
    httpProxyPort: options.httpProxyPort,
    socksProxyPort: options.socksProxyPort,
    platform: 'darwin',
  })
  const envPrefix = envAssignments.length
    ? `export ${envAssignments.join(' ')} && `
    : ''

  return [
    options.sandboxExecPath,
    '-p',
    profile,
    options.binShellPath,
    '-c',
    `${envPrefix}${options.command}`,
  ]
}
