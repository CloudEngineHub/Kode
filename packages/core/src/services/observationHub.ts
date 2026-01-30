import { systemReminderService } from '#core/services/systemReminder'
import { getCwd } from '#core/utils/state'
import { debug as debugLogger } from '#core/utils/debugLogger'
import { logError } from '#core/utils/log'

export type ObservationStartContext = {
  agentId: string
  sessionId?: string
  cwd: string
  timestamp: number
}

export type ObservationStopFn = () => void | Promise<void>

export type ObservationDefinition = {
  id: string
  description: string
  getInstanceKey?: (ctx: ObservationStartContext) => string
  isEnabled?: (ctx: ObservationStartContext) => boolean
  start: (
    ctx: ObservationStartContext,
  ) => ObservationStopFn | void | Promise<ObservationStopFn | void>
}

type ObservationInstance = {
  stop?: ObservationStopFn
  startedAt: number
}

class ObservationHub {
  private readonly observers = new Map<string, ObservationDefinition>()
  private readonly instances = new Map<string, ObservationInstance>()
  private isInitialized = false

  constructor() {
    this.initialize()
  }

  public initialize(): void {
    if (this.isInitialized) return
    this.isInitialized = true

    systemReminderService.addEventListener('session:startup', context => {
      const ctx = context as { agentId?: string; sessionId?: string } | null
      const agentId =
        typeof ctx?.agentId === 'string' && ctx.agentId.trim()
          ? ctx.agentId.trim()
          : 'main'

      this.ensureStarted({
        agentId,
        sessionId:
          typeof ctx?.sessionId === 'string' && ctx.sessionId.trim()
            ? ctx.sessionId.trim()
            : undefined,
        cwd: getCwd(),
        timestamp: Date.now(),
      })
    })

    const cleanup = () => void this.stopAll()
    process.once('exit', cleanup)
    process.once('SIGINT', cleanup)
    process.once('SIGTERM', cleanup)
  }

  public register(observer: ObservationDefinition): void {
    if (this.observers.has(observer.id)) return
    this.observers.set(observer.id, observer)
  }

  public ensureStarted(ctx: ObservationStartContext): void {
    for (const observer of this.observers.values()) {
      try {
        if (observer.isEnabled && observer.isEnabled(ctx) === false) {
          continue
        }

        const instanceKey =
          typeof observer.getInstanceKey === 'function'
            ? observer.getInstanceKey(ctx)
            : 'default'
        const normalizedInstanceKey = instanceKey?.trim() || 'default'
        const fullKey = `${observer.id}:${normalizedInstanceKey}`

        if (this.instances.has(fullKey)) continue

        const startedAt = Date.now()
        // Reserve the key immediately so repeated startup events don't
        // accidentally start multiple instances while an async start resolves.
        this.instances.set(fullKey, { stop: undefined, startedAt })
        const res = observer.start(ctx)

        Promise.resolve(res)
          .then(stop => {
            const current = this.instances.get(fullKey)
            if (!current) return
            current.stop = typeof stop === 'function' ? stop : undefined
          })
          .catch(error => {
            logError(error)
            debugLogger.warn('OBSERVATION_START_FAILED', {
              observerId: observer.id,
              instanceKey: normalizedInstanceKey,
              error: error instanceof Error ? error.message : String(error),
            })
            this.instances.delete(fullKey)
          })
      } catch (error) {
        logError(error)
        debugLogger.warn('OBSERVATION_START_CRASH', {
          observerId: observer.id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  public async stopAll(): Promise<void> {
    const stops = Array.from(this.instances.entries())
    this.instances.clear()

    for (const [key, instance] of stops) {
      if (!instance.stop) continue
      try {
        await instance.stop()
      } catch (error) {
        logError(error)
        debugLogger.warn('OBSERVATION_STOP_FAILED', {
          key,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }
}

export const observationHub = new ObservationHub()

export function registerObservation(observer: ObservationDefinition): void {
  observationHub.register(observer)
}
