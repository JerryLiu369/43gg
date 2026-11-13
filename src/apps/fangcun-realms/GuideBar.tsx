import { Play, X } from 'lucide-react';
import { FC_GUIDE_STEPS, FC_GUIDE_TEXT, type FcGuideStep } from './guide.ts';

/** Non-blocking guide strip above the board; each step closes once the player has done it. */
export function GuideBar({ step, onDemo, onSkip }: { step: FcGuideStep; onDemo: () => void; onSkip: () => void }) {
  const index = FC_GUIDE_STEPS.indexOf(step);
  const text = FC_GUIDE_TEXT[step];
  return (
    <section aria-label="新手引导" aria-live="polite" className="fc-guide">
      <ol className="fc-guide-steps" aria-hidden="true">
        {FC_GUIDE_STEPS.map((s, i) => (
          <li key={s} className={i < index ? 'done' : i === index ? 'current' : ''} />
        ))}
      </ol>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-amber-200">
          第 {index + 1} 步，共 {FC_GUIDE_STEPS.length} 步 · {text.title}
        </p>
        <p className="mt-0.5 text-[11px] leading-4 text-slate-300">{text.body}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button type="button" className="fc-btn secondary px-2.5 py-1 text-xs" onClick={onDemo}>
          <Play className="size-3.5" />
          <span className="hidden sm:inline">{text.demo}</span>
          <span className="sm:hidden">示范</span>
        </button>
        <button type="button" className="fc-btn ghost px-2 py-1 text-[11px]" onClick={onSkip}>
          <X className="size-3.5" /> 跳过
        </button>
      </div>
    </section>
  );
}
