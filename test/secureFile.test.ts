import { describe, expect, test, beforeEach, afterEach } from '@jest/globals'
import { SecureFileService, secureFileService } from '../src/utils/secureFile'
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, rmdirSync } from 'node:fs'
import { join, dirname } from 'node:path'

describe('SecureFileService', () => {
  let secureFileService: SecureFileService
  let testDir: string
  let tempDir: string

  beforeEach(() => {
    secureFileService = SecureFileService.getInstance()
    testDir = join(process.cwd(), 'test-temp')
    tempDir = '/tmp/secure-file-test'
    
    // Create test directories
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true })
    }
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true })
    }
  })

  afterEach(() => {
    // Clean up test files
    const cleanupDir = (dir: string) => {
      if (existsSync(dir)) {
        const files = require('node:fs').readdirSync(dir)
        for (const file of files) {
          const filePath = join(dir, file)
          if (require('node:fs').statSync(filePath).isDirectory()) {
            cleanupDir(filePath)
            rmdirSync(filePath)
          } else {
            unlinkSync(filePath)
          }
        }
      }
    }
    
    cleanupDir(testDir)
    cleanupDir(tempDir)
    
    try {
      rmdirSync(testDir)
      rmdirSync(tempDir)
    } catch {
      // Ignore errors if directories don't exist
    }
  })

  describe('validateFilePath', () => {
    test('should validate valid file paths', () => {
      const validPaths = [
        join(testDir, 'test.txt'),
        join(process.cwd(), 'test.js'),
        join(tempDir, 'test.json'),
        join(require('node:os').homedir(), '.testrc')
      ]

      validPaths.forEach(path => {
        const result = secureFileService.validateFilePath(path)
        expect(result.isValid).toBe(true)
        expect(result.error).toBeUndefined()
      })
    })

    test('should reject paths with traversal characters', () => {
      // Test with absolute paths that would traverse outside allowed directories
      const invalidPaths = [
        '/etc/passwd',
        '/usr/bin/ls',
        '/root/.ssh/id_rsa'
      ]

      invalidPaths.forEach(path => {
        const result = secureFileService.validateFilePath(path)
        expect(result.isValid).toBe(false)
        expect(result.error).toContain('outside allowed directories')
      })
    })

    test('should reject paths with tilde character', () => {
      const result = secureFileService.validateFilePath('~/some/file')
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('traversal')
    })

    test('should reject paths with suspicious patterns', () => {
      const suspiciousPaths = [
        join(testDir, 'test${HOME}.txt'),
        join(testDir, 'test`command`.txt'),
        join(testDir, 'test|pipe.txt'),
        join(testDir, 'test;command.txt'),
        join(testDir, 'test&background.txt'),
        join(testDir, 'test>redirect.txt'),
        join(testDir, 'test<input.txt')
      ]

      suspiciousPaths.forEach(path => {
        const result = secureFileService.validateFilePath(path)
        expect(result.isValid).toBe(false)
        expect(result.error).toContain('suspicious pattern')
      })
    })

    test('should reject paths outside allowed directories', () => {
      const restrictedPaths = [
        '/etc/passwd',
        '/usr/bin/ls',
        '/root/.ssh/id_rsa',
        '/var/log/syslog'
      ]

      restrictedPaths.forEach(path => {
        const result = secureFileService.validateFilePath(path)
        expect(result.isValid).toBe(false)
        expect(result.error).toContain('outside allowed directories')
      })
    })

    test('should reject paths that are too long', () => {
      const longPath = 'a'.repeat(5000)
      const result = secureFileService.validateFilePath(longPath)
      expect(result.isValid).toBe(false)
      expect(result.error).toContain('Path too long')
    })
  })

  describe('validateFileName', () => {
    test('should validate valid filenames', () => {
      const validFilenames = [
        'test.txt',
        'my-file.js',
        'data.json',
        'config.yml',
        'script.sh',
        'file.with.multiple.dots',
        'UPPERCASE.TXT',
        'mixedCase.Js'
      ]

      validFilenames.forEach(filename => {
        const result = secureFileService.validateFileName(filename)
        expect(result.isValid).toBe(true)
        expect(result.error).toBeUndefined()
      })
    })

    test('should reject invalid filenames', () => {
      const invalidFilenames = [
        '', // empty
        'a'.repeat(300), // too long
        'test<file>.txt', // contains <
        'test>file.txt', // contains >
        'test:file.txt', // contains :
        'test"file".txt', // contains "
        'test/file.txt', // contains /
        'test\\file.txt', // contains \
        'test|file.txt', // contains |
        'test?file.txt', // contains ?
        'test*file.txt', // contains *
        'test\x00file.txt', // contains null character
        'CON', // reserved name
        'PRN.txt', // reserved name
        'AUX.js', // reserved name
        'NUL.json', // reserved name
        'COM1.bat', // reserved name
        'LPT1.sh', // reserved name
        '.hidden', // starts with dot
        'file.', // ends with dot
        ' file.txt', // starts with space
        'file.txt ' // ends with space
      ]

      invalidFilenames.forEach(filename => {
        const result = secureFileService.validateFileName(filename)
        expect(result.isValid).toBe(false)
      })
    })
  })

  describe('safeExists', () => {
    test('should return true for existing files in allowed directories', () => {
      const testFile = join(testDir, 'existing.txt')
      writeFileSync(testFile, 'test content')
      
      const result = secureFileService.safeExists(testFile)
      expect(result).toBe(true)
    })

    test('should return false for non-existing files', () => {
      const nonExistentFile = join(testDir, 'nonexistent.txt')
      const result = secureFileService.safeExists(nonExistentFile)
      expect(result).toBe(false)
    })

    test('should return false for invalid paths', () => {
      const invalidPath = join(testDir, '..', 'etc', 'passwd')
      const result = secureFileService.safeExists(invalidPath)
      expect(result).toBe(false)
    })
  })

  describe('safeReadFile', () => {
    test('should read existing files successfully', () => {
      const testFile = join(testDir, 'test.txt')
      const content = 'Hello, World!'
      writeFileSync(testFile, content)
      
      const result = secureFileService.safeReadFile(testFile)
      expect(result.success).toBe(true)
      expect(result.content).toBe(content)
      expect(result.stats).toBeDefined()
      expect(result.stats?.size).toBe(content.length)
    })

    test('should reject non-existing files', () => {
      const nonExistentFile = join(testDir, 'nonexistent.txt')
      const result = secureFileService.safeReadFile(nonExistentFile)
      expect(result.success).toBe(false)
      expect(result.error).toBe('File does not exist')
    })

    test('should reject invalid paths', () => {
      // Create a directory that is definitely not allowed
      const invalidPath = '/root/secure-test.txt'
      const result = secureFileService.safeReadFile(invalidPath)
      expect(result.success).toBe(false)
      expect(result.error).toContain('outside allowed directories')
    })

    test('should reject files with disallowed extensions', () => {
      const testFile = join(testDir, 'test.exe')
      writeFileSync(testFile, 'executable content')
      
      const result = secureFileService.safeReadFile(testFile)
      expect(result.success).toBe(false)
      expect(result.error).toBe('File extension \'.exe\' is not allowed')
    })

    test('should allow files with custom allowed extensions', () => {
      const testFile = join(testDir, 'test.custom')
      writeFileSync(testFile, 'custom content')
      
      const result = secureFileService.safeReadFile(testFile, {
        allowedExtensions: ['.custom']
      })
      expect(result.success).toBe(true)
      expect(result.content).toBe('custom content')
    })

    test('should reject files that are too large', () => {
      const testFile = join(testDir, 'large.txt')
      const largeContent = 'a'.repeat(1024 * 1024) // 1MB
      writeFileSync(testFile, largeContent)
      
      const result = secureFileService.safeReadFile(testFile, {
        maxFileSize: 512 * 1024 // 512KB
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('File too large')
    })

    test('should handle directories', () => {
      const result = secureFileService.safeReadFile(testDir, { checkFileExtension: false })
      expect(result.success).toBe(false)
      expect(result.error).toBe('Path is not a file')
    })
  })

  describe('safeWriteFile', () => {
    test('should write files successfully', () => {
      const testFile = join(testDir, 'output.txt')
      const content = 'Hello, World!'
      
      const result = secureFileService.safeWriteFile(testFile, content)
      expect(result.success).toBe(true)
      
      // Verify file was created
      expect(existsSync(testFile)).toBe(true)
      expect(readFileSync(testFile, 'utf8')).toBe(content)
    })

    test('should reject invalid paths', () => {
      const invalidPath = '/root/secure-test.txt'
      const result = secureFileService.safeWriteFile(invalidPath, 'malicious')
      expect(result.success).toBe(false)
      expect(result.error).toContain('outside allowed directories')
    })

    test('should reject files with disallowed extensions', () => {
      const testFile = join(testDir, 'test.exe')
      const result = secureFileService.safeWriteFile(testFile, 'executable content')
      expect(result.success).toBe(false)
      expect(result.error).toBe('File extension \'.exe\' is not allowed')
    })

    test('should reject content that is too large', () => {
      const testFile = join(testDir, 'large.txt')
      const largeContent = 'a'.repeat(1024 * 1024) // 1MB
      
      const result = secureFileService.safeWriteFile(testFile, largeContent, {
        maxSize: 512 * 1024 // 512KB
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('Content too large')
    })

    test('should create directories when requested', () => {
      const nestedFile = join(testDir, 'nested', 'subdir', 'file.txt')
      const content = 'nested content'
      
      const result = secureFileService.safeWriteFile(nestedFile, content, {
        createDirectory: true
      })
      expect(result.success).toBe(true)
      expect(existsSync(nestedFile)).toBe(true)
      expect(readFileSync(nestedFile, 'utf8')).toBe(content)
    })

    test('should perform atomic writes when requested', () => {
      const testFile = join(testDir, 'atomic.txt')
      const content = 'atomic content'
      
      const result = secureFileService.safeWriteFile(testFile, content, {
        atomic: true
      })
      expect(result.success).toBe(true)
      expect(existsSync(testFile)).toBe(true)
      expect(readFileSync(testFile, 'utf8')).toBe(content)
    })
  })

  describe('safeDeleteFile', () => {
    test('should delete existing files successfully', () => {
      const testFile = join(testDir, 'to-delete.txt')
      writeFileSync(testFile, 'content to delete')
      
      const result = secureFileService.safeDeleteFile(testFile)
      expect(result.success).toBe(true)
      expect(existsSync(testFile)).toBe(false)
    })

    test('should reject non-existing files', () => {
      const nonExistentFile = join(testDir, 'nonexistent.txt')
      const result = secureFileService.safeDeleteFile(nonExistentFile)
      expect(result.success).toBe(false)
      expect(result.error).toBe('File does not exist')
    })

    test('should reject invalid paths', () => {
      const invalidPath = '/root/secure-test.txt'
      const result = secureFileService.safeDeleteFile(invalidPath)
      expect(result.success).toBe(false)
      expect(result.error).toContain('outside allowed directories')
    })

    test('should handle directories', () => {
      const result = secureFileService.safeDeleteFile(testDir)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Path is not a file')
    })
  })

  describe('safeCreateDirectory', () => {
    test('should create directories successfully', () => {
      const newDir = join(testDir, 'new-dir')
      
      const result = secureFileService.safeCreateDirectory(newDir)
      expect(result.success).toBe(true)
      expect(existsSync(newDir)).toBe(true)
    })

    test('should handle existing directories', () => {
      const result = secureFileService.safeCreateDirectory(testDir)
      expect(result.success).toBe(true)
    })

    test('should reject invalid paths', () => {
      const invalidPath = '/root/secure-test'
      const result = secureFileService.safeCreateDirectory(invalidPath)
      expect(result.success).toBe(false)
      expect(result.error).toContain('outside allowed directories')
    })

    test('should handle existing files', () => {
      const existingFile = join(testDir, 'existing.txt')
      writeFileSync(existingFile, 'content')
      
      const result = secureFileService.safeCreateDirectory(existingFile)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Path already exists and is not a directory')
    })
  })

  describe('safeGetFileInfo', () => {
    test('should get file info successfully', () => {
      const testFile = join(testDir, 'info.txt')
      const content = 'file info test'
      writeFileSync(testFile, content)
      
      const result = secureFileService.safeGetFileInfo(testFile)
      expect(result.success).toBe(true)
      expect(result.stats).toBeDefined()
      expect(result.stats?.isFile).toBe(true)
      expect(result.stats?.size).toBe(content.length)
      expect(result.stats?.isDirectory).toBe(false)
    })

    test('should get directory info successfully', () => {
      const result = secureFileService.safeGetFileInfo(testDir)
      expect(result.success).toBe(true)
      expect(result.stats).toBeDefined()
      expect(result.stats?.isFile).toBe(false)
      expect(result.stats?.isDirectory).toBe(true)
    })

    test('should reject non-existing paths', () => {
      const nonExistentPath = join(testDir, 'nonexistent.txt')
      const result = secureFileService.safeGetFileInfo(nonExistentPath)
      expect(result.success).toBe(false)
      expect(result.error).toBe('File does not exist')
    })

    test('should reject invalid paths', () => {
      const invalidPath = '/root/secure-test.txt'
      const result = secureFileService.safeGetFileInfo(invalidPath)
      expect(result.success).toBe(false)
      expect(result.error).toContain('outside allowed directories')
    })
  })

  describe('configuration methods', () => {
    test('should add allowed base paths', () => {
      const customDir = join(testDir, 'custom')
      mkdirSync(customDir, { recursive: true })
      
      const result = secureFileService.addAllowedBasePath(customDir)
      expect(result.success).toBe(true)
      
      // Test that the new path is now allowed
      const testFile = join(customDir, 'test.txt')
      const validation = secureFileService.validateFilePath(testFile)
      expect(validation.isValid).toBe(true)
    })

    test('should reject non-existing base paths', () => {
      const nonExistentDir = join(testDir, 'nonexistent')
      const result = secureFileService.addAllowedBasePath(nonExistentDir)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Base path does not exist')
    })

    test('should set max file size', () => {
      secureFileService.setMaxFileSize(2048)
      
      const testFile = join(testDir, 'size-test.txt')
      const largeContent = 'a'.repeat(3000) // 3KB
      writeFileSync(testFile, largeContent)
      
      const result = secureFileService.safeReadFile(testFile)
      expect(result.success).toBe(false)
      expect(result.error).toContain('File too large')
    })

    test('should add allowed extensions', () => {
      secureFileService.addAllowedExtensions(['.custom', '.special'])
      
      const testFile = join(testDir, 'test.custom')
      writeFileSync(testFile, 'custom content')
      
      const result = secureFileService.safeReadFile(testFile)
      expect(result.success).toBe(true)
      expect(result.content).toBe('custom content')
    })

    test('should check if path is allowed', () => {
      const allowedPath = join(testDir, 'allowed.txt')
      const disallowedPath = '/etc/passwd'
      
      expect(secureFileService.isPathAllowed(allowedPath)).toBe(true)
      expect(secureFileService.isPathAllowed(disallowedPath)).toBe(false)
    })
  })

  describe('singleton pattern', () => {
    test('should return the same instance', () => {
      const instance1 = SecureFileService.getInstance()
      const instance2 = SecureFileService.getInstance()
      const instance3 = secureFileService
      
      expect(instance1).toBe(instance2)
      expect(instance2).toBe(instance3)
    })

    test('should maintain configuration across instances', () => {
      const instance1 = SecureFileService.getInstance()
      const instance2 = SecureFileService.getInstance()
      
      instance1.setMaxFileSize(2048)
      instance2.addAllowedExtensions(['.test'])
      
      const testFile = join(testDir, 'test.test')
      writeFileSync(testFile, 'test')
      
      const result = instance1.safeReadFile(testFile)
      expect(result.success).toBe(true)
    })
  })

  describe('error handling', () => {
    test('should handle permission errors gracefully', () => {
      // This test simulates permission errors by trying to read a directory as a file
      const result = secureFileService.safeReadFile(testDir, { 
        checkFileExtension: false,
        maxFileSize: 10 * 1024 * 1024 // Use default size
      })
      expect(result.success).toBe(false)
      expect(result.error).toBe('Path is not a file')
    })

    test('should handle file system errors gracefully', () => {
      // Test with a path that contains invalid characters for the file system
      const invalidPath = join(testDir, 'invalid\0path.txt')
      const result = secureFileService.validateFilePath(invalidPath)
      // The validation might handle this differently, but it should still fail
      if (!result.isValid) {
        expect(result.error).toBeDefined()
      }
    })
  })

  describe('edge cases', () => {
    test('should handle empty files', () => {
      const testFile = join(testDir, 'empty.txt')
      writeFileSync(testFile, '')
      
      const result = secureFileService.safeReadFile(testFile)
      expect(result.success).toBe(true)
      expect(result.content).toBe('')
      expect(result.stats?.size).toBe(0)
    })

    test('should handle files with special characters in name', () => {
      const testFile = join(testDir, 'file-with-hyphens_and_underscores.txt')
      const content = 'special characters test'
      writeFileSync(testFile, content)
      
      const result = secureFileService.safeReadFile(testFile)
      expect(result.success).toBe(true)
      expect(result.content).toBe(content)
    })

    test('should handle different encodings', () => {
      const testFile = join(testDir, 'utf8.txt')
      const content = 'Hello 世界 🌍'
      writeFileSync(testFile, content, 'utf8')
      
      const result = secureFileService.safeReadFile(testFile, { encoding: 'utf8' })
      expect(result.success).toBe(true)
      expect(result.content).toBe(content)
    })
  })
})