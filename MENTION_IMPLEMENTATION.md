# @mention Implementation with System Reminder Integration

## Overview

Successfully implemented @agent and @file mentions as system reminder attachments, following the event-driven architecture philosophy of the existing system.

## Key Design Principles

1. **Event-Driven Architecture**: Mentions trigger events that are handled by the system reminder service
2. **Non-Invasive Integration**: Code fits naturally into existing patterns without disrupting core flows
3. **Separation of Concerns**: Mention detection, event emission, and reminder generation are cleanly separated
4. **Performance Optimized**: Agent list caching prevents repeated filesystem access

## Implementation Details

### 1. Mention Detection (`/src/services/mentionProcessor.ts`)

```typescript
// Separate patterns for different mention types
private agentPattern = /@(agent-[\w\-]+)/g
private filePattern = /@([a-zA-Z0-9/._-]+(?:\.[a-zA-Z0-9]+)?)/g
```

- Detects @agent-xxx patterns (e.g., @agent-simplicity-auditor)
- Detects @file patterns (e.g., @src/query.ts, @package.json)
- Emits events when mentions are found
- Uses cached agent list for performance

### 2. System Reminder Integration (`/src/services/systemReminder.ts`)

#### Agent Mentions
```typescript
// Creates reminder instructing to use Task tool
`The user mentioned @agent-${agentType}. You MUST use the Task tool with subagent_type="${agentType}" to delegate this task to the specified agent.`
```

#### File Mentions
```typescript
// Creates reminder instructing to read file
`The user mentioned @${context.originalMention}. You MUST read the entire content of the file at path: ${filePath} using the Read tool.`
```

### 3. Message Processing (`/src/utils/messages.tsx`)

```typescript
// Process mentions for system reminder integration
if (input.includes('@')) {
  const { processMentions } = await import('../services/mentionProcessor')
  await processMentions(input)
}
```

- No longer calls `resolveFileReferences` for user messages
- @mentions trigger reminders instead of embedding content

### 4. Custom Commands (`/src/services/customCommands.ts`)

- `resolveFileReferences` still available for custom commands
- Skips @agent mentions to avoid conflicts
- Maintains backward compatibility for command files

## Behavior Changes

### Before
- @file would embed file content directly into the message
- @agent-xxx would show "(file not found: agent-xxx)"
- No system guidance for handling mentions

### After
- @file triggers a system reminder to read the file using Read tool
- @agent-xxx triggers a system reminder to use Task tool with the specified agent
- Clean separation between user intent and system instructions
- LLM receives clear guidance on how to handle mentions

## Event Flow

```
User Input with @mention
    ↓
processUserInput() in messages.tsx
    ↓
processMentions() in mentionProcessor.ts
    ↓
Emit 'agent:mentioned' or 'file:mentioned' event
    ↓
System Reminder event listener
    ↓
Create and cache reminder
    ↓
getMentionReminders() during query generation
    ↓
Reminder injected into user message
    ↓
LLM receives instruction as system reminder
```

## Testing

To test the implementation:

1. **Agent mention**: Type "@agent-simplicity-auditor analyze this code"
   - Should trigger Task tool with subagent_type="simplicity-auditor"

2. **File mention**: Type "Review @src/query.ts for issues"
   - Should trigger Read tool to read src/query.ts

3. **Mixed mentions**: Type "@agent-test-writer create tests for @src/utils/messages.tsx"
   - Should trigger both Task and Read tools

## Benefits

1. **Natural User Experience**: Users can mention agents and files naturally
2. **Clear System Guidance**: LLM receives explicit instructions via reminders
3. **Maintains Architecture**: Follows existing event-driven patterns
4. **No Breaking Changes**: Agent execution loop remains intact
5. **Performance**: Caching prevents repeated agent list lookups
6. **Extensible**: Easy to add new mention types in the future

## Future Enhancements

1. Support for @workspace mentions
2. Support for @url mentions for web content
3. Configurable mention behavior per context
4. Batch mention processing for efficiency