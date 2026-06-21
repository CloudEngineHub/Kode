import React, { useCallback, useMemo, useState } from 'react'
import { Instructions, Panel } from '../components'
import type { WizardData, WizardMethod } from './types'

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

const WIZARD_PATHS: Record<WizardMethod, number[]> = {
  quickGenerate: [0, 1, 2, 9],
  customGenerate: [0, 1, 2, 6, 7, 8, 9],
  manual: [0, 1, 3, 4, 5, 6, 7, 8, 9],
}

export function getWizardStepSubtitle(
  ctx: Pick<WizardContextValue, 'stepIndex' | 'totalSteps' | 'wizardData'>,
  subtitle: string,
): string {
  const method = ctx.wizardData.method
  if (!method) return `Step ${ctx.stepIndex + 1} - ${subtitle}`

  const path = WIZARD_PATHS[method]
  const pathIndex = path.indexOf(ctx.stepIndex)
  if (pathIndex === -1) {
    return `Step ${ctx.stepIndex + 1}/${ctx.totalSteps} - ${subtitle}`
  }

  return `Step ${pathIndex + 1}/${path.length} - ${subtitle}`
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
