import { homedir } from 'os'
import type { BashPathOp } from './types'

function extractPathArgsForShellCommand(
  args: string[],
  flagsTakingValues: Set<string>,
  defaultIfEmpty: string[] = [],
): string[] {
  const out: string[] = []
  let sawPatternOrExpr = false

  for (let i = 0; i < args.length; i++) {
    const token = args[i]
    if (token === undefined || token === null) continue
    if (token.startsWith('-')) {
      const flag = token.split('=')[0]
      if (
        flag &&
        (flag === '-e' ||
          flag === '--regexp' ||
          flag === '-f' ||
          flag === '--file')
      ) {
        sawPatternOrExpr = true
      }
      if (flag && flagsTakingValues.has(flag) && !token.includes('=')) {
        i++
      }
      continue
    }
    if (!sawPatternOrExpr) {
      sawPatternOrExpr = true
      continue
    }
    out.push(token)
  }

  return out.length > 0 ? out : defaultIfEmpty
}

export const PATH_COMMAND_ARG_EXTRACTORS: Record<
  string,
  (args: string[]) => string[]
> = {
  cd: args => (args.length === 0 ? [homedir()] : [args.join(' ')]),
  ls: args => {
    const cleaned = args.filter(a => a && !a.startsWith('-'))
    return cleaned.length > 0 ? cleaned : ['.']
  },
  find: args => {
    const out: string[] = []
    const paramFlags = new Set([
      '-newer',
      '-anewer',
      '-cnewer',
      '-mnewer',
      '-samefile',
      '-path',
      '-wholename',
      '-ilname',
      '-lname',
      '-ipath',
      '-iwholename',
    ])
    const newerRe = /^-newer[acmBt][acmtB]$/
    let sawNonFlag = false
    for (let i = 0; i < args.length; i++) {
      const token = args[i]
      if (!token) continue
      if (token.startsWith('-')) {
        if (['-H', '-L', '-P'].includes(token)) continue
        sawNonFlag = true
        if (paramFlags.has(token) || newerRe.test(token)) {
          const next = args[i + 1]
          if (next) {
            out.push(next)
            i++
          }
        }
        continue
      }
      if (!sawNonFlag) out.push(token)
    }
    return out.length > 0 ? out : ['.']
  },
  mkdir: args => args.filter(a => a && !a.startsWith('-')),
  touch: args => args.filter(a => a && !a.startsWith('-')),
  rm: args => args.filter(a => a && !a.startsWith('-')),
  rmdir: args => args.filter(a => a && !a.startsWith('-')),
  mv: args => args.filter(a => a && !a.startsWith('-')),
  cp: args => args.filter(a => a && !a.startsWith('-')),
  cat: args => args.filter(a => a && !a.startsWith('-')),
  head: args => args.filter(a => a && !a.startsWith('-')),
  tail: args => args.filter(a => a && !a.startsWith('-')),
  sort: args => args.filter(a => a && !a.startsWith('-')),
  uniq: args => args.filter(a => a && !a.startsWith('-')),
  wc: args => args.filter(a => a && !a.startsWith('-')),
  cut: args => args.filter(a => a && !a.startsWith('-')),
  paste: args => args.filter(a => a && !a.startsWith('-')),
  column: args => args.filter(a => a && !a.startsWith('-')),
  file: args => args.filter(a => a && !a.startsWith('-')),
  stat: args => args.filter(a => a && !a.startsWith('-')),
  diff: args => args.filter(a => a && !a.startsWith('-')),
  awk: args => args.filter(a => a && !a.startsWith('-')),
  strings: args => args.filter(a => a && !a.startsWith('-')),
  hexdump: args => args.filter(a => a && !a.startsWith('-')),
  od: args => args.filter(a => a && !a.startsWith('-')),
  base64: args => args.filter(a => a && !a.startsWith('-')),
  nl: args => args.filter(a => a && !a.startsWith('-')),
  sha256sum: args => args.filter(a => a && !a.startsWith('-')),
  sha1sum: args => args.filter(a => a && !a.startsWith('-')),
  md5sum: args => args.filter(a => a && !a.startsWith('-')),
  tr: args => {
    const hasDelete = args.some(
      a =>
        a === '-d' ||
        a === '--delete' ||
        (a.startsWith('-') && a.includes('d')),
    )
    const cleaned = args.filter(a => a && !a.startsWith('-'))
    return cleaned.slice(hasDelete ? 1 : 2)
  },
  grep: args =>
    extractPathArgsForShellCommand(
      args,
      new Set([
        '-e',
        '--regexp',
        '-f',
        '--file',
        '--exclude',
        '--include',
        '--exclude-dir',
        '--include-dir',
        '-m',
        '--max-count',
        '-A',
        '--after-context',
        '-B',
        '--before-context',
        '-C',
        '--context',
      ]),
    ),
  rg: args =>
    extractPathArgsForShellCommand(
      args,
      new Set([
        '-e',
        '--regexp',
        '-f',
        '--file',
        '-t',
        '--type',
        '-T',
        '--type-not',
        '-g',
        '--glob',
        '-m',
        '--max-count',
        '--max-depth',
        '-r',
        '--replace',
        '-A',
        '--after-context',
        '-B',
        '--before-context',
        '-C',
        '--context',
      ]),
      ['.'],
    ),
  sed: args => {
    const out: string[] = []
    let skipNext = false
    let sawExpression = false
    for (let i = 0; i < args.length; i++) {
      if (skipNext) {
        skipNext = false
        continue
      }
      const token = args[i]
      if (!token) continue
      if (token.startsWith('-')) {
        if (token === '-f' || token === '--file') {
          const next = args[i + 1]
          if (next) {
            out.push(next)
            skipNext = true
            sawExpression = true
          }
        } else if (token === '-e' || token === '--expression') {
          skipNext = true
          sawExpression = true
        } else if (token.includes('e') || token.includes('f')) {
          sawExpression = true
        }
        continue
      }
      if (!sawExpression) {
        sawExpression = true
        continue
      }
      out.push(token)
    }
    return out
  },
  jq: args => {
    const out: string[] = []
    const flags = new Set([
      '-e',
      '--expression',
      '-f',
      '--from-file',
      '--arg',
      '--argjson',
      '--slurpfile',
      '--rawfile',
      '--args',
      '--jsonargs',
      '-L',
      '--library-path',
      '--indent',
      '--tab',
    ])
    let sawExpression = false
    for (let i = 0; i < args.length; i++) {
      const token = args[i]
      if (token === undefined || token === null) continue
      if (token.startsWith('-')) {
        const flag = token.split('=')[0]
        if (flag && (flag === '-e' || flag === '--expression'))
          sawExpression = true
        if (flag && flags.has(flag) && !token.includes('=')) i++
        continue
      }
      if (!sawExpression) {
        sawExpression = true
        continue
      }
      out.push(token)
    }
    return out
  },
  git: args => {
    if (args.length >= 1 && args[0] === 'diff') {
      if (args.includes('--no-index')) {
        return args
          .slice(1)
          .filter(a => a && !a.startsWith('-'))
          .slice(0, 2)
      }
    }
    return []
  },
}

