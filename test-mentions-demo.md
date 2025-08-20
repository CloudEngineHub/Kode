# @mention Feature Demo & Test Cases

## How to Test the Implementation

### Test 1: Agent Mention
```bash
# In the CLI, type:
"Please review my code architecture with @agent-simplicity-auditor"

# Expected behavior:
# 1. System reminder injected: "You MUST use the Task tool with subagent_type='simplicity-auditor'..."
# 2. LLM will call Task tool with the simplicity-auditor agent
# 3. Agent will execute the review task
```

### Test 2: File Mention
```bash
# In the CLI, type:
"Explain the query flow in @src/query.ts"

# Expected behavior:
# 1. System reminder injected: "You MUST read the entire content of the file at path: src/query.ts..."
# 2. LLM will call Read tool to read src/query.ts
# 3. LLM will then explain the query flow based on file content
```

### Test 3: Multiple Mentions
```bash
# In the CLI, type:
"Have @agent-test-writer create tests for @src/utils/messages.tsx"

# Expected behavior:
# 1. Two system reminders injected
# 2. LLM will first read src/utils/messages.tsx
# 3. LLM will then use Task tool with test-writer agent
# 4. Test writer agent will create tests for the file
```

### Test 4: Invalid Mentions (Should be Ignored)
```bash
# In the CLI, type:
"Use @agent-nonexistent to analyze @fake-file.txt"

# Expected behavior:
# 1. No system reminders generated (invalid agent and non-existent file)
# 2. LLM sees the original text but no special instructions
# 3. LLM will likely respond that it cannot find these resources
```

## Internal Flow Trace

When you type: `"Review @src/query.ts"`

1. **messages.tsx:373**: `processMentions("Review @src/query.ts")` called
2. **mentionProcessor.ts:91**: File exists check for `src/query.ts` ✓
3. **mentionProcessor.ts:101**: Event emitted: `'file:mentioned'`
4. **systemReminder.ts:404**: Event listener triggered
5. **systemReminder.ts:412**: Reminder created with text:
   ```
   The user mentioned @src/query.ts. You MUST read the entire content 
   of the file at path: /full/path/src/query.ts using the Read tool...
   ```
6. **systemReminder.ts:420**: Reminder cached with key `file_mention_/full/path/src/query.ts_[timestamp]`
7. **query.ts:185**: `formatSystemPromptWithContext` called
8. **claude.ts:1155**: `generateSystemReminders` called
9. **systemReminder.ts:85**: `getMentionReminders()` called
10. **systemReminder.ts:243**: Reminder retrieved (within 5-second window)
11. **query.ts:206**: Reminder injected into user message
12. **LLM receives**: Original text + system reminder instruction
13. **LLM response**: Calls Read tool to read the file

## Debugging

To verify the system is working:

1. **Check if mentions are detected**:
   - Add a console.log in `mentionProcessor.ts` line 74 and 103

2. **Check if events are emitted**:
   - Add a console.log in `systemReminder.ts` line 388 and 409

3. **Check if reminders are generated**:
   - Add a console.log in `systemReminder.ts` line 245

4. **Check if reminders are injected**:
   - Add a console.log in `query.ts` line 206

## Configuration

The system has these configurable parameters:

- **Cache TTL**: 60 seconds (agent list cache in mentionProcessor.ts:34)
- **Freshness Window**: 5 seconds (mention reminders in systemReminder.ts:236)
- **Reminder Priority**: 'high' for both agent and file mentions
- **Max Reminders**: 5 per session (systemReminder.ts:89)

## Benefits

1. **Natural syntax**: Users can mention agents and files naturally
2. **Clear instructions**: LLM receives explicit guidance
3. **No content embedding**: Files are read on-demand, not embedded
4. **Smart validation**: Only valid agents and existing files trigger actions
5. **Event-driven**: Clean architecture with proper separation of concerns