#!/usr/bin/env bun
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

const OUT_DIR = 'dist'

function printBuildLogs(result) {
  for (const log of result.logs ?? []) {
    const prefix =
      log.level === 'error'
        ? 'error'
        : log.level === 'warning'
          ? 'warn'
          : 'info'
    // Bun already formats file/line nicely in many cases, but keep a stable message.
    console.error(`[bun.build:${prefix}] ${log.message}`)
  }
}

async function buildWithBun(options) {
  const result = await Bun.build({
    entrypoints: options.entrypoints,
    outdir: options.outdir,
    target: 'bun',
    format: 'esm',
    splitting: true,
    // Keep node_modules as runtime dependencies (avoid bundling optional deps like ink devtools).
    packages: 'external',
    sourcemap: 'external',
    minify: false,
  })

  if (!result.success) {
    printBuildLogs(result)
    throw new Error(`bun build failed (${options.label})`)
  }
}

async function main() {
  console.log('🚀 Building Kode CLI (all-in-Bun)...')

  rmSync(OUT_DIR, { recursive: true, force: true })
  mkdirSync(join(OUT_DIR, 'entrypoints'), { recursive: true })

  // Build the lightweight entry first (src/index.ts -> dist/index.js)
  await buildWithBun({
    label: 'index',
    entrypoints: ['src/index.ts'],
    outdir: OUT_DIR,
  })

  // Build CLI + MCP entrypoints (dist/entrypoints/*.js)
  await buildWithBun({
    label: 'entrypoints',
    entrypoints: ['src/entrypoints/cli.tsx', 'src/entrypoints/mcp.ts'],
    outdir: join(OUT_DIR, 'entrypoints'),
  })

  // Mark dist as ESM for interoperability (some tooling still expects this)
  writeFileSync(
    join(OUT_DIR, 'package.json'),
    JSON.stringify({ type: 'module', main: './index.js' }, null, 2),
  )

  // Copy yoga.wasm alongside outputs (helps in environments where root assets are stripped)
  try {
    cpSync('yoga.wasm', join(OUT_DIR, 'yoga.wasm'))
  } catch (err) {
    console.warn(
      '⚠️  Could not copy yoga.wasm:',
      err instanceof Error ? err.message : String(err),
    )
  }

  // Copy vendor assets if present (ripgrep, future bundled tools)
  try {
    if (existsSync('vendor')) {
      cpSync('vendor', join(OUT_DIR, 'vendor'), { recursive: true })
    }
  } catch (err) {
    console.warn(
      '⚠️  Could not copy vendor assets:',
      err instanceof Error ? err.message : String(err),
    )
  }

  // Generate Node-based CLI shim (npm bin points here)
  // - Prefer cached native binary (Windows OOTB)
  // - Fallback to Bun runtime (preserve current behavior)
  cpSync(join('scripts', 'cli-wrapper.cjs'), 'cli.js')
  try {
    chmodSync('cli.js', 0o755)
  } catch (err) {
    console.warn(
      '⚠️  Could not make cli.js executable:',
      err instanceof Error ? err.message : String(err),
    )
  }

  // Create .npmrc file (kept intentionally tiny)
  writeFileSync(
    '.npmrc',
    `# Kode npm configuration
package-lock=false
save-exact=true
`,
  )

  console.log('✅ Build completed')
  console.log('📋 Outputs:')
  console.log('  - dist/index.js')
  console.log('  - dist/entrypoints/cli.js')
  console.log('  - dist/entrypoints/mcp.js')
  console.log('  - cli.js')
}

main().catch(err => {
  console.error('❌ Build failed:', err)
  process.exit(1)
})
