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
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-950 px-6 text-center text-gray-100">
        <div className="text-5xl">⚠️</div>
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="max-w-md text-sm text-gray-400">
          The page hit an unexpected error. Reloading usually fixes it.
        </p>
        <pre className="max-w-full overflow-x-auto rounded-lg bg-gray-900 px-4 py-3 text-left text-xs text-red-400">
          {error.message}
        </pre>
        {componentStack && (
          <details className="max-w-full text-left">
            <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-200">
              Where it happened
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-gray-900 px-4 py-3 text-left text-[11px] text-gray-300">
              {componentStack.trim()}
            </pre>
          </details>
        )}
        <div className="flex gap-3">
          <button
            onClick={this.reset}
            className="rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="rounded-md border border-gray-700 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-900"
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
