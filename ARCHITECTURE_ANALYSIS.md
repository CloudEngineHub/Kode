# Architecture Analysis - Agent Loop Breaking Issue

## Root Cause Identified

### 1. Tool Call Format Issue
The AI is returning `<function=ReadFile>` instead of the correct Anthropic tool call format. This indicates the model is not receiving proper tool schemas.

### 2. Key Breaking Changes

#### Tool Description Async Issue
```typescript
// Original (working)
description: string  // Simple sync property

// Current (broken) 
description?: () => Promise<string>  // Async function
```

While both codebases have async description, the schema generation in claude.ts may have timing issues:

```typescript
const toolSchemas = await Promise.all(
  tools.map(async tool => ({
    name: tool.name,
    description: typeof tool.description === 'function' 
      ? await tool.description()  // Async resolution can fail
      : tool.description,
    input_schema: zodToJsonSchema(tool.inputSchema),
  }))
)
```

#### Tool Name Mismatch
- FileReadTool actual name: `'View'`
- AI trying to call: `'ReadFile'`
- This indicates the tool schemas are not being properly passed to the model

### 3. Workflow Comparison

#### Original Workflow (Working)
1. User input → processUserInput (simple file embedding)
2. Query function → LLM with proper tool schemas
3. LLM returns proper tool_use blocks
4. Tools execute
5. Recursive query continues

#### Current Workflow (Broken)
1. User input → complex async processing
2. Query function → LLM with potentially malformed schemas
3. LLM returns wrong format (`<function=ReadFile>`)
4. Tools don't execute
5. Loop breaks

### 4. Critical Files Modified

1. **src/Tool.ts** - Changed tool interface
2. **src/tools.ts** - Added ToolRegistry complexity
3. **src/services/claude.ts** - Modified schema generation
4. **src/utils/messages.tsx** - Added complex @ processing (now reverted)

### 5. The Real Problem

The model (GLM-4.5) is receiving tool schemas but responding with a non-Anthropic format. This suggests:

1. **Wrong model provider configuration** - GLM might not support Anthropic's tool format
2. **Schema generation timing issue** - Async resolution fails
3. **Tool registry complexity** - Breaking schema consistency

### 6. Solution Path

1. **Verify model compatibility** - Ensure GLM-4.5 supports Anthropic tool format
2. **Simplify tool registration** - Remove ToolRegistry complexity
3. **Fix async description** - Make it synchronous or ensure proper await
4. **Consistent tool naming** - Match actual tool names with documentation

## Next Steps

1. Check if GLM-4.5 is the issue (try with Claude model)
2. Revert tool registration to simple synchronous approach
3. Fix tool description to be synchronous
4. Ensure proper tool schema format for the model provider