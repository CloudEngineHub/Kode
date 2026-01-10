import { existsSync } from 'fs'
import { isAbsolute, resolve } from 'path'

import type {
  BackgroundProcess,
  BunShellExecOptions,
  BunShellPromotableExec,
  BackgroundShellStatusAttachment,
  BashNotification,
} from './types'
import { createInitialState, type BunShellState } from './state'
import { exec } from './exec'
import { execPromotable } from './execPromotable'
import {
  execInBackground,
  flushBackgroundShellStatusAttachments,
  flushBashNotifications,
  getBackgroundOutput,
  killBackgroundShell,
  listBackgroundShells,
  readBackgroundOutput,
} from './background'
import { getShellCmdForPlatform } from './shellCmd'

/**
 * BunShell - Cross-platform shell using Node.js child_process.spawn with proper timeout support.
 */
export class BunShell {
  private state: BunShellState

  constructor(cwd: string) {
    this.state = createInitialState(cwd)
  }

  private static instance: BunShell | null = null

  static restart() {
    if (BunShell.instance) {
      BunShell.instance.close()
      BunShell.instance = null
    }
  }

  static getInstance(): BunShell {
    if (!BunShell.instance || !BunShell.instance.state.isAlive) {
      BunShell.instance = new BunShell(process.cwd())
    }
    return BunShell.instance
  }

  static getShellCmdForPlatform(
    platform: NodeJS.Platform,
    command: string,
    env: NodeJS.ProcessEnv = process.env,
  ): string[] {
    return getShellCmdForPlatform(platform, command, env)
  }

  execPromotable(
    command: string,
    abortSignal?: AbortSignal,
    timeout?: number,
    options?: BunShellExecOptions,
  ): BunShellPromotableExec {
    return execPromotable(this.state, command, abortSignal, timeout, options)
  }

  async exec(
    command: string,
    abortSignal?: AbortSignal,
    timeout?: number,
    options?: BunShellExecOptions,
  ) {
    return exec(this.state, command, abortSignal, timeout, options)
  }

  execInBackground(
    command: string,
    timeout?: number,
    options?: BunShellExecOptions,
  ): { bashId: string } {
    return execInBackground(this.state, command, timeout, options)
  }

  getBackgroundOutput(shellId: string) {
    return getBackgroundOutput(this.state, shellId)
  }

  readBackgroundOutput(bashId: string, options?: { filter?: string }) {
    return readBackgroundOutput(this.state, bashId, options)
  }

  killBackgroundShell(shellId: string): boolean {
    return killBackgroundShell(this.state, shellId)
  }

  listBackgroundShells(): BackgroundProcess[] {
    return listBackgroundShells(this.state)
  }

  pwd(): string {
    return this.state.cwd
  }

  async setCwd(cwd: string) {
    const resolved = isAbsolute(cwd) ? cwd : resolve(this.state.cwd, cwd)
    if (!existsSync(resolved)) {
      throw new Error(`Path "${resolved}" does not exist`)
    }
    this.state.cwd = resolved
  }

  killChildren() {
    this.state.abortController?.abort()
    this.state.currentProcess?.kill()
    for (const bg of Array.from(this.state.backgroundProcesses.keys())) {
      killBackgroundShell(this.state, bg)
    }
  }

  close(): void {
    this.state.isAlive = false
    this.killChildren()
  }

  flushBashNotifications(): BashNotification[] {
    return flushBashNotifications(this.state)
  }

  flushBackgroundShellStatusAttachments(): BackgroundShellStatusAttachment[] {
    return flushBackgroundShellStatusAttachments(this.state)
  }
}
