/** Мелкие помощники отрисовки: экранирование, элементы, простой линейный график. */

export const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const rub = (cents) =>
  (cents / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';

export const dt = (iso) =>
  iso ? new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'medium' }) : '—';

export function toast(message, kind = 'info') {
  for (const old of document.querySelectorAll('[data-testid=toast]')) old.remove();
  const el = document.createElement('div');
  el.textContent = message;
  el.dataset.testid = 'toast';
  el.style.cssText =
    'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);padding:10px 16px;' +
    'border-radius:8px;color:#fff;z-index:99;box-shadow:0 4px 14px rgba(0,0,0,.18);' +
    `background:${kind === 'error' ? '#dc2626' : '#16a34a'}`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

/** Линейный график средней позиции: ось Y инвертирована (1-я позиция сверху). */
export function lineChart(points, { height = 220, invert = true } = {}) {
  if (!points.length) return '<p class="empty">Нет данных за период</p>';
  const w = 900;
  const h = height;
  const pad = { l: 36, r: 12, t: 12, b: 24 };
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i) => pad.l + (i * (w - pad.l - pad.r)) / Math.max(1, points.length - 1);
  const y = (v) => {
    const norm = (v - min) / span;
    const t = invert ? norm : 1 - norm;
    return pad.t + t * (h - pad.t - pad.b);
  };
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const ticks = [min, (min + max) / 2, max]
    .map(
      (v) =>
        `<text x="4" y="${(y(v) + 4).toFixed(1)}" font-size="10" fill="#6b7280">${v.toFixed(1)}</text>` +
        `<line x1="${pad.l}" y1="${y(v).toFixed(1)}" x2="${w - pad.r}" y2="${y(v).toFixed(1)}" stroke="#e2e5ea"/>`,
    )
    .join('');
  const dots = points
    .map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="2.5" fill="#2563eb"><title>${esc(p.date)}: ${p.value}</title></circle>`)
    .join('');
  const firstLabel = esc(points[0].date);
  const lastLabel = esc(points[points.length - 1].date);
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="График">
    ${ticks}
    <path d="${path}" fill="none" stroke="#2563eb" stroke-width="2"/>
    ${dots}
    <text x="${pad.l}" y="${h - 6}" font-size="10" fill="#6b7280">${firstLabel}</text>
    <text x="${w - pad.r}" y="${h - 6}" font-size="10" fill="#6b7280" text-anchor="end">${lastLabel}</text>
  </svg>`;
}

export function download(filename, content, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿' + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
