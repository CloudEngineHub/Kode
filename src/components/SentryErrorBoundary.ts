import * as React from 'react'
import { captureException } from '../services/sentry'

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
}

export class SentryErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    ;(this as any).state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error): void {
    captureException(error)
  }

  render(): React.ReactNode {
    if ((this as any).state.hasError) {
      return null
    }

    return (this as any).props.children
  }
}
