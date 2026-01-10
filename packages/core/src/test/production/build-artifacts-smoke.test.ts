import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

function run(
  cmd: string[],
  options?: { cwd?: string; env?: Record<string, string | undefined> },
) {
  return spawnSync(cmd[0], cmd.slice(1), {
    cwd: options?.cwd ?? process.cwd(),
    env: { ...process.env, ...options?.env },
    encoding: 'utf8',
    timeout: 5 * 60 * 1000,
  })
}

describe('build artifacts (smoke)', () => {
  test(
    'bun run build produces runnable dist outputs (no network)',
    async () => {
      const build = run([process.execPath, 'run', 'build'])
      expect(build.status).toBe(0)

      const distIndex = join(process.cwd(), 'dist', 'index.js')
      const distCli = join(process.cwd(), 'dist', 'entrypoints', 'cli.js')
      const distMcp = join(process.cwd(), 'dist', 'entrypoints', 'mcp.js')
      const distDaemon = join(process.cwd(), 'dist', 'entrypoints', 'daemon.js')
      const distWebuiIndex = join(process.cwd(), 'dist', 'webui', 'index.html')

      expect(existsSync(distIndex)).toBe(true)
      expect(existsSync(distCli)).toBe(true)
      expect(existsSync(distMcp)).toBe(true)
      expect(existsSync(distDaemon)).toBe(true)
      expect(existsSync(distWebuiIndex)).toBe(true)

      const pkg = JSON.parse(
        readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
      )
      const expectedVersion = String(pkg.version ?? '')

      const help = run([process.execPath, distIndex, '--help-lite'])
      expect(help.status).toBe(0)
      expect(help.stdout).toContain('Usage: kode')
      expect(help.stdout).toContain('--help')
      expect(help.stdout).toContain('--print')

      const ver = run([process.execPath, distIndex, '--version'])
      expect(ver.status).toBe(0)
      expect(ver.stdout.trim()).toBe(expectedVersion)

      const cliVersion = run([process.execPath, distCli, '--version'])
      expect(cliVersion.status).toBe(0)
      expect(cliVersion.stdout.trim()).toBe(expectedVersion)

      // mcp entrypoint should be importable and export `startMCPServer` without side effects.
      const mcpUrl = pathToFileURL(distMcp).href
      const mcpCheck = run([
        process.execPath,
        '-e',
        `import(${JSON.stringify(mcpUrl)}).then((m)=>{ if(typeof m.startMCPServer!=='function') process.exit(2); process.exit(0); }).catch((e)=>{ console.error(e); process.exit(3); });`,
      ])
      expect(mcpCheck.status).toBe(0)
    },
    { timeout: 6 * 60 * 1000 },
  )
})
