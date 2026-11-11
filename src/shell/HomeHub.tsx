import React from 'react';
import { ArrowRight, Box, Cpu, FolderPlus, Layers } from 'lucide-react';
import { AppAccent, WorkspaceAppEntry } from '../apps/registry.ts';

interface HomeHubProps {
  apps: ReadonlyArray<WorkspaceAppEntry>;
  onLaunchApp: (appId: string) => void;
}

const ACCENT_STYLES: Record<
  AppAccent,
  {
    badge: string;
    button: string;
    borderHover: string;
    dot: string;
  }
> = {
  amber: {
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    button: 'bg-[#f59e0b] hover:bg-[#d97706] text-black',
    borderHover: 'hover:border-amber-500/60',
    dot: 'bg-amber-400',
  },
  cyan: {
    badge: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40',
    button: 'bg-cyan-400 hover:bg-cyan-300 text-slate-950',
    borderHover: 'hover:border-cyan-500/60',
    dot: 'bg-cyan-400',
  },
  emerald: {
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
    button: 'bg-emerald-400 hover:bg-emerald-300 text-slate-950',
    borderHover: 'hover:border-emerald-500/60',
    dot: 'bg-emerald-400',
  },
  rose: {
    badge: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
    button: 'bg-rose-400 hover:bg-rose-300 text-slate-950',
    borderHover: 'hover:border-rose-500/60',
    dot: 'bg-rose-400',
  },
};

export const HomeHub: React.FC<HomeHubProps> = ({ apps, onLaunchApp }) => {
  return (
    <div className="min-h-dvh w-full bg-[#090b0e] text-slate-100 flex flex-col">
      {/* Subtle geometric top hairline */}
      <div className="h-1 w-full bg-gradient-to-r from-[#f59e0b] via-cyan-400 to-slate-800 shrink-0" />

      <div className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 flex flex-col justify-between gap-10">
        <div className="space-y-8">
          {/* Workspace Header */}
          <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-800/90 pb-6">
            <div className="space-y-2.5">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-[#11161f] border border-slate-800 text-[11px] font-mono-num text-slate-300">
                <Layers className="w-3.5 h-3.5 text-[#f59e0b]" />
                <span>GAISTUDIO // UNIFIED WORKSPACE</span>
              </div>
              <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-white leading-none">
                AI Studio 应用大厅
              </h1>
              <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
                统一 React 外壳承载多个独立小应用：按需加载、运行期隔离，退出时自动释放 WebGL、RAF、音频与键鼠监听。
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto px-3 py-1.5 rounded-lg bg-[#11161f] border border-slate-800 text-xs font-mono-num text-slate-300 shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>{apps.length} APPS READY</span>
            </div>
          </header>

          {/* App Cards Grid */}
          <section aria-label="已注册小应用" className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {apps.map((app) => {
              const style = ACCENT_STYLES[app.accent];
              return (
                <article
                  key={app.id}
                  data-testid={`app-card-${app.id}`}
                  className={`group flex flex-col justify-between bg-[#10151d] border border-slate-800 ${style.borderHover} rounded-xl p-5 sm:p-6 transition-colors shadow-xl`}
                >
                  <div className="space-y-4">
                    {/* Top Meta Row */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${style.dot}`} />
                        <span className="font-mono-num text-xs text-slate-400">
                          ?app={app.id}
                        </span>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded border text-[11px] font-mono-num shrink-0 ${style.badge}`}
                      >
                        {app.kind === 'react-lazy' ? (
                          <Cpu className="w-3 h-3" />
                        ) : (
                          <Box className="w-3 h-3" />
                        )}
                        <span>{app.techLabel}</span>
                      </span>
                    </div>

                    {/* Title & Subtitle */}
                    <div>
                      <h2 className="font-display text-3xl font-bold tracking-wide text-white">
                        {app.title}
                      </h2>
                      <p className="text-xs font-medium text-slate-400 mt-0.5">{app.subtitle}</p>
                    </div>

                    {/* Description */}
                    <p className="text-sm text-slate-300 leading-relaxed">{app.description}</p>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {app.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded bg-[#0a0d12] border border-slate-800/90 text-[11px] font-mono-num text-slate-400"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Card Footer & Launch Button */}
                  <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between gap-3">
                    <span className="text-[11px] font-mono-num text-slate-500 truncate">
                      {app.sourceDir}
                    </span>
                    <button
                      type="button"
                      data-testid={`launch-${app.id}`}
                      onClick={() => onLaunchApp(app.id)}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${style.button}`}
                    >
                      <span>启动应用</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
        </div>

        {/* Concise Registration Reference */}
        <footer className="bg-[#0d1117] border border-slate-800/90 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-start sm:items-center gap-2.5">
            <FolderPlus className="w-4 h-4 text-slate-300 shrink-0 mt-0.5 sm:mt-0" />
            <span>
              新增小应用：放入{' '}
              <code className="px-1.5 py-0.5 rounded bg-[#161c24] text-slate-200 font-mono-num">
                src/apps/&lt;slug&gt;/
              </code>{' '}
              或静态目录{' '}
              <code className="px-1.5 py-0.5 rounded bg-[#161c24] text-slate-200 font-mono-num">
                apps/&lt;slug&gt;/
              </code>
              ，并在{' '}
              <code className="px-1.5 py-0.5 rounded bg-[#161c24] text-slate-200 font-mono-num">
                src/apps/registry.ts
              </code>{' '}
              登记一行即可。
            </span>
          </div>
          <span className="font-mono-num text-[11px] text-slate-500 shrink-0">
            Single Origin · Lazy / Sandbox
          </span>
        </footer>
      </div>
    </div>
  );
};
