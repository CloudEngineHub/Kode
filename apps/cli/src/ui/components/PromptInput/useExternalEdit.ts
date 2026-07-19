import { useCallback, useEffect, useRef, useState } from 'react'
import { launchExternalEditor } from '#cli-utils/externalEditor'

type InlineMessageState = { show: boolean; text?: string }

export function useExternalEdit(args: {
  input: string
  isLoading: boolean
  isDisabled: boolean
  onInputChange: (text: string) => void
  setCursorOffset: (offset: number) => void
  setMessage: (message: InlineMessageState) => void
}) {
  const {
    input,
    isDisabled,
    isLoading,
    onInputChange,
    setCursorOffset,
    setMessage,
  } = args
  const [isEditingExternally, setIsEditingExternally] = useState(false)
  const mountedRef = useRef(true)
  const messageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearMessageTimeout = useCallback(() => {
    if (!messageTimeoutRef.current) return
    clearTimeout(messageTimeoutRef.current)
    messageTimeoutRef.current = null
  }, [])

  const scheduleMessageDismiss = useCallback(
    (delayMs: number) => {
      clearMessageTimeout()
      messageTimeoutRef.current = setTimeout(() => {
        messageTimeoutRef.current = null
        if (mountedRef.current) setMessage({ show: false })
      }, delayMs)
    },
    [clearMessageTimeout, setMessage],
  )

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      clearMessageTimeout()
    }
  }, [clearMessageTimeout])

  const handleExternalEdit = useCallback(async () => {
    if (isEditingExternally || isLoading || isDisabled) return
    setIsEditingExternally(true)
    clearMessageTimeout()
    setMessage({ show: true, text: 'Opening external editor...' })

    try {
      const result = await launchExternalEditor(input)
      if (!mountedRef.current) return

      if (result.text !== null) {
        onInputChange(result.text)
        setCursorOffset(result.text.length)
        setMessage({
          show: true,
          text: `Loaded from ${result.editorLabel ?? 'editor'}`,
        })
        scheduleMessageDismiss(3000)
      } else {
        setMessage({
          show: true,
          text:
            ('error' in result && result.error?.message) ??
            'External editor unavailable. Set $EDITOR or install code/nano/vim/notepad.',
        })
        scheduleMessageDismiss(4000)
      }
    } finally {
      if (mountedRef.current) setIsEditingExternally(false)
    }
  }, [
    clearMessageTimeout,
    input,
    isDisabled,
    isEditingExternally,
    isLoading,
    onInputChange,
    scheduleMessageDismiss,
    setCursorOffset,
    setMessage,
  ])

  return { isEditingExternally, handleExternalEdit }
}
