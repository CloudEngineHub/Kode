# Claude Code package files — roles & evidence map

- Package root (analyzed): `<CLAUDE_CODE_PKG_ROOT>`
- Package version: `@anthropic-ai/claude-code@2.1.6`
- Package inventory anchor: `docs/research/claude-code/01_inventory.json`

> Rule: Every “role/mechanism” claim below is tied to either (a) file contents, or (b) a literal-string-backed snippet extracted from `cli.js`.

## `README.md`

- Meta (T01): sha256=5e22a6ce805db8c1301dce3a89c1089af5f9df7d76db7bbc08dc27d0809071fe, size=1986
- Observed role: Human-facing introduction + install/run instructions + links to official docs + bug reporting & data policy pointers.
- Evidence (verbatim excerpt):
  > # Claude Code
  >
  > ![](https://img.shields.io/badge/Node.js-18%2B-brightgreen?style=flat-square) [![npm]](https://www.npmjs.com/package/@anthropic-ai/claude-code)
  >
  > [npm]: https://img.shields.io/npm/v/@anthropic-ai/claude-code.svg?style=flat-square
  >
  > Claude Code is an agentic coding tool that lives in your terminal, understands your codebase, and helps you code faster by executing routine tasks, explaining complex code, and handling git workflows -- all through natural language commands. Use it in your terminal, IDE, or tag @claude on Github.
  >
  > **Learn more in the [official documentation](https://code.claude.com/docs/en/overview)**.
  >
  > <img src="https://github.com/anthropics/claude-code/blob/main/demo.gif?raw=1" />
  >
  > ## Get started
  >
  > 1. Install Claude Code:
  >
  > ```sh
  > npm install -g @anthropic-ai/claude-code
  > ```

## `LICENSE.md`

- Meta (T01): sha256=8ce94b9478bb9868f9641f818e06cd722fbe55d4c22e2d2ed11971b20146173a, size=147
- Observed role: Minimal license/legal pointer (single-line) rather than full license text.
- Evidence (verbatim):

```text
© Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.
```

## `package.json`

- Meta (T01): sha256=a50450e9cb16a6bdcdb63b2337f27054735fb7259fce12e60edce19c7e47c1f3, size=1199
- Observed role: Defines the distribution as a CLI-only npm package, with a single `bin` entrypoint and no JS dependencies.
- Evidence (selected fields, verbatim):

```json
{
  "name": "@anthropic-ai/claude-code",
  "version": "2.1.6",
  "description": "Use Claude, Anthropic's AI assistant, right from your terminal. Claude can understand your codebase, edit files, run terminal commands, and handle entire workflows for you.",
  "bin": {
    "claude": "cli.js"
  },
  "type": "module",
  "engines": {
    "node": ">=18.0.0"
  },
  "dependencies": {},
  "optionalDependencies": {
    "@img/sharp-darwin-arm64": "^0.33.5",
    "@img/sharp-darwin-x64": "^0.33.5",
    "@img/sharp-linux-arm": "^0.33.5",
    "@img/sharp-linux-arm64": "^0.33.5",
    "@img/sharp-linux-x64": "^0.33.5",
    "@img/sharp-linuxmusl-arm64": "^0.33.5",
    "@img/sharp-linuxmusl-x64": "^0.33.5",
    "@img/sharp-win32-x64": "^0.33.5"
  }
}
```

- Notes (bounded by evidence):
  - `bin.claude = "cli.js"` implies the published command is `claude` and the runtime entrypoint is this bundled file.
  - `dependencies` is empty in this package, which strongly suggests third-party runtime code is vendored/bundled into `cli.js` (verify in T05).
  - `optionalDependencies` includes platform-specific `@img/sharp-*`, consistent with image processing features mentioned in the changelog (e.g., image paste/drag).

## `bun.lock`

- Meta (T01): sha256=d6a512f5e83c303bee673f1e68f76e431e7ead8a82f46fe0baffbbbabf743398, size=551
- Observed role: Bun lock file with only optional dependency versions; no direct evidence this file is read at runtime by `cli.js` (search for a literal `bun.lock` file read in T05 if needed).
- Evidence (verbatim excerpt):

```json
{
  "lockfileVersion": 1,
  "configVersion": 1,
  "workspaces": {
    "": {
      "name": "@anthropic-ai/claude-code",
      "optionalDependencies": {
        "@img/sharp-darwin-arm64": "^0.33.5",
        "@img/sharp-darwin-x64": "^0.33.5",
        "@img/sharp-linux-arm": "^0.33.5",
        "@img/sharp-linux-arm64": "^0.33.5",
        "@img/sharp-linux-x64": "^0.33.5",
        "@img/sharp-linuxmusl-arm64": "^0.33.5",
        "@img/sharp-linuxmusl-x64": "^0.33.5",
        "@img/sharp-win32-x64": "^0.33.5"
      }
    }
  },
  "packages": {}
}
```

## `sdk-tools.d.ts`

- Meta (T01): sha256=717265233d7ebc0927517db86bd13d96cd488df5755aed0f637da218bd3be818, size=66576
- Observed role: TypeScript type declarations for SDK/tooling surface. This file is a key evidence source for tool schemas (deep analysis deferred to T04).
- Evidence: file exists in package inventory; no claim here about runtime usage.

## WASM assets (`*.wasm`)

- `resvg.wasm`: sha256=22bf6e9f9a100d972da0411a69c5ba504367fc1fa87b3b64e3f35e53926d2d70, size=2478606
- `tree-sitter.wasm`: sha256=0ce0c1e5ecd6ca51cf0ee32bd06012c14133332f1e28423f322cdabf9e061637, size=205498
- `tree-sitter-bash.wasm`: sha256=364f0a2cd385c792239423026ef442dbd073d34c396b7bc9e5932426b8e4aa5d, size=1380769
- Observed role (evidence-limited): These WASM filenames appear as literals inside `cli.js`, indicating runtime loads them from disk (details deferred to T06).
- Evidence (`cli.js` snippet around `resvg.wasm`):

```js
 as cE9}from"fs";import{dirname as pE9,join as QS0}from"path";import{tmpdir as EC7}from"os";import{fileURLToPath as zC7}from"url";function $C7(){let A=pE9(zC7(import.meta.url));return QS0(pE9(ZvA()),"resvg.wasm")}function CC7(){if(!qG()||typeof Bun>"u"||!Bun.embeddedFiles)return null;for(let A of Bun.embeddedFiles){let Q=A.name;if(Q&&Q.endsWith("resvg.wasm"))return A}return null}async function UC7(){if(AS0)return;if(qG()){let B=CC7();if(B){let G=await B.arrayBuffer(
```

- Evidence (`cli.js` snippet around `tree-sitter.wasm`):

```js
-sASSERTIONS for more info.";var Q=new WebAssembly.RuntimeError(A);throw readyPromiseReject(Q),Q}O0(abort,"abort");var wasmBinaryFile;function findWasmBinary(){if(Module.locateFile)return locateFile("tree-sitter.wasm");return new URL("tree-sitter.wasm",import.meta.url).href}O0(findWasmBinary,"findWasmBinary");function getBinarySync(A){if(A==wasmBinaryFile&&wasmBinary)return new Uint8Array(wasmBinary);if(readBinary)return readBinary(A);throw"both async and sync fetching of
```

- Evidence (`cli.js` snippet around `tree-sitter-bash.wasm`):

```js
ull}async function YD2(A){let Q=EH5(A);if(!Q)return null;let B=await Q.arrayBuffer();return new Uint8Array(B)}async function zH5(){let A=yA();if(qG()){let J=await YD2("tree-sitter.wasm"),X=await YD2("tree-sitter-bash.wasm");if(J&&X){await tyA.init({wasmBinary:J}),JFA=new tyA,YvA=await iJ1.load(X),JFA.setLanguage(YvA),k("tree-sitter: loaded from embedded"),l("tengu_tree_sitter_load",{success:!0,from_embedded:!0});return}}let B=HH5(),G=!1,Z=G?BX1(B,"web-tree-sitter","tree-sitter
```

## `vendor/ripgrep/**`

- Observed role: Bundled ripgrep binaries + a Node native addon (`ripgrep.node`) for fast search across platforms (deep mechanism analysis deferred; here we only map the packaged artifacts and a literal evidence snippet).
- Packaged files (from T01 inventory):
  - `vendor/ripgrep/COPYING` (sha256=01c266bced4a434da0051174d6bee16a4c82cf634e2679b6155d40d75012390f, size=126)
  - `vendor/ripgrep/arm64-darwin/rg` (sha256=f052af072a844ef3a2189a269da0c061fc90750ce85af7e91e8c8fcc88047a40, size=4393360)
  - `vendor/ripgrep/arm64-darwin/ripgrep.node` (sha256=920cdefc6184643ddabdd3d34c5544e6bb3a3a65fa8b7361ab1cb168648747d1, size=6183792)
  - `vendor/ripgrep/arm64-linux/rg` (sha256=717b20bd9176b6b81ecc9930d342cac9dfa3a129f194ea3923ac5a7fedad7ddf, size=5248072)
  - `vendor/ripgrep/arm64-linux/ripgrep.node` (sha256=45b787d7b3ca36c4cf9c0c3a7d92f5b182085f6bd88b942496fe772ff6e8e73b, size=4654360)
  - `vendor/ripgrep/x64-darwin/rg` (sha256=923dcc25cab57d33f4e7dd0476d4b74a554401a38817e246a8d6101dcd51c50f, size=5162504)
  - `vendor/ripgrep/x64-darwin/ripgrep.node` (sha256=c0b043a1507e140487ec699ba4a8f9158df6cf83207116eaf1b2735bb19bb0f9, size=6138416)
  - `vendor/ripgrep/x64-linux/rg` (sha256=f401154e2393f9002ac77e419f9ee5521c18f4f8cd3e32293972f493ba06fce7, size=6597984)
  - `vendor/ripgrep/x64-linux/ripgrep.node` (sha256=64c2d622043f9c75e8121a2f62f2eb8e2b5289d4b24bf7b3d873f000b159127f, size=5002216)
  - `vendor/ripgrep/x64-win32/rg.exe` (sha256=f162b54de2adfc72d78adb1dbada2dedda111ae0a5e2f6e9500f4f909664c5d2, size=5407744)
  - `vendor/ripgrep/x64-win32/ripgrep.node` (sha256=5315175fc2b13d8c1b77c8bf6bf6c724f6c58be9e93c4cd2fac77320b8d9038e, size=6965760)
- Evidence (`cli.js` snippet around `RIPGREP_NODE_PATH`):

```js
r DC9={};M5(DC9,{ripgrepMain:()=>Fw7});import{createRequire as Ww7}from"module";import{fileURLToPath as Dw7}from"url";import{dirname as Kw7,join as Vw7}from"path";function Fw7(A){let Q;if(process.env.RIPGREP_NODE_PATH)Q=NA(process.env.RIPGREP_NODE_PATH).ripgrepMain;else{let B=Vw7(Kw7(Dw7(import.meta.url)),"ripgrep.node");Q=Ww7(import.meta.url)(B).ripgrepMain}return Q(["--no-config",...A])}var KC9=()=>{};import{posix as VC9,win32 as FC9}from"path";function Hw7(){let A=proce
```

## Environment variable hooks (examples tied to packaged behavior)

- `CLAUDE_CODE_TMPDIR`: used as an override for temp directory in screenshot/clipboard flow (snippet evidence below; full behavior mapping deferred to T07/T08).

```js
enshot to clipboard.",linux:"No image found in clipboard. Use appropriate screenshot tool to copy a screenshot to clipboard."};return Q[A]||Q.linux}function JeB(){let A=process.platform,Q=process.env.CLAUDE_CODE_TMPDIR||(A==="win32"?process.env.TEMP||"C:\\Temp":"/tmp"),B="claude_cli_latest_screenshot.png",G={darwin:GZ0(Q,"claude_cli_latest_screenshot.png"),linux:GZ0(Q,"claude_cli_latest_screenshot.png"),win32:GZ0(Q,"claude_cli_latest_screenshot.png")},Z=G[A]||G.linux,Y={dar
```

- `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS`: literal appears in cli.js (snippet evidence below).

```js
e
    - Do NOT use \`/tmp\` directly - use \`/tmp/claude/\` or rely on TMPDIR instead
    - Most programs that respect TMPDIR will automatically use \`/tmp/claude/\``}function fr8(){if(n1(process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS))return"";return"\n  - You can use the `run_in_background` parameter to run the command in the background. Only use this if you don't need the result immediately and are OK being notified when the command completes later. You do not need to check the output r
```

## Optional `@img/sharp-*` (image pipeline hint)

- Observed role: Optional dependency family suggests image decoding/resizing; changelog explicitly mentions image-related fixes (see T02).
- Evidence (`cli.js` snippet around `@img/sharp`):

```js
,"webp","avif","tiff","gif","svg","jp2","dzi","image","resize","thumbnail","crop","embed","libvips","vips"],dependencies:{color:"^4.2.3","detect-libc":"^2.0.3",semver:"^7.6.3"},optionalDependencies:{"@img/sharp-darwin-arm64":"0.33.5","@img/sharp-darwin-x64":"0.33.5","@img/sharp-libvips-darwin-arm64":"1.0.4","@img/sharp-libvips-darwin-x64":"1.0.4","@img/sharp-libvips-linux-arm":"1.0.5","@img/sharp-libvips-linux-arm64":"1.0.4","@img/sharp-libvips-linux-s390x":"1.0.4",
```

## Preliminary conclusions (strictly bounded)

- The published npm package is extremely small in dependency surface: nearly all runtime logic is bundled into `cli.js` plus a few native/wasm assets and platform ripgrep binaries.
- `README.md` / `LICENSE.md` are minimal human-facing files; `bun.lock` is present but has no direct runtime-use evidence at this stage.
- Next: T04 (tool type surface via `sdk-tools.d.ts`) and T05 (full `cli.js` anatomy) should turn these artifact-level observations into concrete mechanism specs.
