import { type Option } from '@inkjs/ui'
import chalk from 'chalk'
import {
  type ToolUseConfirm,
  toolUseConfirmGetPrefix,
} from './PermissionRequest'
import { isUnsafeCompoundCommand } from '@utils/commands'
import { getCwd } from '@utils/state'
import { getTheme } from '@utils/theme'
import { type OptionSubtree } from '@components/CustomSelect/select'

const SHELL_KEYWORD_PREFIXES = new Set([
  // Shell control keywords: allowlisting these as a "prefix" is usually too broad/misleading.
  'for',
  'if',
  'while',
  'until',
  'case',
  'select',
  'function',
  'do',
  'then',
  'elif',
  'else',
  'fi',
  'done',
])

/**
 * Generates options for the tool use confirmation dialog
 */
export function toolUseOptions({
  toolUseConfirm,
  command,
}: {
  toolUseConfirm: ToolUseConfirm
  command: string
}): (Option | OptionSubtree)[] {
  // Hide "don't ask again" options if the command is an unsafe compound command, or a potential command injection
  const showDontAskAgainOption =
    !isUnsafeCompoundCommand(command) &&
    toolUseConfirm.commandPrefix &&
    !toolUseConfirm.commandPrefix.commandInjectionDetected
  const prefix = toolUseConfirmGetPrefix(toolUseConfirm)
  const prefixBase =
    typeof prefix === 'string' ? prefix.trim().split(/\s+/)[0] : null
  const preferFullCommandOverPrefix =
    typeof prefixBase === 'string' && SHELL_KEYWORD_PREFIXES.has(prefixBase)
  const showDontAskAgainPrefixOption =
    showDontAskAgainOption && prefix !== null && !preferFullCommandOverPrefix

  let dontShowAgainOptions: (Option | OptionSubtree)[] = []
  if (showDontAskAgainPrefixOption) {
    // Prefix option takes precedence over full command option
    dontShowAgainOptions = [
      {
        label: `Yes, and don't ask again for commands starting with ${chalk.bold(prefix)} in ${chalk.bold(getCwd())}`,
        value: 'yes-dont-ask-again-prefix',
      },
    ]
  } else if (showDontAskAgainOption) {
    dontShowAgainOptions = [
      {
        label: `Yes, and don't ask again for this exact command in ${chalk.bold(getCwd())}`,
        value: 'yes-dont-ask-again-full',
      },
    ]
  }

  return [
    {
      label: 'Yes',
      value: 'yes',
    },
    ...dontShowAgainOptions,
    {
      label: `No, and provide instructions (${chalk.bold.hex(getTheme().warning)('esc')})`,
      value: 'no',
    },
  ]
}
