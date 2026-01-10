import { unzipSync } from 'fflate'
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve, sep } from 'node:path'
import { gunzipSync } from 'node:zlib'

export type ExtractArchiveOptions = {
  stripComponents?: number
  filter?: (entryPath: string) => boolean
}

function normalizeArchivePath(rawPath: string): string {
  const withoutNull = rawPath.split('\0')[0] ?? ''
  const withSlashes = withoutNull.replace(/\\/g, '/')
  const noLeadingSlash = withSlashes.replace(/^\/+/, '')
  const noDrivePrefix = noLeadingSlash.replace(/^[A-Za-z]:\//, '')
  const parts = noDrivePrefix.split('/').filter(Boolean)
  for (const part of parts) {
    if (part === '.' || part === '..') {
      throw new Error(`Unsafe archive path: ${rawPath}`)
    }
  }
  return parts.join('/')
}

function stripLeadingComponents(
  normalizedPath: string,
  stripComponents: number,
): string | null {
  if (stripComponents <= 0) return normalizedPath
  const parts = normalizedPath.split('/').filter(Boolean)
  if (parts.length <= stripComponents) return null
  return parts.slice(stripComponents).join('/')
}

function safeDestinationPath(destDir: string, entryPath: string): string {
  if (!entryPath) {
    throw new Error('Entry path is empty')
  }
  if (isAbsolute(entryPath)) {
    throw new Error(`Absolute archive path is not allowed: ${entryPath}`)
  }
  const resolvedDestDir = resolve(destDir)
  const outPath = resolve(resolvedDestDir, entryPath)
  if (
    outPath !== resolvedDestDir &&
    !outPath.startsWith(resolvedDestDir + sep)
  ) {
    throw new Error(`Archive entry escapes destination: ${entryPath}`)
  }
  return outPath
}

export async function extractZipBuffer(
  zipData: Uint8Array,
  destDir: string,
  options: ExtractArchiveOptions = {},
): Promise<void> {
  const stripComponents = options.stripComponents ?? 0
  const filter = options.filter

  mkdirSync(destDir, { recursive: true })

  const entries = unzipSync(zipData)
  for (const [rawName, contents] of Object.entries(entries)) {
    const normalized = normalizeArchivePath(rawName)
    const stripped = stripLeadingComponents(normalized, stripComponents)
    if (!stripped) continue
    if (filter && !filter(stripped)) continue

    const isDir = rawName.endsWith('/') || stripped.endsWith('/')
    const outputPath = safeDestinationPath(destDir, stripped)

    if (isDir) {
      mkdirSync(outputPath, { recursive: true })
      continue
    }

    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, Buffer.from(contents))
  }
}

export async function extractZipFile(
  zipPath: string,
  destDir: string,
  options: ExtractArchiveOptions = {},
): Promise<void> {
  const data = readFileSync(zipPath)
  await extractZipBuffer(new Uint8Array(data), destDir, options)
}

function decodeTarString(buf: Buffer, start: number, end: number): string {
  const slice = buf.subarray(start, end)
  const nul = slice.indexOf(0)
  const trimmed = (nul === -1 ? slice : slice.subarray(0, nul))
    .toString('utf8')
    .trim()
  return trimmed
}

function parseTarOctal(buf: Buffer, start: number, end: number): number {
  const raw = decodeTarString(buf, start, end)
  if (!raw) return 0
  const parsed = Number.parseInt(raw, 8)
  if (!Number.isFinite(parsed)) return 0
  return parsed
}

function isAllZero(block: Buffer): boolean {
  for (let i = 0; i < block.length; i++) {
    if (block[i] !== 0) return false
  }
  return true
}

function parsePaxHeader(data: Buffer): Record<string, string> {
  const out: Record<string, string> = {}
  let offset = 0
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset)
    if (space === -1) break
    const lenRaw = data.subarray(offset, space).toString('utf8')
    const recordLen = Number.parseInt(lenRaw, 10)
    if (!Number.isFinite(recordLen) || recordLen <= 0) break
    const record = data.subarray(
      offset + (space - offset) + 1,
      offset + recordLen,
    )
    const recordStr = record.toString('utf8')
    const eq = recordStr.indexOf('=')
    if (eq !== -1) {
      const key = recordStr.slice(0, eq).trim()
      const value = recordStr
        .slice(eq + 1)
        .replace(/\n$/, '')
        .trim()
      if (key) out[key] = value
    }
    offset += recordLen
  }
  return out
}

export async function extractTarGzBuffer(
  tarGzData: Uint8Array,
  destDir: string,
  options: ExtractArchiveOptions = {},
): Promise<void> {
  const tarData = gunzipSync(Buffer.from(tarGzData))
  await extractTarBuffer(new Uint8Array(tarData), destDir, options)
}

export async function extractTarGzFile(
  tarGzPath: string,
  destDir: string,
  options: ExtractArchiveOptions = {},
): Promise<void> {
  const data = readFileSync(tarGzPath)
  await extractTarGzBuffer(new Uint8Array(data), destDir, options)
}

export async function extractTarBuffer(
  tarData: Uint8Array,
  destDir: string,
  options: ExtractArchiveOptions = {},
): Promise<void> {
  const stripComponents = options.stripComponents ?? 0
  const filter = options.filter

  mkdirSync(destDir, { recursive: true })

  const buf = Buffer.from(tarData)
  let offset = 0

  let pendingLongPath: string | null = null
  let pendingPax: Record<string, string> | null = null

  while (offset + 512 <= buf.length) {
    const header = buf.subarray(offset, offset + 512)
    offset += 512

    if (isAllZero(header)) {
      break
    }

    const name = decodeTarString(header, 0, 100)
    const mode = parseTarOctal(header, 100, 108)
    const size = parseTarOctal(header, 124, 136)
    const typeflag = decodeTarString(header, 156, 157) || '0'
    const prefix = decodeTarString(header, 345, 500)

    const rawPathFromHeader = prefix ? `${prefix}/${name}` : name

    const contentStart = offset
    const contentEnd = offset + size
    if (contentEnd > buf.length) {
      throw new Error('Truncated tar archive')
    }

    const content = buf.subarray(contentStart, contentEnd)
    offset += Math.ceil(size / 512) * 512

    if (typeflag === 'L') {
      pendingLongPath = content.toString('utf8').replace(/\0.*$/, '').trim()
      continue
    }

    if (typeflag === 'x') {
      pendingPax = parsePaxHeader(content)
      continue
    }

    let entryPath = pendingLongPath ?? rawPathFromHeader
    pendingLongPath = null

    if (pendingPax?.path) {
      entryPath = pendingPax.path
    }
    pendingPax = null

    const normalized = normalizeArchivePath(entryPath)
    const stripped = stripLeadingComponents(normalized, stripComponents)
    if (!stripped) continue
    if (filter && !filter(stripped)) continue

    const outputPath = safeDestinationPath(destDir, stripped)
    if (typeflag === '5') {
      mkdirSync(outputPath, { recursive: true })
      continue
    }

    if (typeflag !== '0' && typeflag !== '\0') {
      continue
    }

    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, content)
    if (mode && process.platform !== 'win32') {
      try {
        chmodSync(outputPath, mode & 0o777)
      } catch {}
    }
  }
}
