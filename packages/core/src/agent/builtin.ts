import type { AgentConfig } from './types'

export const BUILTIN_GENERAL_PURPOSE: AgentConfig = {
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
  source: 'built-in',
  location: 'built-in',
  baseDir: 'built-in',
}

export const BUILTIN_EXPLORE: AgentConfig = {
  agentType: 'Explore',
  whenToUse:
    'Fast agent specialized for exploring codebases. Use this when you need to quickly find files by patterns (eg. "src/components/**/*.tsx"), search code for keywords (eg. "API endpoints"), or answer questions about the codebase (eg. "how do API endpoints work?"). When calling this agent, specify the desired thoroughness level: "quick" for basic searches, "medium" for moderate exploration, or "very thorough" for comprehensive analysis across multiple locations and naming conventions.',
  tools: '*',
  disallowedTools: ['Task', 'ExitPlanMode', 'Edit', 'Write', 'NotebookEdit'],
  systemPrompt:
    'You are an agent specialized for exploring codebases quickly and efficiently. Focus on fast, targeted searches and high-signal summaries.',
  source: 'built-in',
  location: 'built-in',
  baseDir: 'built-in',
}

export const BUILTIN_PLAN: AgentConfig = {
  agentType: 'Plan',
  whenToUse:
    'Agent specialized for producing high quality plans before execution.',
  tools: '*',
  disallowedTools: ['Task', 'ExitPlanMode', 'Edit', 'Write', 'NotebookEdit'],
  systemPrompt:
    'You are an agent specialized for planning. Produce a clear, actionable step-by-step plan, then stop.',
  source: 'built-in',
  location: 'built-in',
  baseDir: 'built-in',
}

export const BUILTIN_STATUSLINE_SETUP: AgentConfig = {
  agentType: 'StatuslineSetup',
  whenToUse: 'Agent specialized for configuring the CLI status line command.',
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
  source: 'built-in',
  location: 'built-in',
  baseDir: 'built-in',
}

export const BUILTIN_AGENTS: AgentConfig[] = [
  BUILTIN_GENERAL_PURPOSE,
  BUILTIN_STATUSLINE_SETUP,
  BUILTIN_EXPLORE,
  BUILTIN_PLAN,
]
