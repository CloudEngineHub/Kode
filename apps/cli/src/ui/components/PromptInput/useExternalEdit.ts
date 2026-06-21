import { useCallback, useState } from 'react'
import { launchExternalEditor } from '#cli-utils/externalEditor'
import { terminalCapabilityManager } from '#ui-ink/utils/terminalCapabilityManager'

type InlineMessageState = { show: boolean; text?: string }

export function useExternalEdit(args: {
  input: string
  isLoading: boolean
  isDisabled: boolean
  onInputChange: (text: string) => void
  setCursorOffset: (offset: number) => void
  setMessage: (message: InlineMessageState) => void
}) {
  const [isEditingExternally, setIsEditingExternally] = useState(false)

  const handleExternalEdit = useCallback(async () => {
    if (isEditingExternally || args.isLoading || args.isDisabled) return
    setIsEditingExternally(true)
    args.setMessage({ show: true, text: 'Opening external editor...' })

    const result = await launchExternalEditor(args.input)
    terminalCapabilityManager.enableSupportedModes()
    if (result.text !== null) {
      args.onInputChange(result.text)
      args.setCursorOffset(result.text.length)
      args.setMessage({
        show: true,
        text: `Loaded from ${result.editorLabel ?? 'editor'}`,
      })
      setTimeout(() => args.setMessage({ show: false }), 3000)
    } else {
      args.setMessage({
        show: true,
        text:
          ('error' in result && result.error?.message) ??
          'External editor unavailable. Set $EDITOR or install code/nano/vim/notepad.',
      })
      setTimeout(() => args.setMessage({ show: false }), 4000)
    }

    setIsEditingExternally(false)
  }, [args, isEditingExternally])

  return { isEditingExternally, handleExternalEdit }
}
