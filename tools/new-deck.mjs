// Creates a deck file from a Pokémon TCG Live export and adds it to the deck index.
// Usage: node tools/new-deck.mjs <deck-id> "<Deck name>" <list.txt> [format-id]
// Then fill in the TODOs in data/decks/<deck-id>.json (Pokémon HP/evolutions, lines, model, guides).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseList, countCards } from '../assets/js/decklist.js';

const root = new URL('..', import.meta.url);
const [id, name, listPath, formatArg] = process.argv.slice(2);
if (!id || !name || !listPath) {
  console.error('Usage: node tools/new-deck.mjs <deck-id> "<Deck name>" <list.txt> [format-id]');
  process.exit(1);
}
if (!/^[a-z0-9-]+$/.test(id)) {
  console.error('Deck id must be lowercase letters, numbers and dashes.');
  process.exit(1);
}
const file = new URL(`data/decks/${id}.json`, root);
if (existsSync(file)) {
  console.error(`data/decks/${id}.json already exists.`);
  process.exit(1);
}
const list = readFileSync(listPath, 'utf8').trim();
const parsed = parseList(list);
const n = countCards(parsed);
const formats = JSON.parse(readFileSync(new URL('data/formats.json', root))).formats;
const format = formatArg || formats[formats.length - 1].id;

const pokemon = {};
for (const p of parsed.pokemon) pokemon[p.name] = { hp: null, ex: / ex$/.test(p.name) || undefined, evolvesFrom: null };

const deck = {
  id,
  name,
  format,
  status: 'testing',
  created: new Date().toISOString().slice(0, 10),
  summary: 'TODO: one or two sentences on what the deck does.',
  archetypeRef: null,
  list,
  pokemon,
  lines: [{ basic: 'TODO', stage1: null, stage2: null, energy: 2 }],
  model: {
    starter: { name: 'TODO', hp: 70, prizes: 1 },
    attackers: [{ name: 'TODO', hp: 200, prizes: 2, type: 'Colorless', weakness: null, ex: true, energy: 2, weight: 1, dmg: { base: 180 } }],
    bench: [],
    consistency: 0.88,
    gust: 0.55,
    stock: 4,
  },
  gameplan: { setup: [], turns: [], tips: [] },
  matchups: {},
  record: [],
};
writeFileSync(file, JSON.stringify(deck, null, 2) + '\n');
const indexFile = new URL('data/decks/index.json', root);
const index = JSON.parse(readFileSync(indexFile));
if (!index.includes(id)) index.push(id);
writeFileSync(indexFile, JSON.stringify(index, null, 2) + '\n');
console.log(`Created data/decks/${id}.json (${n.total} cards) and added it to data/decks/index.json.`);
if (n.total !== 60) console.log(`WARNING: the list has ${n.total} cards.`);
console.log('Next: fill in the TODOs, then run node tools/sim-cli.mjs ' + id);
