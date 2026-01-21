#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

function run(cmd, options = {}) {
  const proc = spawnSync(cmd[0], cmd.slice(1), {
    stdio: 'pipe',
    encoding: 'utf8',
    ...options,
  })

  if (proc.error) throw proc.error

  if (proc.status !== 0) {
    const stderr = (proc.stderr || '').trim()
    throw new Error(
      stderr || `Command failed (${proc.status}): ${cmd.join(' ')}`,
    )
  }

  return (proc.stdout || '').trim()
}

function getNpmCommandFromEnv() {
  const raw = process.env.npm_config_argv
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    const cooked = Array.isArray(parsed?.cooked) ? parsed.cooked : null
    const original = Array.isArray(parsed?.original) ? parsed.original : null
    const args = original || cooked
    const cmd = typeof args?.[0] === 'string' ? args[0] : null
    return cmd
  } catch {
    return null
  }
}

function shouldInstallHooks() {
  if (process.env.KODE_SKIP_HOOKS === '1') return false
  if (process.env.CI) return false

  const npmCmd = getNpmCommandFromEnv()
  if (npmCmd && ['pack', 'publish', 'ci'].includes(npmCmd)) return false

  return true
}

function main() {
  // Only install hooks in a real git checkout.
  if (!existsSync('.git')) return
  if (!existsSync('.husky')) return
  if (!shouldInstallHooks()) return

  try {
    const current = run(['git', 'config', '--get', 'core.hooksPath'])
    if (current === '.husky') return
    run(['git', 'config', 'core.hooksPath', '.husky'])
    // Keep output minimal; devs can verify with: git config --get core.hooksPath
    console.log('✅ Git hooks installed (core.hooksPath=.husky)')
  } catch (err) {
    // Best-effort: never block installs.
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`⚠️  Could not install git hooks: ${msg}`)
  }
}

main()
