import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sentry } from "@/lib/sentry";

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
  /** When this value changes the boundary resets without unmounting children. */
  resetKey?: string;
  /** Render a full-page overlay instead of an inline card. */
  fullPage?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  lastResetKey: string | undefined;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, lastResetKey: props.resetKey };
  }

  // Called when an error is thrown during render.
  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  // Resets error state when resetKey changes (e.g. route navigation).
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.lastResetKey) {
      if (state.hasError) {
        // Key changed while in error state → reset so the new page can render.
        return { hasError: false, error: null, lastResetKey: props.resetKey };
      }
      return { lastResetKey: props.resetKey };
    }
    return null;
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught error:", error.message, errorInfo.componentStack);
    try { Sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } }); } catch {}
  }

  private reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fullPage) {
        return (
          <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-8 text-center bg-background text-foreground">
            <AlertTriangle className="h-12 w-12 text-destructive" />
            <div className="space-y-2">
              <h1 className="text-2xl font-bold">Something went wrong</h1>
              <p className="text-muted-foreground max-w-md">
                {this.props.fallbackMessage || "An unexpected error occurred. Navigate to another page or refresh to continue."}
              </p>
            </div>
            {import.meta.env.DEV && this.state.error && (
              <pre className="max-w-lg text-xs text-destructive bg-destructive/10 p-3 rounded overflow-auto max-h-40 text-left">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex gap-3">
              <Button variant="outline" onClick={this.reset}>
                <RefreshCw className="h-4 w-4 mr-2" /> Try Again
              </Button>
              <Button asChild>
                <a href="/"><Home className="h-4 w-4 mr-2" /> Go Home</a>
              </Button>
            </div>
          </div>
        );
      }

      return (
        <div className="min-h-[300px] flex flex-col items-center justify-center gap-4 p-8 text-center">
          <AlertTriangle className="h-10 w-10 text-destructive" />
          <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            {this.props.fallbackMessage || "An unexpected error occurred. Please try again."}
          </p>
          {import.meta.env.DEV && this.state.error && (
            <pre className="mt-2 max-w-lg text-xs text-destructive bg-destructive/10 p-3 rounded overflow-auto max-h-40 text-left">
              {this.state.error.message}
            </pre>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={this.reset}>
              <RefreshCw className="h-4 w-4 mr-2" /> Try Again
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <a href="/"><Home className="h-4 w-4 mr-2" /> Home</a>
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
