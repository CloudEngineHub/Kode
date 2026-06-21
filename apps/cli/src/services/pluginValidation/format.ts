import figures from 'figures'

import type { ValidationResult } from './types'

export function formatValidationResult(result: ValidationResult): string {
  const lines: string[] = []
  for (const err of result.errors) {
    lines.push(`  ${figures.pointer} ${err.path}: ${err.message}`)
  }
  for (const warn of result.warnings) {
    lines.push(`  ${figures.pointer} ${warn.path}: ${warn.message}`)
  }

  lines.push('')

  if (result.success) {
    lines.push(
      result.warnings.length > 0
        ? `${figures.tick} Validation passed with warnings`
        : `${figures.tick} Validation passed`,
    )
  } else {
    lines.push(`${figures.cross} Validation failed`)
  }

  return lines.join('\n')
}
