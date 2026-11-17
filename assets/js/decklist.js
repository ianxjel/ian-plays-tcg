// Decklist tools: parse a Pokémon TCG Live export, build the simplified view, and goldfish
// opening hands to estimate how fast the main attacker comes online.
import { rngFrom } from './sim.js';

const ENERGY_SYMBOLS = { G: 'Grass', R: 'Fire', W: 'Water', L: 'Lightning', P: 'Psychic', F: 'Fighting', D: 'Darkness', M: 'Metal' };

export function parseList(text) {
  const out = { pokemon: [], trainer: [], energy: [] };
  let section = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const head = line.match(/^(Pok[eé]mon|Trainer|Energy)\s*:?\s*\d*$/i);
    if (head) {
      const h = head[1].toLowerCase();
      section = h.startsWith('pok') ? 'pokemon' : h;
      continue;
    }
    const m = line.match(/^(\d+)\s+(.+?)(?:\s+([A-Za-z0-9-]+)\s+(\d+[a-z]?))?$/);
    if (!m || !section) continue;
    let name = m[2].trim();
    name = name.replace(/^Basic \{([A-Z])\} Energy$/, (_, s) => `${ENERGY_SYMBOLS[s] || s} Energy`);
    out[section].push({ count: Number(m[1]), name, set: m[3] || '', num: m[4] || '' });
  }
  return out;
}

export function countCards(parsed) {
  const sum = (a) => a.reduce((s, c) => s + c.count, 0);
  return { pokemon: sum(parsed.pokemon), trainer: sum(parsed.trainer), energy: sum(parsed.energy), total: sum(parsed.pokemon) + sum(parsed.trainer) + sum(parsed.energy) };
}

function merge(cards) {
  const map = new Map();
  for (const c of cards) map.set(c.name, (map.get(c.name) || 0) + c.count);
  return [...map.entries()].map(([name, count]) => ({ name, count }));
}

