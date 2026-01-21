import type { z } from 'zod'

import type { Tool } from './Tool'

export type ToolSpec<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput = any,
> = Pick<
  Tool<TInput, TOutput>,
  | 'name'
  | 'description'
  | 'inputSchema'
  | 'inputJSONSchema'
  | 'prompt'
  | 'userFacingName'
  | 'cachedDescription'
  | 'isEnabled'
  | 'isReadOnly'
  | 'isConcurrencySafe'
  | 'needsPermissions'
  | 'requiresUserInteraction'
  | 'validateInput'
  | 'renderResultForAssistant'
>

export type ToolRunner<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput = any,
> = Pick<Tool<TInput, TOutput>, 'name' | 'call'>

export type ToolPresenter<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput = any,
> = Pick<
  Tool<TInput, TOutput>,
  | 'name'
  | 'renderToolUseMessage'
  | 'renderToolUseRejectedMessage'
  | 'renderToolResultMessage'
>

export type SplitTool<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput = any,
> = {
  spec: ToolSpec<TInput, TOutput>
  runner: ToolRunner<TInput, TOutput>
  presenter: ToolPresenter<TInput, TOutput>
}

export function splitLegacyTool<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput = any,
>(tool: Tool<TInput, TOutput>): SplitTool<TInput, TOutput> {
  const spec: ToolSpec<TInput, TOutput> = {
    name: tool.name,
    // Tool descriptions may be async functions; adapters/spec consumers must not receive a Promise-returning function here.
    // Prefer the cached (resolved) string description when available.
    description:
      tool.cachedDescription ??
      (typeof tool.description === 'string' ? tool.description : undefined),
    inputSchema: tool.inputSchema,
    inputJSONSchema: tool.inputJSONSchema,
    prompt: tool.prompt,
    userFacingName: tool.userFacingName,
    cachedDescription: tool.cachedDescription,
    isEnabled: tool.isEnabled,
    isReadOnly: tool.isReadOnly,
    isConcurrencySafe: tool.isConcurrencySafe,
    needsPermissions: tool.needsPermissions,
    requiresUserInteraction: tool.requiresUserInteraction,
    validateInput: tool.validateInput,
    renderResultForAssistant: tool.renderResultForAssistant,
  }

  const runner: ToolRunner<TInput, TOutput> = {
    name: tool.name,
    call: (input, context) => tool.call(input, context),
  }

  const presenter: ToolPresenter<TInput, TOutput> = {
    name: tool.name,
    renderToolUseMessage: (input, options) =>
      tool.renderToolUseMessage(input, options),
    renderToolUseRejectedMessage: tool.renderToolUseRejectedMessage
      ? (...args) => tool.renderToolUseRejectedMessage!(...args)
      : undefined,
    renderToolResultMessage: tool.renderToolResultMessage
      ? (output, options) => tool.renderToolResultMessage!(output, options)
      : undefined,
  }

  return { spec, runner, presenter }
}
