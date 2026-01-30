import path from 'node:path'
import { LEGACY_ENV } from '#config/compat/legacyEnv'

function normalizeTmpDir(raw: string): string {
  return raw.trim().replace(/[\\/]+$/, '')
}

function mapLegacyTmpDirToKodeDir(raw: string): string {
  const normalized = normalizeTmpDir(raw)
  if (!normalized) return normalized

  const base = path.basename(normalized)
  if (base === 'claude') return path.join(path.dirname(normalized), 'kode')
  if (base === 'kode') return normalized
  return path.join(normalized, 'kode')
}

export function resolveSandboxTmpDir(options?: {
  platform?: NodeJS.Platform
}): string {
  const platform = options?.platform ?? process.platform

  const explicitKodeTmpDir = process.env.KODE_TMPDIR
  if (typeof explicitKodeTmpDir === 'string' && explicitKodeTmpDir.trim()) {
    return normalizeTmpDir(explicitKodeTmpDir)
  }

  const legacyTmpDir = process.env[LEGACY_ENV.tmpDir]
  if (typeof legacyTmpDir === 'string' && legacyTmpDir.trim()) {
    return mapLegacyTmpDirToKodeDir(legacyTmpDir)
  }

  const legacyTmpBase = process.env[LEGACY_ENV.codeTmpDir]
  if (typeof legacyTmpBase === 'string' && legacyTmpBase.trim()) {
    return mapLegacyTmpDirToKodeDir(legacyTmpBase)
  }

  if (platform === 'win32') {
    const base =
      process.env.TEMP ??
      process.env.TMP ??
      process.env.USERPROFILE ??
      'C:\\\\Windows\\\\Temp'
    return path.join(base, 'kode')
  }

  return '/tmp/kode'
}

export function buildSandboxEnvAssignments(options?: {
  httpProxyPort?: number
  socksProxyPort?: number
  platform?: NodeJS.Platform
}): string[] {
  const httpProxyPort = options?.httpProxyPort
  const socksProxyPort = options?.socksProxyPort
  const platform = options?.platform ?? process.platform

  const env: string[] = [
    'SANDBOX_RUNTIME=1',
    `TMPDIR=${resolveSandboxTmpDir({ platform })}`,
  ]
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
