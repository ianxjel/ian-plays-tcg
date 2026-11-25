import { loadJSON, h, pct, fmtDate, formatState, winRate, matrixLookup, verdict, markNav, showError, prizeMap } from './common.js';
import { matchupNotes } from './insights.js';
import { simulateMatchup, hashSeed, FACTOR_TEXT } from './sim.js';
import { splitChapters, renderMarkdown, inline } from './markdown.js';

markNav();

const root = document.getElementById('guide');
let A, META, CAL, X, xid, STREAMS;

async function main() {
  const params = new URLSearchParams(location.search);
  xid = params.get('id');
  const [F, arch, cal, streams] = await Promise.all([
    loadJSON('data/formats.json'),
    loadJSON('data/archetypes.json'),
    loadJSON('data/sim-calibration.json').catch(() => ({ shrink: 1 })),
    loadJSON('data/streams.json').catch(() => ({ events: {}, matches: [] })),
  ]);
  A = arch.archetypes;
  CAL = cal;
  STREAMS = streams;
  const fmt = F.formats.find((f) => f.id === params.get('format')) || formatState(F.formats).live;
  META = await loadJSON(fmt.data);
  X = A[xid];
  if (!X) {
    root.replaceChildren(h('p.note', 'No guide for that deck. ', h('a', { href: 'guides.html' }, 'See all guides'), '.'));
    return;
  }
  const text = await fetch(`data/guides/${xid}.md`)
    .then((r) => (r.ok ? r.text() : ''))
    .catch(() => '');
  const guide = text ? splitChapters(text) : null;
  document.title = `${X.name} guide — Ian Plays TCG`;

  const rank = META.top.findIndex((t) => t.id === xid);
  const row = META.top[rank] || (META.alsoNotable || []).find((t) => t.id === xid);
  const lim = matrixLookup(META, 'limitless');
  const th = matrixLookup(META, 'trainerHill');
  const challengers = META.top
    .map((t) => t.id)
    .filter((id) => id !== xid && A[id])
    .map((id) => {
      const r = lim(id, xid);
      const t = th(id, xid);
      return { id, a: A[id], real: r ? { wr: winRate(r.w, r.l, r.t), n: r.w + r.l + r.t, rec: r } : null, th: t ? { wr: winRate(t.w, t.l, t.t, 'trainerHill'), n: t.w + t.l + t.t } : null };
    })
    .sort((p, q) => (q.real?.wr ?? -1) - (p.real?.wr ?? -1));

  const statLine = row
    ? `${rank >= 0 ? `#${rank + 1} in the ${fmt.name}` : `Outside the top 10 in the ${fmt.name}`}: ${row.limitless.share.toFixed(1)}% of the field online${row.limitless.w !== undefined ? `, ${pct(winRate(row.limitless.w, row.limitless.l, row.limitless.t), 1)} win rate` : ''}.`
    : fmt.name;

  const mine = STREAMS.matches.filter((m) => m.p1.deck === xid || m.p2.deck === xid);

  // Every chapter of the page, in reading order. The table of contents is built from this list.
  const parts = [];
  if (guide) for (const c of guide.chapters) parts.push({ group: 'How to play', id: `ch-${c.id}`, title: c.title, body: () => h('div.prose', { html: renderMarkdown(c.md) }) });
  else parts.push({ group: 'How to play', id: 'how-it-plays', title: 'How it plays', body: () => planCard() });
  if (mine.length) parts.push({ group: 'Watch', id: 'watch', title: 'Watch it played', body: () => watchBody(mine) });
  parts.push({ group: 'How to beat it', id: 'who-beats', title: `Who beats ${X.short}`, body: () => whoBeats(challengers) });
  parts.push({ group: 'How to beat it', id: 'beat-anything', title: 'Beating it with anything', body: () => beatCard() });
  parts.push({ group: 'How to beat it', id: 'deck-by-deck', title: 'Deck by deck', body: () => deckByDeck(challengers) });
  parts.forEach((p, i) => (p.n = i + 1));

  root.replaceChildren(
    h('p.small.crumbs', h('a', { href: 'guides.html' }, 'All guides'), '  /  ', h('a', { href: 'index.html#top' }, 'Meta')),
    h(
      'header.guide-head',
      h('h1', X.name),
      h('p.guide-sub', guide ? 'How to play it, and how every top deck beats it' : `How every top deck beats ${X.name}`),
      h('p.lede', statLine, ' ', X.summary),
      guide?.meta.list ? h('p.small.guide-meta', { html: `Reference list: ${inline(guide.meta.list)}. Guide updated ${fmtDate(guide.meta.updated)}.` }) : null
    ),
    h(
      'div.guide-layout',
      toc(parts),
      h(
        'div.guide-main',
        guide?.intro ? h('div.prose.guide-intro', { html: renderMarkdown(guide.intro) }) : null,
        parts.map((p) => h('section.chapter', { id: p.id }, h('h2.ch-title', h('span.ch-num', String(p.n)), p.title), p.body()))
      )
    ),
    h(
      'section.section.method',
      h('h2', 'Where this comes from'),
      h(
        'p',
        `The how-to-play chapters are written from the reference list and its card text as printed on Limitless. Playthroughs are worked examples built from that card text, not records of real games; the streamed matches are the real thing. Win rates are results from Limitless online events and Trainer Hill, captured ${fmtDate(META.captured)}. Matchup notes are worked out from card text in the deck profiles; "about" marks damage that varies from game to game. Simulated games use the same profiles and are pulled toward 50% to match how they compare with real results.`
      )
    )
  );

  root.addEventListener('click', onCopy);
  const target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (target) {
    if (target.tagName === 'DETAILS') target.open = true;
    target.scrollIntoView();
  }
}

