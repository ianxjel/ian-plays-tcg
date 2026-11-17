// Checks the simulator against real results: runs every meta deck against every other meta deck
// and compares with the Limitless matchup matrix. Writes data/sim-calibration.json, which the site
// uses to shrink raw sim win rates toward 50% and to show how accurate the sim is.
//
// Usage: node tools/calibrate.mjs [games-per-matchup]
import { readFileSync, writeFileSync } from 'node:fs';
import { simulateMatchup, hashSeed } from '../assets/js/sim.js';

const root = new URL('..', import.meta.url);
const arch = JSON.parse(readFileSync(new URL('data/archetypes.json', root))).archetypes;
const meta = JSON.parse(readFileSync(new URL('data/meta/tef-dlr.json', root)));
const games = Number(process.argv[2] || 1500);

const ids = meta.top.map((t) => t.id);
const real = {};
for (const [a, b, w, l, t] of meta.matrix.limitless) real[`${a}|${b}`] = { wr: w / (w + l + t), n: w + l + t };

const pts = [];
const rows = [];
for (const a of ids) {
  const cells = [];
  for (const b of ids) {
    if (a === b) {
      cells.push('  -  ');
      continue;
    }
    const r = simulateMatchup(arch[a].model, arch[b].model, { games, seed: hashSeed(a + b) });
    const rv = real[`${a}|${b}`];
    pts.push({ sim: r.winRate, real: rv.wr, n: rv.n });
    cells.push(`${Math.round(r.winRate * 100)}/${Math.round(rv.wr * 100)}`.padStart(5));
  }
  rows.push(arch[a].short.padEnd(13) + cells.join(' '));
}

const mae = (k) => pts.reduce((s, p) => s + Math.abs(0.5 + k * (p.sim - 0.5) - p.real), 0) / pts.length;
let best = { k: 1, mae: mae(1) };
for (let k = 0.3; k <= 1.0001; k += 0.05) if (mae(k) < best.mae) best = { k: Math.round(k * 100) / 100, mae: mae(k) };
const nullMae = pts.reduce((s, p) => s + Math.abs(0.5 - p.real), 0) / pts.length;
const clear = pts.filter((p) => Math.abs(p.real - 0.5) > 0.05);
const agree = clear.filter((p) => (p.sim - 0.5) * (p.real - 0.5) > 0).length;

console.log('sim/real win % (row deck vs column deck)');
console.log(' '.repeat(13) + ids.map((i) => arch[i].short.slice(0, 5).padStart(5)).join(' '));
console.log(rows.join('\n'));
console.log(`\nRaw MAE ${(mae(1) * 100).toFixed(1)} pts | shrink k=${best.k} MAE ${(best.mae * 100).toFixed(1)} pts | always-50% MAE ${(nullMae * 100).toFixed(1)} pts`);
console.log(`Favored side matches real results in ${agree}/${clear.length} matchups that are not a coin flip`);

const out = {
  updated: new Date().toISOString().slice(0, 10),
  format: meta.format,
  gamesPerMatchup: games,
  matchups: pts.length,
  shrink: best.k,
  maeRaw: Math.round(mae(1) * 1000) / 10,
  maeCalibrated: Math.round(best.mae * 1000) / 10,
  maeAlways50: Math.round(nullMae * 1000) / 10,
  favoredAgree: agree,
  favoredTotal: clear.length,
};
writeFileSync(new URL('data/sim-calibration.json', root), JSON.stringify(out, null, 2) + '\n');
console.log('Wrote data/sim-calibration.json');
