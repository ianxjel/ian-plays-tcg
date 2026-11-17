// Runs the same setup odds and matchup sims as the deck page, in the terminal.
// Usage: node tools/sim-cli.mjs <deck-id> [games-per-matchup]
import { readFileSync } from 'node:fs';
import { parseList, countCards, goldfish } from '../assets/js/decklist.js';
import { simulateMatchup, hashSeed, FACTOR_TEXT } from '../assets/js/sim.js';

const root = new URL('..', import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root)));
const [id, gamesArg] = process.argv.slice(2);
if (!id) {
  console.error('Usage: node tools/sim-cli.mjs <deck-id> [games]');
  process.exit(1);
}
const games = Number(gamesArg || 2000);
const D = read(`data/decks/${id}.json`);
const A = read('data/archetypes.json').archetypes;
const F = read('data/formats.json');
const CAL = read('data/sim-calibration.json');
const fmt = F.formats.find((f) => f.id === D.format);
const META = read(fmt.data);

const parsed = parseList(D.list);
const n = countCards(parsed);
console.log(`${D.name} — ${n.total} cards (${n.pokemon} Pokémon / ${n.trainer} Trainers / ${n.energy} Energy)`);
if (n.total !== 60) console.log(`  WARNING: list has ${n.total} cards`);
for (const p of parsed.pokemon) if (!(D.pokemon || {})[p.name]) console.log(`  WARNING: "${p.name}" missing from "pokemon" (add hp, ex, evolvesFrom)`);
if (!D.lines?.length) console.log('  WARNING: no "lines" — setup odds will be empty');

const speed = goldfish(parsed, D.pokemon || {}, D.lines || [], { games: 4000, seed: hashSeed(D.id) });
const p = (x) => `${Math.round(x * 100)}%`.padStart(4);
console.log(`\nSetup odds (main attacker can attack by turn 1..5), mulligan ${p(speed.mulliganRate)}`);
console.log(`  first : ${speed.first.slice(0, 5).map(p).join(' ')}`);
console.log(`  second: ${speed.second.slice(0, 5).map(p).join(' ')}`);

const PILOT_SKILL = 0.6; // keep in sync with assets/js/deck.js
const model = structuredClone(D.model);
if (!model.speed) {
  const adj = (x) => (x === 0 ? 0 : 1 - (1 - x) * PILOT_SKILL);
  model.speed = { first: speed.first.map(adj), second: speed.second.map(adj) };
}
const cal = (x) => 0.5 + CAL.shrink * (x - 0.5);
console.log(`\nVs top 10 (${games} games each; sim shown after ${Math.round((1 - CAL.shrink) * 100)}% pull toward 50%)`);
let num = 0;
let den = 0;
for (const t of META.top) {
  const r = simulateMatchup(model, A[t.id].model, { games, seed: hashSeed(D.id + t.id + games) });
  const rec = D.archetypeRef && (META.matrix.limitless || []).find((x) => x[0] === D.archetypeRef && x[1] === t.id);
  const real = rec ? `${Math.round((rec[2] / (rec[2] + rec[3] + rec[4])) * 100)}%`.padStart(4) : '   -';
  const wf = r.winFactors.slice(0, 2).map((f) => `${FACTOR_TEXT.win[f.key]} ${p(f.share)}`).join('; ');
  const lf = r.lossFactors.slice(0, 2).map((f) => `${FACTOR_TEXT.loss[f.key]} ${p(f.share)}`).join('; ');
  console.log(`${A[t.id].name.padEnd(28)} sim ${p(cal(r.winRate))} (raw ${p(r.winRate)})  real ${real}  ready ${r.myReadyMedian} vs ${r.oppReadyMedian}`);
  console.log(`   wins: ${wf}\n   losses: ${lf}`);
  num += cal(r.winRate) * t.limitless.share;
  den += t.limitless.share;
}
console.log(`\nWeighted sim win rate vs top 10: ${p(num / den)}`);