function toc(parts) {
  const groups = [];
  for (const p of parts) {
    let g = groups.find((x) => x.name === p.group);
    if (!g) groups.push((g = { name: p.group, items: [] }));
    g.items.push(p);
  }
  const box = h(
    'details.toc-box',
    h('summary', 'Chapters', h('span.small', `${parts.length}`)),
    groups.map((g) => h('div.toc-group', h('p.toc-label', g.name), h('ol', g.items.map((p) => h('li', h('a', { href: `#${p.id}` }, h('span.toc-n', String(p.n)), p.title))))))
  );
  const wide = window.matchMedia('(min-width: 1000px)');
  box.open = wide.matches;
  wide.addEventListener?.('change', (e) => (box.open = e.matches));
  return h('nav.toc', { 'aria-label': 'Chapters' }, box);
}

function onCopy(e) {
  const btn = e.target.closest('.copy-list');
  if (!btn) return;
  const done = (msg) => {
    btn.textContent = msg;
    setTimeout(() => (btn.textContent = 'Copy list'), 1800);
  };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(btn.dataset.list).then(() => done('Copied'), () => done('Copy failed'));
  else done('Copy failed');
}

function planCard() {
  return h('div.list-card', h('ul', X.plan.map((p) => h('li', p))), h('h3', { style: { margin: '12px 0 6px' } }, 'Key cards'), h('div.chips', X.keyCards.map((c) => h('span.chip-card', c))));
}

function beatCard() {
  return h(
    'div.list-card',
    h('ul', X.beatIt.map((p) => h('li', p))),
    X.sample ? h('p.small', h('a', { href: X.sample.url, target: '_blank', rel: 'noopener' }, `Sample list: ${X.sample.player}`), `, ${X.sample.event}, ${fmtDate(X.sample.date)}`) : null
  );
}

// ---------- Streamed matches ----------

