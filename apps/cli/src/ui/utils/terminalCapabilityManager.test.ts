import { afterEach, describe, expect, test } from 'bun:test'
import { EventEmitter } from 'node:events'
import { closeSync, mkdtempSync, openSync, rmSync } from 'node:fs'
import path from 'node:path'

import { TerminalCapabilityManager } from './terminalCapabilityManager'

class FakeTTYInput extends EventEmitter {
  isTTY = true
  isRaw = false

  setEncoding(_encoding: BufferEncoding): void {}

  setRawMode(value: boolean): void {
    this.isRaw = value
  }
}

const originalStdin = Object.getOwnPropertyDescriptor(process, 'stdin')
const originalStdout = Object.getOwnPropertyDescriptor(process, 'stdout')
let tempDir: string | undefined
let tempFd: number | undefined

function installFakeTTY(stdin: FakeTTYInput): void {
  tempDir = mkdtempSync(path.join(path.dirname(process.cwd()), '.tmp-tty-'))
  tempFd = openSync(path.join(tempDir, 'stdout.log'), 'w')

  Object.defineProperty(process, 'stdin', {
    configurable: true,
    value: stdin,
  })
  Object.defineProperty(process, 'stdout', {
    configurable: true,
    value: {
      isTTY: true,
      fd: tempFd,
    },
  })
}

afterEach(() => {
  if (originalStdin) Object.defineProperty(process, 'stdin', originalStdin)
  if (originalStdout) Object.defineProperty(process, 'stdout', originalStdout)
  if (tempFd !== undefined) {
    closeSync(tempFd)
    tempFd = undefined
  }
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true })
    tempDir = undefined
  }
})

describe('TerminalCapabilityManager', () => {
  test('keeps probe input open briefly after DA so delayed OSC 11 is captured', async () => {
    const stdin = new FakeTTYInput()
    installFakeTTY(stdin)

    const manager = new TerminalCapabilityManager()
    const detection = manager.detectCapabilities(100, 20)

    queueMicrotask(() => {
      stdin.emit('data', '\x1b[?1;2c')
      setTimeout(() => {
        stdin.emit('data', '\x1b]11;rgb:1111/2222/3333\x1b\\')
      }, 5)
    })

    await detection

    expect(manager.getTerminalBackgroundColor()).toBe('#112233')
    expect(stdin.isRaw).toBe(false)
  })
})
