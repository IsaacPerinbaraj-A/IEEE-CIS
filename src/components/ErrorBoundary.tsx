import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; fallback: (retry: () => void) => ReactNode };
type State = { failed: boolean };

/**
 * Catches a crash in the part of the page it wraps and shows `fallback` instead of a blank screen
 * (idea from the second version's ErrorBoundary, used here around whole pages and the admin).
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // A crash during the home intro must not leave the header and page hidden or locked
    document.body.dataset.intro = "done";
    document.querySelectorAll("[inert]").forEach(el => el.removeAttribute("inert"));
    document.body.style.overflow = "";
    console.error(error, info.componentStack);
  }

  retry = () => this.setState({ failed: false });

  render() {
    return this.state.failed ? this.props.fallback(this.retry) : this.props.children;
  }
}
