import type { Tool } from '#core/tooling/Tool'

function readString(input: Record<string, unknown>, key: string): string {
  const value = input[key]
  return typeof value === 'string' ? value : ''
}

export function getPermissionKey(
  tool: Tool,
  input: { [k: string]: unknown },
  prefix: string | null,
): string {
  switch (tool.name) {
    case 'Bash': {
      const command = readString(input, 'command').trim()
      if (prefix) {
        return `${tool.name}(${String(prefix).trim()}:*)`
      }
      return `${tool.name}(${command})`
    }
    case 'WebFetch': {
      try {
        const url = readString(input, 'url')
        return `${tool.name}(domain:${new URL(url).hostname})`
      } catch {
        return `${tool.name}(input:${String(input)})`
      }
    }
    case 'WebSearch': {
      const query = readString(input, 'query').trim()
      if (!query) return tool.name
      return `${tool.name}(${query})`
    }
    case 'SlashCommand': {
      const command =
        typeof input.command === 'string' ? input.command.trim() : ''
      if (prefix) {
        return `${tool.name}(${String(prefix).trim()}:*)`
      }
      return `${tool.name}(${command})`
    }
    case 'Skill': {
      const raw = typeof input.skill === 'string' ? input.skill : ''
      const skill = raw.trim().replace(/^\//, '')
      if (prefix) {
        const p = String(prefix).trim().replace(/^\//, '')
        return `${tool.name}(${p}:*)`
      }
      return `${tool.name}(${skill})`
    }
    default: {
      return tool.name
    }
  }
}
