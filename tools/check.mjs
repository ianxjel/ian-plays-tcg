// Sanity checks for the data files. Usage: node tools/check.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { parseList, countCards } from '../assets/js/decklist.js';
import { splitChapters } from '../assets/js/markdown.js';
import { formatState } from '../assets/js/common.js';

const root = new URL('..', import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root)));
const problems = [];
const F = read('data/formats.json');
const A = read('data/archetypes.json').archetypes;

for (const f of F.formats) {
  const m = read(f.data);
  for (const t of [...m.top, ...(m.next || [])]) if (!A[t.id]) problems.push(`${f.data}: unknown archetype "${t.id}"`);
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

// Deck guides: every top-20 deck of the live format (top plus next) needs one, with a 60-card list and playthroughs.
const REQUIRED = ['At a glance', 'The list', 'Card by card', 'Playthroughs', 'Matchup cheat sheet'];
const guides = readdirSync(new URL('data/guides/', root)).filter((f) => f.endsWith('.md'));
const live = formatState(F.formats).live;
{
  const lm = read(live.data);
  for (const t of [...lm.top, ...(lm.next || [])]) if (!guides.includes(`${t.id}.md`)) problems.push(`data/guides/${t.id}.md: missing (it is a top-20 deck in ${live.id})`);
}
for (const f of guides) {
  const where = `data/guides/${f}`;
  const id = f.replace(/\.md$/, '');
  if (!A[id]) problems.push(`${where}: no archetype "${id}"`);
  const text = readFileSync(new URL(where, root), 'utf8');
  const g = splitChapters(text);
  const titles = g.chapters.map((c) => c.title);
  for (const r of REQUIRED) if (!titles.includes(r)) problems.push(`${where}: no "## ${r}" chapter`);
  if (!g.meta.list || !g.meta.updated) problems.push(`${where}: front matter needs list and updated`);
  const fences = [...text.matchAll(/```(\w+)\n([\s\S]*?)```/g)];
  const lists = fences.filter((m) => m[1] === 'decklist');
  if (lists.length !== 1) problems.push(`${where}: ${lists.length} decklist blocks (want 1)`);
  for (const m of lists) {
    const n = countCards(parseList(m[2]));
    if (n.total !== 60) problems.push(`${where}: decklist has ${n.total} cards`);
  }
  const plays = fences.filter((m) => m[1] === 'play');
  if (plays.length < 3) problems.push(`${where}: ${plays.length} playthroughs (want at least 3)`);
  for (const m of plays) {
    const lines = m[2].split('\n').filter((l) => l.trim());
    if (!lines.some((l) => /^lesson:/i.test(l))) problems.push(`${where}: a playthrough has no lesson`);
    for (const l of lines) if (!/^(setup|lesson|you \d+|opp \d+):\s/i.test(l)) problems.push(`${where}: playthrough line not understood: "${l.slice(0, 50)}"`);
  }
}

// Streamed matches: decks must be known archetypes (or null with a label), events must exist, and each match needs a way to watch it.
const S = read('data/streams.json');
for (const [i, m] of S.matches.entries()) {
  const where = `data/streams.json match ${i + 1}`;
  const ev = S.events[m.event];
  if (!ev) problems.push(`${where}: unknown event "${m.event}"`);
  for (const side of [m.p1, m.p2]) {
    if (side.deck && !A[side.deck]) problems.push(`${where}: unknown archetype "${side.deck}"`);
    if (!side.deck && !side.label) problems.push(`${where}: a side with no deck needs a label`);
  }
  if (!Array.isArray(m.score) || m.score.length !== 2) problems.push(`${where}: score should be [p1 games, p2 games]`);
  if (m.video && !/^https:\/\/(www\.)?(youtube\.com|youtu\.be|twitch\.tv)\//.test(m.video)) problems.push(`${where}: video should be a YouTube or Twitch link`);
  if (!m.video && !(ev?.page && Number.isFinite(m.t))) problems.push(`${where}: no video, so it needs t and an event page`);
}
for (const [k, e] of Object.entries(S.events)) if (!F.formats.some((f) => f.id === e.format)) problems.push(`data/streams.json event ${k}: unknown format "${e.format}"`);

if (problems.length) {
  console.log(problems.map((p) => `✗ ${p}`).join('\n'));
  process.exit(1);
}
console.log(`✓ ${Object.keys(A).length} archetypes, ${F.formats.length} formats, ${files.length} deck files, ${guides.length} guides and ${S.matches.length} streamed matches look fine.`);
