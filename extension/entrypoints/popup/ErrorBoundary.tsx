/**
 * Catches render errors in one popup section and shows them, so a crash can never leave the
 * popup silently blank.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { LoadError } from './LoadStatus';

interface Props {
  /** Shown in the error message, e.g. "Focus session". */
  name: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[StudyLens] ${this.props.name} crashed`, error, info.componentStack);
  }

  override render() {
    if (this.state.error) {
      return (
        <LoadError
          what={this.props.name}
          message={this.state.error.message}
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}
