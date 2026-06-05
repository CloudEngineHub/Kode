import { describe, expect, test } from 'bun:test'

describe('terminalSetup module resolution', () => {
  test('terminalSetup module can be imported without errors', async () => {
    let importError: Error | null = null
    try {
      await import('@commands/terminalSetup')
    } catch (e) {
      importError = e instanceof Error ? e : new Error(String(e))
    }
    expect(importError).toBeNull()
  })

  test('terminalSetup exports a default command', async () => {
    const mod = await import('@commands/terminalSetup')
    expect(mod.default).toBeDefined()
    expect(mod.default.name).toBe('terminal-setup')
    expect(mod.default.type).toBe('local')
  })

  test('terminalSetup exports isShiftEnterKeyBindingInstalled', async () => {
    const mod = await import('@commands/terminalSetup')
    expect(typeof mod.isShiftEnterKeyBindingInstalled).toBe('function')
  })

  test('isShiftEnterKeyBindingInstalled returns a boolean', async () => {
    const mod = await import('@commands/terminalSetup')
    const result = mod.isShiftEnterKeyBindingInstalled()
    expect(typeof result).toBe('boolean')
  })

  test('terminalSetup exports handleHashCommand', async () => {
    const mod = await import('@commands/terminalSetup')
    expect(typeof mod.handleHashCommand).toBe('function')
  })

  test('terminalSetup command has correct metadata', async () => {
    const mod = await import('@commands/terminalSetup')
    const cmd = mod.default
    expect(cmd.description).toContain('Shift+Enter')
    expect(cmd.isHidden).toBe(false)
    expect(typeof cmd.call).toBe('function')
  })
})
