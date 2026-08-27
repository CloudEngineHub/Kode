# ACP host

This directory adapts Kode orchestration to Agent Client Protocol JSON-RPC over
stdio. `apps/cli/src/dispatch.ts --acp` routes to
`apps/server/src/acp/runAcpStdio.ts`.

`kodeAcpAgent.ts` maps ACP operations to internal behavior; `stdoutGuard.ts`
protects the protocol stream from non-JSON output. ACP transport and rendering
must not become core orchestration concerns.
