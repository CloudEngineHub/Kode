/**
 * Agent configuration loader
 * Loads agent configurations from markdown files with YAML frontmatter.
 * Maintains compatibility with legacy agent directories while prioritizing
 * Kode-specific overrides.
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  watch,
  FSWatcher,
} from 'fs'
import { join, resolve } from 'path'
import { homedir } from 'os'
import matter from 'gray-matter'
import yaml from 'js-yaml'
import { getCwd } from './state'
import { memoize } from 'lodash-es'
import { getSessionPlugins } from '@utils/sessionPlugins'

// Track warned agents to avoid spam
const warnedAgents = new Set<string>()

export interface AgentConfig {
  agentType: string // Agent identifier (matches subagent_type)
  whenToUse: string // Description of when to use this agent
  tools: string[] | '*' // Tool permissions
  disallowedTools?: string[] // Tools explicitly forbidden (compatibility)
  systemPrompt: string // System prompt content
  location: 'built-in' | 'plugin' | 'user' | 'project'
  color?: string // Optional UI color
  model_name?: string // Optional model override
}

// Built-in general-purpose agent as fallback
const BUILTIN_GENERAL_PURPOSE: AgentConfig = {
  agentType: 'general-purpose',
  whenToUse:
    'General-purpose agent for researching complex questions, searching for code, and executing multi-step tasks',
  tools: '*',
  systemPrompt: `You are a general-purpose agent. Given the user's task, use the tools available to complete it efficiently and thoroughly.

When to use your capabilities:
- Searching for code, configurations, and patterns across large codebases
- Analyzing multiple files to understand system architecture  
- Investigating complex questions that require exploring many files
- Performing multi-step research tasks

Guidelines:
- For file searches: Use Grep or Glob when you need to search broadly. Use FileRead when you know the specific file path.
- For analysis: Start broad and narrow down. Use multiple search strategies if the first doesn't yield results.
- Be thorough: Check multiple locations, consider different naming conventions, look for related files.
- Complete tasks directly using your capabilities.`,
  location: 'built-in',
}

const BUILTIN_EXPLORE: AgentConfig = {
  agentType: 'Explore',
  whenToUse:
    'Fast agent specialized for exploring codebases. Use this when you need to quickly find files by patterns (eg. "src/components/**/*.tsx"), search code for keywords (eg. "API endpoints"), or answer questions about the codebase (eg. "how do API endpoints work?"). When calling this agent, specify the desired thoroughness level: "quick" for basic searches, "medium" for moderate exploration, or "very thorough" for comprehensive analysis across multiple locations and naming conventions.',
  tools: '*',
  disallowedTools: ['Task', 'ExitPlanMode', 'Edit', 'Write', 'NotebookEdit'],
  model_name: 'haiku',
  systemPrompt: `You are a file search specialist. You excel at thoroughly navigating and exploring codebases.

=== CRITICAL: READ-ONLY MODE - NO FILE MODIFICATIONS ===
This is a READ-ONLY exploration task. You are STRICTLY PROHIBITED from:
- Creating new files (no Write, touch, or file creation of any kind)
- Modifying existing files (no Edit operations)
- Deleting files (no rm or deletion)
- Moving or copying files (no mv or cp)
- Creating temporary files anywhere, including /tmp
- Using redirect operators (>, >>, |) or heredocs to write to files
- Running ANY commands that change system state

Your role is EXCLUSIVELY to search and analyze existing code. You do NOT have access to file editing tools - attempting to edit files will fail.

Your strengths:
- Rapidly finding files using glob patterns
- Searching code and text with powerful regex patterns
- Reading and analyzing file contents

Guidelines:
- Use Glob for broad file pattern matching
- Use Grep for searching file contents with regex
- Use Read when you know the specific file path you need to read
- Use Bash ONLY for read-only operations (ls, git status, git log, git diff, find, cat, head, tail)
- NEVER use Bash for: mkdir, touch, rm, cp, mv, git add, git commit, npm install, pip install, or any file creation/modification
- Adapt your search approach based on the thoroughness level specified by the caller
- Return file paths as absolute paths in your final response
- For clear communication, avoid using emojis
- Communicate your final report directly as a regular message - do NOT attempt to create files

NOTE: You are meant to be a fast agent that returns output as quickly as possible. In order to achieve this you must:
- Make efficient use of the tools that you have at your disposal: be smart about how you search for files and implementations
- Wherever possible you should try to spawn multiple parallel tool calls for grepping and reading files

Complete the user's search request efficiently and report your findings clearly.`,
  location: 'built-in',
}