export const PATH_COMMANDS = new Set(Object.keys(PATH_COMMAND_ARG_EXTRACTORS))

export const COMMAND_PATH_BEHAVIOR: Record<string, BashPathOp> = {
  cd: 'read',
  ls: 'read',
  find: 'read',
  mkdir: 'create',
  touch: 'create',
  rm: 'write',
  rmdir: 'write',
  mv: 'write',
  cp: 'write',
  cat: 'read',
  head: 'read',
  tail: 'read',
  sort: 'read',
  uniq: 'read',
  wc: 'read',
  cut: 'read',
  paste: 'read',
  column: 'read',
  tr: 'read',
  file: 'read',
  stat: 'read',
  diff: 'read',
  awk: 'read',
  strings: 'read',
  hexdump: 'read',
  od: 'read',
  base64: 'read',
  nl: 'read',
  grep: 'read',
  rg: 'read',
  sed: 'write',
  git: 'read',
  jq: 'read',
  sha256sum: 'read',
  sha1sum: 'read',
  md5sum: 'read',
}

export const COMMAND_DESCRIPTIONS: Record<string, string> = {
  cd: 'change directories to',
  ls: 'list files in',
  find: 'search files in',
  mkdir: 'create directories in',
  touch: 'create or modify files in',
  rm: 'remove files from',
  rmdir: 'remove directories from',
  mv: 'move files to/from',
  cp: 'copy files to/from',
  cat: 'concatenate files from',
  head: 'read the beginning of files from',
  tail: 'read the end of files from',
  sort: 'sort contents of files from',
  uniq: 'filter duplicate lines from files in',
  wc: 'count lines/words/bytes in files from',
  cut: 'extract columns from files in',
  paste: 'merge files from',
  column: 'format files from',
  tr: 'transform text from files in',
  file: 'examine file types in',
  stat: 'read file stats from',
  diff: 'compare files from',
  awk: 'process text from files in',
  strings: 'extract strings from files in',
  hexdump: 'display hex dump of files from',
  od: 'display octal dump of files from',
  base64: 'encode/decode files from',
  nl: 'number lines in files from',
  grep: 'search for patterns in files from',
  rg: 'search for patterns in files from',
  sed: 'edit files in',
  git: 'access files with git from',
  jq: 'process JSON from files in',
  sha256sum: 'compute SHA-256 checksums for files in',
  sha1sum: 'compute SHA-1 checksums for files in',
  md5sum: 'compute MD5 checksums for files in',
}
