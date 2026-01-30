export const DESCRIPTION = 'Update a task in the task list.'

export const PROMPT = `Use this tool to update a task’s status or details.

Guidelines:
- Only mark a task as completed when it is fully done (tests pass, no blockers).
- If you get blocked, keep the task in_progress and create a new task describing what to unblock.
- Use status progression: pending → in_progress → completed.
- Set status to "deleted" to permanently remove a task.`
