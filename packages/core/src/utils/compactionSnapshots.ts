import type { Message } from '#core/query'
import { listTaskSummaries } from '#core/utils/taskStorage'

type ToolUseBlockLike = {
  type: 'tool_use' | 'server_tool_use' | 'mcp_tool_use'
  name?: unknown
  input?: unknown
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function isToolUseBlockLike(value: unknown): value is ToolUseBlockLike {
  const record = asRecord(value)
  if (!record) return false
  const type = record.type
  return (
    type === 'tool_use' || type === 'server_tool_use' || type === 'mcp_tool_use'
  )
}

export function formatCompactionTaskListSnapshot(
  maxTasks: number = 50,
): string {
  const tasks = listTaskSummaries()
  if (tasks.length === 0) return 'No tasks.'

  const completed = new Set(
    tasks.filter(t => t.status === 'completed').map(t => t.id),
  )
  return tasks
    .slice(0, maxTasks)
    .map(t => {
      const blocked =
        t.blockedBy.length > 0
          ? ` [blocked by ${t.blockedBy
              .filter(id => !completed.has(id))
              .map(id => `#${id}`)
              .join(', ')}]`
          : ''
      return `#${t.id} [${t.status}] ${t.subject}${blocked}`
    })
    .join('\n')
}

export function formatCompactionSkillCommandSnapshot(
  messages: Message[],
  options?: { maxItems?: number },
): string {
  const maxItems = Math.max(1, Math.trunc(options?.maxItems ?? 30))

  const seen = new Set<string>()
  const items: Array<{ name: string; args?: string }> = []

  const add = (name: string, args?: string) => {
    const normalized = name.trim()
    if (!normalized) return
    const key = `${normalized}\n${args ?? ''}`
    if (seen.has(key)) return
    seen.add(key)
    items.push({
      name: normalized,
      ...(args?.trim() ? { args: args.trim() } : {}),
    })
  }

  // 1) Fast path: messages expanded by SkillTool / SlashCommandTool.
  for (const message of messages) {
    if (message?.type !== 'user') continue
    const opts = message.options
    if (!opts || opts.isCustomCommand !== true) continue
    const name = typeof opts.commandName === 'string' ? opts.commandName : ''
    const args = typeof opts.commandArgs === 'string' ? opts.commandArgs : ''
    add(name, args)
    if (items.length >= maxItems) break
  }

  if (items.length < maxItems) {
    // 2) Fallback: tool uses for Skill / SlashCommand in assistant messages
    for (const message of messages) {
      if (message?.type !== 'assistant') continue
      const content = message.message.content as unknown
      if (!Array.isArray(content)) continue
      for (const block of content) {
        if (!isToolUseBlockLike(block)) continue
        const name = typeof block.name === 'string' ? block.name : ''
        const input = asRecord(block.input)

        if (name === 'Skill') {
          const skill = typeof input?.skill === 'string' ? input.skill : ''
          const args = typeof input?.args === 'string' ? input.args : ''
          add(skill.startsWith('/') ? skill.slice(1) : skill, args)
        } else if (name === 'SlashCommand') {
          const command =
            typeof input?.command === 'string' ? input.command : ''
          const args = typeof input?.args === 'string' ? input.args : ''
          add(command.startsWith('/') ? command.slice(1) : command, args)
        }

        if (items.length >= maxItems) break
      }
      if (items.length >= maxItems) break
    }
  }

  if (items.length === 0) return 'No skills or custom commands invoked.'

  return items
    .slice(0, maxItems)
    .map(item => `- ${item.name}${item.args ? ` ${item.args}` : ''}`)
    .join('\n')
}

function getMcpClientNames(mcpClients: unknown): string[] {
  if (!Array.isArray(mcpClients)) return []
  const names: string[] = []
  for (const client of mcpClients) {
    const record = asRecord(client)
    const name = typeof record?.name === 'string' ? record.name.trim() : ''
    if (name) names.push(name)
  }
  return Array.from(new Set(names))
}

export function formatCompactionMcpSnapshot(args: {
  messages: Message[]
  mcpClients?: unknown
  maxTools?: number
  maxServers?: number
  maxResources?: number
}): string {
  const maxTools = Math.max(1, Math.trunc(args.maxTools ?? 25))
  const maxServers = Math.max(1, Math.trunc(args.maxServers ?? 10))
  const maxResources = Math.max(1, Math.trunc(args.maxResources ?? 10))

  const servers = getMcpClientNames(args.mcpClients).slice(0, maxServers)

  const usedTools: string[] = []
  const seen = new Set<string>()
  const resources: string[] = []
  const seenResources = new Set<string>()
  for (const message of args.messages) {
    if (message?.type !== 'assistant') continue
    const content = message.message.content as unknown
    if (!Array.isArray(content)) continue
    for (const block of content) {
      if (!isToolUseBlockLike(block)) continue
      const name = typeof block.name === 'string' ? block.name.trim() : ''

      if (block.type === 'tool_use') {
        if (name === 'ReadMcpResourceTool') {
          const input = asRecord(block.input)
          const server =
            typeof input?.server === 'string' ? input.server.trim() : ''
          const uri = typeof input?.uri === 'string' ? input.uri.trim() : ''
          if (uri) {
            const entry = server ? `${server}: ${uri}` : uri
            if (resources.length < maxResources && !seenResources.has(entry)) {
              seenResources.add(entry)
              resources.push(entry)
            }
          }
        }
      }

      if (block.type !== 'mcp_tool_use') continue
      if (!name || seen.has(name)) continue
      seen.add(name)
      usedTools.push(name)

      if (usedTools.length >= maxTools && resources.length >= maxResources) {
        break
      }
    }
    if (usedTools.length >= maxTools && resources.length >= maxResources) break
  }

  const lines: string[] = []
  lines.push(
    `Connected servers: ${servers.length > 0 ? servers.join(', ') : 'None/unknown'}`,
  )
  lines.push(
    `Resources read recently: ${resources.length > 0 ? resources.slice(0, maxResources).join(' · ') : 'None/unknown'}`,
  )
  lines.push(
    `Tools used recently: ${usedTools.length > 0 ? usedTools.join(', ') : 'None/unknown'}`,
  )
  return lines.join('\n')
}
