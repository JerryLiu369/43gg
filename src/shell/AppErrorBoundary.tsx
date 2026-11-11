import React from 'react';

interface AppErrorBoundaryProps {
  appTitle: string;
  onBackToHub: () => void;
  children: React.ReactNode;
}

interface AppErrorBoundaryState {
  errorMessage: string | null;
}

export class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  public constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = { errorMessage: null };
  }

  public static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    const message =
      error instanceof Error ? error.message : 'Unexpected runtime error inside sub-app.';
    return { errorMessage: message };
  }

  public render(): React.ReactNode {
    if (this.state.errorMessage) {
      return (
        <div className="w-full h-full flex items-center justify-center p-6 bg-[#090b0e]">
          <div className="max-w-md w-full bg-[#11161f] border border-rose-800/70 rounded-xl p-6 space-y-4 shadow-2xl">
            <div className="text-xs font-mono-num uppercase tracking-wider text-rose-400">
              APP RUNTIME ERROR
            </div>
            <h2 className="font-display text-2xl font-bold text-white">
              {this.props.appTitle} 启动异常
            </h2>
            <p className="text-xs text-slate-300 font-mono-num bg-[#090b0e] border border-slate-800 rounded p-3 break-words">
              {this.state.errorMessage}
            </p>
            <button
              type="button"
              onClick={this.props.onBackToHub}
              className="px-4 py-2 text-xs font-bold bg-[#f59e0b] hover:bg-[#d97706] text-black rounded transition-colors cursor-pointer"
            >
              返回首页 (Return Home)
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
