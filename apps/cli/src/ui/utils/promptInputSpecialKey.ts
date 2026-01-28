import type { Key } from '#ui-ink/hooks/useKeypress'
import type { InputShortcut } from './permissionModeCycleShortcut'

type KeyWithOption = Key & { option?: boolean }

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

  if (
    args.inputChar === 'µ' ||
    args.inputChar === 'μ' ||
    (optionOrMeta && (args.inputChar === 'm' || args.inputChar === 'M')) ||
    (args.key.ctrl && (args.inputChar === 'm' || args.inputChar === 'M'))
  ) {
    return 'modelSwitch'
  }

  if (
    args.inputChar === '\x07' ||
    args.inputChar === '©' ||
    (args.key.ctrl && (args.inputChar === 'g' || args.inputChar === 'G')) ||
    (optionOrMeta && (args.inputChar === 'g' || args.inputChar === 'G'))
  ) {
    return 'externalEditor'
  }

  if (
    args.inputChar === '\x02' ||
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
