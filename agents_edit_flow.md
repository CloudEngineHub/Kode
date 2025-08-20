╭────────────────────────────────────────────────────────────────────────╮
│ Agents                                                                 │
│ 6 agents                                                               │
│                                                                        │
│ Created agent: bug-finder                                              │
│                                                                        │
│   Create new agent                                                     │
│                                                                        │
│   Personal agents (/Users/baicai/.claude/agents)                       │
│   general-purpose · sonnet                                             │
│   claude-tester · sonnet                                               │
│                                                                        │
│   Project agents (.claude/agents)                                      │
│   bug-finder · opus                                                    │
│ ❯ code-reviewer · opus                                                 │
│                                                                        │
│   Built-in agents (always available)                                   │
│   general-purpose · sonnet ⚠ overridden by user                        │
│   statusline-setup · sonnet                                            │
│   output-mode-setup · sonnet                                           │
│                                                                        │
╰────────────────────────────────────────────────────────────────────────╯
   Press ↑↓ to navigate · Enter to select · Esc to go back


╭────────────────────────────────────────────────────────────────────────╮
│ code-reviewer                                                          │
│                                                                        │
│ ❯ 1. View agent                                                        │
│   2. Edit agent                                                        │
│   3. Delete agent                                                      │
│   4. Back                                                              │
│                                                                        │
│ Created agent: bug-finder                                              │
╰────────────────────────────────────────────────────────────────────────╯
   Press ↑↓ to navigate · Enter to select · Esc to go back

view agent:
╭────────────────────────────────────────────────────────────────────────╮
│ code-reviewer                                                          │
│ .claude/agents/code-reviewer.md                                        │
│                                                                        │
│ Description (tells Claude when to use this agent):                     │
│   Use this agent when you need comprehensive code review and analysis. │
│    Examples: <example>Context: The user has just written a new         │
│   function and wants it reviewed before committing. user: 'I just      │
│   wrote this authentication function, can you review it?' assistant:   │
│   'I'll use the code-reviewer agent to provide a thorough analysis of  │
│   your authentication function.' <commentary>Since the user is         │
│   requesting code review, use the Task tool to launch the              │
│   code-reviewer agent to analyze the code for quality, security, and   │
│   best practices.</commentary></example> <example>Context: The user    │
│   has completed a feature implementation and wants feedback. user:     │
│   'Here's my implementation of the user registration system'           │
│   assistant: 'Let me use the code-reviewer agent to examine your user  │
│   registration implementation.' <commentary>The user is presenting     │
│   completed code for review, so use the code-reviewer agent to provide │
│    detailed feedback on the implementation.</commentary></example>     │
│                                                                        │
│ Tools: Bash, Glob, Grep, LS, Read, WebFetch, TodoWrite, WebSearch,     │
│        BashOutput, KillBash                                            │
│                                                                        │
│ Model: Opus                                                            │
│                                                                        │
│ Color:  code-reviewer                                                  │
│                                                                        │
│ System prompt:                                                         │
│                                                                        │
│   You are a Senior Code Review Expert with over 15 years of            │
│   experience in software engineering across multiple programming       │
│   languages and paradigms. You specialize in identifying code          │
│   quality issues, security vulnerabilities, performance bottlenecks,   │
│    and architectural improvements.                                     │
│                                                                        │
│   When reviewing code, you will:                                       │
│                                                                        │
│   Analysis Framework:                                                  │
│   1. Code Quality Assessment: Evaluate readability, maintainability,   │
│    and adherence to coding standards. Check for proper naming          │
│   conventions, code organization, and documentation quality.           │
│   2. Logic and Correctness: Verify the code logic is sound, handles    │
│   edge cases appropriately, and implements the intended                │
│   functionality correctly.                                             │
│   3. Security Analysis: Identify potential security vulnerabilities,   │
│    input validation issues, authentication/authorization flaws, and    │
│   data exposure risks.                                                 │
│   4. Performance Evaluation: Assess algorithmic efficiency, resource   │
│    usage, potential memory leaks, and scalability concerns.            │
│   5. Best Practices Compliance: Ensure adherence to                    │
│   language-specific idioms, design patterns, and industry standards.   │
│   6. Testing Considerations: Evaluate testability and suggest areas    │
│   that need test coverage.                                             │
│                                                                        │
│   Review Process:                                                      │
│   - Begin with an overall assessment of the code's purpose and         │
│   approach                                                             │
│   - Provide specific, actionable feedback with line-by-line comments   │
│    when necessary                                                      │
│   - Categorize issues by severity: Critical (security/correctness),    │
│   Important (performance/maintainability), Minor                       │
│   (style/optimization)                                                 │
│   - Suggest concrete improvements with code examples when helpful      │
│   - Highlight positive aspects and good practices observed             │
│   - Consider the broader codebase context and architectural            │
│   implications                                                         │
│                                                                        │
│   Output Format:                                                       │
│   - Start with a brief summary of overall code quality                 │
│   - List findings organized by category and severity                   │
│   - Provide specific recommendations for each issue                    │
│   - End with a prioritized action plan for improvements                │
│                                                                        │
│   Quality Standards:                                                   │
│   - Be thorough but focus on the most impactful issues first           │
│   - Provide constructive, educational feedback that helps developers   │
│    improve                                                             │
│   - Balance criticism with recognition of good practices               │
│   - Ensure all suggestions are practical and implementable             │
│   - Ask clarifying questions if the code's intent or context is        │
│   unclear                                                              │
│                                                                        │
│   You must follow these coding guidelines: use English only in code    │
│   and comments, avoid emojis, write clean and clear comments, and      │
│   focus on elegant solutions that minimize code changes.               │
╰────────────────────────────────────────────────────────────────────────╯
   Press Enter or Esc to go back

