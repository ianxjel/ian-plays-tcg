import { loadJSON, h, pct, parseDate, today, daysBetween, fmtDate, fmtDay, formatState, winRate, heatColor, heatText, markNav, showError, matrixLookup, verdict } from './common.js';

markNav();

const params = new URLSearchParams(location.search);
const state = { format: null, source: params.get('source') || 'limitless', view: params.get('view') === 'list' ? 'list' : 'grid', focus: params.get('focus') };
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

function renderViewToggle() {
  const box = document.getElementById('view-toggle');
  const views = [
    ['grid', 'Grid'],
    ['list', 'List'],
  ];
  box.replaceChildren(...views.map(([k, label]) => h('button', { type: 'button', 'aria-pressed': String(state.view === k), onclick: () => ((state.view = k), renderAll()) }, label)));
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
  renderEvents(meta);
  renderSourceToggle(meta);
  renderViewToggle();
  renderHeat(meta);
  renderMethod(meta);
}

function renderTop(meta) {
  const maxShare = Math.max(...meta.top.map((t) => t.limitless.share));
  const head = () =>
    h(
      'div.cols-head',
      h('span', '#'),
      h('span', 'Deck'),
      h('span.share-bar', 'Share of the field'),
      h('span.num', 'Limitless'),
      h('span.num', 'Trainer Hill'),
      h('span.num', 'How to beat')
    );
  const row = (t, i) => {
    const a = A[t.id] || { name: t.label || t.id };
    const lw = t.limitless.w !== undefined ? winRate(t.limitless.w, t.limitless.l, t.limitless.t) : null;
    const sub = lw !== null ? `${pct(lw, 1)} win rate, ${t.limitless.count} players` : t.label && t.label !== a.name ? t.label : `${t.limitless.points} points`;
    const summary = h(
      'summary',
      h('span.rank', i + 1),
      h('span.deck-name', a.name, h('small', sub)),
      h('span.share-bar', h('div.bar', h('span', { style: { width: `${(t.limitless.share / maxShare) * 100}%` } }))),
      h('span.num', `${t.limitless.share.toFixed(1)}%`),
      h('span.num', t.trainerHill ? `${t.trainerHill.share.toFixed(1)}%` : '—'),
      h('a.guide-link', { href: `guide.html?id=${t.id}`, 'aria-label': `Guide: how to play and beat ${a.name}` }, 'Guide')
    );
    return h('details.deck-row', summary, profile(t.id, a));
  };
  const parts = [h('div.decks-table', head(), meta.top.map((t, i) => row(t, i)))];
  // Ranks 11 to 20: same rows, folded away under the top 10.
  if (meta.next?.length) {
    const from = meta.top.length;
    parts.push(
      h(
        'details.next-ten',
        h('summary', `Ranks ${from + 1} to ${from + meta.next.length}`, h('small', `Limitless online, captured ${fmtDate(meta.nextCaptured || meta.captured)}`)),
        h('div.decks-table', head(), meta.next.map((t, i) => row(t, from + i)))
      )
    );
  }
  document.getElementById('top-list').replaceChildren(...parts);
}

