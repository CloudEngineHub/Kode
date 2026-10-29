import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { quote } from 'shell-quote'
import {
  launchExternalEditor,
  launchExternalEditorForFilePath,
} from './externalEditor'

describe('external editor command boundary', () => {
  let root: string
  let savedEnv: Record<string, string | undefined>
  const keys = ['VISUAL', 'EDITOR', 'KODE_TEST_EDITOR_ARGS', 'TMPDIR'] as const

  beforeEach(() => {
    savedEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]))
    root = mkdtempSync(join(tmpdir(), 'kode-editor-'))
    const editor = join(root, 'mock-editor.js')
    const log = join(root, 'args.json')
    writeFileSync(
      editor,
      "require('fs').writeFileSync(process.env.KODE_TEST_EDITOR_ARGS,JSON.stringify(process.argv.slice(2)))",
    )
    // VISUAL is a trusted command string and may include flags and a quoted program path.
    process.env.VISUAL =
      process.platform === 'win32'
        ? `"${process.execPath}" "${editor}" --wait`
        : quote([process.execPath, editor, '--wait'])
    delete process.env.EDITOR
    process.env.KODE_TEST_EDITOR_ARGS = log
  })

  afterEach(() => {
    for (const key of keys) {
      if (savedEnv[key] === undefined) delete process.env[key]
      else process.env[key] = savedEnv[key]
    }
    rmSync(root, { recursive: true, force: true })
  })

  describe('external editor filename boundary', () => {
    const filenames =
      process.platform === 'win32'
        ? ['file with spaces.txt', 'literal & %PATH% !bang! ^ (x).txt']
        : [
            'file with spaces.txt',
            "O'Brien.txt",
            '$(printf expanded).txt',
            'literal`printf expanded`$HOME;file.txt',
            'line\nbreak.txt',
          ]

    test.each(filenames)(
      'passes %j as exactly one literal argument',
      async filename => {
        const filePath = join(root, filename)
        writeFileSync(filePath, 'example')
        const result = await launchExternalEditorForFilePath(filePath)
        expect(result.ok).toBe(true)
        expect(
          JSON.parse(readFileSync(process.env.KODE_TEST_EDITOR_ARGS!, 'utf8')),
        ).toEqual(['--wait', filePath])
      },
    )
  })

  test.skipIf(process.platform === 'win32')(
    'temporary editor files also remain literal under a spaced TMPDIR',
    async () => {
      process.env.TMPDIR = join(root, 'temp with spaces')
      mkdirSync(process.env.TMPDIR)
      const result = await launchExternalEditor('draft\r\nline')
      expect(result.text).toBe('draft\nline')
      const args = JSON.parse(
        readFileSync(process.env.KODE_TEST_EDITOR_ARGS!, 'utf8'),
      )
      expect(args[0]).toBe('--wait')
      expect(args).toHaveLength(2)
      expect(args[1]).toContain('temp with spaces')
      expect(existsSync(args[1])).toBe(false)
    },
  )

  test.skipIf(process.platform !== 'win32')(
    'Windows cmd editor wrappers preserve percent, bang, caret and ampersand in paths',
    async () => {
      const wrapper = join(root, 'mock-editor.cmd')
      writeFileSync(
        wrapper,
        `@echo off\r\n"${process.execPath}" "${join(root, 'mock-editor.js')}" %*\r\n`,
      )
      process.env.VISUAL = `"${wrapper}" --wait`
      const filePath = join(root, 'literal %PATH% !bang! ^ & (x).txt')
      writeFileSync(filePath, 'example')
      const result = await launchExternalEditorForFilePath(filePath)
      expect(result.ok).toBe(true)
      expect(
        JSON.parse(readFileSync(process.env.KODE_TEST_EDITOR_ARGS!, 'utf8')),
      ).toEqual(['--wait', filePath])
    },
  )
})
