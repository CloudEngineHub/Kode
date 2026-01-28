import { randomUUID } from 'crypto'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { CACHE_PATHS, dateToFilename } from '#core/utils/log'
import type { BashGateFinding } from './dataLossRules'

export function writeGateFailureDump(args: {
  command: string
  userPrompt: string
  description: string
  findings: BashGateFinding[]
  input: string
  output?: string
  error: string
  errorType?: string
}): void {
  try {
    const dir = join(CACHE_PATHS.errors(), 'bash-llm-gate')
    mkdirSync(dir, { recursive: true })
    const filename = `${dateToFilename(new Date())}-${randomUUID()}.txt`
    const path = join(dir, filename)
    const body = [
      '=== Bash LLM gate failure ===',
      '',
      `error: ${args.error}`,
      args.errorType ? `errorType: ${args.errorType}` : '',
      '',
      '--- command ---',
      args.command,
      '',
      '--- description ---',
      args.description,
      '',
      '--- userPrompt ---',
      args.userPrompt,
      '',
      '--- findings ---',
      args.findings.length
        ? args.findings
            .map(
              f =>
                `[${f.code}] (${f.severity}/${f.category}) ${f.title}${f.evidence ? ` — ${f.evidence}` : ''}`,
            )
            .join('\n')
        : '(none)',
      '',
      '--- gate input ---',
      args.input,
      '',
      args.output !== undefined ? '--- gate output ---' : '',
      args.output ?? '',
      '',
    ]
      .filter(Boolean)
      .join('\n')
    writeFileSync(path, body, 'utf8')
  } catch {
    // Best-effort diagnostics only.
  }
}
