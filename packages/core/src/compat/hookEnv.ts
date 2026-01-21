import { LEGACY_ENV } from './legacyEnv'

export const KODE_HOOK_ENV = {
  projectDir: 'KODE_PROJECT_DIR',
  pluginRoot: 'KODE_PLUGIN_ROOT',
  envFile: 'KODE_ENV_FILE',
} as const

export function buildHookExecEnv(args: {
  projectDir: string
  pluginRoot?: string | null
  envFilePath?: string | null
}): Record<string, string> {
  const env: Record<string, string> = {
    [KODE_HOOK_ENV.projectDir]: args.projectDir,
    [LEGACY_ENV.projectDir]: args.projectDir,
  }

  if (args.pluginRoot) {
    env[KODE_HOOK_ENV.pluginRoot] = args.pluginRoot
    env[LEGACY_ENV.pluginRoot] = args.pluginRoot
  }

  if (args.envFilePath) {
    env[KODE_HOOK_ENV.envFile] = args.envFilePath
    env[LEGACY_ENV.envFile] = args.envFilePath
  }

  return env
}
