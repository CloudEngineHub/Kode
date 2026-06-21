#!/usr/bin/env node

const { execSync } = require('child_process')
const { readFileSync, writeFileSync } = require('fs')
const path = require('path')

/**
 * 发布开发版本到 npm
 * 使用 -dev tag，版本号自动递增 dev 后缀
 * 不涉及 git 操作，专注于 npm 发布
 */
async function publishDev() {
  try {
    console.log('🚀 Starting dev version publish process...\n')

    // 1. 读取当前版本
    const packagePath = path.join(process.cwd(), 'package.json')
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))
    const baseVersion = packageJson.version

    console.log(`📦 Current base version: ${baseVersion}`)

    // 2. 生成开发版本号
    let devVersion
    try {
      // 获取当前 dev tag 的最新版本
      const npmResult = execSync(`npm view @shareai-lab/kode@dev version`, {
        encoding: 'utf8',
      }).trim()
      const currentDevVersion = npmResult

      if (currentDevVersion.startsWith(baseVersion + '-dev.')) {
        const devNumber = parseInt(currentDevVersion.split('-dev.')[1]) + 1
        devVersion = `${baseVersion}-dev.${devNumber}`
      } else {
        devVersion = `${baseVersion}-dev.1`
      }
    } catch {
      // 如果没有找到现有的 dev 版本，从 1 开始
      devVersion = `${baseVersion}-dev.1`
    }

    console.log(`📦 Publishing version: ${devVersion} with tag 'dev'`)

    // 3. 临时更新版本号（同步 workspace 里的平台包版本 + 主包 optionalDependencies）
    const originalVersion = baseVersion
    execSync(`node scripts/set-version.mjs ${devVersion}`, { stdio: 'inherit' })

    // 4. 准备 ripgrep 平台包（发布时生成二进制）
    console.log('🧰 Preparing ripgrep platform packages...')
    execSync('bun run scripts/ensure-ripgrep.mjs', { stdio: 'inherit' })
    execSync('node scripts/prepare-ripgrep-packages.mjs', { stdio: 'inherit' })

    // 5. 准备 Kode 原生二进制平台包（需要已构建/下载各平台二进制到 dist/bin 或 artifacts/）
    console.log('🧰 Preparing Kode binary platform packages...')
    execSync('node scripts/prepare-kode-bin-packages.mjs', { stdio: 'inherit' })

    // 6. 构建项目
    console.log('🔨 Building project...')
    execSync('npm run build', { stdio: 'inherit' })

    // 7. 运行预发布检查
    console.log('🔍 Running pre-publish checks...')
    execSync('bun run scripts/prepublish-check.js', { stdio: 'inherit' })

    // 8. 发布到 npm 的 dev tag（先发布二进制/rg 平台包，再发布主包）
    console.log('📤 Publishing Kode binary platform packages...')
    const kodeBinDirs = [
      'packages/kode-bin-darwin-arm64',
      'packages/kode-bin-darwin-x64',
      'packages/kode-bin-linux-arm64',
      'packages/kode-bin-linux-x64',
      'packages/kode-bin-win32-arm64',
      'packages/kode-bin-win32-x64',
    ]
    for (const dir of kodeBinDirs) {
      execSync(`npm publish --tag dev --access public --ignore-scripts`, {
        stdio: 'inherit',
        cwd: path.join(process.cwd(), dir),
      })
    }

    console.log('📤 Publishing ripgrep platform packages...')
    const ripgrepDirs = [
      'packages/kode-ripgrep-darwin-arm64',
      'packages/kode-ripgrep-darwin-x64',
      'packages/kode-ripgrep-linux-arm64',
      'packages/kode-ripgrep-linux-x64',
      'packages/kode-ripgrep-win32-arm64',
      'packages/kode-ripgrep-win32-x64',
    ]
    for (const dir of ripgrepDirs) {
      execSync(`npm publish --tag dev --access public --ignore-scripts`, {
        stdio: 'inherit',
        cwd: path.join(process.cwd(), dir),
      })
    }

    console.log('📤 Publishing main package...')
    execSync(`npm publish --tag dev --access public --ignore-scripts`, {
      stdio: 'inherit',
    })

    // 9. 恢复原始版本号（避免工作区长期处于 dev 版本）
    execSync(`node scripts/set-version.mjs ${originalVersion}`, {
      stdio: 'inherit',
    })

    console.log('\n✅ Dev version published successfully!')
    console.log(`📦 Version: ${devVersion}`)
    console.log(`🔗 Install with: npm install -g @shareai-lab/kode@dev`)
    console.log(`🔗 Or: npm install -g @shareai-lab/kode@${devVersion}`)
    console.log(
      `📊 View on npm: https://www.npmjs.com/package/@shareai-lab/kode/v/${devVersion}`,
    )
  } catch (error) {
    console.error('❌ Dev publish failed:', error.message)

    console.log('🔄 Please manually restore versions if needed (git checkout).')

    process.exit(1)
  }
}

publishDev()
