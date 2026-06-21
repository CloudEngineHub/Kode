# Claude Code UX stringbook — user-visible copy & prompt patterns (evidence-based)

- Claude package root: `<CLAUDE_CODE_PKG_ROOT>`
- Claude `cli.js`: `<CLAUDE_CODE_PKG_ROOT>/cli.js` (sha256: `b34653bf5caebdafe4d8baed2997166b5e9bb787a87dcc37a262d2ef649b98ea`, package version: `2.1.6`)

This document extracts **high-signal, user-visible UX copy** from `cli.js` and links each phrase to its **triggering control flow** and **verbatim evidence**.

Format per entry:

- 文案 → 场景 → 触发条件（就近控制流） → 证据（`cli.js:<line>` 原文摘录）

## U1) Confirm / exit / cancel microcopy

### U1.1 Double-press-to-exit (“pending exit”)

- 文案：`Press ${keyName} again to exit`
- 场景：对话框/确认提示处于“退出 pending”状态时，引导用户再次按同一按键确认退出（降低误触退出的摩擦与风险）。
- 触发条件：UI 分支渲染：`pending ? ("Press " + keyName + " again to exit") : (...)`。
- 证据：`cli.js:1785`

```js
I.pending?AE.default.createElement(AE.default.Fragment,null,"Press ",I.keyName," again to exit")
```

### U1.2 Confirm vs exit affordance (“Enter confirm, Esc exit”)

- 文案：`Enter to confirm · Esc to exit`
- 场景：同一确认提示在“非 pending exit”时，明确给出确认与退出两种按键操作（减少用户搜索成本）。
- 触发条件：当 `pending` 为 false 时渲染固定文案。
- 证据：`cli.js:2751`

```js
EE.default.createElement(
  EE.default.Fragment,
  null,
  'Enter to confirm · Esc to exit',
)
```

### U1.3 Continue vs exit affordance (“Enter continue, Esc exit”)

- 文案：`Enter to continue · Esc to exit`
- 场景：用于“继续/退出”的二元提示（比“confirm”更轻量，强调继续流程）。
- 触发条件：渲染分支 `!J && H && "Enter to continue · " , "Esc to exit"`。
- 证据：`cli.js:2267`

```js
;(!J && H && 'Enter to continue · ', 'Esc to exit')
```

### U1.4 Cancel affordance + secondary action hint

- 文案：`Esc to cancel`（可追加：` · Tab to add additional instructions`）
- 场景：在某些确认/选择类 UI 中，主取消键为 Esc；并在满足条件时提示 Tab 可添加补充指令（把“高级路径”变成可发现但不打扰的渐进披露）。
- 触发条件：固定渲染 `"Esc to cancel"`；当满足 `... && " · Tab to add additional instructions"` 条件时追加后半句。
- 证据：`cli.js:2361`

```js
createElement(
  C,
  { dimColor: !0 },
  'Esc to cancel',
  I &&
    ((D === 'yes' && !K) || (D === 'no' && !V)) &&
    ' · Tab to add additional instructions',
)
```

## U2) Permissions / approval / sandbox (core friction points)

### U2.1 Central permission prompt message factory (`rI(toolName, decisionReason)`)

- 文案：`Claude requested permissions to use ${A}, but you haven't granted it yet.`
- 场景：当权限系统决定需要用户批准，但当前缺少可用的更具体 reason 时的兜底提示。
- 触发条件：`rI(A,Q)` 中 `Q` 不存在或不匹配任何 `Q.type` 分支时返回该兜底文案。
- 证据：`cli.js:4481`

