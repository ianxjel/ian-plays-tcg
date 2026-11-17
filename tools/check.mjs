// Sanity checks for the data files. Usage: node tools/check.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { parseList, countCards } from '../assets/js/decklist.js';

const root = new URL('..', import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root)));
const problems = [];
const F = read('data/formats.json');
const A = read('data/archetypes.json').archetypes;

for (const f of F.formats) {
  const m = read(f.data);
  for (const t of m.top) if (!A[t.id]) problems.push(`${f.data}: unknown archetype "${t.id}"`);
  for (const [src, recs] of Object.entries(m.matrix || {}))
    for (const r of recs) for (const id of [r[0], r[1]]) if (!A[id]) problems.push(`${f.data} ${src}: unknown archetype "${id}"`);
}
for (const [id, a] of Object.entries(A)) {
  const mdl = a.model;
  if (!mdl?.attackers?.length) problems.push(`archetype ${id}: no attackers`);
  if (!mdl?.speed?.first || !mdl?.speed?.second) problems.push(`archetype ${id}: no speed curve`);
}
const index = read('data/decks/index.json');
const files = readdirSync(new URL('data/decks/', root)).filter((f) => f.endsWith('.json') && f !== 'index.json');
for (const f of files) {
  const d = read(`data/decks/${f}`);
  const where = `data/decks/${f}`;
  if (`${d.id}.json` !== f) problems.push(`${where}: id "${d.id}" doesn't match the file name`);
  if (!d.example && !index.includes(d.id)) problems.push(`${where}: not listed in data/decks/index.json`);
  const n = countCards(parseList(d.list));
  if (n.total !== 60) problems.push(`${where}: ${n.total} cards`);
  if (!F.formats.some((x) => x.id === d.format)) problems.push(`${where}: unknown format "${d.format}"`);
  if (d.archetypeRef && !A[d.archetypeRef]) problems.push(`${where}: unknown archetypeRef "${d.archetypeRef}"`);
  if (JSON.stringify(d).includes('TODO')) problems.push(`${where}: still has TODOs`);
  for (const k of Object.keys(d.matchups || {})) if (!A[k]) problems.push(`${where}: matchup for unknown archetype "${k}"`);
}
for (const id of index) if (!files.includes(`${id}.json`)) problems.push(`data/decks/index.json lists "${id}" but the file is missing`);

if (problems.length) {
  console.log(problems.map((p) => `✗ ${p}`).join('\n'));
  process.exit(1);
}
console.log(`✓ ${Object.keys(A).length} archetypes, ${F.formats.length} formats, ${files.length} deck files look fine.`);
