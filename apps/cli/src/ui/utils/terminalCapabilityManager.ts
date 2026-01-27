import * as fs from 'node:fs'
import {
  disableBracketedPasteMode,
  disableKittyKeyboardProtocol,
  disableModifyOtherKeys,
  enableBracketedPasteMode,
  enableKittyKeyboardProtocol,
  enableModifyOtherKeys,
} from '#cli-utils/terminal'
import { debug as debugLogger } from '#core/utils/debugLogger'

export type TerminalBackgroundColor = string | undefined

export class TerminalCapabilityManager {
  private static instance: TerminalCapabilityManager | undefined

  private static readonly KITTY_QUERY = '\x1b[?u'
  private static readonly OSC_11_QUERY = '\x1b]11;?\x1b\\'
  private static readonly TERMINAL_NAME_QUERY = '\x1b[>q'
  private static readonly DEVICE_ATTRIBUTES_QUERY = '\x1b[c'
  private static readonly MODIFY_OTHER_KEYS_QUERY = '\x1b[>4;?m'
  private static readonly BRACKETED_PASTE_QUERY = '\x1b[?2004$p'

  // eslint-disable-next-line no-control-regex
  private static readonly KITTY_REGEX = /\x1b\[\?(\d+)u/
  // eslint-disable-next-line no-control-regex
  private static readonly TERMINAL_NAME_REGEX = /\x1bP>\|(.+?)(\x1b\\|\x07)/
  // eslint-disable-next-line no-control-regex
  private static readonly DEVICE_ATTRIBUTES_REGEX = /\x1b\[\?(\d+)(;\d+)*c/
  // eslint-disable-next-line no-control-regex
  private static readonly OSC_11_REGEX =
    /\x1b\]11;rgb:([0-9a-fA-F]{1,4})\/([0-9a-fA-F]{1,4})\/([0-9a-fA-F]{1,4})(\x1b\\|\x07)?/
  // eslint-disable-next-line no-control-regex
  private static readonly MODIFY_OTHER_KEYS_REGEX = /\x1b\[>4;(\d+)m/
  // eslint-disable-next-line no-control-regex
  private static readonly BRACKETED_PASTE_REGEX = /\x1b\[\?2004;([1-4])\$y/

  static getInstance(): TerminalCapabilityManager {
    if (!TerminalCapabilityManager.instance) {
      TerminalCapabilityManager.instance = new TerminalCapabilityManager()
    }
    return TerminalCapabilityManager.instance
  }

  private terminalBackgroundColor: TerminalBackgroundColor
  private kittySupported = false
  private kittyEnabled = false
  private detectionComplete = false
  private terminalName: string | undefined
  private modifyOtherKeysSupported = false
  private modifyOtherKeysEnabled = false
  private bracketedPasteSupported = false
  private bracketedPasteEnabled = false

  async detectCapabilities(timeoutMs = 1000): Promise<void> {
    if (this.detectionComplete) return
    this.detectionComplete = true

    if (!process.stdout?.isTTY || !process.stdin?.isTTY) return

    const stdin = process.stdin
    const wasRaw = stdin.isRaw
    try {
      stdin.setEncoding('utf8')
      if (stdin.isTTY && !wasRaw) stdin.setRawMode(true)
    } catch (error) {
      debugLogger.warn('TERMINAL_CAPABILITY_RAWMODE_FAILED', { error })
    }

    await new Promise<void>(resolve => {
      let buffer = ''
      let kittyReceived = false
      let bracketedPasteReceived = false
      let terminalNameReceived = false
      let osc11Received = false
      let deviceAttributesReceived = false
      let modifyOtherKeysReceived = false

      const cleanup = () => {
        stdin.removeListener('data', onData)
        if (stdin.isTTY && !wasRaw) {
          try {
            stdin.setRawMode(false)
          } catch {
            // no-op
          }
        }
        resolve()
      }

      const timeoutId = setTimeout(cleanup, timeoutMs)

      const onData = (data: string) => {
        buffer += data

        if (!kittyReceived) {
          const match = buffer.match(TerminalCapabilityManager.KITTY_REGEX)
          if (match) {
            kittyReceived = true
            this.kittySupported = true
          }
        }

        if (!modifyOtherKeysReceived) {
          const match = buffer.match(
            TerminalCapabilityManager.MODIFY_OTHER_KEYS_REGEX,
          )
          if (match) {
            modifyOtherKeysReceived = true
            const level = Number.parseInt(match[1] ?? '0', 10)
            this.modifyOtherKeysSupported = level >= 2
          }
        }

        if (!bracketedPasteReceived) {
          const match = buffer.match(
            TerminalCapabilityManager.BRACKETED_PASTE_REGEX,
          )
          if (match) {
            bracketedPasteReceived = true
            this.bracketedPasteSupported = true
          }
        }

        if (!terminalNameReceived) {
          const match = buffer.match(
            TerminalCapabilityManager.TERMINAL_NAME_REGEX,
          )
          if (match) {
            terminalNameReceived = true
            this.terminalName = match[1]
          }
        }

        if (!osc11Received) {
          const match = buffer.match(TerminalCapabilityManager.OSC_11_REGEX)
          if (match) {
            osc11Received = true
            this.terminalBackgroundColor = this.parseColor(
              match[1] ?? '0',
              match[2] ?? '0',
              match[3] ?? '0',
            )
          }
        }

        if (!deviceAttributesReceived) {
          const match = buffer.match(
            TerminalCapabilityManager.DEVICE_ATTRIBUTES_REGEX,
          )
          if (match) {
            deviceAttributesReceived = true
            clearTimeout(timeoutId)
            cleanup()
          }
        }
      }

      stdin.on('data', onData)

      try {
        fs.writeSync(
          process.stdout.fd,
          TerminalCapabilityManager.KITTY_QUERY +
            TerminalCapabilityManager.OSC_11_QUERY +
            TerminalCapabilityManager.TERMINAL_NAME_QUERY +
            TerminalCapabilityManager.MODIFY_OTHER_KEYS_QUERY +
            TerminalCapabilityManager.BRACKETED_PASTE_QUERY +
            TerminalCapabilityManager.DEVICE_ATTRIBUTES_QUERY,
        )
      } catch (error) {
        debugLogger.warn('TERMINAL_CAPABILITY_QUERY_FAILED', { error })
        clearTimeout(timeoutId)
        cleanup()
      }
    })
  }

  enableSupportedModes(options?: {
    enableKitty?: boolean
    enableModifyOtherKeys?: boolean
    enableBracketedPaste?: boolean
  }): void {
    try {
      const allowKitty = options?.enableKitty !== false
      const allowModifyOtherKeys = options?.enableModifyOtherKeys !== false
      const allowBracketedPaste = options?.enableBracketedPaste !== false

      const shouldEnableKitty = allowKitty && this.kittySupported
      const shouldEnableModifyOtherKeys =
        !shouldEnableKitty &&
        allowModifyOtherKeys &&
        this.modifyOtherKeysSupported

      // Enable enhanced keyboard reporting. Prefer kitty when supported, otherwise fall back
      // to modifyOtherKeys. Enabling unsupported modes can break key decoding on some terminals.
      if (shouldEnableKitty) {
        enableKittyKeyboardProtocol()
        this.kittyEnabled = true
      } else {
        this.kittyEnabled = false
      }

      if (shouldEnableModifyOtherKeys) {
        enableModifyOtherKeys()
        this.modifyOtherKeysEnabled = true
      } else {
        this.modifyOtherKeysEnabled = false
      }

      // Always *attempt* to enable bracketed paste: unsupported terminals will ignore it.
      // Track "enabled" as "supported+requested" so other heuristics can fall back safely.
      if (allowBracketedPaste) {
        enableBracketedPasteMode()
        this.bracketedPasteEnabled = this.bracketedPasteSupported
      } else {
        this.bracketedPasteEnabled = false
      }
    } catch (error) {
      debugLogger.warn('TERMINAL_CAPABILITY_ENABLE_FAILED', { error })
    }
  }

  disableAllModes(): void {
    disableKittyKeyboardProtocol()
    disableModifyOtherKeys()
    disableBracketedPasteMode()
    this.kittyEnabled = false
    this.modifyOtherKeysEnabled = false
    this.bracketedPasteEnabled = false
  }

  getTerminalBackgroundColor(): TerminalBackgroundColor {
    return this.terminalBackgroundColor
  }

  getTerminalName(): string | undefined {
    return this.terminalName
  }

  isKittyProtocolEnabled(): boolean {
    return this.kittyEnabled
  }

  isKittyProtocolSupported(): boolean {
    return this.kittySupported
  }

  isBracketedPasteSupported(): boolean {
    return this.bracketedPasteSupported
  }

  isBracketedPasteEnabled(): boolean {
    return this.bracketedPasteEnabled
  }

  isModifyOtherKeysSupported(): boolean {
    return this.modifyOtherKeysSupported
  }

  isModifyOtherKeysEnabled(): boolean {
    return this.modifyOtherKeysEnabled
  }

  private parseColor(rHex: string, gHex: string, bHex: string): string {
    const parseComponent = (hex: string) => {
      const val = Number.parseInt(hex, 16)
      if (hex.length === 1) return (val / 15) * 255
      if (hex.length === 2) return val
      if (hex.length === 3) return (val / 4095) * 255
      if (hex.length === 4) return (val / 65535) * 255
      return val
    }

    const r = parseComponent(rHex)
    const g = parseComponent(gHex)
    const b = parseComponent(bHex)

    const toHex = (c: number) => Math.round(c).toString(16).padStart(2, '0')
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
  }
}

export const terminalCapabilityManager = TerminalCapabilityManager.getInstance()
