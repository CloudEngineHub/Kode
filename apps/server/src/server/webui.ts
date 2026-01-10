import { existsSync, readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

export function detectWebuiDir(moduleDir: string): string | null {
  const candidates: string[] = [
    // Packaged: dist/* → dist/webui (compiled chunks may live in dist/, dist/entrypoints/, dist/chunks/, etc.)
    resolve(moduleDir, 'webui'),
    resolve(moduleDir, '..', 'webui'),
    resolve(moduleDir, '..', '..', 'webui'),
  ]

  // Dev/workspace: find ui/web (and/or dist/webui) from common repo layouts.
  for (let up = 0; up <= 6; up++) {
    const parents = Array(up).fill('..')
    candidates.push(resolve(moduleDir, ...parents, 'apps', 'server', 'static'))
    candidates.push(resolve(moduleDir, ...parents, 'ui', 'web', 'dist'))
    candidates.push(resolve(moduleDir, ...parents, 'ui', 'web'))
    candidates.push(resolve(moduleDir, ...parents, 'dist', 'webui'))
  }

  for (const candidate of candidates) {
    try {
      if (existsSync(resolve(candidate, 'index.html'))) return candidate
    } catch {}
  }
  return null
}

function contentTypeForPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return ext === 'html'
    ? 'text/html; charset=utf-8'
    : ext === 'js'
      ? 'text/javascript; charset=utf-8'
      : ext === 'css'
        ? 'text/css; charset=utf-8'
        : ext === 'svg'
          ? 'image/svg+xml'
          : ext === 'json'
            ? 'application/json; charset=utf-8'
            : ext === 'png'
              ? 'image/png'
              : ext === 'jpg' || ext === 'jpeg'
                ? 'image/jpeg'
                : 'application/octet-stream'
}

export function maybeServeWebui(args: {
  webuiRoot: string
  url: URL
}): Response | null {
  const webuiRoot = resolve(args.webuiRoot)
  const pathname = args.url.pathname
  const requested = pathname === '/' ? '/index.html' : pathname
  const rel = requested.startsWith('/') ? requested.slice(1) : requested
  const filePath = resolve(webuiRoot, rel)

  if (!(filePath === webuiRoot || filePath.startsWith(webuiRoot + sep))) {
    return null
  }
  if (!existsSync(filePath)) return null

  const file = readFileSync(filePath)
  return new Response(file, {
    headers: {
      'content-type': contentTypeForPath(filePath),
      'cache-control': 'no-cache',
    },
  })
}
