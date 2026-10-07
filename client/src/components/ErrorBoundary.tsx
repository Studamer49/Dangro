import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Rendered instead of the crashed subtree. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time crashes (missing hooks, undefined data, bad lazy
 * loads) so the whole app never turns into a blank page again.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
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