```js
return `Claude requested permissions to use ${A}, but you haven't granted it yet.`
```

- 文案（Hook 相关）：
  - `Hook '${Q.hookName}' blocked this action: ${Q.reason}`
  - `Hook '${Q.hookName}' requires approval for this ${A} command`
- 场景：Hook（启动/运行时钩子）拦截动作时，将“阻止原因/需要批准”直接告知用户。
- 触发条件：`rI()` 的 `case "hook"`：当 `Q.reason` 存在则返回 blocked-with-reason，否则返回 requires-approval。
- 证据：`cli.js:4481`

```js
case"hook":return Q.reason?`Hook '${Q.hookName}' blocked this action: ${Q.reason}`:`Hook '${Q.hookName}' requires approval for this ${A} command`;
```

- 文案（权限规则来源可解释性）：
  - `Permission rule '${G}' from ${Z} requires approval for this ${A} command`
- 场景：当命中“ask”类 permission rule 时，把规则本体与来源（例如 local/user/project/cliArg/session 等）编入提示，降低“为什么问我”的摩擦。
- 触发条件：`rI()` 的 `case "rule"` 分支。
- 证据：`cli.js:4481`

```js
case"rule":{let G=T5(Q.rule.ruleValue),Z=fxA(Q.rule.source);return`Permission rule '${G}' from ${Z} requires approval for this ${A} command`}
```

- 文案（多子操作拆分提示）：
  - `This ${A} command contains multiple operations. The following part${G.length>1?"s":""} require${G.length>1?"":"s"} approval: ${G.join(", ")}`
  - `This ${A} command contains multiple operations that require approval`
- 场景：当一个高层命令包含多段子操作（尤其 Bash）时，把“需要批准的部分”聚合列出，降低用户理解成本。
- 触发条件：`rI()` 的 `case "subcommandResults"` 分支：收集 `Q.reasons` 中 `behavior==="ask"||"passthrough"` 的子片段。
- 证据：`cli.js:4481`

```js
case"subcommandResults":{let G=[];for(let[Z,Y]of Q.reasons)if(Y.behavior==="ask"||Y.behavior==="passthrough")if(A==="Bash"){let{commandWithoutRedirections:J,redirections:X}=PS(Z),I=X.length>0?J:Z;G.push(I)}else G.push(Z);if(G.length>0)return`This ${A} command contains multiple operations. The following part${G.length>1?"s":""} require${G.length>1?"":"s"} approval: ${G.join(", ")}`;return`This ${A} command contains multiple operations that require approval`}
```

- 文案（permission prompt tool 介入）：
  - `Tool '${Q.permissionPromptToolName}' requires approval for this ${A} command`
- 场景：当权限批准来自一个“permissionPromptTool”（工具化的交互批准流程）时，把该工具名写入原因。
- 触发条件：`rI()` 的 `case "permissionPromptTool"` 分支。
- 证据：`cli.js:4481`

```js
case"permissionPromptTool":return`Tool '${Q.permissionPromptToolName}' requires approval for this ${A} command`;
```

- 文案（sandbox override CTA）：`Run outside of the sandbox`
- 场景：当动作被 sandbox 限制时，给出明确的“脱离 sandbox 执行”的可选路径文案。
- 触发条件：`rI()` 的 `case "sandboxOverride"` 分支。
- 证据：`cli.js:4481`

```js
case"sandboxOverride":return"Run outside of the sandbox";
```

- 文案（classifier 解释）：`Classifier '${Q.classifier}' requires approval for this ${A} command: ${Q.reason}`
- 场景：当 classifier（安全/意图/注入检测等）触发需要批准时，提供 classifier 名与原因。
- 触发条件：`rI()` 的 `case "classifier"` 分支。
- 证据：`cli.js:4481`

```js
case"classifier":return`Classifier '${Q.classifier}' requires approval for this ${A} command: ${Q.reason}`;
```

- 文案（mode 解释）：`Current permission mode (${mu(Q.mode)}) requires approval for this ${A} command`
- 场景：当权限模式（例如 plan / bypassPermissions / default 等）导致需要批准时，直接把 mode 写明。
- 触发条件：`rI()` 的 `case "mode"` 分支。
- 证据：`cli.js:4481`

```js
case"mode":return`Current permission mode (${mu(Q.mode)}) requires approval for this ${A} command`;
```

### U2.2 Deny / auto-deny microcopy

- 文案：`Permission to use ${A.name} has been denied.`
- 场景：命中 deny 规则时的直接拒绝提示（具象到 toolName）。
- 触发条件：`qU7()` 中 `_K0(...)` 命中 deny rule 时返回 `{behavior:"deny", message: ...}`。
- 证据：`cli.js:4481`

```js
if (Y)
  return {
    behavior: 'deny',
    decisionReason: { type: 'rule', rule: Y },
    message: `Permission to use ${A.name} has been denied.`,
  }
