#!/usr/bin/env bun

const fs = require('fs');
const path = require('path');

console.log('📦 Pre-publish checks...\n');

// Check required files
const requiredFiles = [
  'cli.js',
  'package.json',
  'yoga.wasm',
  '.npmrc',
  path.join('dist', 'index.js'),
  path.join('dist', 'entrypoints', 'cli.js'),
  path.join('dist', 'entrypoints', 'mcp.js'),
  // Bundled ripgrep (fixes #144-class issues when system rg is missing)
  path.join('vendor', 'ripgrep', 'x64-win32', 'rg.exe'),
  path.join('vendor', 'ripgrep', 'arm64-win32', 'rg.exe'),
  path.join('vendor', 'ripgrep', 'x64-darwin', 'rg'),
  path.join('vendor', 'ripgrep', 'arm64-darwin', 'rg'),
  path.join('vendor', 'ripgrep', 'x64-linux', 'rg'),
  path.join('vendor', 'ripgrep', 'arm64-linux', 'rg'),
];
const missingFiles = requiredFiles.filter(file => !fs.existsSync(file));

if (missingFiles.length > 0) {
  console.error('❌ Missing required files:', missingFiles.join(', '));
  console.error('   Run "bun run build" first');
  process.exit(1);
}

// Check cli.js is executable
const cliStats = fs.statSync('cli.js');
if (!(cliStats.mode & 0o100)) {
  console.error('❌ cli.js is not executable');
  process.exit(1);
}

// Check package.json
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

if (!pkg.bin || !pkg.bin.kode) {
  console.error('❌ Missing bin field in package.json');
  process.exit(1);
}

// Bundled dependencies check removed - not needed for this package structure

console.log('✅ All checks passed!');
console.log('\n📋 Package info:');
console.log(`   Name: ${pkg.name}`);
console.log(`   Version: ${pkg.version}`);
console.log(`   Main: ${pkg.main}`);
console.log(`   Bin: kode -> ${pkg.bin.kode}`);
console.log('\n🚀 Ready to publish!');
console.log('   Run: npm publish');
