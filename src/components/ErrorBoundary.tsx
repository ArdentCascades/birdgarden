/**
 * ErrorBoundary.tsx — Preact class component error boundary
 *
 * Wraps islands/components that may throw during render.
 * Shows a friendly fallback UI instead of crashing the whole page.
 */
import { Component } from 'preact';
import type { ComponentChildren } from 'preact';

interface Props {
  children: ComponentChildren;
  /** Optional custom fallback message */
  fallback?: string;
}

interface State {
  hasError: boolean;
  message: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(err: unknown): State {
    const message =
      err instanceof Error ? err.message : 'An unexpected error occurred.';
    return { hasError: true, message };
  }

  componentDidCatch(err: unknown, info: { componentStack?: string }) {
    console.error('[ErrorBoundary]', err, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          style="padding:var(--space-6);text-align:center;color:var(--color-text-muted);border:1px solid var(--color-border);border-radius:var(--radius-lg);background:var(--color-bg-subtle);"
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 32 32"
            fill="none"
            aria-hidden="true"
            style="margin:0 auto var(--space-3);"
          >
            <circle cx="16" cy="16" r="14" stroke="var(--color-error)" stroke-width="2"/>
            <path d="M16 9v8M16 21v2" stroke="var(--color-error)" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <p style="font-weight:var(--font-medium);margin-bottom:var(--space-2);">
            {this.props.fallback ?? 'Something went wrong'}
          </p>
          <p style="font-size:var(--text-sm);">
            {this.state.message}
          </p>
          <button
            type="button"
            class="btn btn-outline"
            style="margin-top:var(--space-4);"
            onClick={() => this.setState({ hasError: false, message: '' })}
          >
            Try again
          </button>
        </div>
      );
    }

    return <>{this.props.children}</>;
  }
}
