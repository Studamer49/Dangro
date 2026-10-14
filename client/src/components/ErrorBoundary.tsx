import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Rendered instead of the crashed subtree. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string | null;
}

/**
 * Catches render-time crashes (missing hooks, undefined data, bad lazy
 * loads) so the whole app never turns into a blank page again.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary]", error, info.componentStack);
    // Keep the stack on the error page too: without it, "Cannot read
    // properties of null" gives no hint which component crashed.
    this.setState({ componentStack: info.componentStack ?? null });
  }

  reset = (): void => {
    this.setState({ error: null, componentStack: null });
  };

  render(): ReactNode {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
        <div className="glass-panel flex w-full max-w-lg flex-col items-center rounded-2xl p-8">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/15 text-red-400">
            <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M12 9v4m0 4h.01M10.3 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.7 3.86a2 2 0 00-3.4 0z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">Something went wrong</h1>
          <p className="mt-2 max-w-sm text-sm text-gray-400">
            The page hit an unexpected error. Reloading usually fixes it.
          </p>

          <pre className="mt-5 max-w-full overflow-x-auto rounded-xl border border-red-500/20 bg-red-500/[0.07] px-4 py-3 text-left text-xs text-red-300">
            {error.message}
          </pre>

          {componentStack && (
            <details className="mt-3 max-w-full text-left">
              <summary className="cursor-pointer text-xs font-semibold text-gray-500 transition-colors hover:text-gray-300">
                Where it happened
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded-xl border border-gray-700/60 bg-gray-950/60 px-4 py-3 text-left text-[11px] leading-relaxed text-gray-400">
                {componentStack.trim()}
              </pre>
            </details>
          )}

          <div className="mt-6 flex gap-2">
            <button onClick={this.reset} className="btn-primary">
              Try again
            </button>
            <button onClick={() => window.location.reload()} className="btn-ghost">
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
