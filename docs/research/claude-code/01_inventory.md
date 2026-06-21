# Claude Code package inventory (evidence anchor)

> Path placeholders:
>
> - `<CLAUDE_CODE_PKG_ROOT>`: absolute path to your local `@anthropic-ai/claude-code` package root (the directory that contains `cli.js`).

- Source root: `<CLAUDE_CODE_PKG_ROOT>`
- Updated at: `2026-01-29`
- Package: `@anthropic-ai/claude-code@2.1.22` (bundle reports `VERSION:"2.1.22"`, `BUILD_TIME:"2026-01-28T06:33:34Z"`)
- Files: `20`
- Total size (bytes): `71,552,503` (disk usage: `68M`)

## Key artifacts

| path                                       |      size | sha256                                                             |
| ------------------------------------------ | --------: | ------------------------------------------------------------------ |
| `cli.js`                                   |  11.12 MB | `da39b2c9fe9de2406e05b2f78451610416f2cba2ac624bc21d35d51a50c2d761` |
| `package.json`                             |   1.17 KB | `28e9d517812a0e4184e26af8b75654470f348ce455cab1a3589c20d1de545744` |
| `README.md`                                |   1.99 KB | `9c121f2b01db7f62e3b75e400c8846857b4c32976083ae5a7b2cf6939876c17e` |
| `LICENSE.md`                               |     147 B | `8ce94b9478bb9868f9641f818e06cd722fbe55d4c22e2d2ed11971b20146173a` |
| `sdk-tools.d.ts`                           |  66.01 KB | `a380ff8f854c44973766db5165ff9440eee2547a9dea6e0bc4607b9a0658ba45` |
| `resvg.wasm`                               |   2.36 MB | `22bf6e9f9a100d972da0411a69c5ba504367fc1fa87b3b64e3f35e53926d2d70` |
| `tree-sitter.wasm`                         | 200.68 KB | `0ce0c1e5ecd6ca51cf0ee32bd06012c14133332f1e28423f322cdabf9e061637` |
| `tree-sitter-bash.wasm`                    |   1.32 MB | `364f0a2cd385c792239423026ef442dbd073d34c396b7bc9e5932426b8e4aa5d` |
| `vendor/ripgrep/COPYING`                   |     126 B | `01c266bced4a434da0051174d6bee16a4c82cf634e2679b6155d40d75012390f` |
| `vendor/ripgrep/arm64-darwin/rg`           |   4.19 MB | `f052af072a844ef3a2189a269da0c061fc90750ce85af7e91e8c8fcc88047a40` |
| `vendor/ripgrep/arm64-darwin/ripgrep.node` |   5.90 MB | `920cdefc6184643ddabdd3d34c5544e6bb3a3a65fa8b7361ab1cb168648747d1` |
| `vendor/ripgrep/x64-darwin/rg`             |   4.92 MB | `923dcc25cab57d33f4e7dd0476d4b74a554401a38817e246a8d6101dcd51c50f` |
| `vendor/ripgrep/x64-darwin/ripgrep.node`   |   5.85 MB | `c0b043a1507e140487ec699ba4a8f9158df6cf83207116eaf1b2735bb19bb0f9` |

## Notes

- This inventory is the version/hash anchor for all later “no-hallucination” citations and diffs.
- Some older research notes in this repo were authored against earlier Claude Code versions; prefer string search needles + sha pinning over line-number citations when the installed artifact differs.
- Do not edit files under the Claude Code install directory; store only derived artifacts under this repo.
