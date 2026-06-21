// Keypress handler priority constants
// Higher priority handlers are called first and can stop propagation by returning true

// Base priorities
export const KEYPRESS_PRIORITY = {
  // Critical system dialogs (error alerts, confirmation prompts)
  CRITICAL: 200,

  // Fullscreen overlay screens (config, model picker, help, etc.)
  FULLSCREEN_OVERLAY: 100,

  // Modal dialogs within screens
  MODAL_DIALOG: 80,

  // Inline tool views and permission requests
  INLINE_TOOL: 60,

  // Global REPL controller (F-keys, global shortcuts)
  REPL_CONTROLLER: 50,

  // Completion/suggestion panels (must win over INPUT)
  COMPLETION: 40,

  // Input components (text inputs, cursors, editing)
  INPUT: 30,

  // Default priority (for components that don't specify)
  DEFAULT: 0,

  // Low priority handlers (background listeners)
  BACKGROUND: -50,
} as const

export type KeypressPriority =
  (typeof KEYPRESS_PRIORITY)[keyof typeof KEYPRESS_PRIORITY]
