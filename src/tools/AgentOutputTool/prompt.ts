export const TOOL_NAME_FOR_PROMPT = 'AgentOutputTool'

export const DESCRIPTION = 'Retrieves output from a completed async agent task'

export const PROMPT = `- Retrieves output from a completed async agent task by agentId
- Provide a single agentId
- If you want to check on the agent's progress call AgentOutputTool with block=false to get an immediate update on the agent's status
- If you run out of things to do and the agent is still running - call AgentOutputTool with block=true to idle and wait for the agent's result (do not use block=true unless you completely run out of things to do as it will waste time)`
