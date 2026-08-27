import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { startKodeDaemon } from '#daemon/server'

function createWebuiFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'kode-webui-static-'))
  const assets = join(root, 'assets')
  mkdirSync(assets)
  writeFileSync(
    join(root, 'index.html'),
    '<!doctype html><title>Kode WebUI</title><link rel="stylesheet" href="/assets/app.css"><script src="/assets/app.js"></script>',
  )
  writeFileSync(join(assets, 'app.js'), 'console.log("Kode WebUI")')
  writeFileSync(join(assets, 'app.css'), 'body { color: black; }')
  return root
}

describe('daemon WebUI static hosting', () => {
  test('serves WebUI assets from the configured directory', async () => {
    const webuiDir = createWebuiFixture()
    const daemon = await startKodeDaemon({
      cwd: process.cwd(),
      port: 0,
      echo: true,
      webuiDir,
    })

    try {
      const indexRes = await fetch(`http://${daemon.host}:${daemon.port}/`)
      expect(indexRes.status).toBe(200)
      expect(String(indexRes.headers.get('content-type') ?? '')).toContain(
        'text/html',
      )
      const html = await indexRes.text()
      expect(html).toContain('Kode WebUI')

      const jsRes = await fetch(
        `http://${daemon.host}:${daemon.port}/assets/app.js`,
      )
      expect(jsRes.status).toBe(200)
      expect(String(jsRes.headers.get('content-type') ?? '')).toContain(
        'text/javascript',
      )

      const cssRes = await fetch(
        `http://${daemon.host}:${daemon.port}/assets/app.css`,
      )
      expect(cssRes.status).toBe(200)
      expect(String(cssRes.headers.get('content-type') ?? '')).toContain(
        'text/css',
      )
    } finally {
      daemon.stop()
      rmSync(webuiDir, { recursive: true, force: true })
    }
  })
})
