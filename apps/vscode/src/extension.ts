import type { ExtensionContext } from 'vscode'

import { registerStartChatCommand } from './commands/startChat'

export function activate(context: ExtensionContext) {
  registerStartChatCommand(context)
}

export function deactivate() {}
