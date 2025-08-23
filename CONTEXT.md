# Kode Subagent Implementation - Project Context

## Project Overview

### Mission
Implement a complete subagent system for Kode that achieves **100% alignment** with Claude Code's Task tool functionality, enabling dynamic agent configuration loading from markdown files with YAML frontmatter.

### Core Architecture
Based on Claude Code's three-layer parallel architecture:
1. **User Interaction Layer** - REPL interface and commands
2. **Task Tool Layer** - Dynamic agent orchestration 
3. **Tool Layer** - Individual tools (FileRead, Bash, etc.)

## Implementation Summary

### Key Components Implemented

#### 1. Dynamic Agent Loader (`src/utils/agentLoader.ts`)
- **Purpose**: Load agent configurations from markdown files with YAML frontmatter
- **Five-tier Priority System**: Built-in < ~/.claude < ~/.kode < ./.claude < ./.kode
- **Features**:
  - Memoized loading for performance
  - Hot reload with file system watching
  - Tool permission filtering
  - Model override capabilities

#### 2. TaskTool Integration (`src/tools/TaskTool/TaskTool.tsx`)
- **Purpose**: Modified TaskTool to use dynamic agent configurations
- **Key Changes**:
  - Removed hardcoded `SUBAGENT_CONFIGS`
  - Added dynamic `subagent_type` parameter validation
  - Integrated with agent loader for real-time agent discovery
  - Support for async tool description generation

#### 3. Agent Management UI (`src/commands/agents.tsx`)
- **Purpose**: Interactive `/agents` command for agent CRUD operations
- **Features**:
  - List all available agents with location indicators
  - Create new agents with step-by-step wizard
  - View agent details and system prompts
  - Delete custom agents (preserves built-ins)
  - Support for saving to all 4 directory locations

#### 4. Claude Service Fix (`src/services/claude.ts`)
- **Critical Fix**: Modified tool description processing to support async functions
- **Problem**: `tool.description` was used directly instead of `await tool.description()`
- **Solution**: Added async handling with function type checking

### Agent Configuration Format

```markdown
---
name: agent-name
description: "When to use this agent description"
tools: ["ToolName1", "ToolName2"] # or "*" for all tools
model: model-name # optional
---

System prompt content here...
Multi-line prompts supported.
```

### Directory Structure & Priority

```
Priority Order (later overrides earlier):
1. Built-in (code-embedded)
2. ~/.claude/agents/ (Claude user)
3. ~/.kode/agents/ (Kode user) 
4. ./.claude/agents/ (Claude project)
5. ./.kode/agents/ (Kode project)
```

### Available Built-in Agents

```typescript
// User-level agents (in ~/.kode/agents/)
- general-purpose: Multi-step tasks, research, complex questions
- search-specialist: File/code pattern finding (tools: Grep, Glob, FileRead, LS)
- code-writer: Implementation, debugging (tools: FileRead, FileWrite, FileEdit, MultiEdit, Bash)
- reviewer: Code quality analysis (tools: FileRead, Grep, Glob)
- architect: System design decisions (tools: FileRead, FileWrite, Grep, Glob)

// Project-level agents (in ./.kode/agents/)
- test-writer: Test suite creation (tools: FileRead, FileWrite, FileEdit, Bash, Grep)
- docs-writer: Technical documentation (tools: FileRead, FileWrite, FileEdit, Grep, Glob)
```

## Critical Technical Details

### 1. Async Description Pattern
```typescript
// WRONG (old pattern)
const toolSchemas = tools.map(tool => ({
  description: tool.description, // Function reference
}))

// CORRECT (fixed pattern) 
const toolSchemas = await Promise.all(
  tools.map(async tool => ({
    description: typeof tool.description === 'function' 
      ? await tool.description() 
      : tool.description,
  }))
)
```

### 2. Agent Loading Flow
```typescript
1. scanAgentDirectory() -> Parse .md files with gray-matter
2. loadAllAgents() -> Parallel scanning of all 4 directories  
3. Priority override -> Map-based deduplication by agentType
4. Memoization -> LRU cache for performance
5. Hot reload -> FSWatcher on all directories
```

### 3. Tool Permission Filtering
```typescript
// In TaskTool.tsx
if (toolFilter && toolFilter !== '*') {
  if (Array.isArray(toolFilter)) {
    tools = tools.filter(tool => toolFilter.includes(tool.name))
  }
}
```

### 4. Model Override Logic
```typescript
// Priority: CLI model param > agent config > default
let effectiveModel = model || 'task' // CLI param
if (!model && agentConfig.model) {
  effectiveModel = agentConfig.model // Agent config
}
```

## Standard Operating Procedures

### SOP 1: Adding New Built-in Agent
1. Create `.md` file in appropriate directory
2. Use proper YAML frontmatter format
3. Test with `getActiveAgents()` function
4. Verify priority system works correctly
5. Update documentation if needed

### SOP 2: Debugging Agent Loading Issues
```bash
# 1. Test agent loader directly
bun -e "import {getActiveAgents} from './src/utils/agentLoader'; console.log(await getActiveAgents())"

# 2. Clear cache and reload
bun -e "import {clearAgentCache} from './src/utils/agentLoader'; clearAgentCache()"

# 3. Check TaskTool description generation  
bun -e "import {TaskTool} from './src/tools/TaskTool/TaskTool'; console.log(await TaskTool.description())"

# 4. Verify directory structure
ls -la ~/.claude/agents/ ~/.kode/agents/ ./.claude/agents/ ./.kode/agents/
```

