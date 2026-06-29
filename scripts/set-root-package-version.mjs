#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const version = process.argv[2] || process.env.DEV_VERSION

if (!version || typeof version !== 'string') {
  console.error('Usage: scripts/set-root-package-version.mjs <version>')
  process.exit(1)
}

const packageJsonPath = path.join(process.cwd(), 'package.json')
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
pkg.version = version
fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n')

console.log(`Set package.json version to ${version}`)
