# VSCode PoC (extractable)

This folder contains a minimal VSCode extension proof-of-concept that is intended to live in a **separate repo** eventually.

Goal: **do not re-implement Kode core** in the extension. Instead, the extension connects to the local Kode daemon/WebUI and renders it in a VSCode webview.

This PoC is intentionally thin:
- No agent logic, no tools, no protocol parsing.
- The “backend” is the local Kode daemon started by `kode --web`.

## How it works

- Run Kode with `--web` to start the daemon and print a local WebUI URL (includes a token).
- In VSCode, run the command **“Kode: Open WebUI (PoC)”** and paste the URL.
- The extension opens a webview and loads the WebUI URL in an iframe.

## Use (inside this monorepo)

- Start Kode: `kode --web` (or `bun apps/kode/src/index.ts --web` while developing).
- Open `examples/vscode` as the VSCode workspace folder.
- Press `F5` to launch the Extension Development Host.
- In the Dev Host: run **“Kode: Open WebUI (PoC)”** and paste the URL printed by `kode --web`.

## Extract to a separate repo

- Copy `examples/vscode` into a new repo (or new folder).
- Open that folder in VSCode.
- Press `F5` to launch the Extension Development Host.

Notes:
- There are no runtime dependencies; installing packages is optional.
- This PoC uses an iframe. If your environment blocks it, open the printed URL in a browser instead.
