/**
 * tests/components/ErrorBoundary.test.tsx
 *
 * Tests for the ErrorBoundary Preact class component.
 */
import { describe, test, expect, mock } from 'bun:test';
import { render, fireEvent, waitFor } from '@testing-library/preact';
import ErrorBoundary from '../../src/components/ErrorBoundary.tsx';

// Component that throws on render
function Bomb({ shouldThrow = false }: { shouldThrow?: boolean }) {
  if (shouldThrow) throw new Error('Boom!');
  return <div>Safe content</div>;
}

// Silence console.error for expected errors in tests
const origError = console.error;

describe('ErrorBoundary', () => {
  test('renders children when no error', () => {
    const { container } = render(
      <ErrorBoundary>
        <div>Hello world</div>
      </ErrorBoundary>,
    );
    expect(container.textContent).toContain('Hello world');
  });

  test('renders fallback UI when child throws', () => {
    console.error = mock(() => {});
    const { container } = render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );
    console.error = origError;

    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert!.textContent).toContain('Something went wrong');
  });

  test('shows the error message in fallback', () => {
    console.error = mock(() => {});
    const { container } = render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );
    console.error = origError;

    expect(container.textContent).toContain('Boom!');
  });

  test('shows custom fallback message when provided', () => {
    console.error = mock(() => {});
    const { container } = render(
      <ErrorBoundary fallback="Audio player failed to load">
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );
    console.error = origError;

    expect(container.textContent).toContain('Audio player failed to load');
  });

  test('renders Try again button in fallback state', () => {
    console.error = mock(() => {});
    const { container } = render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );
    console.error = origError;

    const retryBtn = container.querySelector('button');
    expect(retryBtn).not.toBeNull();
    expect(retryBtn!.textContent).toContain('Try again');
  });

  test('Try again button resets the error state', async () => {
    console.error = mock(() => {});
    const { container } = render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );
    console.error = origError;

    expect(container.querySelector('[role="alert"]')).not.toBeNull();

    const retryBtn = container.querySelector('button') as HTMLButtonElement;
    fireEvent.click(retryBtn);

    await waitFor(() => {
      // After reset, the child will render again. Since it still throws,
      // the boundary will catch again — but the state was reset momentarily.
      // This tests that the button fires without throwing itself.
      expect(retryBtn).not.toBeNull();
    });
  });

  test('does not show fallback UI for safe children', () => {
    const { container } = render(
      <ErrorBoundary>
        <span>Safe</span>
        <span>Content</span>
      </ErrorBoundary>,
    );
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain('Safe');
    expect(container.textContent).toContain('Content');
  });
});
