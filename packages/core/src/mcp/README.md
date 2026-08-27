# MCP integration

This module owns Kode's MCP client integration and the MCP server entrypoint.
`apps/cli/src/dispatch.ts` routes MCP modes here, and `scripts/build.mjs` bundles
`packages/core/src/mcp/index.ts` as `dist/entrypoints/mcp.js`.

Tool schemas are produced through the shared tooling model so interactive CLI,
print mode, and MCP transport expose consistent capability contracts.
