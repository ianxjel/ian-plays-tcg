import { loadJSON, h, pct, fmtDate, winRate, heatColor, markNav, showError, prizeMap } from './common.js';
import { parseList, simplify, countCards, goldfish } from './decklist.js';
import { simulateMatchup, hashSeed, FACTOR_TEXT, FACTOR_ADVICE } from './sim.js';

markNav();

// The goldfish plays simple lines. Real pilots find more outs, so the sim scales the
// goldfish's "not ready yet" odds by this factor before racing the meta decks.
const PILOT_SKILL = 0.6;

const root = document.getElementById('deck');
let D, A, F, META, CAL, SPEED;
const rows = {};

async function main() {
  const id = new URLSearchParams(location.search).get('id');
  if (!id) {
    root.replaceChildren(h('p.note', 'No deck picked. ', h('a', { href: 'decks.html' }, 'Go to My decks'), '.'));
    return;
  }
  [D, A, F, CAL] = await Promise.all([
    loadJSON(`data/decks/${encodeURIComponent(id)}.json`),
    loadJSON('data/archetypes.json').then((x) => x.archetypes),
    loadJSON('data/formats.json'),
    loadJSON('data/sim-calibration.json').catch(() => ({ shrink: 1 })),
  ]);
  const fmt = F.formats.find((f) => f.id === D.format) || F.formats[F.formats.length - 1];
  META = await loadJSON(fmt.data);
  document.title = `${D.name} — Ian Plays TCG`;

  const parsed = parseList(D.list);
  const simple = simplify(parsed, D.pokemon || {});
  const counts = countCards(parsed);
  SPEED = goldfish(parsed, D.pokemon || {}, D.lines || [], { games: 4000, seed: hashSeed(D.id) });

  root.replaceChildren(
    D.example ? h('div.banner', 'This is an example deck so you can see the layout. Your own decks will show up on ', h('a', { href: 'decks.html' }, 'My decks'), '.') : null,
    hero(fmt, simple, counts),
    matchupSection(),
    methodSection()
  );
  runSims(2000);
  const target = location.hash && document.getElementById(location.hash.slice(1));
  if (target && target.tagName === 'DETAILS') {
    target.open = true;
    target.scrollIntoView();
  }
}

function hero(fmt, simple, counts) {
  const gp = D.gameplan || {};
  const left = h(
    'div',
    h('p', { style: { margin: '0 0 8px' } }, h('span.status' + (D.status === 'ready' ? '.ready' : D.status === 'retired' ? '.retired' : ''), D.status || 'testing'), ' ', h('span.small', `${fmt.name}, added ${fmtDate(D.created)}`)),
    h('h1', D.name),
    h('p.lede', { style: { marginTop: '12px' } }, D.summary),
    gp.setup || gp.turns || gp.tips
      ? h(
          'details.sub.mu',
          { style: { padding: '0 16px', marginTop: '18px' } },
          h('summary', 'Overall game plan'),
          gp.setup && h('div', h('h3', 'Setup'), h('ul', gp.setup.map((x) => h('li', x)))),
          gp.turns && h('div', h('h3', 'Turn by turn'), h('ol', gp.turns.map((x) => h('li', x)))),
          gp.tips && h('div', h('h3', 'Tips'), h('ul', gp.tips.map((x) => h('li', x))))
        )
      : null
  );
  const copyBtn = h('button.btn', { type: 'button' }, 'Copy list for TCG Live');
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(D.list);
      copyBtn.textContent = 'Copied';
    } catch {
      copyBtn.textContent = 'Copy failed — use the full list below';
    }
  });
  const card = h(
    'div.list-card',
    h('h2', `Simplified list (${counts.total} cards)`),
    h('div.list-group', h('h3', h('span', 'Pokémon'), h('span', counts.pokemon)), simple.pokemon.map((p) => h('div.list-line', h('span', p.label, p.detail && h('span.detail', p.detail)), h('span.ct', p.counts)))),
    h(
      'div.list-group',
      h('h3', h('span', 'Trainers'), h('span', counts.trainer)),
      simple.trainers.map((g) => h('div.list-line', h('span', g.role, h('span.detail', g.cards.map((c) => `${c.count} ${c.name}`).join(', '))), h('span.ct', g.total)))
    ),
    h('div.list-group', h('h3', h('span', 'Energy'), h('span', counts.energy)), h('div.list-line', h('span', simple.energy.map((e) => `${e.count} ${e.name.replace(' Energy', '')}`).join(', ')), h('span.ct', counts.energy))),
    h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' } }, copyBtn),
    h('details', { style: { marginTop: '10px' } }, h('summary.small', 'Full list'), h('pre', { style: { fontSize: '0.8rem', whiteSpace: 'pre-wrap' } }, D.list))
  );
  if (counts.total !== 60) card.prepend(h('p.note', `This list has ${counts.total} cards, not 60.`));
  left.append(setupSection());
  return h('section.deck-hero', left, card);
}

