import { getMCPTools } from '@services/mcpClient'

export type Tool = {
  name: string
  description?: string | (() => Promise<string>)
}

// Tool categories for sophisticated selection
export const TOOL_CATEGORIES = {
  read: ['Read', 'Glob', 'Grep', 'LS'],
  edit: ['Edit', 'MultiEdit', 'Write', 'NotebookEdit'],
  execution: ['Bash', 'BashOutput', 'KillBash'],
  web: ['WebFetch', 'WebSearch'],
  other: ['TodoWrite', 'ExitPlanMode', 'Task'],
} as const

function getCoreTools(): Tool[] {
  const tools: Tool[] = [
    { name: 'Read', description: 'Read files from filesystem' },
    { name: 'Write', description: 'Write files to filesystem' },
    { name: 'Edit', description: 'Edit existing files' },
    { name: 'MultiEdit', description: 'Make multiple edits to files' },
    { name: 'NotebookEdit', description: 'Edit Jupyter notebooks' },
    { name: 'Bash', description: 'Execute bash commands' },
    { name: 'Glob', description: 'Find files matching patterns' },
    { name: 'Grep', description: 'Search file contents' },
    { name: 'LS', description: 'List directory contents' },
    { name: 'WebFetch', description: 'Fetch web content' },
    { name: 'WebSearch', description: 'Search the web' },
    { name: 'TodoWrite', description: 'Manage task lists' },
  ]

  // Hide agent orchestration/self-control tools for subagent configs
  return tools.filter(t => t.name !== 'Task' && t.name !== 'ExitPlanMode')
}

export async function getAvailableTools(): Promise<Tool[]> {
  const availableTools: Tool[] = []
  availableTools.push(...getCoreTools())

  try {
    const mcpTools = await getMCPTools()
    if (Array.isArray(mcpTools) && mcpTools.length > 0) {
      availableTools.push(...mcpTools)
    }
  } catch (error) {
    console.warn('Failed to load MCP tools:', error)
  }

  return availableTools
}
