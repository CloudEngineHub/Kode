#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const primaryCommand = 'kode';
const alternativeCommands = ['kwa', 'kd'];

function commandExists(cmd) {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function setupCommand() {
  // Check if primary command exists
  if (!commandExists(primaryCommand)) {
    console.log(`✅ '${primaryCommand}' command is available and has been set up.`);
    return;
  }

  console.log(`⚠️  '${primaryCommand}' command already exists on your system.`);
  
  // Find an available alternative
  for (const alt of alternativeCommands) {
    if (!commandExists(alt)) {
      // Create alternative command
      const binPath = path.join(__dirname, '..', 'cli.js');
      const altBinPath = path.join(__dirname, '..', '..', '..', '.bin', alt);
      
      try {
        fs.symlinkSync(binPath, altBinPath);
        console.log(`✅ Created alternative command '${alt}' instead.`);
        console.log(`   You can run the tool using: ${alt}`);
        return;
      } catch (err) {
        // Continue to next alternative
      }
    }
  }

  console.log(`
⚠️  All common command names are taken. You can still run the tool using:
   - npx @shareai-lab/kode
   - Or create your own alias: alias myai='npx @shareai-lab/kode'
`);
}

// Only run in postinstall, not in development
if (process.env.npm_lifecycle_event === 'postinstall') {
  setupCommand();
}