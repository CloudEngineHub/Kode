# Autocomplete System Test Guide

## Testing Tab Completion Priority

The system now has three autocomplete systems that work together without conflicts:

### 1. Slash Command Autocomplete
- **Trigger**: Type `/` followed by command name
- **Complete**: Tab or Enter
- **Example**: `/help`, `/model`, `/agents`

### 2. Agent Mention Autocomplete  
- **Trigger**: Type `@` followed by agent name
- **Complete**: Tab only (Enter submits message)
- **Example**: `@agent-code-writer`, `@dao-qi-harmony-designer`

### 3. Path Autocomplete
- **Trigger**: Type a path-like string (contains `/`, starts with `.` or `~`, or has file extension)
- **Complete**: Tab
- **Example**: `./src/`, `~/Desktop/`, `package.json`

### 4. Model Switching (Fallback)
- **Trigger**: Tab key when no autocomplete is active
- **Action**: Switches to next available model

## Tab Key Priority Order

1. **Slash command suggestions** (if `/command` is being typed)
2. **Agent mention suggestions** (if `@agent` is being typed)  
3. **Path autocomplete** (if path-like string is detected)
4. **Model switching** (if no autocomplete is active)

## Test Cases

### Test 1: Slash Command
1. Type `/he`
2. Press Tab → Should complete to `/help `
3. Press Enter → Should execute help command

### Test 2: Agent Mention
1. Type `@code`
2. Press Tab → Should complete to `@agent-code-writer `
3. Type additional message
4. Press Enter → Should submit with agent mention

### Test 3: Path Completion
1. Type `./src/`
2. Press Tab → Should show files in src directory
3. Select with arrow keys
4. Press Tab → Should complete the path

### Test 4: Model Switching
1. Clear input
2. Press Tab → Should switch model
3. Verify model changed in status display

### Test 5: Mixed Usage
1. Type `Check @agent-code-writer for ./package.json`
2. Tab should complete mentions and paths appropriately
3. When no autocomplete context, Tab switches model

## Expected Behavior

- **No conflicts**: Each autocomplete system activates only in its specific context
- **Tab handling**: Properly prioritized based on active context
- **Enter handling**: Only submits for slash commands with no args; otherwise just completes
- **Model switching**: Only works when no autocomplete is active