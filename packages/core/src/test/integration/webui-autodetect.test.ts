import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { detectWebuiDir } from '#daemon/server/webui'

describe('daemon WebUI autodetect', () => {
  test('finds the packaged dist/webui directory from compiled chunks', () => {
    const root = mkdtempSync(join(tmpdir(), 'kode-webui-autodetect-'))
    const moduleDir = join(root, 'dist', 'chunks')
    const webuiDir = join(root, 'dist', 'webui')
    mkdirSync(moduleDir, { recursive: true })
    mkdirSync(webuiDir, { recursive: true })
    writeFileSync(join(webuiDir, 'index.html'), '<title>Kode WebUI</title>')

    try {
      expect(detectWebuiDir(moduleDir)).toBe(webuiDir)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('finds the workspace server static directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'kode-webui-autodetect-'))
    const moduleDir = join(root, 'apps', 'server', 'src', 'server')
    const webuiDir = join(root, 'apps', 'server', 'static')
    mkdirSync(moduleDir, { recursive: true })
    mkdirSync(webuiDir, { recursive: true })
    writeFileSync(join(webuiDir, 'index.html'), '<title>Kode WebUI</title>')

    try {
      expect(detectWebuiDir(moduleDir)).toBe(webuiDir)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
