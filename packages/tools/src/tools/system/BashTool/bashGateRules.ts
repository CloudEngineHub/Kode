export {
  getBashGateFindings,
  shouldReviewBashCommand,
  type BashGateFinding,
} from '#core/safety/bash-gate/bashGateRules'

export type BashGateFindingSeverity = 'high' | 'medium'

export type BashGateFindingCategory =
  | 'data_loss'
  | 'fs_delete'
  | 'fs_write'
  | 'privilege'
  | 'remote_exec'
  | 'persistence'
  | 'credentials'
  | 'git_data_loss'
  | 'infra_destroy'
  | 'container'
  | 'system'
  | 'process'
  | 'network'
  | 'pkg'
  | 'obfuscation'

export type SimpleRule = {
  code: string
  severity: BashGateFindingSeverity
  category: BashGateFindingCategory
  title: string
  patterns: RegExp[]
  evidence?: (m: RegExpMatchArray) => string
}