function setupSection() {
  const avg = (i) => (SPEED.first[i] + SPEED.second[i]) / 2;
  const main = D.lines?.[0];
  const attacker = main ? main.stage2 || main.stage1 || main.basic : 'main attacker';
  const turns = [1, 2, 3, 4, 5];
  return h(
    'div',
    { style: { marginTop: '28px' } },
    h('div.section-head', h('div', h('h2', 'Setup odds'), h('p.small', `How often ${attacker} can attack by each of your turns, from 4,000 simulated opening hands on autopilot. Real play finds more outs, so read these as a floor.`))),
    h(
      'div.stat-strip',
      h('div', h('div.v', pct(avg(2))), h('div.k', `${attacker} attacking by turn 3`)),
      h('div', h('div.v', pct(SPEED.mulliganRate)), h('div.k', 'Opening hands that mulligan')),
      h('div', h('div.v', { id: 'overall' }, '…'), h('div.k', 'Sim win rate vs the top 10, weighted by play rate'))
    ),
    h(
      'table.odds',
      h('thead', h('tr', h('th', 'Attacking by'), turns.map((t) => h('th', `Turn ${t}`)))),
      h(
        'tbody',
        h('tr', h('td', 'Going first'), turns.map((t) => h('td', pct(SPEED.first[t - 1])))),
        h('tr', h('td', 'Going second'), turns.map((t) => h('td', pct(SPEED.second[t - 1]))))
      )
    )
  );
}

function realRef(opp) {
  if (!D.archetypeRef) return null;
  const rec = (META.matrix?.limitless || []).find((r) => r[0] === D.archetypeRef && r[1] === opp);
  if (!rec) return null;
  return { wr: winRate(rec[2], rec[3], rec[4]), n: rec[2] + rec[3] + rec[4] };
}

function myRecord(opp) {
  const recs = (D.record || []).filter((r) => r.opp === opp);
  if (!recs.length) return null;
  const s = recs.reduce((a, r) => ({ w: a.w + (r.w || 0), l: a.l + (r.l || 0), t: a.t + (r.t || 0) }), { w: 0, l: 0, t: 0 });
  return s;
}

function matchupSection() {
  const refName = D.archetypeRef && A[D.archetypeRef] ? A[D.archetypeRef].name : null;
  const head = h(
    'div.mu-head',
    h('span', 'Opponent'),
    h('span.sim-col', 'Sim win rate'),
    h('span.num', refName ? `${refName} real` : 'Real'),
    h('span.num', 'Your games')
  );
  const list = h(
    'div.mu-list',
    META.top.map((t) => {
      const a = A[t.id];
      const real = realRef(t.id);
      const rec = myRecord(t.id);
      const bar = h('div.wr-bar', h('div.fill'), h('div.mid'), h('div.label', h('span.loading', 'simulating…')));
      const body = h('div.mu-body', h('p.loading', 'Simulating…'));
      const el = h(
        'details.mu',
        { id: `mu-${t.id}` },
        h(
          'summary',
          h('span.opp', a.name, h('small', `${t.limitless.share.toFixed(1)}% of the field`)),
          bar,
          h('span.num', real ? pct(real.wr) : '—', real && h('small', `${real.n} games`)),
          h('span.num', rec ? `${rec.w}-${rec.l}-${rec.t}` : '—', rec && h('small', pct(winRate(rec.w, rec.l, rec.t))))
        ),
        body
      );
      rows[t.id] = { el, bar, body, a, t };
      return el;
    })
  );
  return h(
    'section.section',
    h(
      'div.section-head',
      h(
        'div',
        h('h2', 'Versus the top 10'),
        h(
          'p.small',
          'Open a matchup for setup, turn plan, why simulated games were won or lost, and suggestions.',
          refName ? ` "Real" is how ${refName} decks did against that deck on Limitless, the closest thing to real results until you log your own games.` : ''
        )
      )
    ),
    head,
    list
  );
}

