# Claude Code WASM assets — loading, call sites, UX impact (evidence-based)

- Claude package root: `<CLAUDE_CODE_PKG_ROOT>`
- Claude cli.js: `<CLAUDE_CODE_PKG_ROOT>/cli.js` (sha256: `b34653bf5caebdafe4d8baed2997166b5e9bb787a87dcc37a262d2ef649b98ea`)

## Assets (package-level facts)

- `resvg.wasm`: sha256=`22bf6e9f9a100d972da0411a69c5ba504367fc1fa87b3b64e3f35e53926d2d70`, size=`2478606`
- `tree-sitter.wasm`: sha256=`0ce0c1e5ecd6ca51cf0ee32bd06012c14133332f1e28423f322cdabf9e061637`, size=`205498`
- `tree-sitter-bash.wasm`: sha256=`364f0a2cd385c792239423026ef442dbd073d34c396b7bc9e5932426b8e4aa5d`, size=`1380769`

## Shared helpers (build gate + installation path)

### `qG()` (Bun + embeddedFiles gate)

- Evidence anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:26` (definition)

```js
function dAA() {
  return process.versions.bun !== void 0
}
function qG() {
  return (
    dAA() && Array.isArray(Bun?.embeddedFiles) && Bun.embeddedFiles.length > 0
  )
}
```

### `ZvA()` (invoked binary/script path)

- Evidence anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:2388` (definition)

```js
function ZvA() {
  try {
    if (qG()) return process.execPath || 'unknown'
    return process.argv[1] || 'unknown'
  } catch {
    return 'unknown'
  }
}
```

- In the loaders below, `dirname(ZvA())` is used as the base directory for disk lookups (see `resvg.wasm`’s `$C7()` and tree-sitter’s `HH5()` excerpts).

## 1) `resvg.wasm`

### 1.1 Loading point evidence