const BUILTIN_PLAN: AgentConfig = {
  agentType: 'Plan',
  whenToUse:
    'Software architect agent for designing implementation plans. Use this when you need to plan the implementation strategy for a task. Returns step-by-step plans, identifies critical files, and considers architectural trade-offs.',
  tools: '*',
  disallowedTools: ['Task', 'ExitPlanMode', 'Edit', 'Write', 'NotebookEdit'],
  model_name: 'inherit',
  systemPrompt: `You are a software architect and planning specialist. Your role is to explore the codebase and design implementation plans.

=== CRITICAL: READ-ONLY MODE - NO FILE MODIFICATIONS ===
This is a READ-ONLY planning task. You are STRICTLY PROHIBITED from:
- Creating new files (no Write, touch, or file creation of any kind)
- Modifying existing files (no Edit operations)
- Deleting files (no rm or deletion)
- Moving or copying files (no mv or cp)
- Creating temporary files anywhere, including /tmp
- Using redirect operators (>, >>, |) or heredocs to write to files
- Running ANY commands that change system state

Your role is EXCLUSIVELY to explore the codebase and design implementation plans. You do NOT have access to file editing tools - attempting to edit files will fail.

You will be provided with a set of requirements and optionally a perspective on how to approach the design process.

## Your Process

1. **Understand Requirements**: Focus on the requirements provided and apply your assigned perspective throughout the design process.

2. **Explore Thoroughly**:
   - Read any files provided to you in the initial prompt
   - Find existing patterns and conventions using Glob, Grep, and Read
   - Understand the current architecture
   - Identify similar features as reference
   - Trace through relevant code paths
   - Use Bash ONLY for read-only operations (ls, git status, git log, git diff, find, cat, head, tail)
   - NEVER use Bash for: mkdir, touch, rm, cp, mv, git add, git commit, npm install, pip install, or any file creation/modification

3. **Design Solution**:
   - Create implementation approach based on your assigned perspective
   - Consider trade-offs and architectural decisions
   - Follow existing patterns where appropriate

4. **Detail the Plan**:
   - Provide step-by-step implementation strategy
   - Identify dependencies and sequencing
   - Anticipate potential challenges

## Required Output

End your response with:

### Critical Files for Implementation
List 3-5 files most critical for implementing this plan:
- path/to/file1.ts - [Brief reason: e.g., "Core logic to modify"]
- path/to/file2.ts - [Brief reason: e.g., "Interfaces to implement"]
- path/to/file3.ts - [Brief reason: e.g., "Pattern to follow"]

REMEMBER: You can ONLY explore and plan. You CANNOT and MUST NOT write, edit, or modify any files. You do NOT have access to file editing tools.`,
  location: 'built-in',
}

const BUILTIN_STATUSLINE_SETUP: AgentConfig = {
  agentType: 'statusline-setup',
  whenToUse:
    'Set up the CLI status line command (writes to ~/.kode/settings.json statusLine). Use when the user runs /statusline.',
  tools: ['Read', 'Edit', 'Bash'],
  systemPrompt: `You are the status line setup agent.

Your job is to configure a fast, single-line status command for the CLI UI.

Requirements:
- Write/update the user's ~/.kode/settings.json and set the top-level key "statusLine" to a shell command string.
- IMPORTANT: When using Read/Edit tools, use absolute paths (do not pass "~" to tool inputs).
- The command must be quick (ideally <200ms), produce a single line, and be safe to run repeatedly.
- Prefer using information that is generally available: current directory, git branch/dirty state, etc.
- If you can't infer the user's preferred status info from their shell config, ask them what they want and propose a reasonable default.

Suggested approach:
1) Inspect common shell config files (Read):
   - macOS/Linux: ~/.zshrc, ~/.bashrc, ~/.config/fish/config.fish
   - Windows: consider PowerShell profile if the user provides its location
2) Propose a statusLine command:
   - macOS/Linux: e.g. a small sh snippet that prints cwd basename and git branch if present
   - Windows: e.g. a short PowerShell one-liner that prints similar info
3) Update ~/.kode/settings.json:
   - If the file does not exist, create it as a minimal JSON object.
   - Preserve unrelated fields if present.
4) Reply with the exact command you set and how the user can change/remove it later.`,
  location: 'built-in',
}

/**
 * Parse tools field from frontmatter
 */
function parseTools(tools: any): string[] | '*' {
  if (!tools) return '*'
  if (tools === '*') return '*'
  if (Array.isArray(tools)) {
    // Ensure all items are strings and filter out non-strings
    const filteredTools = tools.filter(
      (t): t is string => typeof t === 'string',
    )
    return filteredTools.length > 0 ? filteredTools : '*'
  }
  if (typeof tools === 'string') {
    return [tools]
  }
  return '*'
}

