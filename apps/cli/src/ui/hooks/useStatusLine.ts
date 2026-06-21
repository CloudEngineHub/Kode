import { useEffect, useRef, useState } from 'react'
import { BunShell } from '#runtime/shell'
import { getStatusLineConfig } from '#core/services/statusline'
import { listBackgroundAgentTaskSnapshots } from '#core/utils/backgroundTasks'

function serializeStatusLineInput(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 0) + '\n'
  } catch {
    return '{}\n'
  }
}

function buildDynamicStatusLineInput(
  baseInput: unknown,
  shell: BunShell,
): Record<string, unknown> {
  const base =
    baseInput && typeof baseInput === 'object' && !Array.isArray(baseInput)
      ? (baseInput as Record<string, unknown>)
      : {}

  const existingKode =
    base.kode && typeof base.kode === 'object' && !Array.isArray(base.kode)
      ? (base.kode as Record<string, unknown>)
      : {}

  const shells = shell.listBackgroundShells()
  const runningShells = shells.filter(
    proc => proc.code === null && !proc.interrupted && !proc.killed,
  ).length

  const agents = listBackgroundAgentTaskSnapshots()
  const runningAgents = agents.filter(task => task.status === 'running').length

  const tasks = {
    total: shells.length + agents.length,
    running: runningShells + runningAgents,
    bash: { total: shells.length, running: runningShells },
    agents: { total: agents.length, running: runningAgents },
  }

  return {
    ...base,
    kode: {
      ...existingKode,
      tasks,
    },
  }
}

export function useStatusLine(input?: unknown): {
  text: string | null
  padding: number
} {
  const [state, setState] = useState<{ text: string | null; padding: number }>({
    text: null,
    padding: 0,
  })
  const lastCommandRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const inputRef = useRef<unknown>(input)
  const tickRef = useRef<(() => void) | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    inputRef.current = input

    if (!tickRef.current) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      tickRef.current?.()
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
  }, [input])

  useEffect(() => {
    const enabled =
      process.env.KODE_STATUSLINE_ENABLED === '1' ||
      process.env.NODE_ENV !== 'test'
    if (!enabled) return

    const shell = BunShell.getInstance()
    let alive = true

    const tick = async () => {
      const config = getStatusLineConfig()
      const command = config?.command ?? null
      const padding = config?.padding ?? 0

      if (!command) {
        lastCommandRef.current = null
        abortRef.current?.abort()
        abortRef.current = null
        if (alive) setState({ text: null, padding: 0 })
        return
      }

      lastCommandRef.current = command
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac

      const result = await shell.exec(command, ac.signal, 5000, {
        stdin: serializeStatusLineInput(
          buildDynamicStatusLineInput(inputRef.current, shell),
        ),
      })
      if (!alive) return
      if (result.interrupted) return

      const raw = result.code === 0 ? result.stdout : ''
      const next = raw
        ? raw
            .trim()
            .split(/\r?\n/)
            .flatMap(line => {
              const trimmed = line.trim()
              return trimmed ? [trimmed] : []
            })
            .join('\n')
        : ''
      if (alive) setState({ text: next || null, padding })
    }

    tickRef.current = () => {
      tick().catch(() => {})
    }

    tick().catch(() => {})

    const intervalId = setInterval(() => {
      tickRef.current?.()
    }, 1000)

    return () => {
      alive = false
      abortRef.current?.abort()
      tickRef.current = null
      clearInterval(intervalId)
    }
  }, [])

  return state
}
