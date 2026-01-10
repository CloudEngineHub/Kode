import type { JsonRpcPeer } from '../jsonrpc'
import type * as Protocol from '../protocol'

import type { SessionState } from './types'

export function sendAvailableCommands(
  peer: JsonRpcPeer,
  session: SessionState,
): void {
  const availableCommands: Protocol.AvailableCommand[] = session.commands
    .filter(c => !c.isHidden)
    .map(c => ({
      name: c.userFacingName(),
      description: c.description,
      ...(c.argumentHint ? { input: { hint: c.argumentHint } } : {}),
    }))

  peer.sendNotification('session/update', {
    sessionId: session.sessionId,
    update: {
      sessionUpdate: 'available_commands_update',
      availableCommands,
    } satisfies Protocol.AvailableCommandsUpdate,
  } satisfies Protocol.SessionUpdateNotification)
}

export function sendCurrentMode(
  peer: JsonRpcPeer,
  session: SessionState,
): void {
  peer.sendNotification('session/update', {
    sessionId: session.sessionId,
    update: {
      sessionUpdate: 'current_mode_update',
      currentModeId: session.currentModeId,
    } satisfies Protocol.CurrentModeUpdate,
  } satisfies Protocol.SessionUpdateNotification)
}

export function sendUserMessageChunk(
  peer: JsonRpcPeer,
  sessionId: string,
  text: string,
): void {
  if (!text) return
  peer.sendNotification('session/update', {
    sessionId,
    update: {
      sessionUpdate: 'user_message_chunk',
      content: { type: 'text', text },
    } satisfies Protocol.UserMessageChunk,
  } satisfies Protocol.SessionUpdateNotification)
}

export function sendAgentMessageChunk(
  peer: JsonRpcPeer,
  sessionId: string,
  text: string,
): void {
  if (!text) return
  peer.sendNotification('session/update', {
    sessionId,
    update: {
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text },
    } satisfies Protocol.AgentMessageChunk,
  } satisfies Protocol.SessionUpdateNotification)
}

export function sendAgentThoughtChunk(
  peer: JsonRpcPeer,
  sessionId: string,
  text: string,
): void {
  if (!text) return
  peer.sendNotification('session/update', {
    sessionId,
    update: {
      sessionUpdate: 'agent_thought_chunk',
      content: { type: 'text', text },
    } satisfies Protocol.AgentThoughtChunk,
  } satisfies Protocol.SessionUpdateNotification)
}

export function sendToolCall(
  peer: JsonRpcPeer,
  sessionId: string,
  toolCall: Protocol.ToolCall,
): void {
  peer.sendNotification('session/update', {
    sessionId,
    update: toolCall,
  } satisfies Protocol.SessionUpdateNotification)
}

export function sendToolCallUpdate(
  peer: JsonRpcPeer,
  sessionId: string,
  update: Omit<Protocol.ToolCallUpdate, 'sessionUpdate'>,
): void {
  peer.sendNotification('session/update', {
    sessionId,
    update: {
      sessionUpdate: 'tool_call_update',
      ...update,
    } satisfies Protocol.ToolCallUpdate,
  } satisfies Protocol.SessionUpdateNotification)
}
