import { getMCPTools } from '#core/mcp/client'
import { debug as debugLogger } from '#core/utils/debugLogger'
import { logError } from '#core/utils/log'

export type Tool = {
  name: string
  description?: string | (() => Promise<string>)
}

// Tool categories for sophisticated selection
export const TOOL_CATEGORIES = {
  read: ['Read', 'LS', 'Glob', 'Grep'],
  edit: ['Edit', 'Write', 'NotebookEdit'],
  execution: ['Bash', 'TaskOutput', 'TaskStop'],
  web: ['WebFetch', 'WebSearch'],
  other: ['TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'AskUserQuestion'],
} as const

function getCoreTools(): Tool[] {
  const tools: Tool[] = [
    { name: 'Read', description: 'Read files from filesystem' },
    { name: 'Write', description: 'Write files to filesystem' },
    { name: 'Edit', description: 'Edit existing files' },
    { name: 'NotebookEdit', description: 'Edit Jupyter notebooks' },
    { name: 'Bash', description: 'Execute bash commands' },
    { name: 'TaskOutput', description: 'Read background task output' },
    { name: 'TaskStop', description: 'Stop a running background task' },
    { name: 'Glob', description: 'Find files matching patterns' },
    { name: 'Grep', description: 'Search file contents' },
    { name: 'LS', description: 'List directory contents' },
    { name: 'WebFetch', description: 'Fetch web content' },
    { name: 'WebSearch', description: 'Search the web' },
    { name: 'TaskCreate', description: 'Create a task' },
    { name: 'TaskUpdate', description: 'Update task status and fields' },
    { name: 'TaskList', description: 'List tasks' },
    { name: 'TaskGet', description: 'Get a task by ID' },
    { name: 'AskUserQuestion', description: 'Ask the user a question' },
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
    logError(error)
    debugLogger.warn('AGENT_TOOLING_MCP_LOAD_FAILED', {
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return availableTools
}
