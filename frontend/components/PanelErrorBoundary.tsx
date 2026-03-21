import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  label: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class PanelErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
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
            onClick={() => this.setState({ hasError: false })}
          >
            Retry
          </button>
        </section>
      );
    }
    return this.props.children;
  }
}