function methodSection() {
  const select = h('select', { 'aria-label': 'Games per matchup', style: { font: 'inherit', padding: '6px', borderRadius: '6px' } }, [1000, 2000, 5000, 10000].map((n) => h('option', { value: n, selected: n === 2000 }, `${n.toLocaleString()} games per matchup`)));
  const btn = h('button.btn.primary', { type: 'button', onclick: () => runSims(Number(select.value)) }, 'Run the sims again');
  return h(
    'section.section.method',
    h('h2', 'How the sim works'),
    h(
      'p',
      'Each simulated game is a race to six prizes. Your deck comes online when the setup odds above say it does; each meta deck uses a profile built from its card text and sample lists (HP, damage, prize value, gust targets, walls, locks, spread, snipes). The sim counts which factors showed up in the games you won and lost.'
    ),
    CAL && CAL.maeCalibrated
      ? h(
          'p',
          `Checked against ${CAL.matchups} real Limitless matchups, it picks the favored deck correctly in ${CAL.favoredAgree} of ${CAL.favoredTotal} that aren't a coin flip and is off by about ${CAL.maeCalibrated} points on average, so raw results are pulled ${Math.round((1 - CAL.shrink) * 100)}% toward 50% before they're shown. Use the sim for direction and the real columns for the score.`
        )
      : null,
    h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' } }, select, btn, h('span.small', { id: 'sim-status' }))
  );
}

function deckModel() {
  const m = structuredClone(D.model);
  if (!m.speed) {
    const adj = (p) => Math.round((1 - (1 - p) * PILOT_SKILL) * 1000) / 1000;
    m.speed = { first: SPEED.first.map((p, i) => (i === 0 && p === 0 ? 0 : adj(p))), second: SPEED.second.map((p) => (p === 0 ? 0 : adj(p))) };
  }
  return m;
}

const calibrate = (raw) => 0.5 + (CAL.shrink ?? 1) * (raw - 0.5);

function runSims(games) {
  const model = deckModel();
  const ids = META.top.map((t) => t.id);
  const status = document.getElementById('sim-status');
  const results = {};
  let i = 0;
  const step = () => {
    if (i >= ids.length) {
      finish(results);
      status.textContent = `Ran ${(games * ids.length).toLocaleString()} games.`;
      return;
    }
    const id = ids[i++];
    status.textContent = `Simulating ${A[id].name}…`;
    const r = simulateMatchup(model, A[id].model, { games, seed: hashSeed(D.id + id + games) });
    results[id] = r;
    renderRow(id, r);
    setTimeout(step, 0);
  };
  setTimeout(step, 30);
}

function finish(results) {
  let num = 0;
  let den = 0;
  for (const t of META.top) {
    const r = results[t.id];
    if (!r) continue;
    num += calibrate(r.winRate) * t.limitless.share;
    den += t.limitless.share;
  }
  document.getElementById('overall').textContent = den ? pct(num / den) : '—';
}

