import { Component, type ReactNode } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveIcon } from "@/components/icon-resolve";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}
interface ErrorBoundaryState {
  error: Error | null;
}

class TabErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <div className="flex flex-col items-center justify-center gap-3 p-8 text-muted-foreground" data-testid="tab-error">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <p className="text-sm">{this.state.error.message}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => this.setState({ error: null })}
              data-testid="tab-error-retry"
            >
              Retry
            </Button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

interface TabShellProps {
  label: string;
  icon: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  children: ReactNode;
}

export default function TabShell({ label, icon, onRefresh, isRefreshing, children }: TabShellProps) {
  const Icon = resolveIcon(icon);
  return (
    <div className="flex flex-col h-full" data-testid={`tab-shell-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
          <h2 className="text-sm font-semibold">{label}</h2>
        </div>
        {onRefresh && (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={onRefresh}
            disabled={isRefreshing}
            data-testid="tab-refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
        )}
      </div>
      <div className="flex-1 overflow-auto p-4">
        <TabErrorBoundary>{children}</TabErrorBoundary>
      </div>
    </div>
  );
}
