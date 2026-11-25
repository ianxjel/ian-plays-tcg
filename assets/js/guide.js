import { loadJSON, h, pct, fmtDate, parseDate, formatState, winRate, matrixLookup, verdict, markNav, showError, prizeMap } from './common.js';
import { matchupNotes } from './insights.js';
import { simulateMatchup, hashSeed, FACTOR_TEXT } from './sim.js';

markNav();

const root = document.getElementById('guide');
let A, META, CAL, X, xid;

async function main() {
  const params = new URLSearchParams(location.search);
  xid = params.get('id');
  const [F, arch, cal] = await Promise.all([loadJSON('data/formats.json'), loadJSON('data/archetypes.json'), loadJSON('data/sim-calibration.json').catch(() => ({ shrink: 1 }))]);
  A = arch.archetypes;
  CAL = cal;
  const fmt = F.formats.find((f) => f.id === params.get('format')) || formatState(F.formats).live;
  META = await loadJSON(fmt.data);
  X = A[xid];
  if (!X) {
    root.replaceChildren(h('p.note', 'No guide for that deck. ', h('a', { href: 'guides.html' }, 'See all guides'), '.'));
    return;
  }
  document.title = `How to beat ${X.name} — Ian Plays TCG`;

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

  root.replaceChildren(
    h('p.small', { style: { margin: '0 0 8px' } }, h('a', { href: 'guides.html' }, 'All guides'), '  /  ', h('a', { href: 'index.html#top' }, 'Meta')),
    h('h1', `How to beat ${X.name}`),
    h('p.lede', { style: { marginTop: '12px' } }, statLine, ' ', X.summary),
    h(
      'div.two-col',
      { style: { marginTop: '22px' } },
      h('div.list-card', h('h2', 'How it plays'), h('ul', X.plan.map((p) => h('li', p))), h('h3', { style: { margin: '12px 0 6px' } }, 'Key cards'), h('div.chips', X.keyCards.map((c) => h('span.chip-card', c)))),
      h(
        'div.list-card',
        h('h2', 'Beating it with anything'),
        h('ul', X.beatIt.map((p) => h('li', p))),
        X.sample ? h('p.small', h('a', { href: X.sample.url, target: '_blank', rel: 'noopener' }, `Sample list: ${X.sample.player}`), `, ${X.sample.event}, ${fmtDate(X.sample.date)}`) : null
      )
    ),
    whoBeats(challengers),
    h(
      'section.section',
      h('div.section-head', h('div', h('h2', 'Deck by deck'), h('p.small', `How each top deck beats ${X.name}. Open one for the plan.`))),
      h('div.mu-list', challengers.map((c) => matchupCard(c)))
    ),
    h(
      'section.section.method',
      h('h2', 'Where this comes from'),
      h(
        'p',
        `Win rates are real results from Limitless online events and Trainer Hill, captured ${fmtDate(META.captured)}. The notes under each matchup are worked out from card text in the deck profiles (HP, damage, Weakness, prize value, locks, walls, spread, snipes); "about" marks damage that varies from game to game. The simulated games use the same profiles and are pulled toward 50% to match how they compare with real results.`
      )
    )
  );

  const target = location.hash && document.getElementById(location.hash.slice(1));
  if (target && target.tagName === 'DETAILS') {
    target.open = true;
    target.scrollIntoView();
  }
}

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
    'section.section',
    h(
      'div.section-head',
      h('div', h('h2', `Who beats ${X.name}`), h('p.small', `Each bar is that deck's win rate against ${X.name} on Limitless. Right of center means it wins the matchup; left means ${X.name} does.`))
    ),
    sum.length ? h('p', sum.join(' ')) : null,
    h('div.dv-list', h('div.dv-head', h('span', 'Deck'), h('span.dv-axis', h('span', `${X.short} wins`), h('span', '50%'), h('span', 'Deck wins')), h('span.dv-num', 'Win rate')), rows)
  );
}

function openCard(id) {
  const d = document.getElementById(`vs-${id}`);
  if (d) d.open = true;
}

function matchupCard(c) {
  const v = verdict(c.real?.wr ?? null);
  const notes = matchupNotes(c.a, X);
  const body = h('div.mu-body');
  const simBox = h('div', h('p.small.loading', 'Opens a quick simulation…'));
  let simmed = false;
  const simDetails = h('details.sub', h('summary', 'Simulated games'), simBox);
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
    simDetails,
    h('p.small', { style: { marginTop: '10px' } }, h('a', { href: `guide.html?id=${c.id}` }, `How to beat ${c.a.name}`), '  ', h('span', '|'), '  ', h('a', { href: `https://play.limitlesstcg.com/decks/${c.a.limitless}/matchups?format=standard`, target: '_blank', rel: 'noopener' }, `${c.a.short} matchups on Limitless`))
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
