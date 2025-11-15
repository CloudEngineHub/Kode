# OpenAI Adapter Layer

This module explains how Kode’s Anthropic-first conversation engine can selectively route requests through OpenAI Chat Completions or the new Responses API without exposing that complexity to the rest of the system. The adapter layer only runs when `USE_NEW_ADAPTERS !== 'false'` and a `ModelProfile` is available.

## Goals

- Preserve Anthropic-native data structures (`AssistantMessage`, `MessageParam`, tool blocks) everywhere outside the adapter layer.
- Translate those structures into a provider-neutral `UnifiedRequestParams` shape so different adapters can share logic.
- Map the unified format onto each provider’s transport (Chat Completions vs Responses API) and back into Anthropic-style `AssistantMessage` objects.

## Request Flow

1. **Anthropic Messages → Unified Params**  
   `queryOpenAI` (`src/services/claude.ts`) converts the existing Anthropic message history into OpenAI-style role/content pairs via `convertAnthropicMessagesToOpenAIMessages`, flattens system prompts, and builds a `UnifiedRequestParams` bundle (see `src/types/modelCapabilities.ts`). This bundle captures:
   - `messages`: already normalized to OpenAI format but still provider-neutral inside the adapters.
   - `systemPrompt`: array of strings, preserving multi-block Anthropic system prompts.
   - `tools`: tool metadata (names, descriptions, JSON schema) fetched once so adapters can reshape it.
   - `maxTokens`, `stream`, `reasoningEffort`, `verbosity`, `previousResponseId`, and `temperature` flags.

2. **Adapter Selection**  
   `ModelAdapterFactory` inspects the `ModelProfile` and capability table (`src/constants/modelCapabilities.ts`) to choose either:
   - `ChatCompletionsAdapter` for classic `/chat/completions` style providers.
   - `ResponsesAPIAdapter` when the provider natively supports `/responses`.

3. **Adapter-Specific Request Construction**
   - **Chat Completions (`src/services/adapters/chatCompletions.ts`)**
     - Reassembles a single message list including system prompts.
     - Picks the correct max-token field (`max_tokens` vs `max_completion_tokens`).
     - Attaches OpenAI function-calling tool descriptors, optional `stream_options`, reasoning effort, and verbosity when supported.
     - Handles model quirks (e.g., removes unsupported fields for `o1` models).
   - **Responses API (`src/services/adapters/responsesAPI.ts`)**
     - Converts chat-style messages into `input` items (message blocks, function-call outputs, images).
     - Moves system prompts into the `instructions` string.
     - Uses `max_output_tokens`, always enables streaming, and adds `include` entries for reasoning envelopes.
     - Emits the flat `tools` array expected by `/responses`, `tool_choice`, `parallel_tool_calls`, state IDs, verbosity controls, etc.

4. **Transport**  
   Both adapters delegate the actual network call to helpers in `src/services/openai.ts`:
   - Chat Completions requests use `getCompletionWithProfile` (legacy path) or the same helper `queryOpenAI` previously relied on.
   - Responses API requests go through `callGPT5ResponsesAPI`, which POSTs the adapter-built payload and returns the raw `Response` object for streaming support.

## Response Flow

1. **Raw Response → Unified Response**
   - `ChatCompletionsAdapter.parseResponse` pulls the first `choice`, extracts tool calls, and normalizes usage counts.
   - `ResponsesAPIAdapter.parseResponse` distinguishes between streaming vs JSON responses:
     - Streaming: incrementally decode SSE chunks, concatenate `response.output_text.delta`, and capture completed tool calls.
     - JSON: fold `output` message items into text blocks, gather tool-call items, and preserve `usage`/`response.id` for stateful follow-ups.
   - Both return a `UnifiedResponse` containing `content`, `toolCalls`, token usage, and optional `responseId`.

2. **Unified Response → Anthropic AssistantMessage**  
   Back in `queryOpenAI`, the unified response is wrapped in Anthropic’s schema: `content` becomes Ink-ready blocks, tool calls become `tool_use` entries, and usage numbers flow into `AssistantMessage.message.usage`. Consumers (UI, TaskTool, etc.) continue to see only Anthropic-style messages.

## Legacy Fallbacks

- If `USE_NEW_ADAPTERS === 'false'` or no `ModelProfile` is available, the system bypasses adapters entirely and hits `getCompletionWithProfile` / `getGPT5CompletionWithProfile`. These paths still rely on helper utilities in `src/services/openai.ts`.
- `ResponsesAPIAdapter` also carries compatibility flags (e.g., `previousResponseId`, `parallel_tool_calls`) so a single unified params structure works across official OpenAI and third-party providers.

## When to Extend This Layer

- **New OpenAI-style providers**: add capability metadata and, if necessary, a specialized adapter that extends `ModelAPIAdapter`.
- **Model-specific quirks**: keep conversions inside the adapter so upstream Anthropic abstractions stay untouched.
- **Stateful Responses**: leverage the `responseId` surfaced by `UnifiedResponse` to support follow-up calls that require `previous_response_id`.
