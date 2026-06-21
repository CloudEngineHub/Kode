import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomBytes } from 'crypto'

// ============================================
// Test Sandbox for Safe Verification
// ============================================

export type TestSandbox = {
  root: string
  cwd: string
  home: string
  createFile: (relativePath: string, content?: string) => string
  createDir: (relativePath: string) => string
  cleanup: () => void
}

export function createTestSandbox(prefix = 'kode-test'): TestSandbox {
  const id = randomBytes(8).toString('hex')
  const root = join(tmpdir(), `${prefix}-${id}`)

  // Create isolated directory structure
  const cwd = join(root, 'workspace')
  const home = join(root, 'home')

  mkdirSync(root, { recursive: true })
  mkdirSync(cwd, { recursive: true })
  mkdirSync(home, { recursive: true })

  const createFile = (relativePath: string, content = ''): string => {
    const fullPath = join(cwd, relativePath)
    const dir = join(fullPath, '..')
    mkdirSync(dir, { recursive: true })
    writeFileSync(fullPath, content)
    return fullPath
  }

  const createDir = (relativePath: string): string => {
    const fullPath = join(cwd, relativePath)
    mkdirSync(fullPath, { recursive: true })
    return fullPath
  }

  const cleanup = () => {
    if (existsSync(root)) {
      rmSync(root, { recursive: true, force: true })
    }
  }

  return { root, cwd, home, createFile, createDir, cleanup }
}

// ============================================
// Mock Command Context for Rule Testing
// ============================================

export type MockCommandResult = {
  command: string
  wouldExecute: boolean
  findings: Array<{ id: string; title: string }>
  blocked: boolean
}

export function mockCommandExecution(
  command: string,
  detectFn: (cmd: string) => Array<{ id: string; title: string }>,
): MockCommandResult {
  const findings = detectFn(command)
  return {
    command,
    wouldExecute: true,
    findings,
    blocked: findings.length > 0,
  }
}

// ============================================
// Test Fixtures for Common Scenarios
// ============================================

export const TEST_COMMANDS = {
  // Should trigger LLM Gate (data loss)
  dangerous: [
    'git reset --hard',
    'git reset --hard HEAD~1',
    'git clean -fd',
    'git clean -fdx',
    'git push --force',
    'git push -f origin main',
    'git stash drop',
    'git stash clear',
    'rm -rf /',
    'rm -rf ~',
    'rm -rf .',
    'rm -rf /etc',
    'rm -rf /usr',
    'rm -rf /bin',
    'mkfs.ext4 /dev/sda1',
    'shred /dev/sda',
    'dd if=/dev/zero of=/dev/sda',
    'terraform destroy',
    'kubectl delete namespace prod',
    'pulumi destroy',
  ],

  // Should NOT trigger LLM Gate (safe)
  safe: [
    'ls -la',
    'git status',
    'git log',
    'git diff',
    'git pull',
    'git push',
    'git reset HEAD~1',
    'git stash',
    'git stash pop',
    'rm file.txt',
    'rm -rf ./node_modules',
    'rm -rf /tmp/test',
    'rm -rf /var/log/app',
    'rm -rf /etc/nginx/conf.d',
    'dd if=/dev/zero of=./test.img bs=1M count=100',
    'terraform plan',
    'terraform apply',
    'kubectl get pods',
    'kubectl describe pod nginx',
    'echo "hello"',
    'cat file.txt',
    'grep pattern file.txt',
  ],

  // Should NOT trigger (false positive prevention)
  falsePositives: [
    'echo "git reset --hard"',
    'printf "rm -rf /"',
    '# git reset --hard',
    '# rm -rf /',
    'grep "git reset" history.log',
    'cat scripts/deploy.sh',
  ],
} as const

// ============================================
// Assertion Helpers
// ============================================

export function assertAllTrigger(
  commands: readonly string[],
  detectFn: (cmd: string) => Array<{ id: string; title: string }>,
): { passed: string[]; failed: string[] } {
  const passed: string[] = []
  const failed: string[] = []

  for (const cmd of commands) {
    const findings = detectFn(cmd)
    if (findings.length > 0) {
      passed.push(cmd)
    } else {
      failed.push(cmd)
    }
  }

  return { passed, failed }
}

export function assertNoneTrigger(
  commands: readonly string[],
  detectFn: (cmd: string) => Array<{ id: string; title: string }>,
): { passed: string[]; failed: string[] } {
  const passed: string[] = []
  const failed: string[] = []

  for (const cmd of commands) {
    const findings = detectFn(cmd)
    if (findings.length === 0) {
      passed.push(cmd)
    } else {
      failed.push(cmd)
    }
  }

  return { passed, failed }
}
