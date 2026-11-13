export function cn(...inputs: Array<string | false | null | undefined>): string {
  return inputs.filter(Boolean).join(' ');
}

export function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatClock(iso: string): string {
  try {
    return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  } catch {
    return '';
  }
}

export function hasAutostartParam(): boolean {
  if (typeof window === 'undefined') return false;
  const search = new URLSearchParams(window.location.search);
  if (search.get('autostart') === '1') return true;
  const hashIdx = window.location.hash.indexOf('?');
  if (hashIdx >= 0) {
    const hashParams = new URLSearchParams(window.location.hash.slice(hashIdx));
    if (hashParams.get('autostart') === '1') return true;
  }
  return false;
}