// What each Trainer does, for the simplified list and the goldfish. Unknown cards fall back to "Other".
export const TRAINERS = {
  "Lillie's Determination": { role: 'Draw', sup: true, fx: { shuffleDraw: 6, fullPrizeDraw: 8 } },
  'Judge': { role: 'Disruption', sup: true, fx: { shuffleDraw: 4 } },
  'Iono': { role: 'Disruption', sup: true, fx: { shuffleDraw: 6 } },
  "Boss's Orders": { role: 'Gust', sup: true },
  'Crispin': { role: 'Energy', sup: true, fx: { crispin: true } },
  'Dawn': { role: 'Search', sup: true, fx: { dawn: true } },
  'Hilda': { role: 'Search', sup: true, fx: { hilda: true } },
  'Cyrano': { role: 'Search', sup: true, fx: { cyrano: 3 } },
  "Team Rocket's Petrel": { role: 'Search', sup: true, fx: { petrel: true } },
  "Explorer's Guidance": { role: 'Draw', sup: true, fx: { lookTake: [6, 2] } },
  "Ciphermaniac's Codebreaking": { role: 'Search', sup: true, fx: { lookTake: [60, 1] } },
  "Brock's Scouting": { role: 'Search', sup: true, fx: { basics: 2 } },
  'Gwynn': { role: 'Draw', sup: true },
  'Naveen': { role: 'Search', sup: true },
  "Rosa's Encouragement": { role: 'Energy', sup: true },
  'Kieran': { role: 'Switching', sup: true },
  'Surfer': { role: 'Switching', sup: true },
  "Lana's Aid": { role: 'Recovery', sup: true },
  "Black Belt's Training": { role: 'Other', sup: true },
  "Acerola's Mischief": { role: 'Other', sup: true },
  'Briar': { role: 'Other', sup: true },
  'Eri': { role: 'Disruption', sup: true },
  'Philippe': { role: 'Other', sup: true },
  "Janine's Secret Art": { role: 'Energy', sup: true },
  "Professor Turo's Scenario": { role: 'Switching', sup: true },
  'Ultra Ball': { role: 'Search', fx: { ultra: true } },
  'Buddy-Buddy Poffin': { role: 'Search', fx: { poffin: 2 } },
  'Nest Ball': { role: 'Search', fx: { nest: true } },
  'Poké Pad': { role: 'Search', fx: { pad: true } },
  'Dusk Ball': { role: 'Search', fx: { dusk: true } },
  'Pokégear 3.0': { role: 'Search', fx: { gear: true } },
  'Secret Box': { role: 'Search' },
  'Precious Trolley': { role: 'Search' },
  'Bug Catching Set': { role: 'Search' },
  "Team Rocket's Transceiver": { role: 'Search' },
  'Rare Candy': { role: 'Evolution', fx: { candy: true } },
  'Night Stretcher': { role: 'Recovery' },
  'Super Rod': { role: 'Recovery' },
  'Sacred Ash': { role: 'Recovery' },
  'Energy Recycler': { role: 'Recovery' },
  'Energy Switch': { role: 'Energy' },
  'Wondrous Patch': { role: 'Energy' },
  'Glass Trumpet': { role: 'Energy' },
  "N's PP Up": { role: 'Energy' },
  'Crushing Hammer': { role: 'Disruption' },
  'Enhanced Hammer': { role: 'Disruption' },
  'Unfair Stamp': { role: 'Disruption' },
  'Special Red Card': { role: 'Disruption' },
  'Prime Catcher': { role: 'Gust' },
  'Counter Catcher': { role: 'Gust' },
  'Switch': { role: 'Switching' },
  'Jumbo Ice Cream': { role: 'Other' },
  'Blowtorch': { role: 'Other' },
  "Hero's Cape": { role: 'Tools' },
  'Air Balloon': { role: 'Tools' },
  'Binding Mochi': { role: 'Tools' },
  'Brave Bangle': { role: 'Tools' },
  'Handheld Fan': { role: 'Tools' },
  'Luxurious Cape': { role: 'Tools' },
  'Area Zero Underdepths': { role: 'Stadiums' },
  'Forest of Vitality': { role: 'Stadiums' },
  'Battle Cage': { role: 'Stadiums' },
  'Prism Tower': { role: 'Stadiums' },
  'Jamming Tower': { role: 'Stadiums' },
  'Academy at Night': { role: 'Stadiums' },
  "Team Rocket's Watchtower": { role: 'Stadiums' },
  "Team Rocket's Factory": { role: 'Stadiums' },
  "N's Castle": { role: 'Stadiums' },
  'Risky Ruins': { role: 'Stadiums' },
  'Legendary Pyroduct': { role: 'Stadiums' },
  'Legendary Summit': { role: 'Stadiums' },
  'Gravity Mountain': { role: 'Stadiums' },
  'Festival Grounds': { role: 'Stadiums' },
  'Artazon': { role: 'Stadiums' },
};

const ROLE_ORDER = ['Draw', 'Search', 'Evolution', 'Energy', 'Gust', 'Disruption', 'Switching', 'Recovery', 'Tools', 'Stadiums', 'Other'];
const ROLE_LABEL = {
  Draw: 'Draw',
  Search: 'Search',
  Evolution: 'Evolution help',
  Energy: 'Energy',
  Gust: 'Gust',
  Disruption: 'Disruption',
  Switching: 'Switching',
  Recovery: 'Recovery',
  Tools: 'Tools',
  Stadiums: 'Stadiums',
  Other: 'Other Trainers',
};

function trainerRole(name) {
  if (TRAINERS[name]) return TRAINERS[name].role;
  if (/Technical Machine/.test(name)) return 'Tools';
  if (/Ball$/.test(name)) return 'Search';
  return 'Other';
}

// pokemonInfo: { "Dragapult ex": { evolvesFrom: "Drakloak" }, ... } from the deck file.
export function simplify(parsed, pokemonInfo = {}) {
  const pk = merge(parsed.pokemon);
  const byName = Object.fromEntries(pk.map((p) => [p.name, p]));
  const childOf = {};
  for (const [name, info] of Object.entries(pokemonInfo)) if (info.evolvesFrom) childOf[info.evolvesFrom] = name;
  const used = new Set();
  const lines = [];
  for (const p of pk) {
    if (used.has(p.name) || pokemonInfo[p.name]?.evolvesFrom) continue;
    const chain = [p];
    used.add(p.name);
    let cur = p.name;
    while (childOf[cur] && byName[childOf[cur]]) {
      cur = childOf[cur];
      chain.push(byName[cur]);
      used.add(cur);
    }
    lines.push(chain);
  }
  for (const p of pk) if (!used.has(p.name)) lines.push([p]);
  const pokemon = lines.map((chain) =>
    chain.length > 1
      ? { label: `${chain[chain.length - 1].name} line`, counts: chain.map((c) => c.count).join('-'), detail: chain.map((c) => c.name).join(' → ') }
      : { label: chain[0].name, counts: String(chain[0].count) }
  );
  const groups = {};
  for (const t of merge(parsed.trainer)) (groups[trainerRole(t.name)] ||= []).push(t);
  const trainers = ROLE_ORDER.filter((r) => groups[r]).map((r) => ({ role: ROLE_LABEL[r], total: groups[r].reduce((s, c) => s + c.count, 0), cards: groups[r].sort((a, b) => b.count - a.count) }));
  const energy = merge(parsed.energy).sort((a, b) => b.count - a.count);
  return { pokemon, trainers, energy };
}

