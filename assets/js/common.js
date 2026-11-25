// Shared helpers for all pages.

const cache = new Map();
export async function loadJSON(path) {
  if (!cache.has(path)) {
    cache.set(
      path,
      fetch(path, { cache: 'no-cache' }).then((r) => {
        if (!r.ok) throw new Error(`Could not load ${path} (${r.status})`);
        return r.json();
      })
    );
  }
  return cache.get(path);
}

// Tiny element builder: h('div.class', { attr }, ...children)
export function h(tag, attrs, ...children) {
  const [name, ...classes] = tag.split('.');
  const node = document.createElement(name || 'div');
  if (classes.length) node.className = classes.join(' ');
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'html') node.innerHTML = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const pct = (x, digits = 0) => (x === null || x === undefined || Number.isNaN(x) ? '—' : `${(x * 100).toFixed(digits)}%`);

export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function today() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

export function daysBetween(a, b) {
  return Math.round((b - a) / 86400000);
}

export function fmtDate(s, opts = { month: 'short', day: 'numeric' }) {
  return parseDate(s).toLocaleDateString('en-US', opts);
}

export function fmtDay(s) {
  return parseDate(s).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// Which format is live today, and which one comes next.
export function formatState(formats) {
  const t = today();
  const live = formats.find((f) => (!f.start || parseDate(f.start) <= t) && (!f.end || parseDate(f.end) >= t)) || formats[formats.length - 1];
  const next = formats.find((f) => f.start && parseDate(f.start) > t) || null;
  return { live, next };
}

// Win % from a W-L-T record. Trainer Hill counts a tie as a third of a win.
export function winRate(w, l, t, source = 'limitless') {
  const n = w + l + t;
  if (!n) return null;
  return source === 'trainerHill' ? (3 * w + t) / (3 * n) : w / n;
}

// Diverging color for a win rate (red below 50%, green above).
export function heatColor(wr) {
  if (wr === null || wr === undefined) return '';
  const t = Math.max(-1, Math.min(1, (wr - 0.5) / 0.25));
  const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
  const even = [227, 232, 239];
  const rgb = t >= 0 ? mix(even, [47, 138, 91], t) : mix(even, [196, 72, 61], -t);
  return `rgb(${rgb.join(',')})`;
}

export function heatText(wr) {
  return wr !== null && Math.abs(wr - 0.5) > 0.15 ? '#fff' : 'var(--ink)';
}

export function markNav() {
  const here = location.pathname.split('/').pop() || 'index.html';
  for (const a of document.querySelectorAll('.nav a')) {
    const target = a.getAttribute('href');
    if (target === here || (here === 'deck.html' && target === 'decks.html') || (here === 'guide.html' && target === 'guides.html')) a.setAttribute('aria-current', 'page');
  }
}

export function showError(container, err) {
  container.replaceChildren(h('p.note', `Something didn't load: ${err.message}. If you're opening the file directly, serve the folder instead (for example: python3 -m http.server).`));
}

// Prize map glyph: "2-2-2" → three KOs of two prize cards each; "+1" marks prizes they gave you.
export function prizeMap(key) {
  const [main, gift] = key.split('+');
  const kos = main ? main.split('-').map(Number) : [];
  const wrap = h('span.prize-map', { 'aria-label': `Prize map ${key}` });
  for (const n of kos) wrap.append(h('span.prize-ko', Array.from({ length: n }, () => h('span.prize'))));
  if (gift) wrap.append(h('span.prize-ko', { title: 'Prizes from their self-KO' }, Array.from({ length: Number(gift) }, () => h('span.prize.gift'))));
  return wrap;
}

// Matchup lookup for one data source. Falls back to the other deck's side of the same matchup.
export function matrixLookup(meta, source) {
  const recs = meta.matrix?.[source] || [];
  const direct = new Map();
  for (const r of recs) {
    const key = `${r[0]}|${r[1]}`;
    if (!direct.has(key) || r[5] === 'meta') direct.set(key, r);
  }
  return (a, b) => {
    const d = direct.get(`${a}|${b}`);
    if (d) return { w: d[2], l: d[3], t: d[4], from: d[5] || 'row' };
    const inv = direct.get(`${b}|${a}`);
    if (inv) return { w: inv[3], l: inv[2], t: inv[4], from: 'inverse' };
    return null;
  };
}

// Favored / even / unfavored, from the first deck's point of view.
export function verdict(wr) {
  if (wr === null || wr === undefined) return { key: 'none', label: 'no data', mark: '' };
  const p = Math.round(wr * 100); // judge on the number people see
  if (p >= 55) return { key: 'fav', label: 'favored', mark: '▲' };
  if (p <= 45) return { key: 'unfav', label: 'unfavored', mark: '▼' };
  return { key: 'even', label: 'even', mark: '' };
}
