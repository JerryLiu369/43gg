const SUFFIXES = [
  '',
  'K',
  'M',
  'B',
  'T',
  'Qa',
  'Qi',
  'Sx',
  'Sp',
  'Oc',
  'No',
  'Dc',
];

export function formatNum(value: number, decimalsForSmall = 0): string {
  if (!Number.isFinite(value)) return '0';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);

  if (abs < 1000) {
    if (decimalsForSmall > 0 && abs < 100 && abs > 0) {
      return `${sign}${abs.toFixed(decimalsForSmall)}`;
    }
    return `${sign}${Math.floor(abs).toLocaleString('en-US')}`;
  }

  const tier = Math.floor(Math.log10(abs) / 3);
  if (tier < SUFFIXES.length) {
    const scaled = abs / Math.pow(10, tier * 3);
    const digits = scaled >= 100 ? 1 : scaled >= 10 ? 2 : 2;
    return `${sign}${scaled.toFixed(digits)}${SUFFIXES[tier]}`;
  }

  const exp = Math.floor(Math.log10(abs));
  const mantissa = abs / Math.pow(10, exp);
  return `${sign}${mantissa.toFixed(2)}e${exp}`;
}

export function formatRate(perSec: number): string {
  if (!Number.isFinite(perSec) || perSec <= 0) return '+0/s';
  if (perSec < 10) return `+${perSec.toFixed(1)}/s`;
  return `+${formatNum(perSec)}/s`;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remS = s % 60;
  if (m < 60) {
    return remS > 0 ? `${m}m ${remS}s` : `${m}m`;
  }
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return `${h}h ${remM}m`;
}
