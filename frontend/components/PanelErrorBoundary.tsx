import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  label: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  retryCount: number;
}

export class PanelErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, retryCount: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[PanelErrorBoundary] ${this.props.label}:`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="panel loading-panel">
          <p>
            <strong>{this.props.label}</strong> hit an error. The demo can continue.
          </p>
          <button
            type="button"
            className="action-button"
            style={{ maxWidth: 120, marginTop: 10 }}
            onClick={() => this.setState((prev) => ({ hasError: false, retryCount: prev.retryCount + 1 }))}
          >
            Retry
          </button>
        </section>
      );
    }
    return <div key={this.state.retryCount}>{this.props.children}</div>;
  }
}
