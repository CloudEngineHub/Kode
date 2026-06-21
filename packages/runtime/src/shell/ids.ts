import { randomUUID } from 'crypto'

export function makeBackgroundTaskId(): string {
  // Compatibility: local_bash task IDs are prefixed with "b".
  return `b${randomUUID().replace(/-/g, '').slice(0, 6)}`
}
