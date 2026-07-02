// IIC-grade number formatting.
// Below 10K: locale-grouped integer. Up to Decillion: shorthand. Beyond: scientific.

const SHORT_UNITS = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

export function formatBig(n) {
  if (!isFinite(n)) return '∞';
  if (n === 0) return '0';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs < 10000) return sign + Math.floor(abs).toLocaleString();

  let i = 0;
  let v = abs;
  while (v >= 1000 && i < SHORT_UNITS.length - 1) { v /= 1000; i++; }

  if (i === SHORT_UNITS.length - 1 && v >= 1000) {
    return sign + abs.toExponential(2).replace('+', '');
  }
  const digits = v < 10 ? 2 : v < 100 ? 1 : 0;
  return sign + v.toFixed(digits) + SHORT_UNITS[i];
}

export function formatRate(perSecond, scale = 'sec') {
  const factor = scale === 'min' ? 60 : scale === 'hour' ? 3600 : 1;
  const suffix = scale === 'min' ? '/min' : scale === 'hour' ? '/hr' : '/s';
  return `${formatBig(perSecond * factor)}${suffix}`;
}

export function formatDuration(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '—';
  const s = Math.floor(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}
