export type CommandShortcutHint = {
  trigger: string
  effect: string
}

export type CommandShortcutHints = {
  commands: readonly CommandShortcutHint[]
  shortcuts: readonly CommandShortcutHint[]
}

export function getShortcutModifierLabel(
  platform = process.platform,
): 'Alt' | 'Option' {
  return platform === 'darwin' ? 'Option' : 'Alt'
}

export function getCommandShortcutHints(
  platform = process.platform,
): CommandShortcutHints {
  const modifier = getShortcutModifierLabel(platform)

  return {
    commands: [
      { trigger: '/init', effect: 'create AGENTS.md' },
      { trigger: '/help', effect: 'open help' },
      { trigger: '/bash <cmd>', effect: 'run shell command' },
      { trigger: '/note <text>', effect: 'save note to AGENTS.md' },
    ],
    shortcuts: [
      { trigger: `${modifier}+M`, effect: 'switch model' },
      { trigger: `${modifier}+G`, effect: 'open external editor' },
    ],
  }
}
