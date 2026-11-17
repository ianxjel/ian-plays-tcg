import { loadJSON, h, pct, parseDate, today, daysBetween, fmtDate, fmtDay, formatState, winRate, heatColor, heatText, markNav, showError } from './common.js';

markNav();

const params = new URLSearchParams(location.search);
const state = { format: null, source: params.get('source') || 'limitless' };
let F, A, CAL;
const metas = {};

async function main() {
  [F, A, CAL] = await Promise.all([loadJSON('data/formats.json'), loadJSON('data/archetypes.json').then((x) => x.archetypes), loadJSON('data/sim-calibration.json').catch(() => null)]);
  for (const f of F.formats) metas[f.id] = await loadJSON(f.data);
  renderHero();
  const { live, next } = formatState(F.formats);
  state.format = params.get('format') && metas[params.get('format')] ? params.get('format') : next && daysBetween(today(), parseDate(next.start)) <= 14 ? next.id : live.id;
  renderFormatToggle();
  renderAll();
}

function renderHero() {
  const t = today();
  const { live, next } = formatState(F.formats);
  document.getElementById('today').textContent = `Today is ${t.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`;
  const upcoming = F.setChanges.filter((c) => parseDate(c.legal) >= t);
  const change = upcoming[0];
  const h1 = document.getElementById('countdown');
  const text = document.getElementById('hero-text');
  if (change) {
    const d = daysBetween(t, parseDate(change.legal));
    const when = d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`;
    h1.textContent = `${change.set} is legal ${when}`;
    const after = upcoming[1];
    const parts = [];
    if (next && change.legal === next.start) parts.push(`The ${live.name} runs through ${fmtDay(live.end)}. From ${fmtDay(change.legal)}, Standard adds ${change.set}.`);
    else parts.push(`You're in the ${live.name}. ${change.set} ${change.confirmed ? 'is tournament legal' : 'should be tournament legal'} from ${fmtDay(change.legal)}${change.confirmed ? '' : ' (estimated)'}.`);
    if (after) parts.push(`After that comes ${after.set}: release ${after.confirmed ? '' : 'reported for '}${fmtDate(after.release)}, legal around ${fmtDate(after.legal)}${after.confirmed ? '' : ' (estimated)'}.`);
    text.textContent = parts.join(' ');
  } else {
    h1.textContent = `You're in the ${live.name}`;
    text.textContent = 'No set change is on the calendar yet.';
  }

  const segs = [];
  for (const f of F.formats) {
    if (f.end && parseDate(f.end) < t) continue;
    const isLive = f === live;
    const range = f.start && f.end ? `${fmtDate(f.start)} to ${f.endEstimated ? 'about ' : ''}${fmtDate(f.end)}` : f.end ? `through ${fmtDate(f.end)}` : `from ${fmtDate(f.start)}`;
    const left = isLive && f.end ? daysBetween(t, parseDate(f.end)) + 1 : null;
    segs.push(
      h(`div.rail-seg${isLive ? '.now' : '.next'}`, h('div.seg-name', f.name), h('div.small', isLive ? `Now, ${range}${left !== null ? ` (${left} day${left === 1 ? '' : 's'} left)` : ''}` : range))
    );
  }
  for (const c of F.setChanges) {
    if (parseDate(c.legal) <= t || F.formats.some((f) => f.start === c.legal)) continue;
    segs.push(h('div.rail-seg.est', h('div.seg-name', `${c.set} format`), h('div.small', `${c.confirmed ? '' : 'About '}${fmtDate(c.legal)}${c.confirmed ? '' : ', not confirmed'}`)));
  }
  const rail = document.getElementById('rail');
  rail.replaceChildren(h('div.rail-track', { style: { gridTemplateColumns: `repeat(auto-fit, minmax(170px, 1fr))` } }, segs));
}

function renderFormatToggle() {
  const box = document.getElementById('format-toggle');
  box.replaceChildren(
    ...[...F.formats].reverse().map((f) =>
      h('button', { type: 'button', 'aria-pressed': String(state.format === f.id), onclick: () => ((state.format = f.id), renderFormatToggle(), renderAll()) }, f.name.replace(' format', ''))
    )
  );
}

function renderSourceToggle(meta) {
  const box = document.getElementById('source-toggle');
  const sources = Object.keys(meta.matrix || {}).filter((k) => meta.matrix[k].length);
  if (!sources.includes(state.source)) state.source = sources[0] || 'limitless';
  box.replaceChildren(
    ...sources.map((s) => h('button', { type: 'button', 'aria-pressed': String(state.source === s), onclick: () => ((state.source = s), renderAll()) }, meta.sources[s].label))
  );
}

function renderAll() {
  const meta = metas[state.format];
  const fmt = F.formats.find((f) => f.id === state.format);
  document.getElementById('top-sub').textContent = `${fmt.name} (${fmt.code}). ${meta.headline}, captured ${fmtDate(meta.captured)}.`;
  renderTop(meta);
  renderSourceToggle(meta);
  renderHeat(meta);
  renderMethod(meta);
}

