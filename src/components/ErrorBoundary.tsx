/**
 * ErrorBoundary.tsx — Preact error boundary
 *
 * Wraps any island that might throw during render or in an effect.
 * Shows a minimal fallback UI instead of a blank or broken component.
 *
 * Usage:
 *   <ErrorBoundary label="Filter Panel">
 *     <FilterPanel ... />
 *   </ErrorBoundary>
 */
import { Component } from 'preact';
import type { ComponentChildren } from 'preact';

interface Props {
  /** Human-readable name shown in the fallback message */
  label?: string;
  /** Custom fallback node; defaults to a generic error card */
  fallback?: ComponentChildren;
  children: ComponentChildren;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // Log to console in development; swap for a real error reporter in production
    console.error(`[ErrorBoundary] ${this.props.label ?? 'component'} threw:`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          role="alert"
          style={[
            'padding: var(--space-4);',
            'border: 1px solid var(--color-border);',
            'border-radius: var(--radius-lg);',
            'background: var(--color-bg-card);',
            'color: var(--color-text-muted);',
            'font-size: var(--text-sm);',
            'text-align: center;',
          ].join('')}
        >
          <p style="margin: 0 0 var(--space-2);">
            {this.props.label
              ? `${this.props.label} could not load.`
              : 'This section could not load.'}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            style={[
              'font-size: var(--text-xs);',
              'color: var(--color-primary);',
              'background: none;',
              'border: none;',
              'cursor: pointer;',
              'text-decoration: underline;',
              'padding: 0;',
            ].join('')}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
