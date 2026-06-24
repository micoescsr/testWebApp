// components/common/ErrorBoundary.jsx
import React from "react";

/**
 * Catches render-time errors in its subtree and shows a fallback instead of
 * unmounting the whole React app (which otherwise blanks the entire page).
 *
 * Props:
 * - resetKey: when this value changes, the boundary clears its error state.
 *   Pass the current route path so navigating to another page auto-recovers.
 * - children: the protected subtree.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidUpdate(prevProps) {
    // Auto-recover when the caller signals a context change (e.g. route change).
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  componentDidCatch(error, errorInfo) {
    console.error("Render error caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary" role="alert">
          <h4>Oops, something broke</h4>
          <p>This page hit an unexpected error. You can retry or use the menu to navigate elsewhere.</p>
          {import.meta.env.DEV && this.state.error && (
            <pre className="error-boundary-detail">
              {String(this.state.error?.message || this.state.error)}
            </pre>
          )}
          <button onClick={() => this.setState({ hasError: false, error: null })}>
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
