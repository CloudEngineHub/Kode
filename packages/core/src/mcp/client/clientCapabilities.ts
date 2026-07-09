import type { ClientCapabilities } from '@modelcontextprotocol/sdk/types.js'

import { getMcpClientCapabilities } from './roots'

export type McpClientCapabilitySummary = {
  roots: { enabled: boolean; listChanged: boolean }
  sampling: { enabled: boolean }
  elicitation: { enabled: boolean }
}

export function summarizeMcpClientCapabilities(
  capabilities: ClientCapabilities = getMcpClientCapabilities(),
): McpClientCapabilitySummary {
  return {
    roots: {
      enabled: Boolean(capabilities.roots),
      listChanged: Boolean(capabilities.roots?.listChanged),
    },
    sampling: { enabled: Boolean(capabilities.sampling) },
    elicitation: { enabled: Boolean(capabilities.elicitation) },
  }
}

export function getMcpClientCapabilitySummary(): McpClientCapabilitySummary {
  return summarizeMcpClientCapabilities()
}

export function formatMcpClientCapabilityLine(
  name: string,
  enabled: boolean,
  detail?: string,
): string {
  if (!enabled) return `${name}: disabled`
  return `${name}: enabled${detail ? ` (${detail})` : ''}`
}

export function formatMcpClientCapabilitySummary(
  summary: McpClientCapabilitySummary,
): string[] {
  return [
    formatMcpClientCapabilityLine(
      'roots',
      summary.roots.enabled,
      summary.roots.listChanged ? 'listChanged' : undefined,
    ),
    formatMcpClientCapabilityLine('sampling', summary.sampling.enabled),
    formatMcpClientCapabilityLine('elicitation', summary.elicitation.enabled),
  ]
}