```

- 文案：`Permission to use ${A.name} has been auto-denied in dontAsk mode.`
- 场景：用户处在 `dontAsk` 模式时，所有 ask 自动转 deny，同时明确是“自动拒绝”而非系统错误。
- 触发条件：包装器逻辑：当 `Y.behavior==="ask"` 且 `toolPermissionContext.mode==="dontAsk"` 时返回该文案。
- 证据：`cli.js:4481`

```js
if (J.toolPermissionContext.mode === 'dontAsk')
  return {
    behavior: 'deny',
    decisionReason: { type: 'mode', mode: 'dontAsk' },
    message: `Permission to use ${A.name} has been auto-denied in dontAsk mode.`,
  }
```

- 文案：`Permission to use ${A.name} has been auto-denied (prompts unavailable).`
- 场景：当前上下文不允许弹出权限提示（例如异步/后台 agent 等）时的 fail-closed 文案。
- 触发条件：当 `toolPermissionContext.shouldAvoidPermissionPrompts` 为真时返回该文案，并带 reason `Permission prompts are not available in this context`。
- 证据：`cli.js:4481`

```js
reason:"Permission prompts are not available in this context"},message:`Permission to use ${A.name} has been auto-denied (prompts unavailable).`
```

### U2.3 “Bypass permissions” disabled notifications (policy vs settings)

- 文案：
  - `Bypass permissions mode was disabled by your organization policy`
  - `Bypass permissions mode was disabled by settings`
- 场景：当用户选择 bypassPermissions 但被 gate/策略禁用时，提供明确的“禁用来源”以减少排障摩擦。
- 触发条件：`jz9()` 中当 `I==="bypassPermissions" && Y` 时设置 `notification:X`（并分别在 Statsig gate vs settings 时选择不同文案）。
- 证据：`cli.js:4481`

```js
if (G)
  (k('bypassPermissions mode is disabled by Statsig gate', { level: 'warn' }),
    (X = 'Bypass permissions mode was disabled by your organization policy'))
else
  (k('bypassPermissions mode is disabled by settings', { level: 'warn' }),
    (X = 'Bypass permissions mode was disabled by settings'))
```

- 文案：`--dangerously-skip-permissions cannot be used with root/sudo privileges for security reasons`
- 场景：在 root/sudo 场景硬拒绝“危险跳过权限”参数，避免高权限下的安全风险；并给出明确原因。
- 触发条件：`kC1()` 中检测 `process.getuid()===0` 且不在 sandbox/特定环境变量时 `console.error(...)` 并 `process.exit(1)`。
- 证据：`cli.js:5115`

```js
;(console.error(
  '--dangerously-skip-permissions cannot be used with root/sudo privileges for security reasons',
),
  process.exit(1))
```

### U2.4 Command-level security gates (sed & injection patterns)

- 文案：`sed command requires approval (contains potentially dangerous operations)`
- 场景：对 `sed` 命令做额外检查，发现可能危险的写/执行操作时强制进入 ask。
- 触发条件：`MD2()` 遍历 `OF(A.command)` 的子命令；当命中 `sed` 且 `!zK0(...)` 时返回 `{behavior:"ask", message: ...}`。
- 证据：`cli.js:2391`

```js
if (!zK0(Z, { allowFileWrites: J }))
  return {
    behavior: 'ask',
    message:
      'sed command requires approval (contains potentially dangerous operations)',
    decisionReason: {
      type: 'other',
      reason:
        'sed command contains operations that require explicit approval (e.g., write commands, execute commands)',
    },
  }
