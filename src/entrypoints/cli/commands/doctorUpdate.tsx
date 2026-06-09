import React from 'react'
import type { Command } from '@commander-js/extra-typings'
import { PRODUCT_NAME } from '@constants/product'
import { Doctor } from '@screens/Doctor'
import { MACRO } from '@constants/macros'

export function registerDoctorAndUpdateCommands(program: Command): void {
  program
    .command('doctor')
    .description(`Check the health of your ${PRODUCT_NAME} installation`)
    .action(async () => {
      await new Promise<void>(resolve => {
        ;(async () => {
          const { render } = await import('ink')
          render(<Doctor onDone={() => resolve()} doctorMode={true} />)
        })()
      })
      process.exit(0)
    })

  program
    .command('update')
    .description('Show manual upgrade commands (no auto-install)')
    .action(async () => {
      console.log(`Current version: ${MACRO.VERSION}`)
      console.log('Checking for updates...')

      const { getLatestVersion, getUpdateCommandSuggestions } =
        await import('@utils/session/autoUpdater')
      const latestVersion = await getLatestVersion()

      if (!latestVersion) {
        console.error('Failed to check for updates')
        process.exit(1)
      }

      if (latestVersion === MACRO.VERSION) {
        console.log(`${PRODUCT_NAME} is up to date`)
        process.exit(0)
      }

      console.log(`New version available: ${latestVersion}`)
      const cmds = await getUpdateCommandSuggestions()
      console.log('\nRun one of the following commands to update:')
      for (const c of cmds) console.log(`  ${c}`)
      if (process.platform !== 'win32') {
        console.log(
          '\nNote: you may need to prefix with "sudo" on macOS/Linux.',
        )
      }
      process.exit(0)
    })
}