function profile(id, a) {
  if (!a.summary) return h('div.profile', h('p.small', 'No profile for this deck yet.'));
  const links = [h('li', h('a', { href: `guide.html?id=${id}` }, `Full guide: how to play ${a.short || a.name} and how every top deck beats it`))];
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

function renderEvents(meta) {
  const section = document.getElementById('events');
  const ev = (meta.events || [])[0];
  section.hidden = !ev;
  if (!ev) return;
  document.getElementById('events-sub').textContent = `${ev.name}, ${fmtDay(ev.date)}. ${ev.players.toLocaleString()} players.`;
  const top8 = ev.top.slice(0, 8);
  const counts = {};
  for (const [, , , id] of ev.top.slice(0, 16)) counts[id] = (counts[id] || 0) + 1;
  const most = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const name = (id) => (A[id] ? A[id].name : id);
  const lead = `${name(top8[0][3])} won. ${name(most[0])} put ${most[1]} decks in the top 16.`;
  document.getElementById('events-body').replaceChildren(
    h('p', lead),
    h(
      'ol.decks-table',
      { style: { listStyle: 'none', padding: 0, margin: 0 } },
      top8.map(([place, player, country, id]) =>
        h('li.list-line', { style: { padding: '10px 16px' } }, h('span', h('strong', `${place}. ${name(id)}`), h('span.detail', `${player} (${country})`)))
      )
    ),
    h('p.small', { style: { marginTop: '8px' } }, h('a', { href: ev.decklists || ev.url, target: '_blank', rel: 'noopener' }, 'Top decklists on Limitless'))
  );
}

function renderHeat(meta) {
  const box = document.getElementById('heat');
  const hasData = meta.matrix && Object.values(meta.matrix).some((r) => r.length);
  document.getElementById('view-toggle').hidden = !hasData;
  document.getElementById('source-toggle').hidden = !hasData;
  if (!hasData) {
    box.replaceChildren(h('p.note', 'Matchup data is tracked for the Delta Reign format. Switch to it above to see who beats who.'));
    return;
  }
  const ids = meta.top.map((t) => t.id);
  const share = Object.fromEntries(meta.top.map((t) => [t.id, t.limitless.share]));
  const get = matrixLookup(meta, state.source);
  const wrOf = (a, b) => {
    const r = get(a, b);
    return r ? { wr: winRate(r.w, r.l, r.t, state.source), n: r.w + r.l + r.t, r } : null;
  };
  const name = (id) => (A[id] ? A[id].short : id);
  // Share-weighted win rate against the rest of the top 10.
  const overall = (a) => {
    let num = 0;
    let den = 0;
    for (const b of ids) {
      if (a === b) continue;
      const x = wrOf(a, b);
      if (!x) continue;
      num += x.wr * share[b];
      den += share[b];
    }
    return den ? num / den : null;
  };
  if (state.view === 'list') return renderList(box, ids, wrOf, overall);

  const focus = state.focus && ids.includes(state.focus) ? state.focus : null;
  const thead = h(
    'thead',
    h('tr', h('th.corner', { scope: 'col' }, 'Deck ↓', h('br'), 'against →'), ids.map((id) => h('th', { scope: 'col', class: focus === id ? 'hl' : null }, name(id))), h('th.overall', { scope: 'col' }, 'Vs top 10'))
  );
  const tbody = h(
    'tbody',
    ids.map((a) =>
      h(
        'tr',
        h(
          'th',
          { scope: 'row', class: focus === a ? 'hl' : null },
          h('button', { type: 'button', 'aria-pressed': String(focus === a), onclick: () => ((state.focus = focus === a ? null : a), renderHeat(meta)) }, name(a))
        ),
        ids.map((b) => {
          const hl = focus && (a === focus || b === focus) ? 'hl' : null;
          const x = wrOf(a, b);
          if (a === b) return h('td.self', { class: `self ${hl || ''}`, title: `${A[a]?.name} mirror` }, x ? Math.round(x.wr * 100) : '—');
          if (!x) return h('td.na', { class: `na ${hl || ''}`, title: 'No data captured' }, '·');
          const v = verdict(x.wr);
          const tip = `${A[a]?.name} vs ${A[b]?.name}: ${A[a]?.short} wins ${pct(x.wr, 1)} of ${x.n} games (${x.r.w}-${x.r.l}-${x.r.t})${x.r.from === 'inverse' ? ', from the other deck’s side' : ''}`;
          return h(
            'td',
            { class: hl, title: tip, 'aria-label': tip, style: { background: heatColor(x.wr), color: heatText(x.wr), opacity: x.n < 25 && !focus ? 0.6 : null } },
            v.mark ? h('span.mk', { 'aria-hidden': 'true' }, v.mark) : null,
            Math.round(x.wr * 100)
          );
        }),
        (() => {
          const o = overall(a);
          return h('td.overall', { class: `overall ${focus === a ? 'hl' : ''}`, style: { background: heatColor(o), color: heatText(o) }, title: `${A[a]?.name}: ${pct(o, 1)} against the rest of the top 10, weighted by play rate` }, o === null ? '—' : Math.round(o * 100));
        })()
      )
    )
  );
  const parts = [
    h('p.heat-caption', 'Read across a row: the deck on the left against each deck on top. ', h('b', '▲'), ' the row deck is favored (55% or more), ', h('b', '▼'), ' it is unfavored (45% or less). Tap a deck name to focus on it.'),
    h('div.grid-scroll', h('table', { class: `heat${focus ? ' focused' : ''}` }, thead, tbody)),
    h('div.legend', { style: { marginTop: '10px' } }, h('span', 'Row deck loses'), h('span.swatch', { 'aria-hidden': 'true' }), h('span', 'Row deck wins')),
  ];
  if (focus) parts.push(focusNote(focus, ids, wrOf, overall));
  else parts.push(h('p.small', { style: { marginTop: '8px' } }, 'Faded cells have fewer than 25 games. Hover or long-press a cell for the record.'));
  box.replaceChildren(...parts);
}

function sides(a, ids, wrOf) {
  const out = { beats: [], loses: [], even: [] };
  for (const b of ids) {
    if (a === b) continue;
    const x = wrOf(a, b);
    if (!x) continue;
    const v = verdict(x.wr);
    (v.key === 'fav' ? out.beats : v.key === 'unfav' ? out.loses : out.even).push({ id: b, wr: x.wr, n: x.n });
  }
  out.beats.sort((p, q) => q.wr - p.wr);
  out.loses.sort((p, q) => p.wr - q.wr);
  out.even.sort((p, q) => q.wr - p.wr);
  return out;
}

function focusNote(a, ids, wrOf, overall) {
  const s = sides(a, ids, wrOf);
  const fmtList = (arr) => arr.map((x) => `${A[x.id].short} (${pct(x.wr)})`).join(', ');
  return h(
    'div.focus-note',
    h('p', h('strong', A[a].name), ` wins ${pct(overall(a))} against the rest of the top 10.`),
    s.beats.length ? h('p', `Beats ${fmtList(s.beats)}.`) : h('p', 'No clearly favored matchups.'),
    s.loses.length ? h('p', `Loses to ${fmtList(s.loses)}.`) : h('p', 'No clearly bad matchups.'),
    s.even.length ? h('p.small', `Close to even: ${fmtList(s.even)}.`) : null,
    h('p.small', h('a', { href: `guide.html?id=${a}` }, `How to beat ${A[a].name}`))
  );
}

function renderList(box, ids, wrOf, overall) {
  const chip = (x, kind) => h(`span.mchip.${kind}`, { title: `${x.n} games` }, `${A[x.id].short} ${Math.round(x.wr * 100)}`);
  const rows = ids
    .map((a) => ({ a, o: overall(a), s: sides(a, ids, wrOf) }))
    .sort((p, q) => (q.o ?? 0) - (p.o ?? 0))
    .map(({ a, o, s }) =>
      h(
        'div.wbw-row',
        h('h3', h('a', { href: `guide.html?id=${a}` }, A[a].name), h('small', `${pct(o)} vs the top 10`)),
        h(
          'div',
          h('div.wbw-line', h('span.lbl', 'Beats'), s.beats.length ? s.beats.map((x) => chip(x, 'fav')) : h('span.small', 'nobody clearly')),
          h('div.wbw-line', { style: { marginTop: '6px' } }, h('span.lbl', 'Loses to'), s.loses.length ? s.loses.map((x) => chip(x, 'unfav')) : h('span.small', 'nobody clearly')),
          s.even.length ? h('div.wbw-line', { style: { marginTop: '6px' } }, h('span.lbl', 'Even'), s.even.map((x) => chip(x, 'even'))) : null
        )
      )
    );
  box.replaceChildren(h('p.heat-caption', 'Sorted by win rate against the rest of the top 10. Numbers are each deck\'s win % in that matchup; 55%+ counts as a win, 45% or less as a loss.'), h('div.wbw', rows));
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
