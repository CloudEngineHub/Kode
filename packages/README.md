# Internal packages

Kode is published as one main npm package, but its implementation is divided
into workspace modules:

- `config`: settings, schemas, migrations, and data roots.
- `core`: orchestration, permissions, providers, MCP, and sessions.
- `protocol`: persisted and transport contracts.
- `runtime`: process, shell, sandbox, and background-task primitives.
- `tools`: built-in capability definitions and implementations.
- `client`: daemon client helpers.
- `builtin-skills`: runtime knowledge shipped with the main package.
- `kode-bin-*` and `kode-ripgrep-*`: generated platform package manifests;
  their binaries are created during release and are not committed.

Workspace packages are private implementation modules. The only external
integration surfaces are the `protocol` and `daemon-client` subpath exports
declared in the root `package.json` and built under `dist/sdk/**`.

The intended dependency direction is host → core → tools/runtime/config/protocol.
Runtime and protocol must not import a host. Some tools still carry Ink rendering
code; that is known migration debt rather than the desired module seam.
