# Test @mention Integration

This file tests the integration of @mention functionality with the system reminder infrastructure.

## Test Cases

1. **Agent mentions**: Test @agent-simplicity-auditor or @simplicity-auditor
2. **File mentions**: Test @src/query.ts or @package.json
3. **Mixed mentions**: Use both in same message

## Expected Behavior

When a user mentions @agent-xxx or @file:
1. The mention processor detects it
2. Emits an event to system reminder service  
3. System reminder creates a reminder
4. Reminder gets injected into the next LLM query
5. LLM receives context about the mention

## Implementation Summary

The implementation follows an event-driven architecture:

```
User Input → processMentions() → emitReminderEvent() → systemReminder listeners
                                                          ↓
                                                     Cache reminder
                                                          ↓
                                              getMentionReminders() during query
```

The key files modified:
- `/src/services/mentionProcessor.ts` - New service for mention detection
- `/src/services/systemReminder.ts` - Added event listeners and getMentionReminders()
- `/src/utils/messages.tsx` - Integrated processMentions() call

This approach is minimally disruptive and follows the existing philosophy of the system reminder infrastructure.