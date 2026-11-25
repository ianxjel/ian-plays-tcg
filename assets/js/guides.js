import { loadJSON, h, pct, fmtDate, formatState, winRate, matrixLookup, markNav, showError } from './common.js';

markNav();

async function main() {
  const [F, arch, S] = await Promise.all([loadJSON('data/formats.json'), loadJSON('data/archetypes.json'), loadJSON('data/streams.json').catch(() => ({ matches: [] }))]);
  const A = arch.archetypes;
  const fmt = formatState(F.formats).live;
  const META = await loadJSON(fmt.data);
  const lim = matrixLookup(META, 'limitless');
  const ids = META.top.map((t) => t.id);
  const cards = META.top.map((t, i) => {
    const a = A[t.id];
    const vs = ids
      .filter((id) => id !== t.id)
      .map((id) => {
        const r = lim(id, t.id);
        return { id, wr: r ? winRate(r.w, r.l, r.t) : null };
      })
      .filter((x) => x.wr !== null)
      .sort((p, q) => q.wr - p.wr);
    const counters = vs.filter((x) => x.wr >= 0.55).slice(0, 3);
    const prey = vs.filter((x) => x.wr <= 0.45).reverse().slice(0, 3);
    return h(
      'a.tcg-card',
      { href: `guide.html?id=${t.id}` },
      h('p.small', { style: { margin: 0 } }, `#${i + 1}, ${t.limitless.share.toFixed(1)}% of the field`),
      h('h3', a.name),
      h('p.small', { style: { margin: 0 } }, guideLine(S, t.id)),
      h('p', { style: { margin: 0 } }, counters.length ? `Beaten most by ${counters.map((c) => `${A[c.id].short} (${pct(c.wr)})`).join(', ')}.` : 'No deck in the top 10 is clearly favored against it.'),
      prey.length ? h('p.small', { style: { margin: 0 } }, `It beats ${prey.map((c) => `${A[c.id].short} (they win ${pct(c.wr)})`).join(', ')}.`) : null
    );
  });
  document.getElementById('guide-list').replaceChildren(h('div.deck-cards', cards), h('p.small', { style: { marginTop: '14px' } }, `${fmt.name}, Limitless online results captured ${fmtDate(META.captured)}.`));
}

function guideLine(S, id) {
  const n = S.matches.filter((m) => m.p1.deck === id || m.p2.deck === id).length;
  return `How to play it, how to beat it${n ? `, ${n} streamed ${n === 1 ? 'match' : 'matches'}` : ''}.`;
}

main().catch((e) => showError(document.getElementById('guide-list'), e));
