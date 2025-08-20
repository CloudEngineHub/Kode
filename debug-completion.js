#!/usr/bin/env node

// 临时调试脚本 - 测试补全系统是否工作
console.log('Debug: Testing completion system...')

// 测试文件是否存在
const fs = require('fs')
const path = require('path')

const testFiles = ['package.json', 'package-lock.json', 'README.md']
testFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`✅ Found file: ${file}`)
  } else {
    console.log(`❌ Missing file: ${file}`)
  }
})

// 测试目录读取
try {
  const entries = fs.readdirSync('.').filter(f => f.startsWith('pa'))
  console.log(`Files starting with 'pa':`, entries)
} catch (err) {
  console.log('Error reading directory:', err)
}

console.log('Debug completed.')