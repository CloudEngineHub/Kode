import type { ChildProcess } from 'node:child_process'
import type { BackgroundProcess } from './types'

export type BunShellState = {
  cwd: string
  isAlive: boolean
  currentProcess: ChildProcess | null
  abortController: AbortController | null
  backgroundProcesses: Map<string, BackgroundProcess>
}

export function createInitialState(cwd: string): BunShellState {
  return {
    cwd,
    isAlive: true,
    currentProcess: null,
    abortController: null,
    backgroundProcesses: new Map(),
  }
}
