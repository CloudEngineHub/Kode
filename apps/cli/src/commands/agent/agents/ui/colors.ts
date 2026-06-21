import { getTheme } from '#core/utils/theme'

export function panelBorderColor(kind: 'suggestion' | 'error'): string {
  const theme = getTheme()
  return kind === 'error' ? theme.error : theme.suggestion
}

export function themeColor(
  kind: 'error' | 'warning' | 'success' | 'suggestion',
): string {
  const theme = getTheme()
  switch (kind) {
    case 'error':
      return theme.error
    case 'warning':
      return theme.warning
    case 'success':
      return theme.success
    case 'suggestion':
    default:
      return theme.suggestion
  }
}
