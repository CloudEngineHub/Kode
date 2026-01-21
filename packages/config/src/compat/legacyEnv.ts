export const LEGACY_ENV = {
  configDir: 'CLAUDE_CONFIG_DIR',
  envFile: 'CLAUDE_ENV_FILE',
  pluginRoot: 'CLAUDE_PLUGIN_ROOT',
  projectDir: 'CLAUDE_PROJECT_DIR',
  codeEntryPoint: 'CLAUDE_CODE_ENTRYPOINT',
  agentSdkVersion: 'CLAUDE_AGENT_SDK_VERSION',
  codeMcpServerName: 'CLAUDE_CODE_MCP_SERVER_NAME',
  codeDebugLogsDir: 'CLAUDE_CODE_DEBUG_LOGS_DIR',
  codeSessionId: 'CLAUDE_CODE_SESSION_ID',
  codeTmpDir: 'CLAUDE_CODE_TMPDIR',
  codeDisableCommandInjectionCheck:
    'CLAUDE_CODE_DISABLE_COMMAND_INJECTION_CHECK',
  codeSkipPromptHistory: 'CLAUDE_CODE_SKIP_PROMPT_HISTORY',
  codePlanV2ExploreAgentCount: 'CLAUDE_CODE_PLAN_V2_EXPLORE_AGENT_COUNT',
  codePlanV2AgentCount: 'CLAUDE_CODE_PLAN_V2_AGENT_COUNT',
  codeExitAfterStopDelay: 'CLAUDE_CODE_EXIT_AFTER_STOP_DELAY',
  codeBubblewrap: 'CLAUDE_CODE_BUBBLEWRAP',
  codeBashSandboxShowIndicator: 'CLAUDE_CODE_BASH_SANDBOX_SHOW_INDICATOR',
  codeSubagentModel: 'CLAUDE_CODE_SUBAGENT_MODEL',
  codeContainerId: 'CLAUDE_CODE_CONTAINER_ID',
  codeRemoteSessionId: 'CLAUDE_CODE_REMOTE_SESSION_ID',
  codeAdditionalProtection: 'CLAUDE_CODE_ADDITIONAL_PROTECTION',
  codeUseBedrock: 'CLAUDE_CODE_USE_BEDROCK',
  codeUseVertex: 'CLAUDE_CODE_USE_VERTEX',
  codeUseFoundry: 'CLAUDE_CODE_USE_FOUNDRY',
} as const

export const LEGACY_CLAUDE_ENV = LEGACY_ENV
