# Claude Code `cli.js` — static anatomy (evidence-based)

- Source: `<CLAUDE_CODE_PKG_ROOT>/cli.js`
- cli.js (T01 meta): sha256=`b34653bf5caebdafe4d8baed2997166b5e9bb787a87dcc37a262d2ef649b98ea`, size=`11118843`
- Package: `@anthropic-ai/claude-code@2.1.6`
- VERSION literal in cli.js: `2.1.6`
- BUILD_TIME literal in cli.js: `2026-01-13T01:42:19Z`

## 0) High-level call graph (first pass)

```text
cli.js (bin)
  └─ lO7()  // argv dispatcher
      ├─ --version / -v / -V           -> print version
      ├─ --mcp-cli (guarded by qJ())   -> AC9(argvRest)  // MCP CLI mode
      ├─ --ripgrep                     -> ripgrepMain(argvRest)
      ├─ --claude-in-chrome-mcp        -> BC9()          // Chrome integration mode
      ├─ --chrome-native-host          -> XC9()          // Chrome native host mode
      └─ default                        -> dynamic import { main } -> main()  // interactive CLI
```

## 1) Entry point + argv dispatch (verbatim evidence)

- Evidence anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:5196` (substring excerpt around `async function lO7()`)

```js
.buffer=this.buffer.subarray(4+A);let B=Q.toString("utf-8");this.pendingResolve(B),this.pendingResolve=null}async read(){if(this.closed)return null;if(this.buffer.length>=4){let A=this.buffer.readUInt32LE(0);if(A>0&&A<=rS0&&this.buffer.length>=4+A){let Q=this.buffer.subarray(4,4+A);return this.buffer=this.buffer.subarray(4+A),Q.toString("utf-8")}}return new Promise((A)=>{this.pendingResolve=A,this.tryProcessMessage()})}}tS0();KN();X$();XQ();OEA();process.env.COREPACK_ENABLE_AUTO_PIN="0";if(process.env.CLAUDE_CODE_REMOTE==="true"){let A=process.env.NODE_OPTIONS||"";process.env.NODE_OPTIONS=A?`${A} --max-old-space-size=8192`:"--max-old-space-size=8192"}x9("cli_entry");x9("cli_imports_loaded");async function lO7(){let A=process.argv.slice(2);if(A.length===1&&(A[0]==="--version"||A[0]==="-v"||A[0]==="-V")){x9("cli_version_fast_path"),console.log(`${{ISSUES_EXPLAINER:"report the issue at https://github.com/anthropics/claude-code/issues",PACKAGE_URL:"@anthropic-ai/claude-code",README_URL:"https://code.claude.com/docs/en/overview",VERSION:"2.1.6",FEEDBACK_CHANNEL:"https://github.com/anthropics/claude-code/issues",BUILD_TIME:"2026-01-13T01:42:19Z"}.VERSION} (Claude Code)`);return}if(A[0]==="--mcp-cli"&&qJ()){let B=A.slice(1);process.exit(await AC9(B))}if(A[0]==="--ripgrep"){x9("cli_ripgrep_path");let B=A.slice(1),{ripgrepMain:G}=await Promise.resolve().then(() => (KC9(),DC9));process.exitCode=G(B);return}if(process.argv[2]==="--claude-in-chrome-mcp"){x9("cli_claude_in_chrome_mcp_path"),await BC9();return}else if(process.argv[2]==="--chrome-native-host"){x9("cli_chrome_native_host_path"),await XC9();return}x9("cli_before_main_import");let{main:Q}=await Promise.resolve().then(() => (bN9(),kN9));x9("cli_after_main_import"),await Q(),x9("cli_after_main_complete")}lO7();
```

### Fast paths observed (from the same excerpt)

| Trigger                  | Behavior                                      |
| ------------------------ | --------------------------------------------- |
| `--version / -v / -V`    | print version and return                      |
| `--mcp-cli`              | delegate to AC9(argvRest) when qJ() is truthy |
| `--ripgrep`              | delegate to ripgrepMain(argvRest)             |
| `--claude-in-chrome-mcp` | run BC9()                                     |
| `--chrome-native-host`   | run XC9()                                     |

## 2) Interactive command system anchors

### 2.1) Help command exists

- Evidence anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:3437` (excerpt around `name:"help"`)

