// Minimal VSCode PoC extension (CommonJS).
// Intended to be extracted into its own repository.
const vscode = require('vscode')

function escapeHtmlAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function activate(context) {
  const disposable = vscode.commands.registerCommand('kode.openWebUI', async () => {
    const url = await vscode.window.showInputBox({
      title: 'Kode WebUI URL',
      prompt: 'Paste the local WebUI URL printed by `kode --web` (includes ?token=...)',
      ignoreFocusOut: true,
      value: '',
    })

    if (!url) return

    const panel = vscode.window.createWebviewPanel(
      'kodeWebUI',
      'Kode WebUI (PoC)',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    )

    const safeUrl = escapeHtmlAttr(url)
    panel.webview.html = `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; frame-src *; connect-src *; img-src * data: blob:;" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Kode WebUI</title>
    <style>
      html, body { height: 100%; padding: 0; margin: 0; background: #0b1020; }
      iframe { width: 100%; height: 100%; border: 0; }
    </style>
  </head>
  <body>
    <iframe src="${safeUrl}" allow="clipboard-read; clipboard-write"></iframe>
  </body>
</html>`
  })

  context.subscriptions.push(disposable)
}

function deactivate() {}

module.exports = { activate, deactivate }
