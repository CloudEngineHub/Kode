import React, { useCallback, useMemo, useState } from 'react'
import { Instructions, Panel } from '../components'
import type { WizardData } from './types'

export type WizardContextValue = {
  stepIndex: number
  totalSteps: number
  wizardData: WizardData
  updateWizardData: (patch: Partial<WizardData>) => void
  goNext: () => void
  goBack: () => void
  goToStep: (index: number) => void
  cancel: () => void
  done: () => void
}

export function Wizard(props: {
  steps: Array<(ctx: WizardContextValue) => React.ReactNode>
  initialData?: WizardData
  onCancel: () => void
  onDone: (data: WizardData) => void
}) {
  const [stepIndex, setStepIndex] = useState(0)
  const [data, setData] = useState<WizardData>(props.initialData ?? {})
  const [history, setHistory] = useState<number[]>([])

  const goNext = useCallback(() => {
    setHistory(prev => [...prev, stepIndex])
    setStepIndex(prev => Math.min(prev + 1, props.steps.length - 1))
  }, [props.steps.length, stepIndex])

  const goBack = useCallback(() => {
    setHistory(prev => {
      if (prev.length === 0) {
        props.onCancel()
        return prev
      }
      const next = [...prev]
      const last = next.pop()
      if (typeof last === 'number') setStepIndex(last)
      return next
    })
  }, [props.onCancel])

  const goToStep = useCallback(
    (index: number) => {
      setHistory(prev => [...prev, stepIndex])
      setStepIndex(() => Math.max(0, Math.min(index, props.steps.length - 1)))
    },
    [props.steps.length, stepIndex],
  )

  const updateWizardData = useCallback((patch: Partial<WizardData>) => {
    setData(prev => ({ ...prev, ...patch }))
  }, [])

  const cancel = useCallback(() => props.onCancel(), [props.onCancel])
  const done = useCallback(() => props.onDone(data), [props, data])

  const ctx: WizardContextValue = useMemo(
    () => ({
      stepIndex,
      totalSteps: props.steps.length,
      wizardData: data,
      updateWizardData,
      goNext,
      goBack,
      goToStep,
      cancel,
      done,
    }),
    [
      data,
      done,
      goBack,
      goNext,
      goToStep,
      props.steps.length,
      stepIndex,
      updateWizardData,
      cancel,
    ],
  )

  return <>{props.steps[stepIndex]?.(ctx) ?? null}</>
}

export function WizardPanel(props: {
  subtitle: string
  footerText?: string
  children?: React.ReactNode
}) {
  return (
    <>
      <Panel title="Create new agent" subtitle={props.subtitle}>
        {props.children}
      </Panel>
      <Instructions instructions={props.footerText} />
    </>
  )
}
