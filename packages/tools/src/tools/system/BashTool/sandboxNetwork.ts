import type { ToolUseContext } from '#core/tooling/Tool'
import type { BunShellSandboxPlan } from '#core/utils/sandbox/bunShellSandboxPlan'
import { ensureSandboxNetworkInfrastructure } from '#core/utils/sandbox/sandboxNetworkInfrastructure'
import type { BunShellSandboxOptions } from '#runtime/shell'
import { WebFetchTool } from '#tools/tools/network/WebFetchTool/WebFetchTool'

export async function maybeAttachSandboxNetworkPorts(args: {
  sandboxPlan: BunShellSandboxPlan
  sandboxOptions: BunShellSandboxOptions | undefined
  context: ToolUseContext
}): Promise<BunShellSandboxOptions | undefined> {
  const { sandboxPlan, sandboxOptions, context } = args
  if (!sandboxPlan.willSandbox) return sandboxOptions
  if (!sandboxOptions || sandboxOptions.enabled !== true) return sandboxOptions

  const platform = sandboxOptions.__platformOverride ?? process.platform
  if (platform !== 'darwin') return sandboxOptions

  const needsRestriction =
    'needsNetworkRestriction' in sandboxOptions
      ? sandboxOptions.needsNetworkRestriction === true
      : false
  if (!needsRestriction) return sandboxOptions

  const { abortController } = context
  const mode = context?.options?.toolPermissionContext?.mode ?? 'default'
  const shouldAvoidPermissionPrompts = Boolean(
    context?.options?.shouldAvoidPermissionPrompts,
  )
  const requestToolUsePermission =
    typeof context?.options?.requestToolUsePermission === 'function'
      ? context.options.requestToolUsePermission
      : undefined

  const ports = await ensureSandboxNetworkInfrastructure({
    runtimeConfig: sandboxPlan.runtimeConfig,
    permissionCallback: async ({ host, port }) => {
      if (mode === 'acceptEdits' || mode === 'bypassPermissions') return true
      if (mode === 'dontAsk' || shouldAvoidPermissionPrompts) return false
      if (!requestToolUsePermission) return false
      if (abortController.signal.aborted) return false

      const hostForUrl =
        host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
      const url = `http://${hostForUrl}:${port}/`

      const result = await requestToolUsePermission(
        {
          tool: WebFetchTool,
          description: 'Network request outside of sandbox',
          input: { url },
          commandPrefix: null,
          suggestions: undefined,
          riskScore: null,
        },
        context,
      )

      return result.result === true
    },
  })

  return {
    ...sandboxOptions,
    httpProxyPort: ports.httpProxyPort,
    socksProxyPort: ports.socksProxyPort,
  }
}