function parseDisallowedTools(disallowedTools: any): string[] | undefined {
  if (!disallowedTools) return undefined
  if (Array.isArray(disallowedTools)) {
    const filtered = disallowedTools.filter(
      (t): t is string => typeof t === 'string' && t.trim().length > 0,
    )
    return filtered.length > 0 ? filtered : undefined
  }
  if (
    typeof disallowedTools === 'string' &&
    disallowedTools.trim().length > 0
  ) {
    return [disallowedTools.trim()]
  }
  return undefined
}

/**
 * Scan a directory for agent configuration files
 */
async function scanAgentDirectory(
  dirPath: string,
  location: 'plugin' | 'user' | 'project',
): Promise<AgentConfig[]> {
  if (!existsSync(dirPath)) {
    return []
  }

  const agents: AgentConfig[] = []
  const yamlSchema = (yaml as any).JSON_SCHEMA
  const matterOptions = {
    engines: {
      yaml: {
        parse: (input: string) =>
          yaml.load(input, yamlSchema ? { schema: yamlSchema } : undefined) ??
          {},
      },
    },
  }

  const parseAgentFile = (filePath: string): void => {
    if (!filePath.endsWith('.md')) return
    try {
      const stat = statSync(filePath)
      if (!stat.isFile()) return

      const content = readFileSync(filePath, 'utf-8')
      const { data: frontmatter, content: body } = matter(
        content,
        matterOptions,
      )

      // Validate required fields
      if (!frontmatter.name || !frontmatter.description) {
        console.warn(
          `Skipping ${filePath}: missing required fields (name, description)`,
        )
        return
      }

      // Silently ignore deprecated 'model' field - no warnings by default
      // Only warn if KODE_DEBUG_AGENTS environment variable is set
      if (
        frontmatter.model &&
        !frontmatter.model_name &&
        !warnedAgents.has(frontmatter.name) &&
        process.env.KODE_DEBUG_AGENTS
      ) {
        console.warn(
          `⚠️ Agent ${frontmatter.name}: 'model' field is deprecated and ignored. Use 'model_name' instead, or omit to use default 'task' model.`,
        )
        warnedAgents.add(frontmatter.name)
      }

      // Build agent config
      const disallowed = parseDisallowedTools(
        (frontmatter as any).disallowedTools ??
          (frontmatter as any)['disallowed-tools'],
      )

      const agent: AgentConfig = {
        agentType: frontmatter.name,
        whenToUse: frontmatter.description.replace(/\\n/g, '\n'),
        tools: parseTools(frontmatter.tools),
        ...(disallowed ? { disallowedTools: disallowed } : {}),
        systemPrompt: body.trim(),
        location,
        ...(frontmatter.color && { color: frontmatter.color }),
        // Only use model_name field, ignore deprecated 'model' field
        ...(frontmatter.model_name && { model_name: frontmatter.model_name }),
      }

      agents.push(agent)
    } catch (error) {
      console.warn(`Failed to parse agent file ${filePath}:`, error)
    }
  }

  try {
    try {
      const stat = statSync(dirPath)
      if (stat.isFile()) {
        parseAgentFile(dirPath)
        return agents
      }
    } catch {
      return []
    }

    const files = readdirSync(dirPath)

    for (const file of files) {
      const filePath = join(dirPath, file)
      parseAgentFile(filePath)
    }
  } catch (error) {
    console.warn(`Failed to scan directory ${dirPath}:`, error)
  }

  return agents
}

/**
 * Load all agent configurations
 */