edit agent:
╭────────────────────────────────────────────────────────────────────────╮
│ code-reviewer                                                          │
│                                                                        │
│   1. View agent                                                        │
│ ❯ 2. Edit agent                                                        │
│   3. Delete agent                                                      │
│   4. Back                                                              │
│                                                                        │
│ Created agent: bug-finder                                              │
╰────────────────────────────────────────────────────────────────────────╯
   Press ↑↓ to navigate · Enter to select · Esc to go back

│ Edit agent: code-reviewer                                              │
│ Location: project                                                      │
│                                                                        │
│ ❯ Open in editor                                                       │
│   Edit tools                                                           │
│   Edit model                                                           │
│   Edit color                                                           │
╰────────────────────────────────────────────────────────────────────────╯
   Press ↑↓ to navigate · Enter to select · Esc to go back

Open in editor就是弹出系统的编辑器打开这个文件，然后就可以在里面编辑了。

 Edit tools ：

╭────────────────────────────────────────────────────────────────────────╮
│ Edit agent: code-reviewer                                              │
│                                                                        │
│ ❯ [ Continue ]                                                         │
│ ────────────────────────────────────────                               │
│   ☐ All tools                                                          │
│   ☒ Read-only tools                                                    │
│   ☐ Edit tools                                                         │
│   ☒ Execution tools                                                    │
│ ────────────────────────────────────────                               │
│   [ Show advanced options ]                                            │
│                                                                        │
│ 10 of 14 tools selected                                                │
╰────────────────────────────────────────────────────────────────────────╯
   Press ↑↓ to navigate · Enter to select · Esc to go back

╭────────────────────────────────────────────────────────────────────────╮
│ Edit agent: code-reviewer                                              │
│                                                                        │
│   [ Continue ]                                                         │
│ ────────────────────────────────────────                               │
│   ☐ All tools                                                          │
│   ☒ Read-only tools                                                    │
│   ☐ Edit tools                                                         │
│   ☒ Execution tools                                                    │
│ ────────────────────────────────────────                               │
│ ❯ [ Hide advanced options ]                                            │
│   ☒ Bash                                                               │
│   ☒ Glob                                                               │
│   ☒ Grep                                                               │
│   ☒ LS                                                                 │
│   ☒ Read                                                               │
│   ☐ Edit                                                               │
│   ☐ MultiEdit                                                          │
│   ☐ Write                                                              │
│   ☐ NotebookEdit                                                       │
│   ☒ WebFetch                                                           │
│   ☒ TodoWrite                                                          │
│   ☒ WebSearch                                                          │
│   ☒ BashOutput                                                         │
│   ☒ KillBash                                                           │
│                                                                        │
│ 10 of 14 tools selected                                                │
╰────────────────────────────────────────────────────────────────────────╯
   Press ↑↓ to navigate · Enter to select · Esc to go back

Edit model：
╭────────────────────────────────────────────────────────────────────────╮
│ Edit agent: code-reviewer                                              │
│ Model determines the agent's reasoning capabilities and speed.         │
│                                                                        │
│ ❯ 1. Sonnet               Balanced performance - best for most agents  │
│   2. Opus                 Most capable for complex reasoning tasks✔    │
│   3. Haiku                Fast and efficient for simple tasks          │
│   4. Inherit from parent  Use the same model as the main conversation  │
╰────────────────────────────────────────────────────────────────────────╯
   Press ↑↓ to navigate · Enter to select · Esc to go back

Edit color：

╭────────────────────────────────────────────────────────────────────────╮
│ Edit agent: code-reviewer                                              │
│ Choose background color                                                │
│                                                                        │
│   Automatic color                                                      │
│     Red                                                                │
│     Blue                                                               │
│ ❯   Green                                                              │
│     Yellow                                                             │
│     Purple                                                             │
│     Orange                                                             │
│     Pink                                                               │
│     Cyan                                                               │
│                                                                        │
│                                                                        │
│ Preview:  code-reviewer                                                │
╰────────────────────────────────────────────────────────────────────────╯
   Press ↑↓ to navigate · Enter to select · Esc to go back


