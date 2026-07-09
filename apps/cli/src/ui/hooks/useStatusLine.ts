import { useEffect, useRef, useState } from 'react'
import { BunShell } from '#runtime/shell'
import { getStatusLineConfig } from '#core/services/statusline'
import { getBackgroundTaskCounts } from '#core/tasks/backgroundRegistry'

type StatusLineState = {
  text: string | null
  padding: number
  isConfigured: boolean
}

function serializeStatusLineInput(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 0) + '\n'
  } catch {
    return '{}\n'
  }
}

export function normalizeStatusLineOutput(raw: string): string | null {
  const firstLine = raw
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(line => line.length > 0)

  return firstLine ?? null
}

function buildDynamicStatusLineInput(
  baseInput: unknown,
): Record<string, unknown> {
  const base =
    baseInput && typeof baseInput === 'object' && !Array.isArray(baseInput)
      ? (baseInput as Record<string, unknown>)
      : {}

  const existingKode =
    base.kode && typeof base.kode === 'object' && !Array.isArray(base.kode)
      ? (base.kode as Record<string, unknown>)
      : {}

  const tasks = getBackgroundTaskCounts()

  return {
    ...base,
    kode: {
      ...existingKode,
      tasks,
    },
  }
}

function isStatusLineRuntimeEnabled(): boolean {
  return (
    process.env.KODE_STATUSLINE_ENABLED === '1' ||
    process.env.NODE_ENV !== 'test'
  )
}

function getInitialStatusLineState(): StatusLineState {
  if (!isStatusLineRuntimeEnabled()) {
    return { text: null, padding: 0, isConfigured: false }
  }

  try {
    const config = getStatusLineConfig()
    return {
      text: null,
      padding: config?.padding ?? 0,
      isConfigured: Boolean(config?.command),
    }
  } catch {
    return { text: null, padding: 0, isConfigured: false }
  }
}

export function useStatusLine(input?: unknown): {
  text: string | null
  padding: number
  isConfigured: boolean
} {
  const [state, setState] = useState<StatusLineState>(getInitialStatusLineState)
  const lastCommandRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const inputRef = useRef<unknown>(input)
  const inputSignatureRef = useRef<string | null>(null)
  const tickRef = useRef<(() => void) | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const nextSignature = serializeStatusLineInput(input)
    inputRef.current = input
    if (inputSignatureRef.current === nextSignature) return
    inputSignatureRef.current = nextSignature

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
    const enabled = isStatusLineRuntimeEnabled()
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
        if (alive) {
          setState(prev =>
            prev.text === null && prev.padding === 0 && !prev.isConfigured
              ? prev
              : { text: null, padding: 0, isConfigured: false },
          )
        }
        return
      }

      const commandChanged = lastCommandRef.current !== command
      lastCommandRef.current = command
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac

      if (alive) {
        setState(prev => {
          const nextText = commandChanged ? null : prev.text
          return prev.text === nextText &&
            prev.padding === padding &&
            prev.isConfigured
            ? prev
            : { text: nextText, padding, isConfigured: true }
        })
      }

      const result = await shell.exec(command, ac.signal, 5000, {
        stdin: serializeStatusLineInput(
          buildDynamicStatusLineInput(inputRef.current),
        ),
      })
      if (!alive) return
      if (result.interrupted) return

      const raw = result.code === 0 ? result.stdout : ''
      const next = normalizeStatusLineOutput(raw)
      if (alive) {
        const text = next || null
        setState(prev =>
          prev.text === text && prev.padding === padding && prev.isConfigured
            ? prev
            : { text, padding, isConfigured: true },
        )
      }
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
