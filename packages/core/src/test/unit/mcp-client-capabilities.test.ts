import { afterEach, describe, expect, test } from 'bun:test'

import {
  formatMcpClientCapabilitySummary,
  getMcpClientCapabilitySummary,
  summarizeMcpClientCapabilities,
} from '#core/mcp/client'
import {
  __resetMcpRootsForTests,
  __setMcpRootsTrustOverrideForTests,
} from '#core/mcp/client/roots'

describe('MCP client capability summary', () => {
  afterEach(() => {
    __resetMcpRootsForTests()
  })

  test('summarizes trusted root capability exposure', () => {
    __setMcpRootsTrustOverrideForTests(true)

    expect(getMcpClientCapabilitySummary()).toEqual({
      roots: { enabled: true, listChanged: true },
      sampling: { enabled: false },
      elicitation: { enabled: false },
      tasks: { enabled: false },
    })
  })

  test('formats enabled and disabled client capabilities consistently', () => {
    const summary = summarizeMcpClientCapabilities({
      roots: { listChanged: false },
      sampling: {},
      elicitation: {},
      tasks: {},
    })

    expect(formatMcpClientCapabilitySummary(summary)).toEqual([
      'roots: enabled',
      'sampling: enabled',
      'elicitation: enabled',
      'tasks: enabled',
    ])
  })

  test('formats disabled client capabilities consistently', () => {
    const summary = summarizeMcpClientCapabilities({})

    expect(formatMcpClientCapabilitySummary(summary)).toEqual([
      'roots: disabled',
      'sampling: disabled',
      'elicitation: disabled',
      'tasks: disabled',
    ])
  })
})
