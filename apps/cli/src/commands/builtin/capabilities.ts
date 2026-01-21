import type { Command } from '../types'

export default {
  type: 'prompt',
  name: 'capabilities',
  description: 'Check and manage Kode capabilities via agent',
  isEnabled: true,
  isHidden: false,
  progressMessage: 'managing capabilities',
  disableNonInteractive: true,
  allowedTools: [
    'Task',
    'SlashCommand',
    'Skill',
    'Read(~/**)',
    'Edit(~/.kode/settings.json)',
    'Read(.kode/**)',
    'Edit(.kode/**)',
  ],
  userFacingName() {
    return 'capabilities'
  },
  async getPromptForCommand(args) {
    const prompt =
      args.trim() ||
      [
        'Run a Kode capabilities audit and auto-fix the basics with minimal friction.',
        '',
        'Checklist to assess (report each as OK / Needs attention):',
        '- statusline (configured + renders)',
        '- output style (configured)',
        '- plugins & LSP readiness (configured/available)',
        '- permission friction (unexpected denials / repeated prompts)',
        '',
        'Rules:',
        '- No hard install menus or long command lists.',
        '- Prefer agent-driven actions (Task/Skill/SlashCommand, file edits) and verify each change.',
        '- Keep the default output short; put verbose evidence/logs under a “Details” section.',
        '',
        'Then apply the minimal safe fixes you can without asking me to memorize subcommands; only ask a question when a choice is required.',
      ].join('\n')
    return [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Create a Task with subagent_type "capabilities-manager" and the prompt ${JSON.stringify(prompt)}`,
          },
        ],
      },
    ]
  },
} satisfies Command
