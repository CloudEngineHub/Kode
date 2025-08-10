/**
 * 统一的全局日志系统
 * 普通模式：完全静默，零日志输出
 * 调试模式：详细日志输出
 */

// 环境检测 - 只在明确的调试标志下才启用日志
const isDebugMode = () => 
  process.argv.includes('--debug') || 
  process.argv.includes('--verbose') || 
  process.env.NODE_ENV === 'development'

// 全局日志开关 - 普通模式下完全关闭
const LOGGING_ENABLED = isDebugMode()

/**
 * 统一的日志接口
 * 普通模式下所有调用都是空操作
 */
export const globalLogger = {
  // 标准日志级别
  debug: (...args: any[]) => {
    if (LOGGING_ENABLED) console.debug(...args)
  },
  
  info: (...args: any[]) => {
    if (LOGGING_ENABLED) console.info(...args)
  },
  
  warn: (...args: any[]) => {
    if (LOGGING_ENABLED) console.warn(...args)
  },
  
  error: (...args: any[]) => {
    if (LOGGING_ENABLED) console.error(...args)
  },
  
  log: (...args: any[]) => {
    if (LOGGING_ENABLED) console.log(...args)
  },
  
  // 兼容现有的console.log调用
  console: (...args: any[]) => {
    if (LOGGING_ENABLED) console.log(...args)
  },

  // 模型切换相关日志
  modelSwitch: (message: string, data?: any) => {
    if (LOGGING_ENABLED) {
      console.log(`🔄 Model Switch: ${message}`, data ? data : '')
    }
  },

  // API 相关日志
  api: (message: string, data?: any) => {
    if (LOGGING_ENABLED) {
      console.log(`🌐 API: ${message}`, data ? data : '')
    }
  },

  // 用户友好的状态日志 - 只在调试模式下显示
  status: (message: string) => {
    if (LOGGING_ENABLED) {
      console.log(`ℹ️ ${message}`)
    }
  },

  // 检查日志是否启用
  isEnabled: () => LOGGING_ENABLED
}

// 兼容性：导出为默认console替代
export const logger = globalLogger

// 用于替换现有的console.log调用
export const debugLog = globalLogger.console
export const statusLog = globalLogger.status