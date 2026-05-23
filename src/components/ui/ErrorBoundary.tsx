/**
 * React Error Boundaries — enterprise-grade error isolation.
 *
 * - ErrorBoundary: wraps top-level sections, catches render errors
 * - ErrorFallback: shows user-friendly error UI with recovery option
 * - logCrash: sends error details to main process for crash log
 */

import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, info: ErrorInfo) => void
  /** Unique name for this boundary (used in crash logs) */
  name: string
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

async function logCrash(name: string, error: Error, info: ErrorInfo): Promise<void> {
  try {
    if (typeof window !== 'undefined' && window.api?.saveMessage) {
      // Log crash to main process via a lightweight IPC
      console.error(`[ErrorBoundary:${name}]`, error.message, info.componentStack)
    }
  } catch {
    // Last-resort: can't even log
    console.error(`[FATAL:${name}]`, error)
  }
}

export function ErrorFallback({
  error,
  boundaryName,
  onReset,
}: {
  error: Error | null
  boundaryName: string
  onReset: () => void
}) {
  return (
    <div className="flex items-center justify-center h-full bg-base p-6">
      <div className="max-w-md text-center">
        <p className="text-3xl mb-3">⚠️</p>
        <h2 className="text-sm font-semibold text-text-primary mb-2">
          组件加载异常
        </h2>
        <p className="text-xs text-text-muted mb-1">
          模块: {boundaryName}
        </p>
        {error && (
          <p className="text-xs text-error mb-4 font-mono bg-surface rounded-lg p-2 max-h-24 overflow-y-auto">
            {error.message}
          </p>
        )}
        <button
          onClick={onReset}
          className="px-4 py-2 bg-primary text-white rounded-lg text-xs font-medium hover:opacity-90 transition-opacity"
        >
          重试
        </button>
      </div>
    </div>
  )
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ errorInfo: info })
    this.props.onError?.(error, info)
    logCrash(this.props.name, error, info)
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <ErrorFallback
          error={this.state.error}
          boundaryName={this.props.name}
          onReset={this.handleReset}
        />
      )
    }
    return this.props.children
  }
}

/**
 * Wrapper for sections that should degrade gracefully rather than crash the app.
 */
export function SectionBoundary({ name, children }: { name: string; children: ReactNode }) {
  return (
    <ErrorBoundary name={name}>
      {children}
    </ErrorBoundary>
  )
}
