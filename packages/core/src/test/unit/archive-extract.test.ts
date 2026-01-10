import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { strToU8, zipSync } from 'fflate'
import {
  extractTarGzBuffer,
  extractZipBuffer,
} from '#core/utils/archive/extract'

function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

function tarHeader(options: {
  name: string
  typeflag: '0' | '5'
  size: number
  mode?: number
}): Buffer {
  const header = Buffer.alloc(512, 0)

  header.write(options.name, 0, 100, 'utf8')

  const mode = options.mode ?? (options.typeflag === '5' ? 0o755 : 0o644)
  header.write(mode.toString(8).padStart(7, '0') + '\0', 100, 8, 'ascii')
  header.write('0000000\0', 108, 8, 'ascii') // uid
  header.write('0000000\0', 116, 8, 'ascii') // gid
  header.write(
    options.size.toString(8).padStart(11, '0') + '\0',
    124,
    12,
    'ascii',
  )
  header.write('00000000000\0', 136, 12, 'ascii') // mtime
  header.write('        ', 148, 8, 'ascii') // checksum placeholder
  header.write(options.typeflag, 156, 1, 'ascii')
  header.write('ustar\0', 257, 6, 'ascii')
  header.write('00', 263, 2, 'ascii')

  return header
}

function pad512(buf: Buffer): Buffer {
  const pad = (512 - (buf.length % 512)) % 512
  if (pad === 0) return buf
  return Buffer.concat([buf, Buffer.alloc(pad, 0)])
}

function buildTar(
  entries: Array<{ path: string; type: 'file' | 'dir'; data?: Buffer }>,
): Buffer {
  const chunks: Buffer[] = []
  for (const entry of entries) {
    if (entry.type === 'dir') {
      const name = entry.path.endsWith('/') ? entry.path : `${entry.path}/`
      chunks.push(tarHeader({ name, typeflag: '5', size: 0 }))
      continue
    }

    const data = entry.data ?? Buffer.alloc(0)
    chunks.push(
      tarHeader({ name: entry.path, typeflag: '0', size: data.length }),
    )
    chunks.push(pad512(data))
  }
  chunks.push(Buffer.alloc(1024, 0))
  return Buffer.concat(chunks)
}

describe('archive extraction (zip + tar.gz)', () => {
  test('extractZipBuffer writes files (stripComponents + filter)', async () => {
    const zip = zipSync({
      'root/bin/rg.exe': strToU8('hello'),
      'root/README.txt': strToU8('readme'),
      'root/bin/': strToU8(''),
    })

    const outDir = makeTempDir('kode-zip-extract-')
    try {
      await extractZipBuffer(zip, outDir, {
        stripComponents: 1,
        filter: p => p === 'bin/rg.exe',
      })

      expect(readFileSync(join(outDir, 'bin', 'rg.exe'), 'utf8')).toBe('hello')
      expect(existsSync(join(outDir, 'README.txt'))).toBe(false)
    } finally {
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('extractTarGzBuffer writes files (stripComponents)', async () => {
    const tar = buildTar([
      { path: 'root/bin', type: 'dir' },
      { path: 'root/bin/rg', type: 'file', data: Buffer.from('hello') },
      { path: 'root/README.txt', type: 'file', data: Buffer.from('readme') },
    ])
    const tgz = gzipSync(tar)

    const outDir = makeTempDir('kode-tgz-extract-')
    try {
      await extractTarGzBuffer(new Uint8Array(tgz), outDir, {
        stripComponents: 1,
      })
      expect(readFileSync(join(outDir, 'bin', 'rg'), 'utf8')).toBe('hello')
      expect(readFileSync(join(outDir, 'README.txt'), 'utf8')).toBe('readme')
    } finally {
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  test('rejects path traversal entries', async () => {
    const zip = zipSync({ '../evil.txt': strToU8('nope') })
    const outDir = makeTempDir('kode-zip-traversal-')
    try {
      await expect(extractZipBuffer(zip, outDir)).rejects.toThrow(
        'Unsafe archive path',
      )
      expect(existsSync(join(outDir, '..', 'evil.txt'))).toBe(false)
    } finally {
      rmSync(outDir, { recursive: true, force: true })
    }

    const tar = buildTar([
      { path: '../evil.txt', type: 'file', data: Buffer.from('nope') },
    ])
    const tgz = gzipSync(tar)
    const outDir2 = makeTempDir('kode-tgz-traversal-')
    try {
      await expect(
        extractTarGzBuffer(new Uint8Array(tgz), outDir2),
      ).rejects.toThrow('Unsafe archive path')
      expect(existsSync(join(outDir2, '..', 'evil.txt'))).toBe(false)
    } finally {
      rmSync(outDir2, { recursive: true, force: true })
    }
  })
})
