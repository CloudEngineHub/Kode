import { memoize } from 'lodash-es'
import { Tool } from './Tool'
import { AskExpertModelTool } from './tools/AskExpertModelTool/AskExpertModelTool'
import { AskUserQuestionTool } from './tools/AskUserQuestionTool/AskUserQuestionTool'
import { BashTool } from './tools/BashTool/BashTool'
import { TaskOutputTool } from './tools/TaskOutputTool/TaskOutputTool'
import { EnterPlanModeTool } from './tools/PlanModeTool/EnterPlanModeTool'
import { ExitPlanModeTool } from './tools/PlanModeTool/ExitPlanModeTool'
import { FileEditTool } from './tools/FileEditTool/FileEditTool'
import { FileReadTool } from './tools/FileReadTool/FileReadTool'
import { FileWriteTool } from './tools/FileWriteTool/FileWriteTool'
import { GlobTool } from './tools/GlobTool/GlobTool'
import { GrepTool } from './tools/GrepTool/GrepTool'
import { KillShellTool } from './tools/KillShellTool/KillShellTool'
import { ListMcpResourcesTool } from './tools/ListMcpResourcesTool/ListMcpResourcesTool'
import { MCPTool } from './tools/MCPTool/MCPTool'
import { NotebookEditTool } from './tools/NotebookEditTool/NotebookEditTool'
import { ReadMcpResourceTool } from './tools/ReadMcpResourceTool/ReadMcpResourceTool'
import { SlashCommandTool } from './tools/SlashCommandTool/SlashCommandTool'
import { SkillTool } from './tools/SkillTool/SkillTool'
import { TaskTool } from './tools/TaskTool/TaskTool'
import { TodoWriteTool } from './tools/TodoWriteTool/TodoWriteTool'
import { WebFetchTool } from './tools/WebFetchTool/WebFetchTool'
import { WebSearchTool } from './tools/WebSearchTool/WebSearchTool'
import { getMCPTools } from './services/mcpClient'

// Base tool list for the CLI toolset
export const getAllTools = (): Tool[] => [
  TaskTool as unknown as Tool,
  AskExpertModelTool as unknown as Tool,
  BashTool as unknown as Tool,
  TaskOutputTool as unknown as Tool,
  KillShellTool as unknown as Tool,
  GlobTool as unknown as Tool,
  GrepTool as unknown as Tool,
  FileReadTool as unknown as Tool,
  FileEditTool as unknown as Tool,
  FileWriteTool as unknown as Tool,
  NotebookEditTool as unknown as Tool,
  TodoWriteTool as unknown as Tool,
  WebSearchTool as unknown as Tool,
  WebFetchTool as unknown as Tool,
  AskUserQuestionTool as unknown as Tool,
  EnterPlanModeTool as unknown as Tool,
  ExitPlanModeTool as unknown as Tool,
  SlashCommandTool as unknown as Tool,
  SkillTool as unknown as Tool,
  ListMcpResourcesTool as unknown as Tool,
  ReadMcpResourceTool as unknown as Tool,
  MCPTool as unknown as Tool,
]

export const getTools = memoize(
  async (_includeOptional?: boolean): Promise<Tool[]> => {
    const tools = [...getAllTools(), ...(await getMCPTools())]

    const isEnabled = await Promise.all(tools.map(tool => tool.isEnabled()))
    return tools.filter((_, i) => isEnabled[i])
  },
)

export const getReadOnlyTools = memoize(async (): Promise<Tool[]> => {
  const tools = getAllTools().filter(tool => tool.isReadOnly())
  const isEnabled = await Promise.all(tools.map(tool => tool.isEnabled()))
  return tools.filter((_, index) => isEnabled[index])
})
