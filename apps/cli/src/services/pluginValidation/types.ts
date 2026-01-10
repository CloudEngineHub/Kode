export type ValidationIssue = {
  path: string
  message: string
}

export type ValidationResult = {
  success: boolean
  fileType: 'plugin' | 'marketplace'
  filePath: string
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
}
