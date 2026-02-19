import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("AppErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-background text-foreground">
          <h1 className="text-xl font-semibold text-destructive mb-2">Something went wrong</h1>
          <p className="text-muted-foreground mb-4 max-w-lg text-center">
            The app hit an error. Check the browser console (F12 → Console) for details.
          </p>
          <pre className="text-left text-sm bg-muted p-4 rounded-md overflow-auto max-w-2xl max-h-48">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            className="mt-6 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