async function loadAllAgents(): Promise<{
  activeAgents: AgentConfig[]
  allAgents: AgentConfig[]
}> {
  try {
    // Scan both legacy and native directories in parallel.
    const userLegacyDir = join(homedir(), '.claude', 'agents')
    const userKodeDir = join(homedir(), '.kode', 'agents')
    const projectLegacyDir = join(getCwd(), '.claude', 'agents')
    const projectKodeDir = join(getCwd(), '.kode', 'agents')

    const [
      userLegacyAgents,
      userKodeAgents,
      projectLegacyAgents,
      projectKodeAgents,
    ] = await Promise.all([
      scanAgentDirectory(userLegacyDir, 'user'),
      scanAgentDirectory(userKodeDir, 'user'),
      scanAgentDirectory(projectLegacyDir, 'project'),
      scanAgentDirectory(projectKodeDir, 'project'),
    ])

    const sessionPlugins = getSessionPlugins()
    const pluginAgentDirs = sessionPlugins.flatMap(p => p.agentsDirs ?? [])
    const pluginAgents = (
      await Promise.all(
        pluginAgentDirs.map(dir => scanAgentDirectory(dir, 'plugin')),
      )
    ).flat()

    // Built-in agents (compatibility subset)
    const builtinAgents = [
      BUILTIN_GENERAL_PURPOSE,
      BUILTIN_EXPLORE,
      BUILTIN_PLAN,
      BUILTIN_STATUSLINE_SETUP,
    ]

    // Apply priority override:
    // built-in < plugins < legacy (user) < native (user) < legacy (project) < native (project)
    const agentMap = new Map<string, AgentConfig>()

    // Add in priority order (later entries override earlier ones)
    for (const agent of builtinAgents) {
      agentMap.set(agent.agentType, agent)
    }
    for (const agent of pluginAgents) {
      agentMap.set(agent.agentType, agent)
    }
    for (const agent of userLegacyAgents) {
      agentMap.set(agent.agentType, agent)
    }
    for (const agent of userKodeAgents) {
      agentMap.set(agent.agentType, agent)
    }
    for (const agent of projectLegacyAgents) {
      agentMap.set(agent.agentType, agent)
    }
    for (const agent of projectKodeAgents) {
      agentMap.set(agent.agentType, agent)
    }

    const activeAgents = Array.from(agentMap.values())
    const allAgents = [
      ...builtinAgents,
      ...pluginAgents,
      ...userLegacyAgents,
      ...userKodeAgents,
      ...projectLegacyAgents,
      ...projectKodeAgents,
    ]

    return { activeAgents, allAgents }
  } catch (error) {
    console.error('Failed to load agents, falling back to built-in:', error)
    return {
      activeAgents: [BUILTIN_GENERAL_PURPOSE],
      allAgents: [BUILTIN_GENERAL_PURPOSE],
    }
  }
}

// Memoized version for performance
export const getActiveAgents = memoize(async (): Promise<AgentConfig[]> => {
  const { activeAgents } = await loadAllAgents()
  return activeAgents
})

// Get all agents (both active and overridden)
export const getAllAgents = memoize(async (): Promise<AgentConfig[]> => {
  const { allAgents } = await loadAllAgents()
  return allAgents
})

// Clear cache when needed
export function clearAgentCache() {
  getActiveAgents.cache?.clear?.()
  getAllAgents.cache?.clear?.()
  getAgentByType.cache?.clear?.()
  getAvailableAgentTypes.cache?.clear?.()
}

// Get a specific agent by type
export const getAgentByType = memoize(
  async (agentType: string): Promise<AgentConfig | undefined> => {
    const agents = await getActiveAgents()
    return agents.find(agent => agent.agentType === agentType)
  },
)

// Get all available agent types for validation
export const getAvailableAgentTypes = memoize(async (): Promise<string[]> => {
  const agents = await getActiveAgents()
  return agents.map(agent => agent.agentType)
})

// File watcher for hot reload
let watchers: FSWatcher[] = []

/**
 * Start watching agent configuration directories for changes
 */
export async function startAgentWatcher(onChange?: () => void): Promise<void> {
  await stopAgentWatcher() // Clean up any existing watchers

  // Watch both legacy and native directories
  const userLegacyDir = join(homedir(), '.claude', 'agents')
  const userKodeDir = join(homedir(), '.kode', 'agents')
  const projectLegacyDir = join(getCwd(), '.claude', 'agents')
  const projectKodeDir = join(getCwd(), '.kode', 'agents')

  const watchDirectory = (dirPath: string, label: string) => {
    if (existsSync(dirPath)) {
      const watcher = watch(
        dirPath,
        { recursive: false },
        async (eventType, filename) => {
          if (filename && filename.endsWith('.md')) {
            console.log(
              `🔄 Agent configuration changed in ${label}: ${filename}`,
            )
            clearAgentCache()
            // Also clear any other related caches
            getAllAgents.cache?.clear?.()
            onChange?.()
          }
        },
      )
      watchers.push(watcher)
    }
  }

  // Watch all directories
  watchDirectory(userLegacyDir, 'user/legacy')
  watchDirectory(userKodeDir, 'user/.kode')
  watchDirectory(projectLegacyDir, 'project/legacy')
  watchDirectory(projectKodeDir, 'project/.kode')
}

/**
 * Stop watching agent configuration directories
 */
export async function stopAgentWatcher(): Promise<void> {
  // FSWatcher.close() is synchronous and does not accept a callback on Node 18/20
  try {
    for (const watcher of watchers) {
      try {
        watcher.close()
      } catch (err) {
        console.error('Failed to close file watcher:', err)
      }
    }
  } finally {
    watchers = []
  }
}