function renderRow(id, r) {
  const row = rows[id];
  const wr = calibrate(r.winRate);
  row.bar.querySelector('.fill').style.cssText = `width:${wr * 100}%;background:${heatColor(wr)}`;
  row.bar.querySelector('.label').textContent = `${pct(wr)}${Math.abs(wr - 0.5) < 0.03 ? ' even' : wr > 0.5 ? ' favored' : ' unfavored'}`;
  row.bar.title = `Raw sim ${pct(r.winRate, 1)}; going first ${pct(r.firstWinRate)}, going second ${pct(r.secondWinRate)}`;
  row.body.replaceChildren(...matchupBody(id, r, row.a));
}

function bullets(list) {
  return list && list.length ? h('ul', list.map((x) => h('li', x))) : null;
}

function factorList(items, kind) {
  const text = FACTOR_TEXT[kind];
  const top = items.filter((f) => f.share >= 0.08).slice(0, 4);
  if (!top.length) return h('p.small', 'No single factor stood out.');
  return h(
    'div',
    top.map((f) => h(`div.factor${kind === 'loss' ? '.loss' : ''}`, h('span', text[f.key] || f.key), h('div.bar', h('span', { style: { width: `${f.share * 100}%` } })), h('span.num', pct(f.share))))
  );
}

function matchupBody(id, r, a) {
  const g = D.matchups?.[id] || {};
  const first = r.myReadyMedian;
  const theirs = r.oppReadyMedian;
  const winsTotal = r.wins;

  const setup = h(
    'details.sub',
    { open: true },
    h('summary', 'How to set up'),
    bullets(g.setup || D.gameplan?.setup),
    h('p.small', `In these sims your attacker is usually online by your turn ${first}; ${a.name}'s by their turn ${theirs}.`)
  );

  const race = [];
  if (r.firstKOMedian) race.push(`Your first KO usually lands on your turn ${r.firstKOMedian}.`);
  race.push(`Games last about ${r.turnsMedian} turns each.`);
  race.push(`Going first you win ${pct(calibrate(r.firstWinRate))}; going second ${pct(calibrate(r.secondWinRate))}.`);
  const turns = h('details.sub', h('summary', 'Turn by turn'), g.turns ? h('ol', g.turns.map((x) => h('li', x))) : bullets(D.gameplan?.turns), h('p.small', race.join(' ')));

  const maps = r.prizeMaps.length
    ? h(
        'div',
        h('h3', { style: { margin: '6px 0 8px' } }, 'How the 6 prizes came in your wins'),
        h(
          'div.maps',
          r.prizeMaps.slice(0, 3).map((m) => h('div.row', prizeMap(m.key), h('span.small', `${pct(m.share)} of wins`)))
        )
      )
    : null;
  const kod = r.kodBy.length ? h('p.small', `What they KO'd most: ${r.kodBy.map((k) => `${k.key} (${k.share.toFixed(1)} per game)`).join(', ')}.`) : null;
  const why = h(
    'details.sub',
    h('summary', 'Why games were won and lost'),
    h('div.two-col', h('div', h('h3', { style: { marginBottom: '6px' } }, `In ${winsTotal.toLocaleString()} wins`), factorList(r.winFactors, 'win')), h('div', h('h3', { style: { marginBottom: '6px' } }, `In ${r.losses.toLocaleString()} losses`), factorList(r.lossFactors, 'loss'))),
    maps,
    kod
  );

  const advice = r.lossFactors
    .filter((f) => f.share >= 0.25 && FACTOR_ADVICE[f.key])
    .slice(0, 2)
    .map((f) => FACTOR_ADVICE[f.key]);
  const tips = h(
    'details.sub',
    h('summary', 'Gameplay suggestions'),
    g.tips ? h('div', h('h3', { style: { marginBottom: '6px' } }, 'For this matchup'), bullets(g.tips)) : null,
    advice.length ? h('div', h('h3', { style: { margin: '6px 0' } }, 'From the simulated losses'), bullets(advice)) : null,
    h('div', h('h3', { style: { margin: '6px 0' } }, `Beating ${a.name} in general`), bullets(a.beatIt))
  );

  return [setup, turns, why, tips];
}

main().catch((e) => showError(root, e));