// ---------- Goldfish: how fast does the main attacker come online? ----------

// Built-in setup abilities; a deck file can add or override these under pokemon[name].fx.
export const POKEMON_FX = {
  'Drakloak': { topTake: [2, 1] },
  'Dudunsparce': { draw: 3 },
  'Meowth ex': { onBenchSupporter: true },
  'Mega Kangaskhan ex': { draw: 2 },
  "N's Zoroark ex": { draw: 1 },
  'Alakazam': { evolveDraw: 3 },
};

function expand(parsed, pokemonInfo) {
  const deck = [];
  for (const p of parsed.pokemon) {
    const info = pokemonInfo[p.name] || {};
    for (let i = 0; i < p.count; i++)
      deck.push({ name: p.name, kind: info.evolvesFrom ? 'evo' : 'basic', evolvesFrom: info.evolvesFrom || null, hp: info.hp ?? (info.ex ? 220 : 70), ex: !!info.ex, fx: { ...(POKEMON_FX[p.name] || {}), ...(info.fx || {}) } });
  }
  for (const t of parsed.trainer) for (let i = 0; i < t.count; i++) deck.push({ name: t.name, kind: 'trainer', tr: TRAINERS[t.name] || { role: trainerRole(t.name) } });
  for (const e of parsed.energy) for (let i = 0; i < e.count; i++) deck.push({ name: e.name, kind: 'energy' });
  return deck;
}

function shuffle(a, rng) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// lines: [{ basic, stage1?, stage2?, energy: n, accel?: n }] — any line ready counts as online.
export function goldfish(parsed, pokemonInfo, lines, { games = 3000, seed = 7, maxTurn = 6 } = {}) {
  const rng = rngFrom(seed);
  const base = expand(parsed, pokemonInfo);
  const res = { first: Array(maxTurn).fill(0), second: Array(maxTurn).fill(0), mulligans: 0, games, prizedOut: 0 };
  for (let g = 0; g < games; g++) {
    const goingFirst = g % 2 === 0;
    const r = playGoldfish(base, lines, goingFirst, rng, maxTurn);
    res.mulligans += r.mulligans > 0 ? 1 : 0;
    if (r.prizedOut) res.prizedOut++;
    if (r.ready) for (let t = r.ready - 1; t < maxTurn; t++) res[goingFirst ? 'first' : 'second'][t]++;
  }
  const half = games / 2;
  return {
    first: res.first.map((n) => Math.round((n / half) * 1000) / 1000),
    second: res.second.map((n) => Math.round((n / half) * 1000) / 1000),
    mulliganRate: res.mulligans / games,
    prizedOutRate: res.prizedOut / games,
  };
}