```js
ps://code.claude.com/docs/en/overview"}))),u8.createElement(T,{marginTop:1},u8.createElement(C,{dimColor:!0},Y.pending?u8.createElement(u8.Fragment,null,"Press ",Y.keyName," again to exit"):u8.createElement(C,{italic:!0},"Esc to cancel")))))}var u8;var yX9=w(()=>{bA();hW();i3A();TX9();SX9();GV();M4();z9();bA();u8=p(QA(),1)});var yj0,bD7,vX9;var kX9=w(()=>{yX9();yj0=p(QA(),1),bD7={type:"local-jsx",name:"help",description:"Show help and available commands",isEnabled:()=>!0,isHidden:!1,async call(A,{options:{commands:Q}}){return yj0.createElement(xX9,{commands:Q,onClose:A})},userFacingName(){return"help"}},vX9=bD7});function bX9({onComplete:A}){let Q=OQ(),B=vj0.useCallback(async(Z)=>{let Y=Z==="yes";g0((J)=>({...J,autoConnectIde:Y,hasIdeAutoConnectDialogBeenShown:!0})),A()},[A]);return X0((Z,Y)=>{if(Y.escape)A()}),kJ.default.createElement(T,{marginTop:1,flexDirection:"column"},kJ.default.createElement(T,{flexDirection:"column",borderStyle:"round",borderColor:"ide",paddingX:2,paddingY:1,width:"100%"},kJ.default.createElement(T,{marginBottom:1},kJ.default.createElement(C,{color:"ide"},"Do you wish to enable auto-connect to IDE?")),kJ.default.createElement(T,{flexDirection:"column",paddingX:1},kJ.default.createElement(v0,{options:[{label:"Yes",value:"yes"},{label:"No",value:"no"}],onCh
```

### 2.2) Command resolution + “available commands” error path

