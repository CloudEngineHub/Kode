import { describe, expect, test } from 'bun:test'
import { buildStartupHeaderIdentityKey } from './startupHeaderIdentity'

describe('buildStartupHeaderIdentityKey', () => {
  test('uses session identity instead of terminal dimensions', () => {
    const base = {
      forkNumber: 0,
      isDefaultModel: false,
      updateAvailableVersion: null,
      updateCommands: null,
      mcpClients: [{ type: 'connected', name: 'codegraph' }],
    }

    const beforeResize = buildStartupHeaderIdentityKey(base)
    const afterResize = buildStartupHeaderIdentityKey(base)

    expect(afterResize).toBe(beforeResize)
    expect(beforeResize).not.toContain('80')
    expect(beforeResize).not.toContain('24')
    expect(beforeResize).not.toContain('120')
    expect(beforeResize).not.toContain('40')
  })

  test('changes when displayed startup state changes', () => {
    const base = {
      forkNumber: 0,
      isDefaultModel: true,
      updateAvailableVersion: null,
      updateCommands: null,
      mcpClients: [{ type: 'connected', name: 'codegraph' }],
    }

    expect(
      buildStartupHeaderIdentityKey({
        ...base,
        updateAvailableVersion: '1.2.3',
      }),
    ).not.toBe(buildStartupHeaderIdentityKey(base))
    expect(
      buildStartupHeaderIdentityKey({
        ...base,
        mcpClients: [{ type: 'failed', name: 'codegraph' }],
      }),
    ).not.toBe(buildStartupHeaderIdentityKey(base))
  })
})
