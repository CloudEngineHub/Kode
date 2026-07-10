import { afterEach, describe, expect, test } from 'bun:test'
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { detectWebuiDir, maybeServeWebui } from './webui'

const temporaryDirectories: string[] = []

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'kode-webui-'))
  temporaryDirectories.push(directory)
  return directory
}

function writeFixtureFile(
  root: string,
  relativePath: string,
  body: string,
): void {
  const filePath = join(root, relativePath)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, body)
}

function createWebuiFixture(root: string): string {
  writeFixtureFile(
    root,
    'index.html',
    '<!doctype html><title>Kode WebUI</title>',
  )
  return root
}

function requireWebuiResponse(root: string, pathname: string): Response {
  const response = maybeServeWebui({
    webuiRoot: root,
    url: new URL(`http://localhost${pathname}`),
  })
  if (!response) throw new Error(`Expected a WebUI response for ${pathname}`)
  return response
}

afterEach(() => {
  while (temporaryDirectories.length) {
    const directory = temporaryDirectories.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

describe('WebUI static hosting', () => {
  test('discovers only known packaged and workspace build directories', () => {
    const packagedRoot = createTemporaryDirectory()
    const packagedModuleDir = join(packagedRoot, 'dist', 'chunks')
    const packagedEntrypointsDir = join(packagedRoot, 'dist', 'entrypoints')
    const packagedWebuiDir = createWebuiFixture(
      join(packagedRoot, 'dist', 'webui'),
    )
    mkdirSync(packagedModuleDir, { recursive: true })
    mkdirSync(packagedEntrypointsDir, { recursive: true })

    expect(detectWebuiDir(packagedModuleDir)).toBe(resolve(packagedWebuiDir))
    expect(detectWebuiDir(packagedEntrypointsDir)).toBe(
      resolve(packagedWebuiDir),
    )

    const workspaceRoot = createTemporaryDirectory()
    const sourceModuleDir = join(workspaceRoot, 'apps', 'server', 'src')
    const staticDir = createWebuiFixture(
      join(workspaceRoot, 'apps', 'server', 'static'),
    )
    mkdirSync(sourceModuleDir, { recursive: true })

    expect(detectWebuiDir(sourceModuleDir)).toBe(resolve(staticDir))

    const sourceBuildRoot = createTemporaryDirectory()
    const sourceBuildModuleDir = join(sourceBuildRoot, 'apps', 'server', 'src')
    const distWebuiDir = createWebuiFixture(
      join(sourceBuildRoot, 'dist', 'webui'),
    )
    mkdirSync(sourceBuildModuleDir, { recursive: true })

    expect(detectWebuiDir(sourceBuildModuleDir)).toBe(resolve(distWebuiDir))

    const unrelatedModuleDir = join(workspaceRoot, 'custom', 'nested', 'module')
    createWebuiFixture(join(workspaceRoot, 'ui', 'web', 'dist'))
    mkdirSync(unrelatedModuleDir, { recursive: true })

    expect(detectWebuiDir(unrelatedModuleDir)).toBeNull()
  })

  test('returns MIME types for fonts, source maps, and favicon files', () => {
    const webuiRoot = createWebuiFixture(createTemporaryDirectory())
    writeFixtureFile(webuiRoot, 'assets/kode.woff2', 'font')
    writeFixtureFile(webuiRoot, 'assets/kode.ttf', 'font')
    writeFixtureFile(webuiRoot, 'assets/app.js.map', '{}')
    writeFixtureFile(webuiRoot, 'favicon.ico', 'icon')

    expect(
      requireWebuiResponse(webuiRoot, '/assets/kode.woff2').headers.get(
        'content-type',
      ),
    ).toBe('font/woff2')
    expect(
      requireWebuiResponse(webuiRoot, '/assets/kode.ttf').headers.get(
        'content-type',
      ),
    ).toBe('font/ttf')
    expect(
      requireWebuiResponse(webuiRoot, '/assets/app.js.map').headers.get(
        'content-type',
      ),
    ).toBe('application/json; charset=utf-8')
    expect(
      requireWebuiResponse(webuiRoot, '/favicon.ico').headers.get(
        'content-type',
      ),
    ).toBe('image/x-icon')
  })

  test('uses an SPA fallback without masking daemon routes or missing assets', async () => {
    const webuiRoot = createWebuiFixture(createTemporaryDirectory())
    writeFixtureFile(webuiRoot, 'api/health', 'must not mask daemon health')

    await expect(
      requireWebuiResponse(webuiRoot, '/sessions/active').text(),
    ).resolves.toContain('Kode WebUI')
    expect(
      maybeServeWebui({
        webuiRoot,
        url: new URL('http://localhost/api/health'),
      }),
    ).toBeNull()
    expect(
      maybeServeWebui({ webuiRoot, url: new URL('http://localhost/ws') }),
    ).toBeNull()
    expect(
      maybeServeWebui({
        webuiRoot,
        url: new URL('http://localhost/health'),
      }),
    ).toBeNull()
    expect(
      maybeServeWebui({
        webuiRoot,
        url: new URL('http://localhost/assets/missing.js'),
      }),
    ).toBeNull()
  })

  test('rejects traversal and symlink paths that escape the WebUI root', () => {
    const fixtureRoot = createTemporaryDirectory()
    const webuiRoot = createWebuiFixture(join(fixtureRoot, 'webui'))
    const outsideDir = join(fixtureRoot, 'outside')
    writeFixtureFile(outsideDir, 'secret.txt', 'outside')
    symlinkSync(
      outsideDir,
      join(webuiRoot, 'linked'),
      process.platform === 'win32' ? 'junction' : 'dir',
    )

    expect(
      maybeServeWebui({
        webuiRoot,
        url: new URL('http://localhost/%2e%2e%2fsecret.txt'),
      }),
    ).toBeNull()
    expect(
      maybeServeWebui({
        webuiRoot,
        url: new URL('http://localhost/linked/secret.txt'),
      }),
    ).toBeNull()
  })
})
