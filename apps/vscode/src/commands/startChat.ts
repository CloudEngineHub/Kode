import * as vscode from 'vscode'

export function registerStartChatCommand(
  context: vscode.ExtensionContext,
): void {
  const disposable = vscode.commands.registerCommand('kode.startChat', () => {
    void vscode.window.showInformationMessage('Kode: chat (coming soon)')
  })
  context.subscriptions.push(disposable)
}