function renderTop(meta) {
  const maxShare = Math.max(...meta.top.map((t) => t.limitless.share));
  const head = h(
    'div.cols-head',
    h('span', '#'),
    h('span', 'Deck'),
    h('span.share-bar', 'Share of the field'),
    h('span.num', 'Limitless'),
    h('span.num', 'Trainer Hill')
  );
  const rows = meta.top.map((t, i) => {
    const a = A[t.id] || { name: t.label || t.id };
    const lw = t.limitless.w !== undefined ? winRate(t.limitless.w, t.limitless.l, t.limitless.t) : null;
    const sub = lw !== null ? `${pct(lw, 1)} win rate, ${t.limitless.count} players` : t.label && t.label !== a.name ? t.label : `${t.limitless.points} points`;
    const summary = h(
      'summary',
      h('span.rank', i + 1),
      h('span.deck-name', a.name, h('small', sub)),
      h('span.share-bar', h('div.bar', h('span', { style: { width: `${(t.limitless.share / maxShare) * 100}%` } }))),
      h('span.num', `${t.limitless.share.toFixed(1)}%`),
      h('span.num', t.trainerHill ? `${t.trainerHill.share.toFixed(1)}%` : '—')
    );
    return h('details.deck-row', summary, profile(t.id, a));
  });
  document.getElementById('top-list').replaceChildren(h('div.decks-table', head, rows));
}

function profile(id, a) {
  if (!a.summary) return h('div.profile', h('p.small', 'No profile for this deck yet.'));
  const links = [];
  if (a.sample) links.push(h('li', h('a', { href: a.sample.url, target: '_blank', rel: 'noopener' }, `Sample list: ${a.sample.player}`), `, ${a.sample.event}, ${fmtDate(a.sample.date)}`));
  if (a.limitless) {
    links.push(h('li', h('a', { href: `https://play.limitlesstcg.com/decks/${a.limitless}?format=standard`, target: '_blank', rel: 'noopener' }, 'Results on Limitless')));
    links.push(h('li', h('a', { href: `https://www.trainerhill.com/decklist/${a.limitless}`, target: '_blank', rel: 'noopener' }, 'Card usage on Trainer Hill')));
  }
  return h(
    'div.profile',
    h('div', h('p', a.summary), h('h3', { style: { margin: '10px 0 6px' } }, 'Key cards'), h('div.chips', a.keyCards.map((c) => h('span.chip-card', c)))),
    h('div', h('h3', { style: { marginBottom: '6px' } }, 'How it plays'), h('ul', a.plan.map((p) => h('li', p)))),
    h('div', h('h3', { style: { marginBottom: '6px' } }, 'How to beat it'), h('ul', a.beatIt.map((p) => h('li', p))), h('ul.small', { style: { marginTop: '10px' } }, links))
  );
}

function matrixLookup(meta, source) {
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

function renderHeat(meta) {
  const box = document.getElementById('heat');
  if (!meta.matrix || !Object.keys(meta.matrix).length) {
    box.replaceChildren(h('p.note', 'Matchup data is tracked for the Delta Reign format. Switch to it above to see the grid.'));
    return;
  }
  const ids = meta.top.map((t) => t.id);
  const get = matrixLookup(meta, state.source);
  const name = (id) => (A[id] ? A[id].short : id);
  const thead = h('thead', h('tr', h('th', ''), ids.map((id) => h('th', { scope: 'col' }, name(id)))));
  const tbody = h(
    'tbody',
    ids.map((a) =>
      h(
        'tr',
        h('th', { scope: 'row' }, name(a)),
        ids.map((b) => {
          const rec = get(a, b);
          if (a === b) {
            const wr = rec ? winRate(rec.w, rec.l, rec.t, state.source) : null;
            return h('td.self', { title: `${A[a]?.name} mirror${rec ? `: ${rec.w}-${rec.l}-${rec.t}` : ''}` }, wr !== null ? Math.round(wr * 100) : '—');
          }
          if (!rec) return h('td.na', { title: 'No data captured' }, '·');
          const wr = winRate(rec.w, rec.l, rec.t, state.source);
          const n = rec.w + rec.l + rec.t;
          const tip = `${A[a]?.name} vs ${A[b]?.name}: ${pct(wr, 1)} over ${n} games (${rec.w}-${rec.l}-${rec.t})${rec.from === 'inverse' ? ', from the other deck’s side' : ''}`;
          return h('td', { title: tip, 'aria-label': tip, style: { background: heatColor(wr), color: heatText(wr), opacity: n < 25 ? 0.6 : 1 } }, Math.round(wr * 100));
        })
      )
    )
  );
  box.replaceChildren(h('div.grid-scroll', h('table.heat', thead, tbody)), h('p.small', { style: { marginTop: '8px' } }, 'Faded cells have fewer than 25 games. Hover or long-press a cell for the record.'));
}

function renderMethod(meta) {
  const items = Object.values(meta.sources).map((s) => h('li', h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.label), `: ${s.note}`));
  const parts = [h('ul', items)];
  if (CAL) {
    parts.push(
      h(
        'p',
        `Deck pages also run a simulator. Checked against ${CAL.matchups} real Limitless matchups between these decks, it picks the favored deck correctly in ${CAL.favoredAgree} of ${CAL.favoredTotal} matchups that aren't a coin flip, and its win rates are off by about ${CAL.maeCalibrated} points on average (guessing 50% every time is off by ${CAL.maeAlways50}). Treat sim numbers as direction, and the real columns as the score.`
      )
    );
  }
  document.getElementById('method-body').replaceChildren(...parts);
}

main().catch((e) => showError(document.querySelector('main'), e));
