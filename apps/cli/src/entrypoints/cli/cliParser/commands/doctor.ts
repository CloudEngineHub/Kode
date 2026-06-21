import type { Command } from '@commander-js/extra-typings'

import { PRODUCT_NAME } from '#core/constants/product'

import { renderDoctorScreen } from '../../interactive/renderers'

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description(`Check the health of your ${PRODUCT_NAME} installation`)
    .action(async () => {
      await renderDoctorScreen()
      process.exit(0)
    })
}
