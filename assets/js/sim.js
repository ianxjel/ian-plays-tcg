// Prize-race matchup simulator.
// Pure ES module with no dependencies, so it runs in the browser and in Node (tools/sim-cli.mjs).
//
// It does not play real Pokémon TCG rules card by card. Each deck is a "model": when its main
// attacker comes online, how hard it hits, how many prizes each Pokémon gives up, which benched
// Pokémon are easy gust targets, and special effects (damage walls, ability locks, spread, snipes,
// energy denial, mill). Games are a race to 6 prizes between two models. The output is a win rate
// plus the factors that showed up in won and lost games.

export function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const MAX_TURNS = 20; // per player
const START_DECK = 47; // 60 - 7 in hand - 6 prizes

function gauss(rng) {
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function pickWeighted(list, rng) {
  const total = list.reduce((s, x) => s + (x.weight ?? 1), 0);
  let r = rng() * total;
  for (const x of list) {
    r -= x.weight ?? 1;
    if (r <= 0) return x;
  }
  return list[list.length - 1];
}

function sampleReady(curve, rng) {
  const r = rng();
  for (let i = 0; i < curve.length; i++) if (r < curve[i]) return i + 1;
  return curve.length + 1 + Math.floor(rng() * 3);
}

function rollDamage(def, sinceReady, rng) {
  const d = def.dmg || {};
  let v = d.base || 0;
  if (d.ramp) v += d.ramp[Math.min(Math.max(0, sinceReady), d.ramp.length - 1)];
  if (d.coinUntilTails) {
    let guard = 0;
    while (rng() < 0.5 && guard++ < 10) v += d.coinUntilTails;
  }
  if (d.sd) v += Math.round((gauss(rng) * d.sd) / 10) * 10;
  return Math.max(0, v);
}

function makeMon(def, kind) {
  return {
    name: def.name,
    hp: def.hp,
    max: def.hp,
    prizes: def.prizes ?? 1,
    type: def.type,
    weakness: def.weakness || null,
    resist: def.resist || null,
    ex: !!def.ex,
    immuneEx: !!def.immuneEx,
    effectImmune: !!def.effectImmune,
    kind,
    def,
  };
}

function makeSide(model, goingFirst, rng) {
  const curve = goingFirst ? model.speed.first : model.speed.second;
  const s = {
    m: model,
    first: goingFirst,
    ready: sampleReady(curve, rng),
    prizes: 6,
    deck: START_DECK,
    kos: [],
    lost: 0,
    stock: model.stock ?? 4,
    turn: 0,
    online: false,
    sinceReady: -1,
    justPromoted: false,
    snipes: model.snipe?.uses ?? 0,
    outOfAttackers: false,
    stats: { locked: 0, denied: 0, blocked: 0, missed: 0, whiffed: 0, attacks: 0, milled: 0 },
  };
  s.active = makeMon(model.starter || { name: 'Starter', hp: 70, prizes: 1 }, 'starter');
  s.bench = [];
  s.next = null;
  // Per-game form: some games you just draw worse.
  s.form = 0.7 + 0.3 * rng();
  if (rng() < 0.15) s.ready++;
  return s;
}

function fillBench(s, oppModel, rng) {
  const oppTypes = new Set(oppModel.attackers.map((a) => a.type));
  // Against bench spread, players bench fewer low-HP Pokémon.
  const spreadThreat = oppModel.attackers.some((a) => a.spread) ? Math.max(...oppModel.attackers.map((a) => a.spread || 0)) : 0;
  for (const b of s.m.bench || []) {
    let p = b.pIf && oppTypes.has(b.pIf.oppType) ? b.pIf.p : b.p ?? 1;
    if (spreadThreat && b.hp <= spreadThreat && !b.effectImmune) p *= 0.5;
    if (rng() < p) s.bench.push(makeMon(b, 'support'));
  }
  s.gusts = s.m.gustCount ?? 3;
  refreshGrants(s);
}

function chooseAttacker(side, opp, rng) {
  let pool = side.m.attackers;
  if (opp.active && opp.active.immuneEx) {
    const nonEx = pool.filter((a) => !a.ex);
    if (nonEx.length && rng() < 0.85) pool = nonEx;
  }
  // Players pick the attacker that hits the opponent's main attacker for Weakness when they can.
  const target = opp.m.attackers[0];
  const weighted = pool.map((a) => {
    const weak = effectiveWeakness(side, target) || (a.grantWeakness && a.grantWeakness[target.type]);
    return { ...a, weight: (a.weight ?? 1) * (weak && weak === a.type ? 3 : 1) };
  });
  return pickWeighted(weighted, rng);
}

// Weakness a Pokémon has against this attacking side, including granted Weakness
// (e.g. Lillie's Clefairy ex's Fairy Zone gives Dragon Pokémon Psychic Weakness).
function effectiveWeakness(attSide, mon) {
  if (mon.weakness) return mon.weakness;
  const g = attSide.grants;
  return g && mon.type && g[mon.type] ? g[mon.type] : null;
}

function refreshGrants(side) {
  const g = {};
  const mons = [side.active, side.next, ...side.bench].filter(Boolean);
  for (const m of mons) if (m.def && m.def.grantWeakness) Object.assign(g, m.def.grantWeakness);
  side.grants = Object.keys(g).length ? g : null;
}

function dmgTo(def, target, roll, activeSpot, attSide) {
  if (roll <= 0) return 0;
  if (def.counters) return target.effectImmune ? 0 : roll;
  if (target.immuneEx && def.ex) return 0;
  let d = roll;
  // Attacks that scale with the defender's Energy (e.g. Teal Mask Ogerpon ex's Myriad Leaf Shower).
  if (def.dmg && def.dmg.perOppEnergy && target.def && target.def.energy) d += def.dmg.perOppEnergy * target.def.energy;
  if (activeSpot) {
    const weak = attSide ? effectiveWeakness(attSide, target) : target.weakness;
    if (weak && weak === def.type) d *= 2;
    if (target.resist && target.resist === def.type) d = Math.max(0, d - 30);
  }
  return d;
}

function promote(side, opp, rng) {
  if (side.online && !side.outOfAttackers) {
    if (side.next) {
      side.active = side.next;
      side.next = null;
      side.justPromoted = true;
      return;
    }
    if (side.lost < side.stock) {
      side.active = makeMon(chooseAttacker(side, opp, rng), 'attacker');
      side.justPromoted = true;
      return;
    }
    side.outOfAttackers = true;
  }
  if (side.outOfAttackers) {
    side.active = makeMon(side.m.fallback || { name: 'Leftover Pokémon', hp: 90, prizes: 1, dmg: { base: 60 } }, 'fallback');
    return;
  }
  // Not online yet: the next starter steps up.
  side.active = makeMon(side.m.starter || { name: 'Starter', hp: 70, prizes: 1 }, 'starter');
}

function knockOut(taker, victim, mon, how, ohko, rng) {
  taker.prizes -= mon.prizes;
  // KOing the pieces of an evolution line before it is online delays that deck's setup.
  if (!victim.online && (mon.kind === 'starter' || mon.def.line) && rng() < (victim.m.setupFragility ?? 0)) victim.ready++;
  taker.kos.push({ prizes: mon.prizes, how, ohko, name: mon.name, turn: taker.turn });
  if (mon === victim.active) {
    if (mon.kind === 'attacker') victim.lost++;
    promote(victim, taker, rng);
  } else if (mon === victim.next) {
    victim.lost++;
    victim.next = null;
  } else {
    victim.bench = victim.bench.filter((b) => b !== mon);
  }
  refreshGrants(victim);
}

function startTurn(side, opp, rng) {
  side.turn++;
  if (side.deck <= 0) return 'deckout';
  side.deck = Math.max(0, side.deck - (side.m.cardsPerTurn ?? 3));

  // Ability locks from the opponent's stadiums (Legendary Pyroduct, Team Rocket's Watchtower...).
  let penalty = 0;
  let locked = false;
  side.lockedKinds = {};
  const locks = opp.m.locks || {};
  for (const k of Object.keys(locks)) {
    if (rng() < locks[k]) {
      side.lockedKinds[k] = true;
      const relies = side.m.reliesOn?.[k] || 0;
      if (relies > 0) {
        penalty += relies;
        locked = true;
      }
    }
  }
  if (locked) side.stats.locked++;
  if (!side.online && locked && rng() < penalty) side.ready++;

  if (!side.online && side.turn >= side.ready) {
    side.online = true;
    side.sinceReady = 0;
    const mon = makeMon(chooseAttacker(side, opp, rng), 'attacker');
    // The starter often evolves or is the attacker itself; sometimes it stays benched as a liability.
    if (side.active.kind === 'starter' && rng() < (side.m.starterStays ?? 0.35)) side.bench.push(side.active);
    side.active = mon;
    side.justPromoted = false;
  } else if (side.online) {
    side.sinceReady++;
  }
  if (side.m.heal && side.active.kind === 'attacker') side.active.hp = Math.min(side.active.max, side.active.hp + side.m.heal);
  return { penalty: Math.min(0.9, penalty), locked };
}

function takeTurn(side, opp, rng) {
  const st = startTurn(side, opp, rng);
  if (st === 'deckout') return 'deckout';
  if (side.first && side.turn === 1) return null;

  // Can we attack this turn?
  let def = null;
  if (side.online && !side.outOfAttackers) {
    let p = (side.m.consistency ?? 0.9) * side.form;
    if (side.justPromoted) p *= side.m.reload ?? 0.85;
    p *= 1 - st.penalty;
    const dis = opp.m.disrupt || {};
    let denied = false;
    if (dis.energy && rng() < dis.energy * (side.m.energyFragility ?? 0.5)) denied = true;
    if (dis.hand && rng() < dis.hand * (side.m.handFragility ?? 0.5)) denied = true;
    if (denied) side.stats.denied++;
    else if (rng() < p) def = side.active.def;
    else if (!st.locked) side.stats.missed++;
  } else if (side.outOfAttackers) {
    if (rng() < (side.m.consistency ?? 0.9) * 0.8) def = side.active.def;
  } else if (side.m.early && rng() < (side.m.early.p ?? 0.6)) {
    def = side.m.early;
  }
  side.justPromoted = false;

  if (def && def.whiff && rng() < def.whiff) {
    side.stats.whiffed++;
    def = null;
  }

  if (def) {
    side.stats.attacks++;
    const roll = rollDamage(def, side.sinceReady, rng);
    const ping = side.online && side.m.pings && rng() < side.m.pings.p ? side.m.pings.dmg : 0;
    const gustOk = side.online && side.gusts > 0 && rng() < (side.m.gust ?? 0.5);

    const cands = [{ mon: opp.active, where: 'active' }];
    if (gustOk) {
      for (const b of opp.bench) cands.push({ mon: b, where: 'gust' });
      if (opp.next) cands.push({ mon: opp.next, where: 'gust' });
    }
    for (const c of cands) {
      c.d = dmgTo(def, c.mon, roll, true, side);
      c.total = c.d + (c.mon.effectImmune || c.d === 0 ? 0 : ping);
      c.ko = c.total > 0 && c.total >= c.mon.hp;
    }

    // Snipe ability (e.g. Dusknoir Cursed Blast): KO a 2+ prize target outright, or finish the Active.
    const snipeLocked = side.m.snipe && side.m.snipe.lockedBy && side.lockedKinds[side.m.snipe.lockedBy];
    if (side.m.snipe && !snipeLocked && side.snipes > 0 && side.online && side.turn >= (side.m.snipe.from ?? 2) && rng() < (side.m.snipe.p ?? 0.6)) {
      const sd = side.m.snipe.dmg;
      const pool = [opp.active, ...opp.bench, ...(opp.next ? [opp.next] : [])].filter((m) => !m.effectImmune);
      const snipeKO = pool.filter((m) => m.hp <= sd && m.prizes >= 2 && !cands.some((c) => c.mon === m && c.ko)).sort((a, b) => b.prizes - a.prizes)[0];
      const act = cands[0];
      let target = null;
      if (snipeKO) target = snipeKO;
      else if (!act.mon.effectImmune && !act.ko && act.total > 0 && act.mon.hp <= act.total + sd && act.mon.prizes >= 2) target = act.mon;
      if (target) {
        side.snipes--;
        opp.prizes -= side.m.snipe.prizeCost ?? 1;
        opp.kos.push({ prizes: side.m.snipe.prizeCost ?? 1, how: 'selfko', ohko: false, name: side.m.snipe.name, turn: opp.turn });
        if (opp.prizes <= 0) return 'oppwin';
        const before = target.hp;
        target.hp -= sd;
        if (target.hp <= 0) {
          knockOut(side, opp, target, 'snipe', before === target.max, rng);
          if (side.prizes <= 0) return 'win';
        }
        // Refresh the Active candidate after the snipe.
        const a = cands[0];
        a.mon = opp.active;
        a.d = dmgTo(def, a.mon, roll, true, side);
        a.total = a.d + (a.mon.effectImmune || a.d === 0 ? 0 : ping);
        a.ko = a.total > 0 && a.total >= a.mon.hp;
        for (let i = cands.length - 1; i > 0; i--) if (cands[i].mon === target && target.hp <= 0) cands.splice(i, 1);
      }
    }

    let pick = cands
      .filter((c) => c.ko)
      .sort((a, b) => b.mon.prizes - a.mon.prizes || (a.where === 'active' ? -1 : 1))[0];
    if (pick && pick.where === 'gust') side.gusts--;

    let useAlt = false;
    if (!pick) {
      if (cands[0].d > 0) pick = cands[0];
      else if (def.alt) useAlt = true;
      else {
        const dmgBench = cands.filter((c) => c.where === 'gust' && c.d > 0).sort((a, b) => b.mon.prizes - a.mon.prizes)[0];
        if (dmgBench) {
          pick = dmgBench;
          side.gusts--;
        }
        else side.stats.blocked++;
      }
    }
    if (!useAlt && def.alt && opp.deck <= (def.alt.mill || 0) * 2 + 1) useAlt = true;

    if (useAlt) {
      opp.deck = Math.max(0, opp.deck - (def.alt.mill || 0));
      side.stats.milled += def.alt.mill || 0;
      const d = dmgTo(def, opp.active, def.alt.dmg || 0, true, side);
      if (d === 0 && (def.alt.dmg || 0) > 0) side.stats.blocked++;
      if (d > 0) {
        const before = opp.active.hp;
        opp.active.hp -= d;
        if (opp.active.hp <= 0) knockOut(side, opp, opp.active, 'active', before === opp.active.max, rng);
      }
    } else if (pick) {
      const before = pick.mon.hp;
      pick.mon.hp -= pick.total;
      if (pick.mon.hp <= 0) knockOut(side, opp, pick.mon, pick.where, before === pick.mon.max, rng);
    }
    if (side.prizes <= 0) return 'win';

    // Bench spread (e.g. Phantom Dive's 6 damage counters).
    if (def.spread && rng() < (def.spreadP ?? 1)) {
      const amt = def.spread;
      const targets = [...opp.bench, ...(opp.next ? [opp.next] : [])].filter((m) => !m.effectImmune);
      const koable = targets.filter((m) => m.hp <= amt).sort((a, b) => b.prizes - a.prizes);
      if (koable.length) {
        knockOut(side, opp, koable[0], 'spread', false, rng);
        const left = amt - koable[0].hp;
        const second = koable.slice(1).find((m) => m.hp <= left);
        if (second && def.spreadSplit !== false) knockOut(side, opp, second, 'spread', false, rng);
      } else if (opp.next && !opp.next.effectImmune) opp.next.hp -= amt;
      else if (targets.length) targets.sort((a, b) => b.prizes - a.prizes)[0].hp -= amt;
      if (side.prizes <= 0) return 'win';
    }
  }

  // Build the next attacker on the bench.
  if (side.online && !side.outOfAttackers && !side.next) {
    const inPlay = side.active.kind === 'attacker' ? 1 : 0;
    if (side.lost + inPlay < side.stock && rng() < (side.m.benchPrep ?? 0.75)) side.next = makeMon(chooseAttacker(side, opp, rng), 'attacker');
  }
  refreshGrants(side);
  return null;
}

function playGame(myModel, oppModel, meFirst, rng) {
  const me = makeSide(myModel, meFirst, rng);
  const opp = makeSide(oppModel, !meFirst, rng);
  fillBench(me, oppModel, rng);
  fillBench(opp, myModel, rng);
  const order = meFirst ? [me, opp] : [opp, me];
  let winner = null;
  let end = 'turnLimit';
  for (let t = 0; t < MAX_TURNS * 2 && !winner; t++) {
    const side = order[t % 2];
    const other = order[(t + 1) % 2];
    const r = takeTurn(side, other, rng);
    if (r === 'win') {
      winner = side;
      end = 'prizes';
    } else if (r === 'oppwin') {
      winner = other;
      end = 'prizes';
    } else if (r === 'deckout') {
      winner = other;
      end = 'deckout';
    }
  }
  return { me, opp, winner: winner === me ? 'me' : winner === opp ? 'opp' : null, end, meFirst };
}

function sumPrizes(kos, hows) {
  return kos.filter((k) => hows.includes(k.how)).reduce((s, k) => s + k.prizes, 0);
}

function avg(kos) {
  const real = kos.filter((k) => k.how !== 'selfko');
  return real.length ? real.reduce((s, k) => s + k.prizes, 0) / real.length : 0;
}

function ohkoRate(kos) {
  const real = kos.filter((k) => ['active', 'gust'].includes(k.how));
  return real.length ? real.filter((k) => k.ohko).length / real.length : 0;
}

// Factors seen from one side's point of view. Keys are stable ids; labels live in FACTOR_TEXT.
function factorsFor(a, b, g, aWon) {
  const f = [];
  if (a.ready < b.ready) f.push('fasterSetup');
  if (a.ready >= 4 || a.stats.missed >= 2) f.push('slowSetup');
  if (avg(a.kos) > avg(b.kos) + 0.4) f.push('prizeTrade');
  if (ohkoRate(a.kos) > ohkoRate(b.kos) + 0.25) f.push('ohko');
  if (sumPrizes(a.kos, ['gust']) >= 2) f.push('gust');
  if (sumPrizes(a.kos, ['spread', 'snipe']) >= 2) f.push('spread');
  if (b.stats.blocked >= 2) f.push('wall');
  if (b.stats.locked >= 2) f.push('lock');
  if (b.stats.denied >= 2) f.push('disrupt');
  if (b.outOfAttackers) f.push('attrition');
  if (g.end === 'deckout' && aWon) f.push('deckout');
  if (sumPrizes(b.kos, ['selfko']) >= 2) f.push('selfko');
  return f;
}

export const FACTOR_TEXT = {
  win: {
    fasterSetup: 'Your attacker came online before theirs',
    slowSetup: 'Their setup stumbled (attacker online turn 4+ or missed attacks)',
    prizeTrade: 'Better prize trade (your KOs were worth more prizes)',
    ohko: 'You one-shot more often than they did',
    gust: 'Gust KOs on benched Pokémon',
    spread: 'Bench spread or snipe KOs',
    wall: 'Their attacks were walled (damage prevention)',
    lock: 'Their abilities were locked',
    disrupt: 'Energy or hand disruption slowed them',
    attrition: 'They ran out of attackers',
    deckout: 'They decked out',
    selfko: 'Their self-KO Pokémon fed you prizes',
  },
  loss: {
    fasterSetup: 'Their attacker came online before yours',
    slowSetup: 'Your setup stumbled (attacker online turn 4+ or missed attacks)',
    prizeTrade: 'They won the prize trade (your Pokémon gave up more prizes per KO)',
    ohko: 'They one-shot you more often than you one-shot them',
    gust: 'They gusted your benched Pokémon for prizes',
    spread: 'Their spread or snipes took bench prizes',
    wall: 'Your attacks were walled (damage prevention)',
    lock: 'Your abilities were locked',
    disrupt: 'Energy or hand disruption slowed you',
    attrition: 'You ran out of attackers',
    deckout: 'You decked out',
    selfko: 'Your self-KO Pokémon fed them prizes',
  },
};

export const FACTOR_ADVICE = {
  fasterSetup: 'Speed is the matchup. Prioritize search for your main line on turn 1 and bench a second copy early.',
  slowSetup: 'Your attacker is often late. More Pokémon search (Buddy-Buddy Poffin, Ultra Ball) or a thinner list of non-essentials should help.',
  prizeTrade: 'They take 6 prizes in fewer KOs. Avoid benching 2-prize support ex you no longer need, and lead with single-prize Pokémon.',
  ohko: 'They one-shot your attackers. Look for HP boosts (Hero\'s Cape), healing, or an attacker that dodges their weakness math.',
  gust: 'They pick off benched liabilities. Bench Meowth ex / Fezandipiti ex only when you need them, and keep the bench small after setup.',
  spread: 'Bench damage costs you prizes. Keep low-HP basics off the bench once they have done their job.',
  wall: 'Your attackers get walled. Add a non-ex attacker or a way to remove the wall (a stadium bump, gust around it).',
  lock: 'Their stadium shuts off your abilities. Play your own stadium to bump theirs, and do not rely on one engine Pokémon.',
  disrupt: 'Disruption slows you down. Keep an extra Energy in hand and run recovery (Night Stretcher) for lost resources.',
  attrition: 'You run out of attackers in long games. Add recovery or one more copy of your main attacker.',
  deckout: 'You deck out in long games. Use fewer draw effects late, and count your deck before big draw turns.',
  selfko: 'Your self-KO Pokémon give up too many prizes. Use them only when they set up a multi-prize KO.',
};

export function simulateMatchup(myModel, oppModel, { games = 2000, seed = 1 } = {}) {
  const rng = rngFrom(seed);
  const out = {
    games,
    wins: 0,
    losses: 0,
    ties: 0,
    first: { games: 0, wins: 0 },
    second: { games: 0, wins: 0 },
    winFactors: {},
    lossFactors: {},
    prizeMaps: {},
    myReady: [],
    oppReady: [],
    firstKO: [],
    turns: [],
    kodBy: {}, // which of my Pokémon they KO'd
    myTargets: {}, // what I KO'd
    deckouts: 0,
  };
  for (let i = 0; i < games; i++) {
    const meFirst = i % 2 === 0;
    const g = playGame(myModel, oppModel, meFirst, rng);
    const bucket = meFirst ? out.first : out.second;
    bucket.games++;
    out.myReady.push(g.me.ready);
    out.oppReady.push(g.opp.ready);
    out.turns.push(Math.max(g.me.turn, g.opp.turn));
    if (g.end === 'deckout') out.deckouts++;
    const firstKo = g.me.kos.find((k) => k.how !== 'selfko');
    if (firstKo) out.firstKO.push(firstKo.turn);
    for (const k of g.opp.kos) if (k.how !== 'selfko') out.kodBy[k.name] = (out.kodBy[k.name] || 0) + 1;
    for (const k of g.me.kos) if (k.how !== 'selfko') out.myTargets[k.name] = (out.myTargets[k.name] || 0) + 1;
    if (g.winner === 'me') {
      out.wins++;
      bucket.wins++;
      for (const f of factorsFor(g.me, g.opp, g, true)) out.winFactors[f] = (out.winFactors[f] || 0) + 1;
      const map = g.me.kos.filter((k) => k.how !== 'selfko').map((k) => k.prizes);
      const gifted = sumPrizes(g.me.kos, ['selfko']);
      const key = map.join('-') + (gifted ? `+${gifted}` : '');
      out.prizeMaps[key] = (out.prizeMaps[key] || 0) + 1;
    } else if (g.winner === 'opp') {
      out.losses++;
      for (const f of factorsFor(g.opp, g.me, g, true)) out.lossFactors[f] = (out.lossFactors[f] || 0) + 1;
    } else out.ties++;
  }
  return summarize(out);
}

function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

function summarize(o) {
  const pct = (n, d) => (d ? n / d : 0);
  const sortObj = (obj, d) =>
    Object.entries(obj)
      .map(([k, v]) => ({ key: k, n: v, share: pct(v, d) }))
      .sort((a, b) => b.n - a.n);
  return {
    games: o.games,
    winRate: pct(o.wins, o.games),
    tieRate: pct(o.ties, o.games),
    firstWinRate: pct(o.first.wins, o.first.games),
    secondWinRate: pct(o.second.wins, o.second.games),
    winFactors: sortObj(o.winFactors, o.wins),
    lossFactors: sortObj(o.lossFactors, o.losses),
    prizeMaps: sortObj(o.prizeMaps, o.wins).slice(0, 4),
    myReadyMedian: median(o.myReady),
    oppReadyMedian: median(o.oppReady),
    firstKOMedian: median(o.firstKO),
    turnsMedian: median(o.turns),
    deckoutRate: pct(o.deckouts, o.games),
    kodBy: sortObj(o.kodBy, o.games).slice(0, 4),
    myTargets: sortObj(o.myTargets, o.games).slice(0, 4),
    wins: o.wins,
    losses: o.losses,
    ties: o.ties,
  };
}
