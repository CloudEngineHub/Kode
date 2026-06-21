import { getModelManager } from '#core/utils/model'
import { generateKodeContext } from '#core/ai/llm/kodeContext'
import { generateSystemReminders } from './systemReminder'

function isGPT5Model(modelName: string): boolean {
  return modelName.startsWith('gpt-5')
}

export function formatSystemPromptWithContext(
  systemPrompt: string[],
  context: { [k: string]: string },
  agentId?: string,
  skipContextReminders = false, // Parameter kept for API compatibility but not used anymore
): { systemPrompt: string[]; reminders: string } {
  // 构建增强的系统提示，保持与原先直接注入方式的兼容
  const enhancedPrompt = [...systemPrompt]
  let reminders = ''

  // Step 0: Add GPT-5 Agent persistence support for coding tasks
  const modelManager = getModelManager()
  const modelProfile = modelManager.getModel('main')
  if (modelProfile && isGPT5Model(modelProfile.modelName)) {
    // Add coding-specific persistence instructions based on GPT-5 documentation
    const persistencePrompts = [
      '\n# Agent Persistence for Long-Running Coding Tasks',
      'You are working on a coding project that may involve multiple steps and iterations. Please maintain context and continuity throughout the session:',
      '- Remember architectural decisions and design patterns established earlier',
      '- Keep track of file modifications and their relationships',
      '- Maintain awareness of the overall project structure and goals',
      '- Reference previous implementations when making related changes',
      '- Ensure consistency with existing code style and conventions',
      '- Build incrementally on previous work rather than starting from scratch',
    ]
    enhancedPrompt.push(...persistencePrompts)
  }

  // 只有当上下文存在时才处理
  const hasContext = Object.entries(context).length > 0

  if (hasContext) {
    // 步骤1: 直接注入 Kode 上下文到系统提示 - 对齐官方设计
    if (!skipContextReminders) {
      const kodeContext = generateKodeContext()
      if (kodeContext) {
        // 添加分隔符和标识，使项目文档在系统提示中更清晰
        enhancedPrompt.push('\n---\n# 项目上下文\n')
        enhancedPrompt.push(kodeContext)
        enhancedPrompt.push('\n---\n')
      }
    }

    // 步骤2: 生成其他动态提醒返回给调用方 - 保持现有动态提醒功能
    const reminderMessages = generateSystemReminders(hasContext, agentId)
    if (reminderMessages.length > 0) {
      reminders = reminderMessages.map(r => r.content).join('\n') + '\n'
    }

    // 步骤3: 添加其他上下文到系统提示
    enhancedPrompt.push(
      `\nAs you answer the user's questions, you can use the following context:\n`,
    )

    // 过滤掉已经由 Kode 上下文处理的项目文档（避免重复）
    const filteredContext = Object.fromEntries(
      Object.entries(context).filter(
        ([key]) => key !== 'projectDocs' && key !== 'userDocs',
      ),
    )

    enhancedPrompt.push(
      ...Object.entries(filteredContext).map(
        ([key, value]) => `<context name="${key}">${value}</context>`,
      ),
    )
  }

  return { systemPrompt: enhancedPrompt, reminders }
}
