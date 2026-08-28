import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Changing this resets the boundary — used to recover on navigation. */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/**
 * One malformed response should cost the user a card, not the whole dashboard.
 * React unmounts the entire tree on an uncaught render error, so without this a
 * single unexpected null renders a blank white page with no way back.
 */
export default class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // No telemetry endpoint yet; the console is the only place this can go.
    console.error('Dashboard render error', error, info.componentStack);
  }

  override componentDidUpdate(prev: Props): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="card" style={{ maxWidth: 620 }}>
        <h1 className="h2" style={{ marginBottom: 8 }}>This page failed to render</h1>
        <p className="muted">
          Something in the data Auro received did not match what this screen expected. Your session is
          still valid — the rest of the dashboard works.
        </p>
        <pre
          className="mono subtle"
          style={{
            whiteSpace: 'pre-wrap',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: 12,
            marginTop: 12,
            maxHeight: 180,
            overflow: 'auto',
          }}
        >
          {error.message}
        </pre>
        <div className="row gap-2" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
          <button type="button" className="btn btn-sm" onClick={() => window.location.reload()}>
            Reload dashboard
          </button>
        </div>
      </div>
    );
  }
}
