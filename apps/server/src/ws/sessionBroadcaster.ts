import type { DaemonClient, DaemonSession } from './types'

export function addSessionClient(
  session: DaemonSession,
  client: DaemonClient,
): void {
  session.clients.add(client)
}

export function removeSessionClient(
  session: DaemonSession,
  client: DaemonClient,
): void {
  session.clients.delete(client)
}

export function sendClientJson(client: DaemonClient, payload: unknown): void {
  client.send(JSON.stringify(payload))
}

export function broadcastSessionJson(
  session: DaemonSession,
  payload: unknown,
): void {
  const text = JSON.stringify(payload)
  for (const client of Array.from(session.clients)) {
    try {
      client.send(text)
    } catch {
      session.clients.delete(client)
    }
  }
}