- Evidence anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:4107` (excerpt around `resvg.wasm`)

```js
245,b:67},94:{r:59,g:142,b:234},95:{r:214,g:112,b:214},96:{r:41,g:184,b:219},97:{r:255,g:255,b:255}},z8A={r:229,g:229,b:229},eP0={r:30,g:30,b:30}});import{unlinkSync as FC7,mkdirSync as HC7,existsSync as BS0,readFileSync as cE9}from"fs";import{dirname as pE9,join as QS0}from"path";import{tmpdir as EC7}from"os";import{fileURLToPath as zC7}from"url";function $C7(){let A=pE9(zC7(import.meta.url));return QS0(pE9(ZvA()),"resvg.wasm")}function CC7(){if(!qG()||typeof Bun>"u"||!Bun.embeddedFiles)return null;for(let A of Bun.embeddedFiles){let Q=A.name;if(Q&&Q.endsWith("resvg.wasm"))return A}return null}async function UC7(){if(AS0)return;if(qG()){let B=CC7();if(B){let G=await B.arrayBuffer();await tP0(new Uint8Array(G)),AS0=!0;return}}let A=$C7();if(!BS0(A))throw Error(`resvg WASM file not found at: ${A}`);let Q=cE9(A);await tP0(Q),AS0=!0}async function qC7(){if(QC1)return[QC1];let A=CQ(),Q=[];if(A==="macos")Q.push("/System/Library/Fonts/Menlo.ttc","/System/Library/Fonts/Monaco.dfont","/Library/Fonts/Courier New.ttf");else if(A==="linux")Q.push("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf","/usr/share/fonts/TTF/DejaVuSansMono.ttf","/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf","/usr/share/fonts/truetype/ubuntu/UbuntuMono-R.ttf");else if(A==="windows")Q.push("C:\\Windows\\Fonts\\consola.ttf","C:\\Windows\\Fonts\\cour.ttf");for(let B of Q)try{if(BS0(B))return QC1=cE9(B),[QC1]}catch{}return[]}async function lE9(A,Q){if(!qG())return{success:!1,message:"Screenshot copying is not available in this build"};try{await UC7();let B=QS0(EC7(),"claude-code-screenshots");if(!BS0(B))HC7(B,{recursive:
```

### 1.2 WASM wrapper evidence (`tP0` init guard, `hE9` constructor, PNG export)

- Evidence anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:4099` (excerpt; init is single-use and references `initWasm()`)

```js
;(IC7,
  (sP0 = !1),
  (tP0 = async A => {
    if (sP0)
      throw Error(
        'Already initialized. The `initWasm()` function can be used only once.',
      )
    ;(await IC7(await A), (sP0 = !0))
  }),
  hE9)
```

- Evidence anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:4099` (excerpt; the underlying init helper defaults to `index_bg.wasm` when called without an explicit input)

```js
async function fE9(A) {
  if (B4 !== void 0) return B4
  if (typeof A > 'u') A = new URL('index_bg.wasm', void 0)
  let Q = YC7()
  if (
    typeof A === 'string' ||
    (typeof Request === 'function' && A instanceof Request) ||
    (typeof URL === 'function' && A instanceof URL)
  )
    A = fetch(A)
  JC7(Q)
  let { instance: B, module: G } = await ZC7(await A, Q)
  return XC7(B, G)
}
```

- Evidence anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:4099` (excerpt; constructor requires init and passes JSON options + optional `fontBuffers`)

```js
IC7=fE9,hE9=class extends GC7{constructor(A,Q){if(!sP0)throw Error("Wasm has not been initialized. Call `initWasm()` function.");let B=Q?.font;if(!!B&&WC7(B)){let G={...Q,font:{...B,fontBuffers:void 0}};super(A,JSON.stringify(G),B.fontBuffers)}else super(A,JSON.stringify(Q))}}});
```

- Evidence anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:4099` (excerpt; `.render()` produces `QC7` and `.asPng()` calls into the WASM exports)

```js
resvg_width(this.__wbg_ptr)}get height(){return B4.resvg_height(this.__wbg_ptr)}render(){try{let G=B4.__wbindgen_add_to_stack_pointer(-16);B4.resvg_render(G,this.__wbg_ptr);var A=AH()[G/4+0],Q=AH()[G/4+1],B=AH()[G/4+2];if(B)throw Nc(Q);return QC7.__wrap(A)}finally{B4.__wbindgen_add_to_stack_pointer(16)}}toString(){let A,Q;try{let Z=B4.__wbindgen_add_to_stack_pointer(-16);B4.resvg_toString(Z,this.__wbg_ptr);var B=AH()[Z/4+0],G=AH()[Z/4+1
```

```js
.__wbg_ptr)>>>0}get height(){return B4.renderedimage_height(this.__wbg_ptr)>>>0}asPng(){try{let Z=B4.__wbindgen_add_to_stack_pointer(-16);B4.renderedimage_asPng(Z,this.__wbg_ptr);var Q=AH()[Z/4+0],B=AH()[Z/4+1],G=AH()[Z/4+2];if(G)throw Nc(B);return Nc(Q)}finally{B4.__wbindgen_add_to_stack_pointer(16)}}get pixels(){let Q=B4.renderedimage_pixels(this.__wbg_ptr);return Nc(Q)}},BC7,GC7=class{__destroy_into_raw(){let A=this.__wbg_ptr;return
```

### 1.3 SVG generation evidence (ANSI → SVG string)

- Evidence anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:4100` (excerpt around `function mE9(...)` and ANSI parsing)

```js
`);for(let G of B){let Z=[],Y=z8A,J=!1,X=0;while(X<G.length){if(G[X]==="\x1B"&&G[X+1]==="["){let D=X+2;while(D<G.length&&!/[A-Za-z]/.test(G[D]))D++;if(G[D]==="m"){let K=G.slice(X+2,D).split(";").map(Number),V=0;while(V<K.length){let F=K[V];if(F===0)Y=z8A,J=!1;else if(F===1)J=!0;else if(F>=30&&F<=37)Y=uE9[F]||z8A;else if(F>=90&&F<=97)Y=uE9[F]||z8A;else if(F===39)Y=z8A;else if(F===38){if(K[V+1]===5&&K[V+2]!==void 0){let H=K[V+2];Y=KC7(H),V+=2}else if(K[V+1]===2&&K[V+2]!==void 0&&K[V+3]!==void 0&&K[V+4]!==void 0)Y={r:K[V+2],g:K[V+3],b:K[V+4]},V+=4}V++}}X=D+1;continue}let I=X;while(X<G.length&&G[X]!=="\x1B")X++;let W=G.slice(I,X);if(W)Z.push({text:W,color:Y,bold:J})}if(Z.length===0)Z.push({text:"",color:z8A,bold:!1});Q.push(Z)}return Q}function KC7(A){if(A<16)return[{r:0,g:0,b:0},{r:128,g:0,b:0},{r:0,g:128,b:0},{r:128,g:128,b:0},{r:0,g:0,b:128},{r:128,g:0,b:128},{r:0,g:128,b:128},{r:192,g:192,b:192},{r:128,g:128,b:128},{r:255,g:0,b:0},{r:0,g:255,b:0},{r:255,g:255,b:0},{r:0,g:0,b:255},{r:255,g:0,b:255},{r:0,g:255,b:255},{r:255,g:255,b:255}][A]||z8A;if(A<232){let B=A-16,G=Math.floor(B/36),Z=Math.floor(B%36/6),Y=B%6;return{r:G===0?0:55+G*40,g:Z===0?0:55+Z*40,b:Y===0?0:55+Y*40}}let Q=(A-232)*10+8;return{r:Q,g:Q,b:Q}}function VC7(A){return A.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;")}function mE9(A,Q={}){let{fontFamily:B="Menlo, Monaco, monospace",fontSize:G=14,lineHeight:Z=22,paddingX:Y=24,paddingY:J=24,backgroundColor:X=`rgb(${eP0.r}, ${eP0.g}, ${eP0.b})`,borderRadius:I=8}=Q,W=DC7(A);while(W.length>0&&W[W.length-1].every((E)=>E.text.trim()===""))W.pop();let D=G*0.6,K=Math.max(...W.map((E)=>E.reduce((z,$)=>z+$.text.length,0))),V=Math.ceil(K*D+Y*2),F=W.length*Z+J*2,H=`<svg xmlns="http://www.w3.org/2000/svg" width="${V}" height="${F}" viewBox="0 0 ${V} ${F}">
```

### 1.4 Call point evidence (render → PNG)

- Evidence anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:4107` (excerpt around `.render().asPng()`)

```js
Windows\\Fonts\\consola.ttf","C:\\Windows\\Fonts\\cour.ttf");for(let B of Q)try{if(BS0(B))return QC1=cE9(B),[QC1]}catch{}return[]}async function lE9(A,Q){if(!qG())return{success:!1,message:"Screenshot copying is not available in this build"};try{await UC7();let B=QS0(EC7(),"claude-code-screenshots");if(!BS0(B))HC7(B,{recursive:!0});let G=Date.now(),Z=mE9(A,Q),Y=QS0(B,`screenshot-${G}.png`),J=await qC7(),W=new hE9(Z,{fitTo:{mode:"zoom",value:4},font:{fontBuffers:J,defaultFontFamily:"Menlo",monospaceFamily:"Menlo"}}).render().asPng();kB(Y,W);let D=await NC7(Y);try{FC7(Y)}catch{}return D}catch(B){return e(B instanceof Error?B:Error(String(B))),{success:!1,message:`Failed to copy screenshot: ${B instanceof Error?B.message:"Unknown error"}`}}}async function NC7(A){let Q=CQ();if(Q==="macos"){let G=`set the clipboard to (read (POSIX file "${A.replace(/\\/g,"\\\\").replace(/"/g,"\\\"")}") as «class PNGf»)`,Z=await t2("osascript",["-e",G],{timeout:5000});if(Z.code===0)return{success:!0,message:"Screenshot copied to clipboard"};return{success:!1,message:`Failed to copy to clipboard: ${Z.stderr}`}}if(Q==="linux"){if((await t2("xclip",["-selection","clipboard","-t","image/png","-i",A],{timeout:5000})).code===0)return{success:!0,message:"Screenshot copied to clipboard"};if((await t2("xsel",["--clipboard","--input","--type","image/png"],{timeout:5000})).code===0)return{success:!0,message:"Screenshot copied to clipboard"};return
```

### 1.5 Trigger point evidence (Stats UI → ctrl+s → copy)

- Evidence anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:4107` (excerpt around `ctrl+s` binding + `SC7` → `lE9` call)

```js
if(X0((E,z)=>{if(z.escape||z.ctrl&&(E==="c"||E==="d"))Q("Stats dialog dismissed",{display:"system"});if(z.tab)D(($)=>$==="Overview"?"Models":"Overview");if(E==="r"&&!z.ctrl&&!z.meta)Z(LC7(G));if(qG()&&z.ctrl&&E==="s"&&F)SC7(F,W,V)}),B.type==="error")
```

- Evidence anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:4107` (excerpt around `SC7` implementation)

```js
async function SC7(A, Q, B) {
  B('copying…')
  let G = xC7(A, Q),
    Z = await lE9(G)
  ;(B(Z.success ? 'copied!' : 'copy failed'), setTimeout(() => B(null), 2000))
}
function xC7(A, Q) {
  let B = []
  if (Q === 'Overview') B.push(...yC7(A))
  else B.push(...vC7(A))
  while (B.length > 0 && oE9(B[B.length - 1]).trim() === '') B.pop()
  if (B.length > 0) {
    let G = B[B.length - 1],
      Z = oE9(G).length,
      Y = Q === 'Overview' ? 70 : 80,
      J = '/stats',
      X = Math.max(2, Y - Z - 6)
    B[B.length - 1] = G + ' '.repeat(X) + D1.gray('/stats')
  }
  return B.join(`
`)
}
```

### 1.6 User-perceived effect (strictly bounded to evidence)

- The snippets above show a concrete UX affordance: in the Stats UI, when `qG()` is true, pressing `ctrl+s` invokes `SC7(...)`, which calls `lE9(...)` to generate an SVG (`mE9(...)`), render it into a PNG (`.render().asPng()`), then copy the PNG to the OS clipboard via `osascript`/`xclip`/`xsel`/`powershell`.
- When `qG()` is false, `lE9` returns `{success:false,message:"Screenshot copying is not available in this build"}` (see the `lE9` excerpt under 1.1), so this specific UX is build-gated.

## 2) `tree-sitter.wasm` + `tree-sitter-bash.wasm`

### 2.1 Loading point evidence

- Evidence anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:2388` (excerpt around `tree-sitter-bash.wasm`)

```js
alized:()=>JD2});import{fileURLToPath as WH5}from"url";import{dirname as ZD2,join as BX1}from"path";function HH5(){let A=ZD2(WH5(import.meta.url));return ZD2(ZvA())}function EH5(A){if(!qG()||typeof Bun>"u"||!Bun.embeddedFiles)return null;for(let Q of Bun.embeddedFiles){let B=Q.name;if(B&&B.endsWith(A))return Q}return null}async function YD2(A){let Q=EH5(A);if(!Q)return null;let B=await Q.arrayBuffer();return new Uint8Array(B)}async function zH5(){let A=yA();if(qG()){let J=await YD2("tree-sitter.wasm"),X=await YD2("tree-sitter-bash.wasm");if(J&&X){await tyA.init({wasmBinary:J}),JFA=new tyA,YvA=await iJ1.load(X),JFA.setLanguage(YvA),k("tree-sitter: loaded from embedded"),l("tengu_tree_sitter_load",{success:!0,from_embedded:!0});return}}let B=HH5(),G=!1,Z=G?BX1(B,"web-tree-sitter","tree-sitter.wasm"):BX1(B,"tree-sitter.wasm"),Y=G?BX1(B,"tree-sitter-bash","tree-sitter-bash.wasm"):BX1(B,"tree-sitter-bash.wasm");if(!A.existsSync(Z)||!A.existsSync(Y)){k("tree-sitter: WASM files not found"),l("tengu_tree_sitter_load",{success:!1});return}await tyA.init({locateFile:(J)=>J.endsWith("tree-sitter.wasm")?Z:J}),JFA=new tyA,YvA=await iJ1.load(A.readFileBytesSync(Y)),JFA.setLanguage(YvA),k("tree-sitter: loaded from disk"),l("tengu_tree_sitter_load",{success:!0,from_embedded:!1})}async function JD2(){if(!YK0)YK0=zH5();await YK0}async function $H5(A){if(await JD2(),!A||A.length>DH5||!JFA||!YvA)return null;try{let Q=JFA.parse(A),B=Q?.rootNode;if(!B)return null;let G=XD2(B),Z=CH5(G);return{tree:Q,rootNode:B,envVars:Z,commandNode:G,originalCommand:A}}catch{return null}}function XD2(A){let{type:Q,children:B,parent:G}=A;if(ZK0.has(Q))return A;if(Q==="variable_assignment"&&G)return G.children.find((Z)=>Z&&ZK0.has(Z.type)&&Z.startIndex>
```

- Evidence anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:2367` (excerpt around `tree-sitter.wasm`)

```js
ncy(A){if(runDependencies--,Module.monitorRunDependencies?.(runDependencies),runDependencies==0){if(dependenciesFulfilled){var Q=dependenciesFulfilled;dependenciesFulfilled=null,Q()}}}O0(removeRunDependency,"removeRunDependency");function abort(A){Module.onAbort?.(A),A="Aborted("+A+")",err(A),ABORT=!0,A+=". Build with -sASSERTIONS for more info.";var Q=new WebAssembly.RuntimeError(A);throw readyPromiseReject(Q),Q}O0(abort,"abort");var wasmBinaryFile;function findWasmBinary(){if(Module.locateFile)return locateFile("tree-sitter.wasm");return new URL("tree-sitter.wasm",import.meta.url).href}O0(findWasmBinary,"findWasmBinary");function getBinarySync(A){if(A==wasmBinaryFile&&wasmBinary)return new Uint8Array(wasmBinary);if(readBinary)return readBinary(A);throw"both async and sync fetching of the wasm failed"}O0(getBinarySync,"getBinarySync");async function getWasmBinary(A){if(!wasmBinary)try{var Q=await readAsync(A);return new Uint8Array(Q)}catch{}return getBinarySync(A)}O0(getWasmBinary,"getWasmBinary");async function instantiateArrayBuffer(A,Q){try{var B=await getWasmBinary(A),G=await WebAssembly.instantiate(B,Q);return G}catch(Z){err(`failed to asynchronously prepare wasm: ${Z}`),abort(Z)}}O0(instantiateArrayBuffer,"instantiateArrayBuffer");async function instantiateAsync(A,Q,B){if(!A&&typeof WebAssembly.instantiateStreaming=="function"&&!isFileURI(Q)&&!ENVIRONMENT_IS_NODE)try{var G=fetch(Q,{credentials:"same-origin
```

- Evidence anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:2388` (excerpt around `tree-sitter: loaded`)

```js
D2(WH5(import.meta.url));return ZD2(ZvA())}function EH5(A){if(!qG()||typeof Bun>"u"||!Bun.embeddedFiles)return null;for(let Q of Bun.embeddedFiles){let B=Q.name;if(B&&B.endsWith(A))return Q}return null}async function YD2(A){let Q=EH5(A);if(!Q)return null;let B=await Q.arrayBuffer();return new Uint8Array(B)}async function zH5(){let A=yA();if(qG()){let J=await YD2("tree-sitter.wasm"),X=await YD2("tree-sitter-bash.wasm");if(J&&X){await tyA.init({wasmBinary:J}),JFA=new tyA,YvA=await iJ1.load(X),JFA.setLanguage(YvA),k("tree-sitter: loaded from embedded"),l("tengu_tree_sitter_load",{success:!0,from_embedded:!0});return}}let B=HH5(),G=!1,Z=G?BX1(B,"web-tree-sitter","tree-sitter.wasm"):BX1(B,"tree-sitter.wasm"),Y=G?BX1(B,"tree-sitter-bash","tree-sitter-bash.wasm"):BX1(B,"tree-sitter-bash.wasm");if(!A.existsSync(Z)||!A.existsSync(Y)){k("tree-sitter: WASM files not found"),l("tengu_tree_sitter_load",{success:!1});return}await tyA.init({locateFile:(J)=>J.endsWith("tree-sitter.wasm")?Z:J}),JFA=new tyA,YvA=await iJ1.load(A.readFileBytesSync(Y)),JFA.setLanguage(YvA),k("tree-sitter: loaded from disk"),l("tengu_tree_sitter_load",{success:!0,from_embedded:!1})}async function JD2(){if(!YK0)YK0=zH5();await YK0}async function $H5(A){if(await JD2(),!A||A.length>DH5||!JFA||!YvA)return null;try{let Q=JFA.parse(A),B=Q?.rootNode;if(!B)return null;let G=XD2(B),Z=CH5(G);return{tree:Q,rootNode:B,envVars:Z,commandNode:G,originalCommand:A}}catch{return null}}function XD2(A){let{type:Q,children:B,parent:G}=A;if(ZK0.has(Q))return A;if(Q==="variable_assignment"&&G)return G.children.find((Z)=>Z&&ZK0.has(Z.type)&&Z.startIndex>A.startIndex)??null;if(Q==="pipeline"||Q==="redirected_statement")return B.find((Z)=>Z&&ZK0.has(Z.type))??null;for(let Z
```

### 2.2 Call point evidence (parse tree usage)

- Evidence anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:2388` (excerpt around `async function $H5(A)`)

```js
wasm");if(!A.existsSync(Z)||!A.existsSync(Y)){k("tree-sitter: WASM files not found"),l("tengu_tree_sitter_load",{success:!1});return}await tyA.init({locateFile:(J)=>J.endsWith("tree-sitter.wasm")?Z:J}),JFA=new tyA,YvA=await iJ1.load(A.readFileBytesSync(Y)),JFA.setLanguage(YvA),k("tree-sitter: loaded from disk"),l("tengu_tree_sitter_load",{success:!0,from_embedded:!1})}async function JD2(){if(!YK0)YK0=zH5();await YK0}async function $H5(A){if(await JD2(),!A||A.length>DH5||!JFA||!YvA)return null;try{let Q=JFA.parse(A),B=Q?.rootNode;if(!B)return null;let G=XD2(B),Z=CH5(G);return{tree:Q,rootNode:B,envVars:Z,commandNode:G,originalCommand:A}}catch{return null}}function XD2(A){let{type:Q,children:B,parent:G}=A;if(ZK0.has(Q))return A;if(Q==="variable_assignment"&&G)return G.children.find((Z)=>Z&&ZK0.has(Z.type)&&Z.startIndex>A.startIndex)??null;if(Q==="pipeline"||Q==="redirected_statement")return B.find((Z)=>Z&&ZK0.has(Z.type))??null;for(let Z of B){let Y=Z&&XD2(Z);if(Y)return Y}return null}function CH5(A){if(!A||A.type!=="command")return[];let Q=[];for(let B of A.children){if(!B)continue;if(B.type==="variable_assignment")Q.push(B.text);else if(B.type==="command_name"||B.type==="word")break}return Q}function UH5(A){if(A.type==="declaration_command"){let G=A.children[0];return G&&KH5.has(G.text)?[G.text]:[]}let Q=[],B=!1;for(let
```

- Evidence: `<CLAUDE_CODE_PKG_ROOT>/cli.js:2388` (export binding for parseCommand → $H5)

```js
==="system"?W.path:null},K=A==="package-manager"?YFA():void 0;return{installationType:A,version:Q,installationPath:B,invokedBinary:G,configInstallMethod:X,autoUpdates:(()=>{let F=dJA();return F?`disabled (${F})`:"enabled"})(),hasUpdatePermissions:I,multipleInstallations:Z,warnings:Y,packageManager:K,ripgrepStatus:D}}var db=w(()=>{WQ();E2();Qs();XQ();rd();sJ1();h3();K6();iU();Py();FJ();bQ();QX1()});var JK0={};M5(JK0,{parseCommand:()=>$H5,extractCommandArguments:()=>UH5,ensureInitialized:()=>JD2});import{fileURLToPath as WH5}from"url";import{dirname as ZD2,join as BX1}from"path";function HH5(){let A=ZD2(WH5(import.meta.url));return ZD2(ZvA())}function EH5(A){if(!qG()||typeof Bun>"u"||!Bun.embeddedFiles)return null;for(let Q of Bun.embeddedFiles){let B=Q.name;if(B&&B.endsWith(A))return Q}return null}async function YD2(A){let Q=EH5(A);if(!Q)return null;let B=await Q.arrayBuffer();return new Uint8Array(B)}async function zH5(){let A=yA();if(qG()){let J=await YD2("tree-sitter.wasm"),X=await YD2("tree-sitter-bash.wasm");if(J&&X){awa
```

- Evidence: `<CLAUDE_CODE_PKG_ROOT>/cli.js:2388` (feature-detect + cleanup via tree.delete())

```js
et B=this.originalCommand.slice(Q).trim();if(B)A.push(B);return A}withoutOutputRedirections(){if(this.redirectionNodes.length===0)return this.originalCommand;let A=[...this.redirectionNodes].sort((B,G)=>G.startIndex-B.startIndex),Q=this.originalCommand;for(let B of A)Q=Q.slice(0,B.startIndex)+Q.slice(B.endIndex);return Q.trim().replace(/\s+/g," ")}getOutputRedirections(){return this.redirectionNodes.map(({target:A,operator:Q})=>({target:A,operator:Q}))}}var LH5,GX1;var DD2=w(()=>{Y9();LN();LH5=D0(async()=>{try{let{parseCommand:A}=await Promise.resolve().then(() => (XK0(),JK0)),Q=await A("echo test");if(!Q)return!1;return Q.tree.delete(),!0}catch{return!1}}),GX1={async parse(A){if(!A)return null;if(await LH5())try{let{parseCommand:B}=await Promise.resolve().then(() => (XK0(),JK0)),G=await B(A);if(G){let Z=NH5(G.rootNode),Y=wH5(G.rootNode);return G.tree.delete(),new WD2(A,Z,Y)}}catch{}return new ID2(A)}}});async function OH5(A,Q,B){if(Q.filter((W)=>{let D=W.trim();return D.startsWith("cd ")||D==="cd"}).length>1){let W={type:"other",reason:"Multiple directory changes in one command require approval for clarity"};return{behavior:"ask",decisionReason:W,message:rI(o2.name,W)}}let Z=new Map;for(let W of Q){let D=W.trim();if(!D)continue;let K=await B({...A,command:D});Z.set(D,K)}let Y=Array.from(Z.entries()).find(([,W])=>W.behavior==="deny");if(Y){let[W,D]=Y;return{behavior:"deny",message:D.behavior==="deny"?D.message:
```

### 2.3 Call-site evidence (piped subcommands, redirection stripping, approval messaging)

- Evidence anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:2388` (excerpt around `MH5` / `KD2` piping logic; uses `GX1.parse` which is backed by `parseCommand` above)

```js
async function MH5(A) {
  if (!A.includes('>')) return A
  return (await GX1.parse(A))?.withoutOutputRedirections() ?? A
}
async function KD2(A, Q) {
  if (FD2(A.command)) {
    let Y = gb(A.command),
      J = {
        type: 'other',
        reason:
          Y.behavior === 'ask' && Y.message
            ? Y.message
            : 'This command uses shell operators that require approval for safety',
      }
    return { behavior: 'ask', message: rI(o2.name, J), decisionReason: J }
  }
  let B = await GX1.parse(A.command)
  if (!B) return { behavior: 'passthrough', message: 'Failed to parse command' }
  let G = B.getPipeSegments()
  if (G.length <= 1)
    return { behavior: 'passthrough', message: 'No pipes found in command' }
  let Z = await Promise.all(G.map(Y => MH5(Y)))
  return OH5(A, Z, Q)
}
```

### 2.4 User-perceived effect (strictly bounded to evidence)

- `$H5` returns `{ tree, rootNode, envVars, commandNode, originalCommand }` and supports explicit memory cleanup (`tree.delete()`).
- `GX1.parse` uses the tree-sitter parse results to compute `pipePositions` (`NH5(...)`) and output redirection nodes (`wH5(...)`), enabling:
  - pipeline segmentation (`getPipeSegments()`) and per-segment permission evaluation (`OH5(...)`),
  - safe removal of output redirections before evaluating subcommands (`withoutOutputRedirections()` via `MH5(...)`),
  - explicit approval messaging for multi-`cd` pipelines (`"Multiple directory changes in one command require approval for clarity"`) and for shell operator use (`"This command uses shell operators that require approval for safety"`).

## 3) Uncertainty / next steps (still static-only)

- This document intentionally avoids claiming where _every_ tree-sitter parse result is consumed; only the loading + parse construction + export binding are evidenced here.
- Next: in T07, consolidate the runtime spec around command safety decisions, and link these call-sites to the higher-level permission UX (prompts, rule explainers, logs, and persisted artifacts).
