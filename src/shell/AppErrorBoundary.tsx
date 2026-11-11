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
        <div className="w-full h-full flex items-center justify-center p-6 bg-[#FAF8F4] text-[#1C1917]">
          <div className="max-w-md w-full bg-white border border-[#E4DFD5] rounded-xl p-6 space-y-4">
            <div className="text-xs font-semibold text-[#C2410C]">
              模块运行异常
            </div>
            <h2 className="text-xl font-bold text-[#1C1917]">
              {this.props.appTitle} 未能正常渲染
            </h2>
            <p className="text-xs text-[#57534E] font-mono-num bg-[#FAF8F4] border border-[#E4DFD5] rounded-lg p-3 break-words">
              {this.state.errorMessage}
            </p>
            <button
              type="button"
              onClick={this.props.onBackToHub}
              className="px-4 py-2 text-xs font-semibold bg-[#1C1917] hover:bg-[#36312D] text-white rounded-lg transition-colors cursor-pointer"
            >
              返回应用大厅
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
