import type { Key } from '#ui-ink/hooks/useKeypress'
import type { InputShortcut } from './permissionModeCycleShortcut'

type KeyWithOption = Key & { option?: boolean }

// Control characters - use charCodeAt comparison to survive minification
const CTRL_B_CODE = 2 // Ctrl+B = STX (ASCII 2)
const CTRL_G_CODE = 7 // Ctrl+G = BEL (ASCII 7)

export type PromptInputSpecialKeyAction =
  | 'modeCycle'
  | 'modelSwitch'
  | 'externalEditor'
  | 'bashModeToggle'
  | null

export function getPromptInputSpecialKeyAction(args: {
  inputChar: string
  key: KeyWithOption
  modeCycleShortcut: InputShortcut
}): PromptInputSpecialKeyAction {
  if (args.modeCycleShortcut.check(args.inputChar, args.key)) {
    return 'modeCycle'
  }

  const optionOrMeta = Boolean(args.key.meta) || Boolean(args.key.option)
  const charCode =
    args.inputChar.length === 1 ? args.inputChar.charCodeAt(0) : -1

  if (
    args.inputChar === 'µ' ||
    args.inputChar === 'μ' ||
    (optionOrMeta && (args.inputChar === 'm' || args.inputChar === 'M')) ||
    (args.key.ctrl && (args.inputChar === 'm' || args.inputChar === 'M'))
  ) {
    return 'modelSwitch'
  }

  if (
    charCode === CTRL_G_CODE ||
    args.inputChar === '©' ||
    (args.key.ctrl && (args.inputChar === 'g' || args.inputChar === 'G')) ||
    (optionOrMeta && (args.inputChar === 'g' || args.inputChar === 'G'))
  ) {
    return 'externalEditor'
  }

  if (
    charCode === CTRL_B_CODE ||
    args.inputChar === '∫' ||
    (args.key.ctrl && (args.inputChar === 'b' || args.inputChar === 'B')) ||
    (optionOrMeta && (args.inputChar === 'b' || args.inputChar === 'B'))
  ) {
    return 'bashModeToggle'
  }

  return null
}

export function __getPromptInputSpecialKeyActionForTests(
  args: Parameters<typeof getPromptInputSpecialKeyAction>[0],
): PromptInputSpecialKeyAction {
  return getPromptInputSpecialKeyAction(args)
}
