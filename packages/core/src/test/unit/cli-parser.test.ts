import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { createCliProgram } from '#host-cli/entrypoints/cli/cliParser'
import { shouldRunHeadlessMode } from '#host-cli/entrypoints/cli/cliParser/headlessMode'

describe('cli parser (commander)', () => {
  test('--help prints help and exits (no UI started)', () => {
    const program = createCliProgram('', undefined)
    let out = ''
    program.configureOutput({
      writeOut: str => {
        out += str
      },
      writeErr: str => {
        out += str
      },
    })

    program.exitOverride()
    try {
      program.parse(['node', 'kode', '--help'], { from: 'user' })
      throw new Error('expected commander to exit')
    } catch (err: any) {
      expect(err.code).toBe('commander.helpDisplayed')
      expect(err.exitCode).toBe(0)
    }

    expect(out).toContain('Usage: kode')
    expect(out).toContain('--print')
    expect(out).toContain('--headless')
  })

  test('--version prints package version and exits (no UI started)', () => {
    const program = createCliProgram('', undefined)
    let out = ''
    program.configureOutput({
      writeOut: str => {
        out += str
      },
      writeErr: str => {
        out += str
      },
    })

    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
    )

    program.exitOverride()
    try {
      program.parse(['node', 'kode', '--version'], { from: 'user' })
      throw new Error('expected commander to exit')
    } catch (err: any) {
      expect(err.code).toBe('commander.version')
      expect(err.exitCode).toBe(0)
    }

    expect(out.trim()).toBe(String(pkg.version))
  })

  test('parseOptions picks up --cwd, --print, and --headless', () => {
    const program = createCliProgram('', undefined)
    program.parseOptions(['--cwd', '/tmp', '--print', '--headless', '--web'])

    const opts = program.opts() as unknown as {
      cwd: string
      print: boolean
      headless: boolean
      web: boolean
    }
    expect(opts.cwd).toBe('/tmp')
    expect(opts.print).toBe(true)
    expect(opts.headless).toBe(true)
    expect(opts.web).toBe(true)
  })

  test('headless mode detection is explicit or safely inferred', () => {
    expect(shouldRunHeadlessMode({ headless: true })).toBe(true)
    expect(shouldRunHeadlessMode({ print: true })).toBe(true)
    expect(shouldRunHeadlessMode({ outputFormat: 'json' })).toBe(true)
    expect(shouldRunHeadlessMode({ outputFormat: ' JSON ' })).toBe(true)
    expect(shouldRunHeadlessMode({ outputFormat: ' STREAM-JSON ' })).toBe(true)
    expect(shouldRunHeadlessMode({ inputFormat: 'stream-json' })).toBe(true)
    expect(shouldRunHeadlessMode({ inputFormat: ' STREAM-JSON ' })).toBe(true)
    expect(
      shouldRunHeadlessMode({
        stdoutIsTTY: false,
        stdinContent: 'hello',
      }),
    ).toBe(true)
    expect(
      shouldRunHeadlessMode({
        stdoutIsTTY: false,
        prompt: 'hello',
      }),
    ).toBe(true)
    expect(
      shouldRunHeadlessMode({
        stdoutIsTTY: true,
        stdinContent: 'hello',
      }),
    ).toBe(false)
    expect(shouldRunHeadlessMode({ stdoutIsTTY: false })).toBe(false)
    expect(
      shouldRunHeadlessMode({
        stdoutIsTTY: false,
        prompt: '   ',
        stdinContent: '\n\t',
      }),
    ).toBe(false)
  })
})
