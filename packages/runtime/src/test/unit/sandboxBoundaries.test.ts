import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { quote } from 'shell-quote'
import which from 'which'
import { buildMacosSandboxExecCommand } from '#runtime/shell/macosSandbox'
import {
  buildLinuxBwrapCommand,
  buildLinuxBwrapFilesystemArgs,
} from '#runtime/shell/linuxSandbox'
import {
  buildSandboxEnvAssignments,
  resolveSandboxTmpDir,
} from '#runtime/shell/sandboxEnv'

describe('sandbox command boundaries', () => {
  const tmpEnvKeys = [
    'KODE_TMPDIR',
    'CLAUDE_TMPDIR',
    'CLAUDE_CODE_TMPDIR',
    'TEMP',
    'TMP',
    'USERPROFILE',
  ] as const
  let savedEnv: Record<string, string | undefined>
  let root: string

  beforeEach(() => {
    savedEnv = Object.fromEntries(
      tmpEnvKeys.map(key => [key, process.env[key]]),
    )
    root = mkdtempSync(join(tmpdir(), 'kode-shell-boundaries-'))
    for (const key of tmpEnvKeys) delete process.env[key]
  })

  afterEach(() => {
    for (const key of tmpEnvKeys) {
      if (savedEnv[key] === undefined) delete process.env[key]
      else process.env[key] = savedEnv[key]
    }
    rmSync(root, { recursive: true, force: true })
  })

  describe('sandbox temporary path semantics', () => {
    test.each([
      ['linux', 'KODE_TMPDIR', '/', '/'],
      ['linux', 'KODE_TMPDIR', '/tmp/literal\\', '/tmp/literal\\'],
      ['win32', 'KODE_TMPDIR', 'C:\\', 'C:\\'],
      ['win32', 'CLAUDE_TMPDIR', 'C:\\tmp\\claude', 'C:\\tmp\\kode'],
      ['win32', 'CLAUDE_CODE_TMPDIR', 'C:\\', 'C:\\kode'],
    ] as const)('%s preserves %s=%s', (platform, key, value, expected) => {
      process.env[key] = value
      expect(resolveSandboxTmpDir({ platform })).toBe(expected)
    })

    test.each(['', '   '])('win32 ignores an empty TEMP (%j)', value => {
      process.env.TEMP = value
      process.env.TMP = 'D:\\tmp'
      expect(resolveSandboxTmpDir({ platform: 'win32' })).toBe('D:\\tmp\\kode')
    })

    test('Linux binds the canonical configured temp directory', () => {
      const custom = join(root, 'custom temp')
      mkdirSync(custom)
      process.env.KODE_TMPDIR = custom
      const argv = buildLinuxBwrapFilesystemArgs({
        writeConfig: { allowOnly: [] },
      })
      const canonical = realpathSync(custom)
      expect(argv).toContain(canonical)
      const index = argv.indexOf(canonical)
      expect(argv.slice(index - 1, index + 2)).toEqual([
        '--bind',
        canonical,
        canonical,
      ])
    })
  })

  const expectedSsh = "ssh -o ProxyCommand='nc -X 5 -x localhost:1080 %h %p'"
  const nativeMacSandbox =
    process.platform === 'darwin' &&
    existsSync('/usr/bin/sandbox-exec') &&
    spawnSync('/usr/bin/sandbox-exec', [
      '-p',
      '(version 1) (allow default)',
      '/usr/bin/true',
    ]).status === 0

  test.skipIf(!nativeMacSandbox)(
    'native macOS sandbox preserves literal TMPDIR and SSH command',
    () => {
      process.env.KODE_TMPDIR = "/tmp/O'Brien $(printf literal)"
      const argv = buildMacosSandboxExecCommand({
        sandboxExecPath: '/usr/bin/sandbox-exec',
        binShellPath: '/bin/sh',
        command: 'printf "%s\\n%s" "$TMPDIR" "$GIT_SSH_COMMAND"',
        needsNetworkRestriction: false,
        socksProxyPort: 1080,
      })
      const result = spawnSync(argv[0], argv.slice(1), {
        encoding: 'utf8',
        timeout: 5000,
      })
      expect(result.status).toBe(0)
      expect(result.stdout).toBe(`${process.env.KODE_TMPDIR}\n${expectedSsh}`)
    },
  )
  const literalPaths = [
    '/tmp/John Doe/kode',
    "/tmp/O'Brien/kode",
    '/tmp/a"b/kode',
    '/tmp/a=b/kode',
    '/tmp/$(printf expanded)`printf expanded`$HOME;literal/kode',
    '/tmp/line\nbreak/kode',
    '/tmp/literal\\',
  ]

  test('sandbox env entries contain raw values, including the Git command', () => {
    expect(
      buildSandboxEnvAssignments({ platform: 'darwin', socksProxyPort: 1080 }),
    ).toContain(`GIT_SSH_COMMAND=${expectedSsh}`)
  })

  for (const shell of ['/bin/sh', '/bin/bash'].filter(existsSync)) {
    test(`Linux seccomp wrapper via ${shell} preserves each nested command argument`, () => {
      const apply = join(root, "O'Brien $(printf literal) apply")
      const bpf = join(root, "O'Brien $(printf literal) filter.bpf")
      const output = join(root, 'bpf-arg')
      writeFileSync(
        apply,
        '#!/bin/sh\nprintf "%s" "$1" > "$KODE_TEST_BPF_ARG"\nshift\nexec "$@"\n',
        { mode: 0o755 },
      )
      const text = 'literal \'quote\' "double quote" $HOME; $(printf literal)'
      const argv = buildLinuxBwrapCommand({
        bwrapPath: '/unused/bwrap',
        binShellPath: shell,
        command: `printf '%s' ${quote([text])}`,
        linuxSeccomp: { applySeccompPath: apply, bpfPath: bpf },
      })
      const result = spawnSync(shell, ['-c', argv.at(-1)!], {
        encoding: 'utf8',
        timeout: 5000,
        env: { ...process.env, KODE_TEST_BPF_ARG: output },
      })
      expect(result.status).toBe(0)
      expect(result.stdout).toBe(text)
      expect(readFileSync(output, 'utf8')).toBe(bpf)
    })
    describe(`generated macOS command via ${shell}`, () => {
      test.each(literalPaths)(
        'round-trips TMPDIR=%j and Git SSH command',
        tmp => {
          process.env.KODE_TMPDIR = tmp
          const argv = buildMacosSandboxExecCommand({
            sandboxExecPath: '/unused/sandbox-exec',
            binShellPath: shell,
            command: quote([
              process.execPath,
              '-e',
              'process.stdout.write(JSON.stringify([process.env.TMPDIR,process.env.GIT_SSH_COMMAND]))',
            ]),
            needsNetworkRestriction: true,
            socksProxyPort: 1080,
          })
          const result = spawnSync(argv[3], argv.slice(4), {
            encoding: 'utf8',
            timeout: 5000,
          })
          expect(result.status).toBe(0)
          expect(JSON.parse(result.stdout)).toEqual([tmp, expectedSsh])
        },
      )

      test.skipIf(!which.sync('git', { nothrow: true }))(
        'Git launches SSH with one intact ProxyCommand argument',
        () => {
          const bin = join(root, 'bin')
          mkdirSync(bin)
          const output = join(root, 'ssh-args')
          writeFileSync(
            join(bin, 'ssh'),
            '#!/bin/sh\nprintf "%s\\n" "$@" > "$KODE_TEST_SSH_ARGS"\nexit 1\n',
            { mode: 0o755 },
          )
          const argv = buildMacosSandboxExecCommand({
            sandboxExecPath: '/unused/sandbox-exec',
            binShellPath: shell,
            command:
              'git ls-remote ssh://git@kode-test.invalid/example/repo.git',
            needsNetworkRestriction: true,
            socksProxyPort: 1080,
          })
          const result = spawnSync(argv[3], argv.slice(4), {
            encoding: 'utf8',
            timeout: 5000,
            env: {
              ...process.env,
              PATH: bin + ':' + process.env.PATH,
              KODE_TEST_SSH_ARGS: output,
              GIT_SSH_VARIANT: 'ssh',
              GIT_CONFIG_NOSYSTEM: '1',
              GIT_CONFIG_GLOBAL: '/dev/null',
              GIT_TERMINAL_PROMPT: '0',
            },
          })
          expect(result.error).toBeUndefined()
          expect(existsSync(output)).toBe(true)
          expect(readFileSync(output, 'utf8').split('\n')).toContain(
            'ProxyCommand=nc -X 5 -x localhost:1080 %h %p',
          )
        },
      )
    })

    describe(`generated Linux bridge command via ${shell}`, () => {
      test.each([0, 7, 23])(
        'retains exit code %i through bridge cleanup',
        code => {
          const bin = join(root, 'bin')
          mkdirSync(bin)
          writeFileSync(join(bin, 'socat'), '#!/bin/sh\nexec sleep 30\n', {
            mode: 0o755,
          })
          const argv = buildLinuxBwrapCommand({
            bwrapPath: '/unused/bwrap',
            binShellPath: shell,
            command: quote([process.execPath, '-e', `process.exit(${code})`]),
            needsNetworkRestriction: true,
            httpProxyPort: 3128,
            socksProxyPort: 1080,
            linuxBridge: {
              httpSocketPath: '/unused/http.sock',
              socksSocketPath: '/unused/socks.sock',
            },
          })
          const result = spawnSync(shell, ['-c', argv.at(-1)!], {
            env: { ...process.env, PATH: bin + ':' + process.env.PATH },
            encoding: 'utf8',
            timeout: 5000,
          })
          expect(result.status).toBe(code)
        },
      )

      test('socket paths are data and do not undergo shell expansion', () => {
        const bin = join(root, 'bin')
        mkdirSync(bin)
        const log = join(root, 'socat-args')
        writeFileSync(
          join(bin, 'socat'),
          '#!/bin/sh\nprintf "%s\\n" "$2" >> "$KODE_TEST_SOCAT_ARGS"\nexec sleep 30\n',
          { mode: 0o755 },
        )
        const httpSocketPath = join(
          root,
          "O'Brien $(printf injected) http.sock",
        )
        const socksSocketPath = join(root, 'socks $(printf injected).sock')
        const waitForBridges = quote([
          process.execPath,
          '-e',
          `for(let i=0;i<200;i++){try{if(require('fs').readFileSync(process.env.KODE_TEST_SOCAT_ARGS,'utf8').trim().split('\\n').length===2)process.exit(0)}catch{}await Bun.sleep(5)}process.exit(1)`,
        ])
        const argv = buildLinuxBwrapCommand({
          bwrapPath: '/unused/bwrap',
          binShellPath: shell,
          command: waitForBridges,
          needsNetworkRestriction: true,
          linuxBridge: { httpSocketPath, socksSocketPath },
        })
        const result = spawnSync(shell, ['-c', argv.at(-1)!], {
          env: {
            ...process.env,
            PATH: bin + ':' + process.env.PATH,
            KODE_TEST_SOCAT_ARGS: log,
          },
          encoding: 'utf8',
          timeout: 5000,
        })
        expect(result.status).toBe(0)
        const addresses = readFileSync(log, 'utf8')
        expect(addresses.trim().split('\n').sort()).toEqual(
          [
            `UNIX-CONNECT:${root}/O\\'Brien $\\(printf injected\\) http.sock`,
            `UNIX-CONNECT:${root}/socks $\\(printf injected\\).sock`,
          ].sort(),
        )
      })
    })
  }

  test.each(literalPaths)('Linux --setenv keeps TMPDIR=%j unquoted', tmp => {
    process.env.KODE_TMPDIR = tmp
    const argv = buildLinuxBwrapCommand({
      bwrapPath: 'bwrap',
      binShellPath: 'sh',
      command: 'true',
    })
    expect(argv[argv.indexOf('TMPDIR') + 1]).toBe(tmp)
  })
})
