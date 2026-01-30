export const DESCRIPTION = 'Create a new task in the task list.'

export const PROMPT = `Use this tool to create a new task in the task list.

Guidelines:
- Use a short **subject** in imperative form (e.g., "Run tests", "Fix login bug").
- Put detailed requirements and context in **description**.
- **Always provide activeForm**: present continuous shown while a task is in_progress (e.g., subject: "Run tests" → activeForm: "Running tests").
- All tasks are created with status \`pending\`.
- Prefer a small number of specific tasks over one vague task.`
