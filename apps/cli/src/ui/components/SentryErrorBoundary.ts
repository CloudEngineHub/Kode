import * as React from 'react'
import { logError } from '#core/utils/log'

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
}

export class SentryErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error): void {
    // Don't report user-initiated cancellations to Sentry
    if (
      error.name === 'AbortError' ||
      error.message?.includes('abort') ||
      error.message?.includes('The operation was aborted')
    ) {
      return
    }
    logError(error)
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return null
    }

    return this.props.children
  }
}
