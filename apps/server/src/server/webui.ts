import { readFileSync, realpathSync, statSync } from 'node:fs'
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path'

const RESERVED_DAEMON_PATHS = new Set(['api', 'health', 'ws'])

const CONTENT_TYPES: Record<string, string> = {
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.eot': 'application/vnd.ms-fontobject',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function isWithinRoot(root: string, candidate: string): boolean {
  const candidateRelativePath = relative(root, candidate)
  return (
    candidateRelativePath === '' ||
    (!candidateRelativePath.startsWith(`..${sep}`) &&
      candidateRelativePath !== '..' &&
      !isAbsolute(candidateRelativePath))
  )
}

function pathSegmentsFromUrlPathname(pathname: string): string[] | null {
  let decodedPathname: string
  try {
    decodedPathname = decodeURIComponent(pathname)
  } catch {
    return null
  }

  if (!decodedPathname.startsWith('/') || decodedPathname.includes('\0')) {
    return null
  }

  const segments = decodedPathname
    .replaceAll('\\', '/')
    .split('/')
    .filter(Boolean)
  if (segments.some(segment => segment === '.' || segment === '..')) {
    return null
  }

  return segments
}

function resolveWebuiRoot(webuiRoot: string): string | null {
  try {
    const realWebuiRoot = realpathSync(webuiRoot)
    return statSync(realWebuiRoot).isDirectory() ? realWebuiRoot : null
  } catch {
    return null
  }
}

function findWebuiFile(
  webuiRoot: string,
  pathname: string,
): { filePath: string; segments: string[] } | null {
  const segments = pathSegmentsFromUrlPathname(pathname)
  if (!segments?.length) return null

  const candidatePath = resolve(webuiRoot, ...segments)
  if (!isWithinRoot(webuiRoot, candidatePath)) return null

  try {
    const realFilePath = realpathSync(candidatePath)
    if (
      !isWithinRoot(webuiRoot, realFilePath) ||
      !statSync(realFilePath).isFile()
    ) {
      return null
    }
    return { filePath: realFilePath, segments }
  } catch {
    return null
  }
}

function isReservedDaemonPath(pathname: string): boolean {
  const segments = pathSegmentsFromUrlPathname(pathname)
  return Boolean(segments?.[0] && RESERVED_DAEMON_PATHS.has(segments[0]))
}

function shouldServeSpaFallback(pathname: string): boolean {
  if (isReservedDaemonPath(pathname)) return false

  const segments = pathSegmentsFromUrlPathname(pathname)
  if (!segments?.length) return false

  const lastSegment = segments[segments.length - 1] ?? ''
  return extname(lastSegment) === ''
}

function isWebuiDirectory(candidate: string): boolean {
  const webuiRoot = resolveWebuiRoot(candidate)
  if (!webuiRoot) return false

  const indexPath = resolve(webuiRoot, 'index.html')
  try {
    const realIndexPath = realpathSync(indexPath)
    return (
      isWithinRoot(webuiRoot, realIndexPath) && statSync(realIndexPath).isFile()
    )
  } catch {
    return false
  }
}

export function detectWebuiDir(moduleDir: string): string | null {
  const resolvedModuleDir = resolve(moduleDir)
  const candidates = [
    // Packaged: dist/* -> dist/webui (compiled chunks may live in
    // dist/, dist/entrypoints/, dist/chunks/, etc.).
    resolve(resolvedModuleDir, 'webui'),
    resolve(resolvedModuleDir, '..', 'webui'),
    resolve(resolvedModuleDir, '..', '..', 'webui'),
  ]

  // Source checkout: only consider the known build outputs adjacent to
  // apps/server/src. Do not walk arbitrary ancestors looking for a UI folder.
  const serverDir = dirname(resolvedModuleDir)
  const appsDir = dirname(serverDir)
  const workspaceDir = dirname(appsDir)
  if (
    basename(resolvedModuleDir) === 'src' &&
    basename(serverDir) === 'server' &&
    basename(appsDir) === 'apps'
  ) {
    candidates.push(resolve(serverDir, 'static'))
    candidates.push(resolve(appsDir, 'web', 'dist'))
    candidates.push(resolve(workspaceDir, 'dist', 'webui'))
  }

  for (const candidate of new Set(candidates)) {
    if (isWebuiDirectory(candidate)) return candidate
  }
  return null
}

function contentTypeForPath(filePath: string): string {
  return (
    CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
  )
}

export function maybeServeWebui(args: {
  webuiRoot: string
  url: URL
}): Response | null {
  const webuiRoot = resolveWebuiRoot(args.webuiRoot)
  if (!webuiRoot || isReservedDaemonPath(args.url.pathname)) return null

  const requestedPathname =
    args.url.pathname === '/' ? '/index.html' : args.url.pathname
  const requestedFile = findWebuiFile(webuiRoot, requestedPathname)
  const file =
    requestedFile ??
    (shouldServeSpaFallback(args.url.pathname)
      ? findWebuiFile(webuiRoot, '/index.html')
      : null)
  if (!file) return null

  try {
    return new Response(readFileSync(file.filePath), {
      headers: {
        'content-type': contentTypeForPath(file.filePath),
        'cache-control': 'no-cache',
      },
    })
  } catch {
    return null
  }
}