### SOP 3: Testing Subagent System
```typescript
// Comprehensive test pattern
async function testSubagentSystem() {
  // 1. Clear cache
  clearAgentCache()
  
  // 2. Load agents
  const agents = await getActiveAgents()
  
  // 3. Verify count and types
  const types = await getAvailableAgentTypes()
  
  // 4. Test TaskTool integration
  const description = await TaskTool.description()
  
  // 5. Verify priority system
  const duplicates = findDuplicateAgentTypes(agents)
  
  return { agents, types, description, duplicates }
}
```

### SOP 4: Agent Management Best Practices
1. **Agent Naming**: Use kebab-case (`search-specialist`, not `SearchSpecialist`)
2. **Tool Selection**: Be specific about tool permissions for security
3. **Model Selection**: Only specify if different from default
4. **Description**: Clear, concise "when to use" guidance
5. **System Prompt**: Focus on capabilities and constraints

## Key Learnings & Insights

### 1. Claude Code Alignment Requirements
- **100% format compatibility**: YAML frontmatter + markdown body
- **Directory structure**: Support both `.claude` and `.kode` directories  
- **Priority system**: Complex 5-tier hierarchy with proper override logic
- **Hot reload**: Real-time configuration updates without restart
- **Tool permissions**: Security through capability restriction

### 2. Performance Considerations
- **Memoization**: Critical for avoiding repeated file I/O
- **Parallel loading**: All directories scanned concurrently
- **Caching strategy**: LRU cache with manual invalidation
- **File watching**: Efficient hot reload with minimal overhead

### 3. Error Handling Patterns
```typescript
// Graceful degradation pattern
try {
  const agents = await loadAllAgents()
  return { activeAgents: agents.activeAgents, allAgents: agents.allAgents }
} catch (error) {
  console.error('Failed to load agents, falling back to built-in:', error)
  return {
    activeAgents: [BUILTIN_GENERAL_PURPOSE],
    allAgents: [BUILTIN_GENERAL_PURPOSE]
  }
}
```

### 4. TypeScript Integration Points
```typescript
export interface AgentConfig {
  agentType: string          // Matches subagent_type parameter
  whenToUse: string          // User-facing description  
  tools: string[] | '*'      // Tool permission filtering
  systemPrompt: string       // Injected into task prompt
  location: 'built-in' | 'user' | 'project'
  color?: string            // Optional UI theming
  model?: string           // Optional model override
}
```

## Common Issues & Solutions

### Issue 1: "Agent type 'X' not found"
**Cause**: Agent not loaded or wrong agentType in frontmatter
**Solution**: 
1. Check file exists in expected directory
2. Verify `name:` field in YAML frontmatter  
3. Clear cache with `clearAgentCache()`
4. Check file permissions

### Issue 2: Tool description not showing subagent types
**Cause**: Async description function not being awaited
**Solution**: Ensure Claude service uses `await tool.description()` pattern

### Issue 3: Priority system not working
**Cause**: Map iteration order or incorrect directory scanning
**Solution**: Verify loading order matches priority specification

### Issue 4: Hot reload not triggering
**Cause**: File watcher not set up or wrong directory
**Solution**: Check `startAgentWatcher()` covers all 4 directories

## Future Enhancement Opportunities

### 1. Advanced Agent Features
- **Agent inheritance**: Base agents with specialized variants  
- **Conditional logic**: Dynamic tool selection based on context
- **Agent composition**: Chaining agents for complex workflows
- **Performance metrics**: Track agent usage and effectiveness

### 2. UI/UX Improvements  
- **Visual agent editor**: Rich text editing for system prompts
- **Agent marketplace**: Share and discover community agents
- **Configuration validation**: Real-time feedback on agent configs
- **Usage analytics**: Show which agents are most effective

### 3. Integration Enhancements
- **IDE integration**: VS Code extension for agent management
- **API endpoints**: REST API for external agent management
- **Version control**: Git integration for agent configuration history
- **Cloud sync**: Cross-device agent synchronization

## Testing & Validation

### Test Coverage Areas
1. **Agent Loading**: All directory combinations and priority scenarios
2. **Tool Filtering**: Security boundary enforcement  
3. **Model Override**: CLI param vs agent config vs default
4. **Hot Reload**: File change detection and cache invalidation
5. **Error Handling**: Graceful degradation and recovery
6. **TaskTool Integration**: Dynamic description generation
7. **UI Components**: Agent management command workflows

### Validation Checklist
- [ ] All 5 priority levels load correctly
- [ ] Duplicate agent names resolve to highest priority
- [ ] Tool permissions filter correctly  
- [ ] Model overrides work in correct precedence
- [ ] Hot reload detects changes in all directories
- [ ] TaskTool description includes all available agents
- [ ] `/agents` command CRUD operations work
- [ ] Error states handled gracefully
- [ ] TypeScript types are correct and complete
- [ ] Documentation is accurate and comprehensive

## Project Metrics & Success Criteria

### Quantitative Metrics
- **Agent Load Performance**: < 100ms for typical configurations
- **Hot Reload Latency**: < 500ms from file change to cache update  
- **Memory Usage**: < 50MB additional overhead for agent system
- **Test Coverage**: > 90% for core agent functionality
- **TypeScript Compliance**: 0 type errors in agent-related code

### Qualitative Success Criteria
- **100% Claude Code compatibility**: All agent formats work identically
- **Seamless user experience**: No learning curve for existing Claude Code users
- **Robust error handling**: System degrades gracefully under all failure modes
- **Maintainable architecture**: Code is clean, documented, and extensible
- **Performance excellence**: No noticeable impact on Kode startup or operation

---

*This document serves as the single source of truth for the Kode subagent implementation project. All team members should refer to this context when working on agent-related features or debugging issues.*