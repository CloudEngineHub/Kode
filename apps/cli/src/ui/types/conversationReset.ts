import type { Message } from '#core/query'

export type ForkConvoWithMessagesOptions = {
  /**
   * Clears the visible viewport (not scrollback) before rendering the new convo.
   * Use this when switching to an unrelated session (e.g. `/resume`) to avoid
   * duplicated headers and visual artifacts.
   */
  clearViewport?: boolean
  /**
   * Resets the prompt composer (input/mode/pastes). Use this for commands that
   * should leave the user at a clean prompt after switching convos.
   */
  resetInput?: boolean
}

export type SetForkConvoWithMessagesOnTheNextRender = (
  messages: Message[],
  options?: ForkConvoWithMessagesOptions,
) => void
