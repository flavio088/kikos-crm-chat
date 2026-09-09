import { Component, type ReactNode } from "react";

type ErrorBoundaryProps = { readonly fallback: ReactNode; readonly children: ReactNode };
type ErrorBoundaryState = { readonly failed: boolean };

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
