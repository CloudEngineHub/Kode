#!/usr/bin/env bun
import { existsSync, rmSync, writeFileSync, chmodSync } from 'fs';

async function build() {
  console.log('🚀 Building Kode CLI...\n');
  
  try {
    // Clean previous builds
    console.log('🧹 Cleaning previous builds...');
    ['cli.js', '.npmrc'].forEach(file => {
      if (existsSync(file)) {
        rmSync(file, { recursive: true, force: true });
      }
    });
    
    // Create the CLI wrapper
    const wrapper = `#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// Prefer bun if available, otherwise use node with loader
const args = process.argv.slice(2);
const cliPath = path.join(__dirname, 'src', 'entrypoints', 'cli.tsx');

// Try bun first
try {
  const { execSync } = require('child_process');
  execSync('bun --version', { stdio: 'ignore' });
  
  // Bun is available
  const child = spawn('bun', ['run', cliPath, ...args], {
    stdio: 'inherit',
    env: {
      ...process.env,
      YOGA_WASM_PATH: path.join(__dirname, 'yoga.wasm')
    }
  });
  
  child.on('exit', (code) => process.exit(code || 0));
  child.on('error', () => {
    // Fallback to node if bun fails
    runWithNode();
  });
} catch {
  // Bun not available, use node
  runWithNode();
}

function runWithNode() {
  // Use node with tsx loader
  const child = spawn('node', [
    '--loader', 'tsx',
    '--no-warnings',
    cliPath,
    ...args
  ], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_OPTIONS: '--loader tsx --no-warnings',
      YOGA_WASM_PATH: path.join(__dirname, 'yoga.wasm')
    }
  });
  
  child.on('error', (err) => {
    if (err.code === 'MODULE_NOT_FOUND' || err.message.includes('tsx')) {
      console.error('\\nError: tsx is required but not installed.');
      console.error('Please run: npm install');
      process.exit(1);
    } else {
      console.error('Failed to start Kode:', err.message);
      process.exit(1);
    }
  });
  
  child.on('exit', (code) => process.exit(code || 0));
}
`;
    
    writeFileSync('cli.js', wrapper);
    chmodSync('cli.js', 0o755);
    
    // Create .npmrc
    const npmrc = `# Ensure tsx is installed
auto-install-peers=true
`;
    
    writeFileSync('.npmrc', npmrc);
    
    console.log('✅ Build completed successfully!\n');
    console.log('📋 Generated files:');
    console.log('  - cli.js (Smart CLI wrapper)');
    console.log('  - .npmrc (NPM configuration)');
    console.log('\n🚀 Ready to publish!');
    
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

// Run build if called directly
if (import.meta.main) {
  build();
}

export { build };