import { useSyncExternalStore } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { sound } from './sound.ts';

export function SoundControl() {
  const { muted, volume } = useSyncExternalStore(sound.subscribe, sound.getSettings, sound.getServerSettings);

  return (
    <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5">
      <button
        type="button"
        onClick={() => {
          sound.toggleMuted();
          sound.play('toggle');
        }}
        className="grid size-7 place-items-center rounded-full text-amber-200 hover:bg-white/10 cursor-pointer"
        aria-label={muted ? '取消静音' : '静音'}
        title={muted ? '取消静音' : '静音'}
      >
        {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={muted ? 0 : volume}
        onChange={(e) => sound.setVolume(Number(e.target.value))}
        aria-label="音量"
        className="hidden sm:block w-16 accent-amber-400 cursor-pointer"
      />
    </div>
  );
}
