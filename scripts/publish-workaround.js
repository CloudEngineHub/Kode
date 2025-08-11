#!/usr/bin/env node

const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

async function publish() {
  console.log('🚀 Starting publish workaround...\n');
  
  const packagePath = path.join(__dirname, '..', 'package.json');
  
  try {
    // Read package.json
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    const originalBundled = packageJson.bundledDependencies;
    
    // Remove bundledDependencies temporarily
    console.log('📦 Removing bundledDependencies temporarily...');
    delete packageJson.bundledDependencies;
    fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));
    
    // Set proxy and publish
    console.log('🌍 Setting proxy and publishing...');
    process.env.https_proxy = 'http://127.0.0.1:7890';
    process.env.http_proxy = 'http://127.0.0.1:7890';
    process.env.all_proxy = 'socks5://127.0.0.1:7890';
    process.env.SKIP_BUNDLED_CHECK = 'true';
    
    execSync('npm publish --access public', { 
      stdio: 'inherit',
      env: process.env
    });
    
    // Restore bundledDependencies
    console.log('✅ Restoring bundledDependencies...');
    packageJson.bundledDependencies = originalBundled;
    fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));
    
    console.log('🎉 Published successfully!');
    
  } catch (error) {
    console.error('❌ Publish failed:', error.message);
    
    // Restore package.json on error
    try {
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      packageJson.bundledDependencies = ["tsx"];
      fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));
    } catch (e) {
      console.error('Failed to restore package.json');
    }
    
    process.exit(1);
  }
}

publish();