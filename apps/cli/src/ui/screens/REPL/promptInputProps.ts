import type React from 'react'
import type PromptInput from '#ui-ink/components/PromptInput'

type PromptInputProps = React.ComponentProps<typeof PromptInput>

export function buildPromptInputProps(args: {
  commands: PromptInputProps['commands']
  forkNumber: PromptInputProps['forkNumber']
  messageLogName: PromptInputProps['messageLogName']
  initialPrompt?: PromptInputProps['initialPrompt']
  tools: PromptInputProps['tools']
  disableSlashCommands: boolean
  isDisabled: boolean
  isLoading: PromptInputProps['isLoading']
  onQuery: PromptInputProps['onQuery']
  debug: PromptInputProps['debug']
  verbose: PromptInputProps['verbose']
  messages: PromptInputProps['messages']
  setToolJSX: PromptInputProps['setToolJSX']
  input: PromptInputProps['input']
  onInputChange: PromptInputProps['onInputChange']
  mode: PromptInputProps['mode']
  onModeChange: PromptInputProps['onModeChange']
  submitCount: PromptInputProps['submitCount']
  onSubmitCountChange: PromptInputProps['onSubmitCountChange']
  setIsLoading: PromptInputProps['setIsLoading']
  setAbortController: PromptInputProps['setAbortController']
  uiRefreshCounter: PromptInputProps['uiRefreshCounter']
  onShowMessageSelector: PromptInputProps['onShowMessageSelector']
  setForkConvoWithMessagesOnTheNextRender: PromptInputProps['setForkConvoWithMessagesOnTheNextRender']
  readFileTimestamps: PromptInputProps['readFileTimestamps']
  abortController: PromptInputProps['abortController']
  onManageTasks?: PromptInputProps['onManageTasks']
  restorePastes?: PromptInputProps['restorePastes']
  onRestorePastesApplied?: PromptInputProps['onRestorePastesApplied']
  draftPastes?: PromptInputProps['draftPastes']
  onDraftPastesChange?: PromptInputProps['onDraftPastesChange']
}): PromptInputProps {
  return {
    commands: args.commands,
    forkNumber: args.forkNumber,
    messageLogName: args.messageLogName,
    initialPrompt: args.initialPrompt,
    tools: args.tools,
    disableSlashCommands: args.disableSlashCommands,
    isDisabled: args.isDisabled,
    isLoading: args.isLoading,
    onQuery: args.onQuery,
    debug: args.debug,
    verbose: args.verbose,
    messages: args.messages,
    setToolJSX: args.setToolJSX,
    input: args.input,
    onInputChange: args.onInputChange,
    mode: args.mode,
    onModeChange: args.onModeChange,
    submitCount: args.submitCount,
    onSubmitCountChange: args.onSubmitCountChange,
    setIsLoading: args.setIsLoading,
    setAbortController: args.setAbortController,
    uiRefreshCounter: args.uiRefreshCounter,
    onShowMessageSelector: args.onShowMessageSelector,
    setForkConvoWithMessagesOnTheNextRender:
      args.setForkConvoWithMessagesOnTheNextRender,
    readFileTimestamps: args.readFileTimestamps,
    abortController: args.abortController,
    onManageTasks: args.onManageTasks,
    restorePastes: args.restorePastes,
    onRestorePastesApplied: args.onRestorePastesApplied,
    draftPastes: args.draftPastes,
    onDraftPastesChange: args.onDraftPastesChange,
  }
}
