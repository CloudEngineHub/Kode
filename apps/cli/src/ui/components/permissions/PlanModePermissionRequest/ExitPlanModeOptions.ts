export type ExitPlanModeOptionValue =
  | 'yes-bypass-permissions'
  | 'yes-accept-edits'
  | 'yes-default'
  | 'yes-accept-edits-keep-context'
  | 'yes-default-keep-context'
  | 'no'

export type ExitPlanModeOption =
  | {
      type?: 'option'
      label: string
      value: Exclude<ExitPlanModeOptionValue, 'no'>
    }
  | {
      type: 'input'
      label: string
      value: 'no'
      placeholder: string
    }

export function getExitPlanModeOptions(args: {
  bypassAvailable: boolean
}): ExitPlanModeOption[] {
  const options: ExitPlanModeOption[] = []

  options.push(
    args.bypassAvailable
      ? {
          label: 'Yes, clear context and bypass permissions',
          value: 'yes-bypass-permissions',
        }
      : {
          label: 'Yes, clear context and auto-accept edits (shift+tab)',
          value: 'yes-accept-edits',
        },
  )
  options.push({
    label: 'Yes, and manually approve edits',
    value: 'yes-default',
  })

  options.push({
    label: args.bypassAvailable
      ? 'Yes, and bypass permissions'
      : 'Yes, auto-accept edits',
    value: 'yes-accept-edits-keep-context',
  })

  options.push({
    label: 'Yes, manually approve edits',
    value: 'yes-default-keep-context',
  })

  options.push({
    type: 'input',
    label: 'No, keep planning',
    value: 'no',
    placeholder: 'Type here to tell Kode Agent what to change',
  })

  return options
}

export function __getExitPlanModeOptionsForTests(args: {
  bypassAvailable: boolean
}): ExitPlanModeOption[] {
  return getExitPlanModeOptions(args)
}
