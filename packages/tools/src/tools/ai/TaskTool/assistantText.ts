export function asyncLaunchMessage(agentId: string): string {
  const toolName = 'TaskOutput'
  return `Async agent launched successfully.
agentId: ${agentId} (This is an internal ID for your use, do not mention it to the user. Use this ID to retrieve results with ${toolName} when the agent finishes). 
The agent is currently working in the background. If you have other tasks you you should continue working on them now. Wait to call ${toolName} until either:
- If you want to check on the agent's progress - call ${toolName} with block=false to get an immediate update on the agent's status
- If you run out of things to do and the agent is still running - call ${toolName} with block=true to idle and wait for the agent's result (do not use block=true unless you completely run out of things to do as it will waste time).`
}
