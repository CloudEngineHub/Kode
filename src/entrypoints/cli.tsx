#!/usr/bin/env bun
import '@utils/config/sanitizeAnthropicEnv'
import { initSentry } from '@services/sentry'
import {
  ensurePackagedRuntimeEnv,
  ensureYogaWasmPath,
} from './cli/bootstrapEnv'
import { installProcessHandlers, runCli } from './cli/runCli'

initSentry()
ensurePackagedRuntimeEnv()
ensureYogaWasmPath(import.meta.url)

installProcessHandlers()
void runCli()
