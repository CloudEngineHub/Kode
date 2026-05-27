import { describe, expect, test } from 'bun:test'
import { hasSuspiciousWindowsPathPattern } from '@utils/permissions/fileToolPermissionEngine'

describe('hasSuspiciousWindowsPathPattern', () => {
  describe('legitimate paths should NOT be flagged', () => {
    test('normal Unix absolute path', () => {
      expect(hasSuspiciousWindowsPathPattern('/Users/alice/file.txt')).toBe(
        false,
      )
    })

    test('normal relative path', () => {
      expect(hasSuspiciousWindowsPathPattern('src/index.ts')).toBe(false)
    })

    test('path with spaces', () => {
      expect(hasSuspiciousWindowsPathPattern('/Users/alice my/file.txt')).toBe(
        false,
      )
    })

    test('path with dots in filename', () => {
      expect(hasSuspiciousWindowsPathPattern('/path/to/file.min.js')).toBe(
        false,
      )
    })

    test('path with multiple extensions', () => {
      expect(hasSuspiciousWindowsPathPattern('/path/to/archive.tar.gz')).toBe(
        false,
      )
    })
  })

  describe('Windows 8.3 short names should NOT be flagged', () => {
    test('ADMINI~1 in path (common Windows 8.3 name)', () => {
      expect(
        hasSuspiciousWindowsPathPattern(
          'C:\\Users\\ADMINI~1\\AppData\\Local\\Temp\\file.txt',
        ),
      ).toBe(false)
    })

    test('PROGRA~1 in path (Program Files 8.3 name)', () => {
      expect(
        hasSuspiciousWindowsPathPattern(
          'C:\\PROGRA~1\\Common Files\\file.txt',
        ),
      ).toBe(false)
    })

    test('DOCUME~1 in path (Documents 8.3 name)', () => {
      expect(
        hasSuspiciousWindowsPathPattern(
          'C:\\Users\\ADMINI~1\\DOCUME~1\\file.txt',
        ),
      ).toBe(false)
    })

    test('multiple 8.3 names in path', () => {
      expect(
        hasSuspiciousWindowsPathPattern(
          'C:\\Users\\ADMINI~1\\LOCALS~1\\Temp\\kode-test\\file.txt',
        ),
      ).toBe(false)
    })

    test('tilde followed by single digit (8.3 pattern)', () => {
      expect(hasSuspiciousWindowsPathPattern('/path/FILENA~1.txt')).toBe(false)
    })

    test('tilde followed by multiple digits (8.3 pattern)', () => {
      expect(hasSuspiciousWindowsPathPattern('/path/FILENA~12.txt')).toBe(
        false,
      )
    })
  })

  describe('actually suspicious paths should be flagged', () => {
    test('path with multiple colons after drive letter', () => {
      expect(hasSuspiciousWindowsPathPattern('C:\\Users\\foo:bar\\file')).toBe(
        true,
      )
    })

    test('UNC device path prefix \\\\?\\', () => {
      expect(
        hasSuspiciousWindowsPathPattern('\\\\?\\C:\\Users\\file.txt'),
      ).toBe(true)
    })

    test('UNC device path prefix \\\\.\\', () => {
      expect(
        hasSuspiciousWindowsPathPattern('\\\\.\\C:\\Users\\file.txt'),
      ).toBe(true)
    })

    test('path ending with dots', () => {
      expect(hasSuspiciousWindowsPathPattern('/path/to/file...')).toBe(true)
    })

    test('path ending with spaces', () => {
      expect(hasSuspiciousWindowsPathPattern('/path/to/file   ')).toBe(true)
    })

    test('CON reserved name with extension', () => {
      expect(hasSuspiciousWindowsPathPattern('/path/to/file.CON')).toBe(true)
    })

    test('NUL reserved name with extension', () => {
      expect(hasSuspiciousWindowsPathPattern('/path/to/file.NUL')).toBe(true)
    })

    test('COM1 reserved name with extension', () => {
      expect(hasSuspiciousWindowsPathPattern('/path/to/file.COM1')).toBe(true)
    })

    test('LPT1 reserved name with extension', () => {
      expect(hasSuspiciousWindowsPathPattern('/path/to/file.LPT1')).toBe(true)
    })

    test('path with triple dots directory', () => {
      expect(hasSuspiciousWindowsPathPattern('/path/.../file.txt')).toBe(true)
    })
  })

  describe('edge cases', () => {
    test('empty string', () => {
      expect(hasSuspiciousWindowsPathPattern('')).toBe(false)
    })

    test('single character', () => {
      expect(hasSuspiciousWindowsPathPattern('a')).toBe(false)
    })

    test('just a tilde', () => {
      expect(hasSuspiciousWindowsPathPattern('~')).toBe(false)
    })

    test('tilde expansion (Unix home)', () => {
      expect(hasSuspiciousWindowsPathPattern('~/documents/file.txt')).toBe(
        false,
      )
    })

    test('path with tilde in directory name but not 8.3 pattern', () => {
      expect(hasSuspiciousWindowsPathPattern('/path/~backup/file.txt')).toBe(
        false,
      )
    })
  })
})
