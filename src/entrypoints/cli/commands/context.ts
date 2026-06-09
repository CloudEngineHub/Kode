import type { Command } from '@commander-js/extra-typings'
import { cwd } from 'process'
import { PRODUCT_COMMAND } from '@constants/product'
import { getContext, removeContext, setContext } from '@context'
import { setup } from '../setup'
import { omitKeys } from '../commandContext'

export function registerContextCommands(program: Command): void {
  const contextCmd = program
    .command('context')
    .description(
      `Set static context (eg. ${PRODUCT_COMMAND} context add-file ./src/*.py)`,
    )

  contextCmd
    .command('get <key>')
    .option('--cwd <cwd>', 'The current working directory', String, cwd())
    .description('Get a value from context')
    .action(async (key, { cwd }) => {
      await setup(cwd, false)

      const context = omitKeys(
        await getContext(),
        'codeStyle',
        'directoryStructure',
      )
      console.log(context[key])
      process.exit(0)
    })

  contextCmd
    .command('set <key> <value>')
    .description('Set a value in context')
    .option('--cwd <cwd>', 'The current working directory', String, cwd())
    .action(async (key, value, { cwd }) => {
      await setup(cwd, false)

      setContext(key, value)
      console.log(`Set context.${key} to "${value}"`)
      process.exit(0)
    })

  contextCmd
    .command('list')
    .description('List all context values')
    .option('--cwd <cwd>', 'The current working directory', String, cwd())
    .action(async ({ cwd }) => {
      await setup(cwd, false)

      const context = omitKeys(
        await getContext(),
        'codeStyle',
        'directoryStructure',
        'gitStatus',
      )
      console.log(JSON.stringify(context, null, 2))
      process.exit(0)
    })

  contextCmd
    .command('remove <key>')
    .description('Remove a value from context')
    .option('--cwd <cwd>', 'The current working directory', String, cwd())
    .action(async (key, { cwd }) => {
      await setup(cwd, false)

      removeContext(key)
      console.log(`Removed context.${key}`)
      process.exit(0)
    })
}
