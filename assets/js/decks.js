import { loadJSON, h, fmtDate, markNav, showError } from './common.js';
import { parseList, simplify, countCards } from './decklist.js';

markNav();

async function main() {
  const box = document.getElementById('deck-list');
  const [ids, formats] = await Promise.all([loadJSON('data/decks/index.json'), loadJSON('data/formats.json')]);
  const fmtName = (id) => formats.formats.find((f) => f.id === id)?.name || id;
  if (!ids.length) {
    box.replaceChildren(
      h(
        'div.empty',
        h('h2', 'No decks yet'),
        h('p', 'Add your first deck and it shows up here with a simplified list, setup odds and matchups against the top 10.'),
        h(
          'ol',
          h('li', 'Export the list from Pokémon TCG Live (Export copies it as text).'),
          h('li', 'Ask Claude: "Add this deck to ian-plays-tcg" and paste the list. Claude writes the deck file, the matchup guides and pushes it.'),
          h('li', 'Or do it by hand: copy ', h('code', 'data/decks/example-hammerpult.json'), ', swap in your list, and add its id to ', h('code', 'data/decks/index.json'), '.')
        ),
        h('p', h('a', { href: 'deck.html?id=example-hammerpult' }, 'See what a deck page looks like'), ' with an example Dragapult list.')
      )
    );
    return;
  }
  const decks = await Promise.all(ids.map((id) => loadJSON(`data/decks/${id}.json`)));
  box.replaceChildren(
    h(
      'div.deck-cards',
      decks.map((d) => {
        const parsed = parseList(d.list);
        const simple = simplify(parsed, d.pokemon);
        const n = countCards(parsed);
        const main = simple.pokemon[0];
        return h(
          'a.tcg-card',
          { href: `deck.html?id=${encodeURIComponent(d.id)}` },
          h('div', h('span.status' + (d.status === 'ready' ? '.ready' : d.status === 'retired' ? '.retired' : ''), d.status || 'testing')),
          h('h3', d.name),
          h('p.small', `${fmtName(d.format)}, added ${fmtDate(d.created)}`),
          h('p', { style: { margin: 0 } }, d.summary),
          main && h('p.small', { style: { margin: 0 } }, `${main.counts} ${main.label}. ${n.pokemon} Pokémon, ${n.trainer} Trainers, ${n.energy} Energy.`)
        );
      })
    )
  );
}

main().catch((e) => showError(document.getElementById('deck-list'), e));
