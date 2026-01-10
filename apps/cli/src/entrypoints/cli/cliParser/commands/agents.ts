import { cwd } from 'process'
import type { Command } from '@commander-js/extra-typings'

import { setup } from '../../setup'

type AgentsValidateOptions = {
  cwd?: string
  json?: boolean
  toolsCheck?: boolean
}

export function registerAgentsCommands(program: Command): void {
  const agentsCmd = program
    .command('agents')
    .description('Agent utilities (validate templates, etc.)')

  agentsCmd
    .command('validate [paths...]')
    .description(
      'Validate agent markdown files (defaults to user+project agent dirs)',
    )
    .option('--cwd <cwd>', 'The current working directory', String, cwd())
    .option('--json', 'Output as JSON')
    .option(
      '--no-tools-check',
      'Skip validating tool names against the tool registry',
    )
    .action(
      async (paths: string[] | undefined, options: AgentsValidateOptions) => {
        try {
          const workingDir =
            typeof options?.cwd === 'string' ? options.cwd : cwd()
          await setup(workingDir, false)
          const { validateAgentTemplates } =
            await import('../../agentsValidate')
          const report = await validateAgentTemplates({
            cwd: workingDir,
            paths: Array.isArray(paths) ? paths : [],
            checkTools: options.toolsCheck !== false,
          })

          if (options.json) {
            console.log(JSON.stringify(report, null, 2))
            process.exitCode = report.ok ? 0 : 1
            return
          }

          console.log(
            `Validated ${report.results.length} agent file(s): ${report.errorCount} error(s), ${report.warningCount} warning(s)\n`,
          )

          for (const r of report.results) {
            const rel = r.filePath
            const title = r.agentType ? `${r.agentType}` : '(unknown agent)'
            console.log(`${title} — ${rel}`)
            if (r.model) {
              const normalized = r.normalizedModel
                ? ` (normalized: ${r.normalizedModel})`
                : ''
              console.log(`  model: ${r.model}${normalized}`)
            }
            if (r.issues.length === 0) {
              console.log(`  OK`)
            } else {
              for (const issue of r.issues) {
                console.log(`  - ${issue.level}: ${issue.message}`)
              }
            }
            console.log('')
          }

          process.exitCode = report.ok ? 0 : 1
        } catch (error) {
          console.error(error instanceof Error ? error.message : String(error))
          process.exitCode = 1
        }
      },
    )
}
