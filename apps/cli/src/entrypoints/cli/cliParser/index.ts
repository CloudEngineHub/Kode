import type { RenderOptions } from 'ink'
import type { Command } from '@commander-js/extra-typings'

import { createCliProgram } from './program'

export async function parseArgs(
  stdinContent: string,
  renderContext: RenderOptions | undefined,
): Promise<Command> {
  const program = createCliProgram(stdinContent, renderContext)
  await program.parseAsync(process.argv)
  return program
}

export { createCliProgram } from './program'