```

- 文案（兜底原因）：`This command contains patterns that could pose security risks and requires approval`
- 场景：命令注入/危险模式检测的兜底 reason（当 classifier 给出 ask 且没有更具体 message 时）。
- 触发条件：若 `gb(A.command)` 返回非 passthrough，则 reason 取 `X.message` 或该兜底字符串，并转为 ask。
- 证据：`cli.js:2393`

```js
reason: X.behavior === 'ask' && X.message
  ? X.message
  : 'This command contains patterns that could pose security risks and requires approval'
```

### U2.5 MCP permission & validation copy

- 文案：`MCPTool requires permission.`
- 场景：MCP 工具在 `checkPermissions()` 中给出的标准提示（用于统一“需要权限”的语气）。
- 触发条件：MCP tool 定义的 `checkPermissions()` 返回 `{behavior:"passthrough", message:"MCPTool requires permission."}`。
- 证据：`cli.js:1725`

```js
async checkPermissions(){return{behavior:"passthrough",message:"MCPTool requires permission."}}
```

- 文案：`Invalid MCP server or tool name. Names must contain only letters, numbers, hyphens, and underscores.`
- 场景：对 MCP 标识做输入校验，避免注入/路径穿越等风险；并以用户可理解的规则解释拒绝原因。
- 触发条件：当 `!TD2(server) || !TD2(toolName)` 时直接 deny 并返回该文案。
- 证据：`cli.js:2391`

```js
if(!TD2(G)||!TD2(Z))return{behavior:"deny",message:"Invalid MCP server or tool name. Names must contain only letters, numbers, hyphens, and underscores."
```

## U3) Session / resume / teleport UX copy

### U3.1 Teleport resume hint

- 文案：`Resume with: claude --teleport ${sessionId}`
- 场景：当产生一个 teleport 会话 id 时，直接打印“如何恢复”的一行命令（把“下一步”变成可复制的单行命令）。
- 触发条件：控制流直接 `process.stdout.write(\`Resume with: claude --teleport ${G2.id}\`)`。
- 证据：`cli.js:5167`

```js
process.stdout.write(`Resume with: claude --teleport ${G2.id}
```

### U3.2 Resume failure messages

- 文案：`No conversation found with session ID: ${sessionId}`
- 场景：当尝试恢复指定 session id 但查不到历史时的直接错误（防止静默失败）。
- 触发条件：当 `St(sessionId, ...)` 返回 falsy 时输出到 stderr / console.error。
- 证据：`cli.js:5013`

```js
process.stderr.write(`No conversation found with session ID: ${G.sessionId}
```

- 证据：`cli.js:5172`

```js
if (!U9)
  (console.error(`No conversation found with session ID: ${G2}`),
    process.exit(1))
```

- 文案：`Failed to resume session ${sessionId}`
- 场景：恢复会话过程中抛错时的错误文案（用于 CLI/日志）。
- 触发条件：`catch(...) { ... console.error(\`Failed to resume session ${G2}\`); process.exit(1) }`。
- 证据：`cli.js:5172`

```js
;(console.error(`Failed to resume session ${G2}`), process.exit(1))
```

- 文案（UI 标题）：`Failed to resume session`
- 场景：在交互 UI 中显示“恢复失败”标题，并展示 error message 与后续操作提示。
- 触发条件：UI 组件渲染 `createElement(C,{bold:!0,color:"error"},"Failed to resume session")`。
- 证据：`cli.js:5090`

```js
createElement(C, { bold: !0, color: 'error' }, 'Failed to resume session')
```

### U3.3 Flag misuse guardrails

- 文案：`Error: --session-id can only be used with --continue or --resume if --fork-session is also specified.`
- 场景：对命令行参数组合做“明确报错 + 明确修复方向”的 guardrail，减少用户试错成本。
- 触发条件：当 `--session-id` 存在且 `(--continue || --resume)` 且 `! --fork-session` 时写入 stderr。
- 证据：`cli.js:5120`

```js
if((I.continue||I.resume)&&!I.forkSession)process.stderr.write(D1.red(`Error: --session-id can only be used with --continue or --resume if --fork-session is also specified.
```

- 文案（help 描述）：`Use a specific session ID for the conversation (must be a valid UUID)`
- 场景：在 CLI help 中对 `--session-id` 的行为做一句话解释。
- 触发条件：Commander option 注册时的 description 字符串。
- 证据：`cli.js:5120`

```js
.option("--session-id <uuid>","Use a specific session ID for the conversation (must be a valid UUID)")
```

- 文案（onboarding / quick win）：`Type /resume to continue a past conversation`
- 场景：在 onboarding 的“Quick Wins”中，用一句可直接执行的 slash 命令引导用户发现“恢复会话”能力。
- 触发条件：feature 列表项 `resume` 的 `tryItPrompt` 字符串。
- 证据：`cli.js:876`

```js
{id:"resume",name:"Resume Conversations",description:"Pick up where you left off",categoryId:"quick-wins",tryItPrompt:"Type /resume to continue a past conversation",hasBeenUsed:async()=>C7("resume")}
```

## U4) Long tasks / background agent progress copy

- 文案（进度提示模板）：`Agent ${A.id} progress: ${Y.join(", ")}. The agent is still running. You usually do not need to read ${A.outputFile} unless you need specific details right away. You will receive a notification when the agent is done.`
- 场景：当后台 agent 有“工具调用数/Token 数”的增量进展时，输出一段完整提示，强调“通常无需立刻查看 outputFile”，并承诺“完成会通知”，降低用户焦虑与注意力切换成本。
- 触发条件：当 `toolUseCount` 或 `tokenCount` 与 `lastReported*` 比较有增量时，拼接 `Y[]` 并返回该模板字符串。
- 证据：`cli.js:1785`

```js
return `Agent ${A.id} progress: ${Y.join(', ')}. The agent is still running. You usually do not need to read ${A.outputFile} unless you need specific details right away. You will receive a notification when the agent is done.`
```

- 文案：`Full transcript available at: ${X}`
- 场景：任务/agent 完成后提示完整 transcript 的落盘位置，方便用户需要时追溯细节。
- 触发条件：构造 `W`（包含 transcript path）的通知字符串 `Full transcript available at: ${X}`。
- 证据：`cli.js:1785`

```js
Full transcript available at: ${X}`
```

## U5) Auth / network / runtime compatibility copy

### U5.1 Auth prerequisites & errors (SDK / API)

- 文案：`No OAuth token available`
- 场景：first-party OAuth 路径下，没有可用 token 时的错误原因（供上层包装成 `Auth error: ...`）。
- 触发条件：`KJ()` 在 `LB()` 分支下若 `!Q?.accessToken` 返回 `{error:"No OAuth token available"}`。
- 证据：`cli.js:236`

```js
if (!Q?.accessToken) return { headers: {}, error: 'No OAuth token available' }
```

- 文案：`No API key available`
- 场景：API key 路径下，没有可用 key 时的错误原因（同样供上层包装/展示）。
- 触发条件：`KJ()` 在非 `LB()` 分支下若 `!A` 返回 `{error:"No API key available"}`。
- 证据：`cli.js:236`

```js
let A = mw()
if (!A) return { headers: {}, error: 'No API key available' }
```

- 文案：`No organization ID available`
- 场景：需要 org id 的 API 调用缺失 org id 时直接抛错。
- 触发条件：`cq3()` 中 `let A=_3()?.organizationUuid; if(!A) throw Error("No organization ID available")`。
- 证据：`cli.js:236`

```js
let A = _3()?.organizationUuid
if (!A) throw Error('No organization ID available')
```

- 文案：`Auth error: ${Q.error}`
- 场景：当 `KJ()` 返回 error 时，上层统一包装成 `Auth error: ...` 抛出（便于集中处理与提示）。
- 触发条件：`if(Q.error) throw Error(\`Auth error: ${Q.error}\`)`。
- 证据：`cli.js:236`

```js
let Q = KJ()
if (Q.error) throw Error(`Auth error: ${Q.error}`)
```

### U5.2 OAuth browser flow microcopy (HTML pages)

- 文案：`<h1>Authentication Error</h1><p>Invalid state parameter. Please try again.</p><p>You can close this window.</p>`
- 场景：OAuth 回调页在错误场景返回 HTML，明确“你可以关闭窗口”，降低用户困惑。
- 触发条件：当 state 校验失败（`Invalid state parameter`）或 oauth provider 返回 error 时返回对应 HTML。
- 证据：`cli.js:1754`

```js
E.end(
  '<h1>Authentication Error</h1><p>Invalid state parameter. Please try again.</p><p>You can close this window.</p>',
)
```

- 文案（错误封装）：`OAuth error: ${L}`
- 场景：把 provider error 组合成可记录/上抛的错误字符串。
- 触发条件：当 `L` 存在（`z.query.error`）时构造 `b=\`OAuth error: ${L}\``。
- 证据：`cli.js:1754`

```js
let b = `OAuth error: ${L}`
if (M) b += ` - ${M}`
if (_) b += ` (See: ${_})`
```

- 文案：`<h1>Authentication Successful</h1><p>You can close this window. Return to Claude Code.</p>`
- 场景：OAuth 成功后提示用户回到 CLI。
- 触发条件：当 `$`（oauth code）存在时返回 success HTML。
- 证据：`cli.js:1754`

```js
E.end(
  '<h1>Authentication Successful</h1><p>You can close this window. Return to Claude Code.</p>',
)
```

### U5.3 Runtime compatibility & setup restoration

- 文案：`Error: Claude Code requires Node.js version 18 or higher.`
- 场景：启动前置检查，Node 版本过低直接阻止运行并给出明确原因。
- 触发条件：`kC1()` 中 `parseInt(J)<18` 则 `console.error(...)` 并退出。
- 证据：`cli.js:5115`

```js
if (!J || parseInt(J) < 18)
  (console.error(
    D1.bold.red('Error: Claude Code requires Node.js version 18 or higher.'),
  ),
    process.exit(1))
```

- 文案：`Detected an interrupted Terminal.app setup. Your original settings have been restored. You may need to restart Terminal.app for the changes to take effect.`
- 场景：检测到 Terminal.app 配置中断时，告知已恢复且可能需要重启应用生效（减少用户误以为“CLI 把我终端弄坏了”的焦虑）。
- 触发条件：`p21()` 返回 `status==="restored"` 时输出黄字提示。
- 证据：`cli.js:5115`

```js
console.log(
  D1.yellow(
    'Detected an interrupted Terminal.app setup. Your original settings have been restored. You may need to restart Terminal.app for the changes to take effect.',
  ),
)
```

- 文案：`Failed to restore Terminal.app settings. Please manually restore your original settings with: defaults import com.apple.Terminal ${D.backupPath}.`
- 场景：自动恢复失败时，给出可手动执行的修复命令（明确下一步）。
- 触发条件：`p21()` 返回 `status==="failed"` 时输出红字提示。
- 证据：`cli.js:5115`

```js
console.error(
  D1.red(
    `Failed to restore Terminal.app settings. Please manually restore your original settings with: defaults import com.apple.Terminal ${D.backupPath}.`,
  ),
)
```

### U5.4 Connection status strings (compact, scannable)

- 文案：
  - `✓ Connected`
  - `⚠ Needs authentication`
  - `✗ Failed to connect`
  - `✗ Connection error`
- 场景：用极短的状态字符串呈现连接结果（适合列表 UI / 诊断输出）。
- 触发条件：`xN9()` 根据 `xO()` 返回的 `type` 选择对应字符串；catch 时返回 connection error。
- 证据：`cli.js:5115`

```js
if(B.type==="connected")return"✓ Connected";else if(B.type==="needs-auth")return"⚠ Needs authentication";else return"✗ Failed to connect"}catch(B){return"✗ Connection error"}
```

## U6) Feature discovery & build-variant messages

- 文案：`Tip: You can launch Claude Code with just \`claude\``
- 场景：当用户误用 `claude code`（把 `code` 当成子命令/提示词）时给出简短 tip（减少“我用错了？”的摩擦）。
- 触发条件：action handler 中检测 `X==="code"` 后 `console.warn(...)` 并把 `X` 置空。
- 证据：`cli.js:5120`

```js
console.warn(D1.yellow('Tip: You can launch Claude Code with just `claude`'))
```

- 文案：`Screenshot copying is not available in this build`
- 场景：功能在某些构建（build variant）不可用时，直接返回失败 + 清晰原因（避免 silent no-op）。
- 触发条件：`lE9()` 中 `if(!qG()) return { success:false, message:"Screenshot copying is not available in this build" }`。
- 证据：`cli.js:4107`

```js
if (!qG())
  return {
    success: !1,
    message: 'Screenshot copying is not available in this build',
  }
```

- 文案（quick win 引导）：`Press Ctrl+V to paste an image from clipboard`
- 场景：把高价值能力（图片粘贴）写成“一步可试”的提示语。
- 触发条件：feature 列表项 `image-paste` 的 `tryItPrompt` 字符串。
- 证据：`cli.js:876`

```js
tryItPrompt: 'Press Ctrl+V to paste an image from clipboard'
```

## U7) Help / command registry copy

- 文案：`Show help and available commands`
- 场景：help 命令在命令注册表中的描述，用于 help 列表。
- 触发条件：命令对象 `description:"Show help and available commands"`。
- 证据：`cli.js:3437`

```js
name:"help",description:"Show help and available commands"
```

- 文案（错误模板）：`Command ${A} not found. Available commands:`
- 场景：当用户输入未知命令时，抛出包含“可用命令列表”的错误（比单句 not found 更低摩擦）。
- 触发条件：`Qx(A,Q)` 中找不到命令对象时 `throw ReferenceError(...)`。
- 证据：`cli.js:4108`

```js
ncludes(A));if(!B)throw ReferenceError(`Command ${A} not found. Available commands: ${Q.map((G)=>{let Z=G.userFacingName();return G.aliases?`${Z} (aliases: ${G.aliases.join(", ")})`:Z}).sort((G,Z)=>G.localeCompare(Z)).join(", ")}`);return B
```

## U8) IDE integration & user choice prompt

- 文案：`Do you wish to enable auto-connect to IDE?`（选项：`Yes` / `No`）
- 场景：在外部终端场景下，询问是否启用 IDE 自动连接（可减少后续手动操作，但需要用户明确同意）。
- 触发条件：对话框渲染该标题，并提供 `options:[{label:"Yes"},{label:"No"}]`。
- 证据：`cli.js:3437`

```js
createElement(C,{color:"ide"},"Do you wish to enable auto-connect to IDE?")),kJ.default.createElement(T,{flexDirection:"column",paddingX:1},kJ.default.createElement(v0,{options:[{label:"Yes",value:"yes"},{label:"No",value:"no"}],onChange:B,defaultValue:"yes",onCancel:()=>A()}))
```

## U9) Keybindings validation UX copy

- 文案：`keybindings.json must contain an array`
- 场景：当用户 keybindings.json 不是数组时，给出明确错误与修复建议。
- 触发条件：校验函数发现 `!Array.isArray(A)` 时 push 一条 `{severity:"error", message:..., suggestion:...}`。
- 证据：`cli.js:861`

```js
if (!Array.isArray(A))
  return (
    Q.push({
      type: 'parse_error',
      severity: 'error',
      message: 'keybindings.json must contain an array',
      suggestion: 'Wrap your bindings in [ ]',
    }),
    Q
  )
```
