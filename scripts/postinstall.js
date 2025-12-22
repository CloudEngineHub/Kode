#!/usr/bin/env node

// This postinstall is intentionally minimal and cross-platform safe.
// npm/pnpm/yarn already create shims from package.json "bin" fields.
// We avoid attempting to create symlinks or relying on platform-specific tools like `which`/`where`.

function postinstallNotice() {
  // Only print informational hints; never fail install.
  try {
    console.log('✅ @shareai-lab/kode installed. Commands available: kode, kwa, kd');
    console.log('   If shell cannot find them, try reloading your terminal or reinstall globally:');
    console.log('   npm i -g @shareai-lab/kode  (or use: npx @shareai-lab/kode)');

    // Kode runtime is Bun-first; give a friendly hint if Bun is not on PATH.
    try {
      const { spawnSync } = require('child_process');
      const ret = spawnSync('bun', ['--version'], { stdio: 'ignore' });
      if (ret.error || ret.status !== 0) {
        console.log('   ℹ️  Kode runs on Bun. Install Bun if you do not have it yet: https://bun.sh');
      }
    } catch {}
  } catch {}
}

if (process.env.npm_lifecycle_event === 'postinstall') {
  postinstallNotice();
}
