import {
  Component,
  createContext,
  Fragment,
  type ErrorInfo,
  type ReactNode,
} from "react";

/**
 * Textes de l'écran de secours. Le paquet n'a pas d'i18n : l'application
 * fournit les textes traduits (issue 636), l'anglais reste le repli.
 */
export type EditorErrorTexts = {
  failed: string;
  reload: string;
};

const DEFAULT_EDITOR_ERROR_TEXTS: EditorErrorTexts = {
  failed: "The editor failed to render. Your recording is still running.",
  reload: "Reload editor",
};

const EditorErrorTextsContext = createContext<EditorErrorTexts>(
  DEFAULT_EDITOR_ERROR_TEXTS,
);

export const EditorErrorTextsProvider = EditorErrorTextsContext.Provider;

type EditorErrorBoundaryProps = {
  children: ReactNode;
  resetKey?: string;
};

type EditorErrorBoundaryState = {
  hasError: boolean;
  recoveryAttempts: number;
  recoveryKey: number;
};

const MAX_AUTO_RECOVERY_ATTEMPTS = 1;

export class EditorErrorBoundary extends Component<
  EditorErrorBoundaryProps,
  EditorErrorBoundaryState
> {
  static contextType = EditorErrorTextsContext;
  declare context: EditorErrorTexts;

  constructor(props: EditorErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, recoveryAttempts: 0, recoveryKey: 0 };
  }

  static getDerivedStateFromError(): Partial<EditorErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // `resetKey` dit quel éditeur a levé : `session_raw_note:<id>` (note),
    // `enhanced_note:<id>` (synthèse) ou `note` (issue 572).
    console.error("Editor render failed", error, info, {
      editor: this.props.resetKey ?? "unknown",
    });

    if (this.state.recoveryAttempts < MAX_AUTO_RECOVERY_ATTEMPTS) {
      this.setState((state) => ({
        hasError: false,
        recoveryAttempts: state.recoveryAttempts + 1,
        recoveryKey: state.recoveryKey + 1,
      }));
    }
  }

  componentDidUpdate(prevProps: EditorErrorBoundaryProps) {
    if (prevProps.resetKey === this.props.resetKey) {
      return;
    }

    this.setState((state) => ({
      hasError: false,
      recoveryAttempts: 0,
      recoveryKey: state.recoveryKey + 1,
    }));
  }

  private retry = () => {
    this.setState((state) => ({
      hasError: false,
      recoveryAttempts: 0,
      recoveryKey: state.recoveryKey + 1,
    }));
  };

  render() {
    if (this.state.hasError) {
      const texts = this.context;
      return (
        <div
          role="alert"
          className="border-border bg-muted text-muted-foreground flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
        >
          <span>{texts.failed}</span>
          <button
            type="button"
            onClick={this.retry}
            className="border-border bg-card text-muted-foreground hover:bg-accent shrink-0 rounded-md border px-2 py-1 text-xs font-medium"
          >
            {texts.reload}
          </button>
        </div>
      );
    }

    return (
      <Fragment key={this.state.recoveryKey}>{this.props.children}</Fragment>
    );
  }
}