- Evidence anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:4108` (excerpt around the not-found template)

```js
ls:[]}}}function Et(){l_.cache?.clear?.(),Tp.cache?.clear?.(),qK1.cache?.clear?.(),rE1(),Q59(),DF1()}function Rp(A,Q){return Q.some((B)=>B.name===A||B.userFacingName()===A||B.aliases?.includes(A))}function Qx(A,Q){let B=Q.find((G)=>G.name===A||G.userFacingName()===A||G.aliases?.includes(A));if(!B)throw ReferenceError(`Command ${A} not found. Available commands: ${Q.map((G)=>{let Z=G.userFacingName();return G.aliases?`${Z} (aliases: ${G.aliases.join(", ")})`:Z}).sort((G,Z)=>G.localeCompare(Z)).join(", ")}`);return B}function nHA(A){if(A.type!=="prompt")return A.description;if(A.source==="plugin"){if(A.pluginInfo?.repository)return`${A.description} (plugin:${A.pluginInfo.repository})`;return`${A.description} (plugin)`}if(A.source==="builtin"||A.source==="mcp")return A.description;if(A.source==="bundled")return`${A.description} (bundled)`;return`${A.description} (${on(A.source)})`}var Iz9,ts,l_,Tp,qK1;var GV=w(()=>{dz1();dY9();sY9();eY9();MF1();AJ9();QJ9();BJ9();ZJ9();vJ9();mJ9();pJ9();cJ9();AX9();KX9();$X9();_X9();kX9();cX9();iX9();aX9();AK1();mD1();jI9();SI9();CW9();RK9();_K9();jK9();PK9();yK9();kK9();QV
```

## 3) Input sources (TTY vs piped)

- Evidence anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:5119` (excerpt around `async function mO7(`)

```js
_AUTH_FILE_DESCRIPTOR)return"remote";return"cli"})();Gb0(Y),x9("main_client_type_determined"),fO7(),x9("main_before_run"),process.title="claude",await dO7(),x9("main_after_run")}function uO7(A){let Q=0,B=DY(A);if(B.stdin)l("tengu_stdin_interactive",{});return{...B,onFlicker:(G,Z,Y,J)=>{if(J==="resize")return;let X=Date.now();if(X-Q<1000)l("tengu_flicker",{desiredHeight:G,actualHeight:Z,ink2Enabled:Y,reason:J});Q=X}}}async function mO7(A,Q){if(!process.stdin.isTTY&&!process.argv.includes("mcp")){if(Q==="stream-json")return process.stdin;process.stdin.setEncoding("utf8");let B="";return process.stdin.on("data",(G)=>{B+=G}),await new Promise((G)=>{process.stdin.on("end",G)}),[A,B].filter(Boolean).join(`
`)}return A}async function dO7(){x9("run_function_start");function A(){let X=(I)=>I.long?.replace(/^--/,"")??I.short?.replace(/^-/,"")??"";return Object.assign({sortSubcommands:!0,sortOptions:!0},{compareOptions:(I,W)=>X(I).localeCompare(X(W))})}let Q=new FC1().configureHelp(A());x9("run_commander_initialized"),Q.hook("preAction",async()=>{x9("preAction_start");let X=wC9();if(X instanceof Promise)await X;x9("preAction_after_init"),UA2(),yO7(),x9("preAction_after_migrations"),qk2(),x9("preAction_after_remote_settings")}),Q.name("claude").description("Claude Code - starts an interactive session by default
```

## 4) TTY evidence anchors

- JSON index: `docs/research/claude-code/05_cli_strings_index.json`

- `process.stdin.isTTY` @ approx line `2751`

```js
agment,null,"Enter to confirm · Esc to exit"))))}var EE;var Vk2=w(()=>{bA();b8();wN();z9();DC0();EE=p(QA(),1)});import{openSync as lm5}from"fs";import{ReadStream as im5}from"tty";function nm5(){if($p!==null)return $p;if(process.stdin.isTTY){$p=void 0;return}if(n1(!1)){$p=void 0;return}if(process.argv.includes("mcp")){$p=void 0;return}if(process.platform==="win32"){$p=void 0;return}try{let A=lm5("/dev/tty","r"),Q=new im5(A);return Q.isTTY=!0,$p=Q,$p}catch(A){e(A),$p=void 0;return}}function DY(A=!1){let Q=nm5(),B={exitOnCtrlC:A};if(Q)B.stdin=Q;return B}var $p=null;var Ef=w(()=>{bQ();b1()});function om5(A,Q){let{addNotification:B,remov
```

- `process.stdout.isTTY` @ approx line `59`

```js
(G5Q())return"ssh-session";if(process.env.TERM){let Q=process.env.TERM;if(Q.includes("alacritty"))return"alacritty";if(Q.includes("rxvt"))return"rxvt";if(Q.includes("termite"))return"termite";return process.env.TERM}if(!process.stdout.isTTY)return"non-interactive";return null}function G5Q(){return!!(process.env.SSH_CONNECTION||process.env.SSH_CLIENT||process.env.SSH_TTY)}var pM1,l74,i74,n74,B5Q,a74,o74=()=>{return process.env.__CFBundleIdentifier==="com.conductor.app"},cM1,s74,c0;var g3=w(()=>{Y9();R5();WQ();RY();bQ();AX();pM1=p(CpA(),1);l74=D0(async()=>{try{let A=l9(),Q=setTimeout(()=>A.abort(),1000);return await PQ.head("http://1.
```

- `process.stderr.isTTY` @ approx line `5194`

```js
kipPermissionsPassed:H,modeIsBypass:E,allowDangerouslySkipPermissionsPassed:z,...$&&{systemPromptFlag:$},...O&&{appendSystemPromptFlag:O},...L&&{rh:L}})}catch(L){e(L instanceof Error?L:Error(String(L)))}}function cO7(){(process.stderr.isTTY?process.stderr:process.stdout.isTTY?process.stdout:void 0)?.write($P)}var B3,RO7=null;var bN9=w(()=>{yAA();A0();ZB();Bm();zC9();LC9();J3();MC9();g3();d1A();luA();SP0();TC9();xC9();a_0();bC9();yC();RfA();BcA();hC9();A0();Ef();bA();HH1();FS();hV1();fS0();hz();zr();o6();oC9();tC9();xeA();SHA();YEA();h3();XQ();eB();$OA();fFA();JB0();b1();a4();rP();a4();ZU9();Cp();EbA();Lj0();Xw0();Zx0();wU9();Kj0();O
```

## 5) Limitations of this pass

- This pass is limited to static, substring-anchored slicing. It provides strong evidence for entry dispatch and command registry existence, but does not fully reconstruct the REPL/state machine inside `main()` yet.
- Next static-only steps (no execution): find the `main` export block referenced by `await Promise.resolve().then(() => (bN9(),kN9))`, identify the root Ink component, and map the core state transitions (session start, prompt submit, tool use, background tasks, compaction).
