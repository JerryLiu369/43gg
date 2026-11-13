/** 不创建全局音频实例；仅在玩家操作后初始化，并在子应用卸载时释放。 */
export function createSound() {
  let context: AudioContext | null = null;
  let disposed = false;
  const voices = new Set<OscillatorNode>();
  return {
    play(kind: 'turn' | 'tide' | 'signal', muted: boolean) {
      if (muted || disposed) return;
      try {
        context ??= new AudioContext();
        if (context.state === 'suspended')
          void context.resume().catch(() => {});
        const notes =
          kind === 'signal'
            ? [392, 493.88, 587.33, 783.99]
            : kind === 'tide'
              ? [196, 293.66]
              : [523.25, 783.99];
        notes.forEach((frequency, index) => {
          const ctx = context!;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const start =
            ctx.currentTime + index * (kind === 'signal' ? 0.14 : 0.05);
          osc.type = 'sine';
          osc.frequency.value = frequency;
          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(0.055, start + 0.014);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.65);
          osc.connect(gain);
          gain.connect(ctx.destination);
          voices.add(osc);
          osc.onended = () => {
            voices.delete(osc);
            osc.disconnect();
            gain.disconnect();
          };
          osc.start(start);
          osc.stop(start + 0.7);
        });
      } catch {
        /* 无音频环境下仍可完整游玩。 */
      }
    },
    dispose() {
      disposed = true;
      for (const osc of voices) {
        osc.onended = null;
        osc.stop();
        osc.disconnect();
      }
      voices.clear();
      if (context) void context.close().catch(() => {});
      context = null;
    },
  };
}
