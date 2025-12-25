// Unified CLI entry (lightweight)
// - Development: use `bun run src/entrypoints/cli.tsx`
// - Production: transpiled to `dist/index.js` and used as bin/main

import { MACRO } from './constants/macros'

function hasFlag(...flags: string[]): boolean {
  return process.argv.some(arg => flags.includes(arg))
}

// Minimal pre-parse: handle version/help early without loading heavy UI modules
if (hasFlag('--version', '-v')) {
  process.stdout.write(`${MACRO.VERSION || ''}\n`)
  process.exit(0)
}

if (hasFlag('--help-lite')) {
  process.stdout.write(
    `Usage: kode [options] [command] [prompt]\n\n` +
      `Common options:\n` +
      `  -h, --help           Show full help\n` +
      `  -v, --version        Show version\n` +
      `  -p, --print          Print response and exit (non-interactive)\n` +
      `  -c, --cwd <cwd>      Set working directory\n`,
  )
  process.exit(0)
}

// For compatibility, --help loads full CLI help
if (hasFlag('--acp')) {
  await import('./entrypoints/acp.js')
} else {
  await import('./entrypoints/cli.js')
}
