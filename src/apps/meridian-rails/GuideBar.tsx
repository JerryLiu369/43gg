import { Play, X } from 'lucide-react';
import { MER_GUIDE_STEPS, MER_GUIDE_TEXT, type MerGuideStep } from './guide.ts';
import { Button } from './ui.tsx';

/**
 * Non-blocking guide strip shown above the board during a guided game. It never covers the board
 * or the panels; each step closes by itself once the player has done it.
 */
export function GuideBar({
  step,
  onDemo,
  onSkip,
}: {
  step: MerGuideStep;
  onDemo: () => void;
  onSkip: () => void;
}) {
  const index = MER_GUIDE_STEPS.indexOf(step);
  const text = MER_GUIDE_TEXT[step];
  return (
    <section
      aria-label="新手引导"
      aria-live="polite"
      className="relative z-20 flex shrink-0 items-center gap-3 border-b border-(--mer-brass-400)/25 bg-(--mer-ink-900) px-3 py-2 sm:px-4"
    >
      <ol className="hidden shrink-0 items-center gap-1 sm:flex" aria-hidden="true">
        {MER_GUIDE_STEPS.map((s, i) => (
          <li
            key={s}
            className={
              i < index
                ? 'h-1 w-5 rounded-full bg-(--mer-brass-400)/60'
                : i === index
                  ? 'h-1 w-5 rounded-full bg-(--mer-brass-300)'
                  : 'h-1 w-5 rounded-full bg-white/15'
            }
          />
        ))}
      </ol>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-(--mer-brass-200)">
          第 {index + 1} 步，共 {MER_GUIDE_STEPS.length} 步 · {text.title}
        </p>
        <p className="mt-0.5 text-[11px] leading-4 text-(--mer-paper-300)">{text.body}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button size="sm" variant="secondary" onClick={onDemo}>
          <Play className="size-3.5" />
          <span className="hidden sm:inline">{text.demo}</span>
          <span className="sm:hidden">示范</span>
        </Button>
        <button
          type="button"
          onClick={onSkip}
          className="inline-flex items-center gap-1 rounded-lg border border-transparent px-2 py-1.5 text-[11px] text-(--mer-paper-400) transition hover:text-(--mer-paper-100) focus-visible:border-(--mer-brass-300)/60 focus-visible:outline-none cursor-pointer"
        >
          <X className="size-3.5" />
          跳过
        </button>
      </div>
    </section>
  );
}