function playGoldfish(base, lines, goingFirst, rng, maxTurn) {
  let deck;
  let hand;
  let mulligans = 0;
  for (;;) {
    deck = shuffle(base.slice(), rng);
    hand = deck.splice(0, 7);
    if (hand.some((c) => c.kind === 'basic')) break;
    mulligans++;
    if (mulligans > 6) return { ready: null, mulligans };
  }
  const prizes = deck.splice(0, 6);
  const main = lines[0];
  const finalName = (l) => l.stage2 || l.stage1 || l.basic;
  const prizedOut = lines.every((l) => base.filter((c) => c.name === finalName(l)).length === prizes.filter((c) => c.name === finalName(l)).length);

  const board = []; // { card, played, energy }
  const draw = (n) => {
    for (let i = 0; i < n && deck.length; i++) hand.push(deck.shift());
  };
  const take = (pred) => {
    const i = deck.findIndex(pred);
    if (i < 0) return null;
    const [c] = deck.splice(i, 1);
    hand.push(c);
    shuffle(deck, rng);
    return c;
  };
  const fromHand = (pred) => {
    const i = hand.findIndex(pred);
    return i < 0 ? null : hand.splice(i, 1)[0];
  };
  const lineNames = new Set(lines.flatMap((l) => [l.basic, l.stage1, l.stage2].filter(Boolean)));
  const onBoard = (name) => board.some((b) => b.card.name === name);
  const inHand = (name) => hand.some((c) => c.name === name);

  // What piece of the main line do we still need?
  const need = () => {
    for (const l of lines) {
      if (onBoard(finalName(l))) return null;
    }
    const l = main;
    if (!onBoard(l.basic) && !(l.stage1 && onBoard(l.stage1)) && !inHand(l.basic)) return l.basic;
    if (l.stage1 && !onBoard(l.stage1) && !(l.stage2 && onBoard(l.stage2)) && !inHand(l.stage1) && !(l.stage2 && inHand('Rare Candy') && inHand(l.stage2))) return l.stage1;
    if (l.stage2 && !onBoard(l.stage2) && !inHand(l.stage2)) return l.stage2;
    return null;
  };
  const energyNeeded = () => {
    const tgt = board.filter((b) => lineNames.has(b.card.name)).sort((a, b) => b.energy - a.energy)[0];
    return tgt ? Math.max(0, main.energy - tgt.energy) : main.energy;
  };
  const playBasics = (turn) => {
    for (;;) {
      if (board.length >= 6) return;
      const c = fromHand((x) => x.kind === 'basic');
      if (!c) return;
      const b = { card: c, played: turn, energy: 0 };
      board.push(b);
      if (c.fx.onBenchSupporter) take((x) => x.tr && x.tr.sup && x.name !== "Boss's Orders");
      for (const l of lines) if (l.basic === c.name && l.benchEnergy && rng() < l.benchEnergy) b.energy++;
    }
  };

  for (let turn = 1; turn <= maxTurn; turn++) {
    draw(1);
    let supporterUsed = goingFirst && turn === 1;
    let energyAttached = false;
    const abilityUsed = new Set();
    for (let loop = 0; loop < 25; loop++) {
      const before = hand.length + board.length + deck.length * 0.001;
      playBasics(turn);
      // Draw abilities on board.
      for (const b of board) {
        const fx = b.card.fx;
        if (abilityUsed.has(b) || !fx) continue;
        if (fx.topTake) {
          abilityUsed.add(b);
          const look = deck.slice(0, fx.topTake[0]);
          const want = need();
          const pick = look.find((c) => c.name === want) || look.find((c) => c.kind === 'energy') || look[0];
          if (pick) {
            deck.splice(deck.indexOf(pick), 1);
            hand.push(pick);
          }
        } else if (fx.draw && !abilityUsed.has('draw:' + b.card.name)) {
          abilityUsed.add(b);
          abilityUsed.add('draw:' + b.card.name);
          draw(fx.draw);
        }
      }
      // Items.
      const want = need();
      if (want) {
        const wantCard = base.find((c) => c.name === want);
        const isBasic = wantCard && wantCard.kind === 'basic';
        if (isBasic && fromHand((c) => c.name === 'Buddy-Buddy Poffin')) {
          for (let k = 0; k < 2; k++) {
            const found = take((c) => c.kind === 'basic' && c.hp <= 70 && (k === 0 ? c.name === want : lineNames.has(c.name)));
            if (found) playBasics(turn);
          }
        } else if (isBasic && fromHand((c) => c.name === 'Nest Ball')) {
          take((c) => c.name === want);
        } else if (hand.length >= 3 && inHand('Ultra Ball')) {
          fromHand((c) => c.name === 'Ultra Ball');
          const junk = hand
            .map((c, i) => ({ c, i, score: lineNames.has(c.name) ? 9 : c.kind === 'energy' ? 3 : c.tr && c.tr.sup ? 5 : 2 }))
            .sort((a, b) => a.score - b.score)
            .slice(0, 2)
            .map((x) => x.c);
          for (const j of junk) hand.splice(hand.indexOf(j), 1);
          take((c) => c.name === want);
        } else if (wantCard && !wantCard.ex && fromHand((c) => c.name === 'Poké Pad')) {
          take((c) => c.name === want);
        }
      }
      // Evolve.
      if (turn >= 2) {
        for (const b of board) {
          if (b.played >= turn) continue;
          const evo = hand.find((c) => c.evolvesFrom === b.card.name);
          if (evo) {
            hand.splice(hand.indexOf(evo), 1);
            b.card = evo;
            b.played = turn;
            if (evo.fx.evolveDraw) draw(evo.fx.evolveDraw);
            continue;
          }
          for (const l of lines) {
            if (l.stage2 && b.card.name === l.basic && inHand('Rare Candy') && inHand(l.stage2)) {
              fromHand((c) => c.name === 'Rare Candy');
              const s2 = fromHand((c) => c.name === l.stage2);
              b.card = s2;
              b.played = turn;
              if (s2.fx.evolveDraw) draw(s2.fx.evolveDraw);
              break;
            }
          }
        }
      }
      // Supporter.
      if (!supporterUsed) {
        const w = need();
        const tryFx = (name, fn) => {
          if (!inHand(name)) return false;
          fromHand((c) => c.name === name);
          fn();
          supporterUsed = true;
          return true;
        };
        const l = main;
        const done =
          (w && tryFx('Dawn', () => [l.basic, l.stage1, l.stage2].filter(Boolean).forEach((n) => take((c) => c.name === n)))) ||
          (w && w !== l.basic && tryFx('Hilda', () => (take((c) => c.name === w), take((c) => c.kind === 'energy')))) ||
          (w && tryFx("Brock's Scouting", () => (take((c) => c.name === l.basic), take((c) => c.kind === 'basic')))) ||
          (w && tryFx("Team Rocket's Petrel", () => take((c) => c.name === 'Rare Candy' || c.name === 'Ultra Ball'))) ||
          (energyNeeded() > 1 &&
            tryFx('Crispin', () => {
              const e1 = deck.find((c) => c.kind === 'energy');
              if (!e1) return;
              deck.splice(deck.indexOf(e1), 1);
              const tgt = board.filter((b) => lineNames.has(b.card.name)).sort((a, b) => b.energy - a.energy)[0];
              if (tgt) tgt.energy++;
              const e2 = deck.find((c) => c.kind === 'energy' && c.name !== e1.name);
              if (e2) {
                deck.splice(deck.indexOf(e2), 1);
                hand.push(e2);
              }
            })) ||
          ((hand.length <= 5 || (w && !inHand('Ultra Ball'))) &&
            tryFx("Lillie's Determination", () => {
              deck.push(...hand.splice(0));
              shuffle(deck, rng);
              draw(8);
            })) ||
          tryFx("Explorer's Guidance", () => {
            const look = deck.slice(0, 6);
            const pick = look.filter((c) => lineNames.has(c.name) || c.kind === 'energy').slice(0, 2);
            for (const p of pick.length ? pick : look.slice(0, 2)) {
              deck.splice(deck.indexOf(p), 1);
              hand.push(p);
            }
          }) ||
          (hand.length <= 3 &&
            tryFx('Judge', () => {
              deck.push(...hand.splice(0));
              shuffle(deck, rng);
              draw(4);
            }));
        if (!done && hand.length <= 4 && inHand("Lillie's Determination")) {
          fromHand((c) => c.name === "Lillie's Determination");
          deck.push(...hand.splice(0));
          shuffle(deck, rng);
          draw(8);
          supporterUsed = true;
        }
      }
      // Attach one Energy per turn to the most advanced Pokémon of the main line.
      if (!energyAttached) {
        const tgt = board
          .filter((b) => lineNames.has(b.card.name))
          .sort((a, b) => (b.card.kind === 'evo') - (a.card.kind === 'evo') || b.energy - a.energy)[0];
        if (tgt && fromHand((c) => c.kind === 'energy')) {
          tgt.energy++;
          energyAttached = true;
        }
      }
      const after = hand.length + board.length + deck.length * 0.001;
      if (after === before) break;
    }
    for (const l of lines) for (const b of board) if (lineNames.has(b.card.name) && l.accel) b.energy += l.accel;
    const canAttack = !(goingFirst && turn === 1);
    const ready = lines.some((l) => board.some((b) => b.card.name === finalName(l) && b.energy >= l.energy));
    if (canAttack && ready) return { ready: turn, mulligans, prizedOut };
  }
  return { ready: null, mulligans, prizedOut };
}
