/**
 * Keeps an exception inside the region that threw it. The rest of the window stays alive and the
 * region shows what failed with a retry action. React only supports error boundaries as classes.
 */

import { Component, type ReactNode } from 'react';
import { describeRenderError, shouldResetBoundary } from '../utils/errorMessages';
import { Button } from '../ui';

interface ErrorBoundaryProps {
  /** Name shown to the user: "Editor", "Panel", "ZPLC Studio". */
  region: string;
  /** Changing it clears a shown error, so a failing file or tab does not block the next one. */
  resetKey?: unknown;
  /** A second way out for a region where retrying the same state may fail again. */
  recovery?: { label: string; run: () => void };
  fullWindow?: boolean;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  resetKey: unknown;
}

export function RegionError({ region, error, onRetry, recovery, fullWindow = false }: {
  region: string;
  error: Error;
  onRetry: () => void;
  recovery?: { label: string; run: () => void };
  fullWindow?: boolean;
}) {
  return (
    <div
      role="alert"
      data-region-error={region}
      className={`${fullWindow ? 'h-screen w-screen' : 'h-full w-full'} flex items-center justify-center overflow-auto bg-[var(--color-surface-900)] p-6 text-center`}
    >
      <div className="max-w-md">
        <p className="text-lg font-medium text-[var(--color-accent-red)]">{region} stopped working</p>
        <p className="mt-2 break-words text-sm text-[var(--color-surface-300)]">{describeRenderError(error)}</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="primary" onClick={onRetry}>Retry</Button>
          {recovery && <Button onClick={() => { recovery.run(); onRetry(); }}>{recovery.label}</Button>}
        </div>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): { error: Error } {
    return { error: error instanceof Error ? error : new Error(describeRenderError(error)) };
  }

  static getDerivedStateFromProps(props: ErrorBoundaryProps, state: ErrorBoundaryState): Partial<ErrorBoundaryState> | null {
    return shouldResetBoundary(state.resetKey, props.resetKey) ? { error: null, resetKey: props.resetKey } : null;
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <RegionError
        region={this.props.region}
        error={error}
        recovery={this.props.recovery}
        fullWindow={this.props.fullWindow}
        onRetry={() => this.setState({ error: null })}
      />
    );
  }
}
