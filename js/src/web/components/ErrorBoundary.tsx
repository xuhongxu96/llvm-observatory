// Keeps an error in one pane from taking down the app: the pane shows the error instead.
// Give it a `key` that changes with what the pane shows, to try again.
import { Component, type ReactNode } from "react";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) return <div className="trace-empty">this pane failed: {this.state.error.message}</div>;
    return this.props.children;
  }
}
