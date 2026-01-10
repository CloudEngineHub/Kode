export type ExitPlanModeOptionValue =
  | 'yes-bypass'
  | 'yes-accept'
  | 'yes-default'
  | 'no'

export type ExitPlanModeOption = {
  label: string
  value: ExitPlanModeOptionValue
}

export function getExitPlanModeOptions(args: {
  bypassAvailable: boolean
}): ExitPlanModeOption[] {
  const options: ExitPlanModeOption[] = []

  options.push(
    args.bypassAvailable
      ? { label: 'Yes, and bypass permissions', value: 'yes-bypass' }
      : { label: 'Yes, and auto-accept edits', value: 'yes-accept' },
  )

  options.push({
    label: 'Yes, and manually approve edits',
    value: 'yes-default',
  })
  options.push({ label: 'No, keep planning', value: 'no' })

  return options
}

export function __getExitPlanModeOptionsForTests(args: {
  bypassAvailable: boolean
}): ExitPlanModeOption[] {
  return getExitPlanModeOptions(args)
}