const hms = (t) => {
  const s = Math.max(0, Math.round(t || 0));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const host = (u) => (/youtube\.com|youtu\.be/.test(u) ? 'YouTube' : /twitch\.tv/.test(u) ? 'Twitch' : 'video');
const deckName = (side) => (side.deck ? A[side.deck]?.name || side.deck : side.label || 'Other');

function matchRow(m, persp) {
  const ev = STREAMS.events[m.event] || { name: m.event };
  const mirror = m.p1.deck === persp && m.p2.deck === persp;
  const meFirst = m.p1.deck === persp;
  const me = meFirst ? m.p1 : m.p2;
  const opp = meFirst ? m.p2 : m.p1;
  const [a, b] = meFirst ? m.score : [m.score[1], m.score[0]];
  const res = mirror ? 'mirror' : a > b ? 'win' : a < b ? 'loss' : 'draw';
  const resText = mirror ? `Mirror ${m.score[0]}–${m.score[1]}` : `${{ win: 'Won', loss: 'Lost', draw: 'Drew' }[res]} ${a}–${b}`;
  const watch = m.video
    ? h('a.sm-watch', { href: m.video, target: '_blank', rel: 'noopener', 'aria-label': `Watch ${me.name} against ${opp.name} on ${host(m.video)}` }, `Watch on ${host(m.video)}`)
    : ev.page
      ? h('a.sm-watch', { href: ev.page, target: '_blank', rel: 'noopener', title: 'Limitless lists a broken video link for this broadcast, so this opens the event stream page.' }, 'Stream page', h('small', `at ${hms(m.t)}`))
      : null;
  return h(
    'li.sm-row',
    h('span', { class: `sm-res ${res}` }, resText),
    h('span.sm-who', h('b', me.name), ` vs ${opp.name}`, h('small', mirror ? 'Mirror match' : `against ${deckName(opp)}`)),
    h('span.sm-ev', `${ev.name}, ${m.round}`, h('small', fmtDate(ev.date))),
    watch
  );
}

function watchBody(matches) {
  const live = (m) => STREAMS.events[m.event]?.format === 'tef-dlr';
  const groups = [
    { title: 'Delta Reign format', note: null, rows: matches.filter(live) },
    { title: 'Before Delta Reign', note: 'These games were played in the TEF–30C format, before Delta Reign was legal, so the lists and the field were different. They are still worth watching for openings and sequencing.', rows: matches.filter((m) => !live(m)) },
  ].filter((g) => g.rows.length);
  const rec = matches.reduce(
    (r, m) => {
      if (m.p1.deck === xid && m.p2.deck === xid) return r;
      const [a, b] = m.p1.deck === xid ? m.score : [m.score[1], m.score[0]];
      r[a > b ? 'w' : a < b ? 'l' : 't']++;
      return r;
    },
    { w: 0, l: 0, t: 0 }
  );
  return h(
    'div',
    h('p', `${matches.length} streamed ${matches.length === 1 ? 'match' : 'matches'} with ${X.name} on Limitless, newest first. Results are from the ${X.short} player's side: ${rec.w} won, ${rec.l} lost, ${rec.t} drawn outside mirrors. Links open at the moment the match starts.`),
    groups.map((g) => h('div.sm-group', h('h3', g.title), g.note ? h('p.small', g.note) : null, h('ul.sm-list', g.rows.map((m) => matchRow(m, xid))))),
    X.limitlessId ? h('p.small', 'More on ', h('a', { href: `https://limitlesstcg.com/decks/${X.limitlessId}`, target: '_blank', rel: 'noopener' }, `the ${X.name} page on Limitless`), '.') : null
  );
}

// ---------- How to beat it ----------

function whoBeats(challengers) {
  const rows = challengers.map((c) => {
    const wr = c.real?.wr ?? null;
    const v = verdict(wr);
    const off = wr === null ? 0 : Math.max(-0.5, Math.min(0.5, wr - 0.5));
    const fill = h('span.dv-fill', { style: off >= 0 ? { left: '50%', width: `${off * 200}%` } : { right: '50%', width: `${-off * 200}%` } });
    return h(
      'a.dv-row',
      { href: `#vs-${c.id}`, onclick: () => openCard(c.id) },
      h('span.dv-name', c.a.name),
      h('span.dv-bar', { class: `dv-bar ${v.key}`, 'aria-hidden': 'true' }, fill, h('span.dv-mid')),
      h('span.dv-num', wr === null ? '—' : `${v.mark ? v.mark + ' ' : ''}${pct(wr)}`, c.real && h('small', `${c.real.n} games${c.th ? `, TH ${pct(c.th.wr)}` : ''}`))
    );
  });
  const best = challengers.filter((c) => c.real && c.real.wr >= 0.55).map((c) => c.a.name);
  const worst = challengers.filter((c) => c.real && c.real.wr <= 0.45).map((c) => c.a.name);
  const sum = [];
  if (best.length) sum.push(`Beat it most often with ${best.join(', ')}.`);
  if (worst.length) sum.push(`${X.name} beats ${worst.join(', ')}.`);
  return h(
    'div',
    h('p.small', `Each bar is that deck's win rate against ${X.name} on Limitless. Right of center means it wins the matchup; left means ${X.name} does.`),
    sum.length ? h('p', sum.join(' ')) : null,
    h('div.dv-list', h('div.dv-head', h('span', 'Deck'), h('span.dv-axis', h('span', `${X.short} wins`), h('span', '50%'), h('span', 'Deck wins')), h('span.dv-num', 'Win rate')), rows)
  );
}

function openCard(id) {
  const d = document.getElementById(`vs-${id}`);
  if (d) d.open = true;
}

function deckByDeck(challengers) {
  return h('div', h('p.small', `How each top deck beats ${X.name}. Open one for the plan, streamed games and a quick simulation.`), h('div.mu-list', challengers.map((c) => matchupCard(c))));
}

function matchupCard(c) {
  const v = verdict(c.real?.wr ?? null);
  const notes = matchupNotes(c.a, X);
  const body = h('div.mu-body');
  const simBox = h('div', h('p.small.loading', 'Opens a quick simulation…'));
  let simmed = false;
  const simDetails = h('details.sub', h('summary', 'Simulated games'), simBox);
  const games = STREAMS.matches.filter((m) => (m.p1.deck === xid && m.p2.deck === c.id) || (m.p2.deck === xid && m.p1.deck === c.id));
  const el = h(
    'details.mu',
    { id: `vs-${c.id}` },
    h(
      'summary.vs-summary',
      h('span.opp', `${c.a.name}`, h('small', `into ${X.name}`)),
      h('span', { class: `pill ${v.key}` }, c.real ? `${v.label} for ${c.a.short}` : 'no data'),
      h('span.num', c.real ? pct(c.real.wr) : '—', c.real && h('small', `${c.real.rec.w}-${c.real.rec.l}-${c.real.rec.t}`))
    ),
    body
  );
  body.append(
    h(
      'details.sub',
      { open: true },
      h('summary', `What ${c.a.short} has going for it`),
      notes.edges.length ? h('ul', notes.edges.map((x) => h('li', x))) : h('p.small', 'No clear edge from card text; this one comes down to play.')
    ),
    h('details.sub', { open: true }, h('summary', 'What to watch out for'), notes.dangers.length ? h('ul', notes.dangers.map((x) => h('li', x))) : h('p.small', 'Nothing in their list lines up especially well against you.')),
    h('details.sub', { open: true }, h('summary', 'Game plan'), notes.plan.length ? h('ol', notes.plan.map((x) => h('li', x))) : h('p.small', 'Trade evenly and win on gusts.')),
    games.length ? h('details.sub', h('summary', `Streamed games (${games.length})`), h('ul.sm-list', games.map((m) => matchRow(m, c.id)))) : null,
    simDetails,
    h(
      'p.small',
      { style: { marginTop: '10px' } },
      h('a', { href: `guide.html?id=${c.id}` }, `${c.a.name} guide`),
      '  ',
      h('span', '|'),
      '  ',
      h('a', { href: `https://play.limitlesstcg.com/decks/${c.a.limitless}/matchups?format=standard`, target: '_blank', rel: 'noopener' }, `${c.a.short} matchups on Limitless`)
    )
  );
  const runSim = () => {
    if (simmed) return;
    simmed = true;
    setTimeout(() => {
      const r = simulateMatchup(c.a.model, X.model, { games: 1500, seed: hashSeed(c.id + xid) });
      const cal = (x) => 0.5 + (CAL.shrink ?? 1) * (x - 0.5);
      const fl = (items, kind) =>
        items
          .filter((f) => f.share >= 0.1)
          .slice(0, 3)
          .map((f) => h(`div.factor${kind === 'loss' ? '.loss' : ''}`, h('span', FACTOR_TEXT[kind][f.key]), h('div.bar', h('span', { style: { width: `${f.share * 100}%` } })), h('span.num', pct(f.share))));
      simBox.replaceChildren(
        h('p', `${c.a.short} won ${pct(cal(r.winRate))} of 1,500 simulated games (going first ${pct(cal(r.firstWinRate))}, second ${pct(cal(r.secondWinRate))}).`),
        h('div.two-col', h('div', h('h3', { style: { marginBottom: '6px' } }, `When ${c.a.short} won`), fl(r.winFactors, 'win')), h('div', h('h3', { style: { marginBottom: '6px' } }, `When ${X.short} won`), fl(r.lossFactors, 'loss'))),
        r.prizeMaps.length ? h('div.maps', { style: { marginTop: '10px' } }, r.prizeMaps.slice(0, 2).map((m) => h('div.row', prizeMap(m.key), h('span.small', `${pct(m.share)} of ${c.a.short} wins`)))) : null
      );
    }, 20);
  };
  simDetails.addEventListener('toggle', () => simDetails.open && runSim());
  return el;
}

main().catch((e) => showError(root, e));
