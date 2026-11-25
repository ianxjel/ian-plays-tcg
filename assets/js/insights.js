// Matchup notes built from the archetype profiles in data/archetypes.json.
// matchupNotes(you, them) answers "how does deck `you` beat deck `them`?" using card facts the
// profiles already carry: HP, damage, prize value, Weakness, locks, walls, spread, snipes, speed.
// Wording says "about" wherever the profile's damage is an estimate rather than a fixed number.

const LOCK_LABEL = {
  evolved: 'Legendary Pyroduct (Evolution Pokémon have no Abilities)',
  colorless: "Team Rocket's Watchtower (Colorless Pokémon have no Abilities)",
};

export function mainAttacker(a) {
  return [...a.model.attackers].sort((x, y) => (y.weight ?? 1) - (x.weight ?? 1))[0];
}

// A typical hit: base damage, plus the second step of any ramp, plus one heads on coin attacks.
export function typical(att) {
  const d = att.dmg || {};
  let v = d.base || 0;
  if (d.ramp) v += d.ramp[Math.min(1, d.ramp.length - 1)];
  if (d.coinUntilTails) v += d.coinUntilTails;
  return v;
}

const isEstimate = (att) => !!(att.dmg?.sd || att.dmg?.ramp || att.dmg?.coinUntilTails || att.whiff);
const about = (att) => (isEstimate(att) ? 'about ' : '');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const listNames = (arr) => (arr.length <= 1 ? arr.join('') : `${arr.slice(0, -1).join(', ')} and ${arr[arr.length - 1]}`);
const uniq = (arr) => [...new Set(arr)];
// How much losing an Energy hurts a deck: set in the profile, otherwise guessed from its main attacker's cost.
const energyNeed = (model) => model.energyFragility ?? ((mainAttacker({ model }).energy || 0) >= 3 ? 0.6 : 0.3);

function grants(model) {
  const g = {};
  for (const m of [...model.attackers, ...(model.bench || [])]) if (m.grantWeakness) Object.assign(g, m.grantWeakness);
  return g;
}

function weaknessAgainst(attModel, target) {
  if (target.weakness) return { type: target.weakness, granted: false };
  const g = grants(attModel);
  return target.type && g[target.type] ? { type: g[target.type], granted: true } : null;
}

function readyTurn(model) {
  const med = (c) => {
    for (let i = 0; i < c.length; i++) if (c[i] >= 0.5) return i + 1;
    return c.length + 1;
  };
  return (med(model.speed.first) + med(model.speed.second)) / 2;
}

// Damage `att` deals to `target` in the Active Spot, ignoring spread and snipes.
function hit(att, attModel, target) {
  if (att.counters) return { d: typical(att), weak: false };
  if (target.immuneEx && att.ex) return { d: 0, weak: false, walled: true };
  let d = typical(att);
  if (att.dmg?.perOppEnergy && target.energy) d += att.dmg.perOppEnergy * target.energy;
  const w = weaknessAgainst(attModel, target);
  const weak = !!(w && w.type === att.type);
  if (weak) d *= 2;
  if (target.resist && target.resist === att.type) d = Math.max(0, d - 30);
  return { d, weak, granted: weak && w.granted };
}

export function matchupNotes(you, them) {
  const ym = you.model;
  const xm = them.model;
  const yMain = mainAttacker(you);
  const xMain = mainAttacker(them);
  const xTargets = xm.attackers.filter((a) => (a.weight ?? 1) >= 0.3);
  const edges = [];
  const dangers = [];
  const plan = [];

  // Weakness and one-hit KOs, your attackers into theirs.
  for (const a of ym.attackers) {
    if ((a.weight ?? 1) < 0.15) continue;
    for (const t of xTargets) {
      const h = hit(a, ym, t);
      if (h.walled) continue;
      if (h.weak) {
        const result = h.d >= t.hp * 1.5 ? `an easy one-hit KO on its ${t.hp} HP` : h.d >= t.hp ? `a one-hit KO on its ${t.hp} HP` : `against its ${t.hp} HP`;
        if (h.granted && a.grantWeakness) edges.push(`${a.name}'s Fairy Zone gives Dragon Pokémon Psychic Weakness, so it hits ${t.name} for ${about(a)}${h.d}, ${result}.`);
        else if (h.granted) edges.push(`With Lillie's Clefairy ex on your bench (Fairy Zone gives Dragon Pokémon Psychic Weakness), ${a.name} hits ${t.name} for ${about(a)}${h.d}, ${result}.`);
        else edges.push(`${a.name} hits ${t.name} for Weakness: ${h.d >= t.hp * 1.5 ? '' : `${about(a)}${h.d} damage, `}${result}.`);
      } else if (a === yMain && t === xMain) {
        const spreadPre = (a.spreadP ?? 1) >= 0.5 ? a.spread || 0 : 0;
        const pre = spreadPre + (ym.pings?.dmg || 0);
        if (h.d >= t.hp) edges.push(`${a.name} one-hit KOs ${t.name}: ${about(a)}${h.d} damage into ${t.hp} HP.`);
        else if (pre && h.d + pre >= t.hp)
          edges.push(
            `${a.name} (${about(a)}${h.d}) can one-hit KO ${t.name} (${t.hp} HP) once it already has ${spreadPre ? `${spreadPre} damage from the last ${a.spreadName || 'spread attack'}` : 'damage on it'}${ym.pings ? ` plus ${ym.pings.dmg} moved by Munkidori` : ''}.`
          );
        else plan.push(`${t.name} has ${t.hp} HP, so your ${a.name} (${about(a)}${h.d} a hit) needs two attacks. Finish it before it can heal or retreat.`);
      }
    }
  }
  if (yMain.counters && (xm.attackers.some((a) => a.immuneEx) || (xMain.resist && xMain.resist === yMain.type)))
    edges.push(`${yMain.name} places damage counters, which ignore Resistance and damage-prevention effects like Mysterious Rock Inn.`);

  // Their attackers into yours.
  for (const t of xTargets) {
    const h = hit(t, xm, yMain);
    if (h.walled) continue;
    if (h.weak)
      dangers.push(
        `${t.name} hits your ${yMain.name} for Weakness${h.granted ? " (Lillie's Clefairy ex's Fairy Zone)" : ''}: ${h.d >= yMain.hp ? `a one-hit KO on its ${yMain.hp} HP` : `${about(t)}${h.d} damage against its ${yMain.hp} HP`}.`
      );
    else if (h.d >= yMain.hp) dangers.push(`${t.name} one-hit KOs your ${yMain.name}: ${about(t)}${h.d} damage into ${yMain.hp} HP.`);
  }
  if (xMain.resist && xMain.resist === yMain.type && !yMain.counters) dangers.push(`${xMain.name} resists ${yMain.type} (−30 damage).`);

  // Attacks that scale with the defender's Energy (Teal Mask Ogerpon ex's Myriad Leaf Shower).
  for (const a of ym.attackers) if (a.dmg?.perOppEnergy && (xMain.energy || 0) >= 3)
    edges.push(`${a.name}'s attack adds ${a.dmg.perOppEnergy} for each Energy on their Active, and ${xMain.name} usually carries ${xMain.energy} (+${a.dmg.perOppEnergy * xMain.energy}).`);
  for (const t of xm.attackers) if (t.dmg?.perOppEnergy && (yMain.energy || 0) >= 3)
    dangers.push(`Their ${t.name} adds ${t.dmg.perOppEnergy} damage for each Energy on your Active; your ${yMain.name} usually carries ${yMain.energy} (+${t.dmg.perOppEnergy * yMain.energy}). Attach only what you need.`);

  // Prize trade.
  const kosYou = Math.ceil(6 / xMain.prizes);
  const kosThem = Math.ceil(6 / yMain.prizes);
  const prizeLine = `Six prizes = ${plural(kosYou, 'KO')} on ${xMain.name} (${plural(xMain.prizes, 'prize')} each); they need ${plural(kosThem, 'KO')} on your ${yMain.name}.`;
  if (kosYou < kosThem) edges.push(`Prize trade is on your side. ${prizeLine}`);
  else if (kosYou > kosThem) dangers.push(`Prize trade favors them. ${prizeLine}`);
  else plan.push(prizeLine);

  // Gust targets on their bench.
  const yHit = typical(yMain);
  const yTypes = new Set(ym.attackers.map((a) => a.type));
  const benchP = (b) => (b.pIf && yTypes.has(b.pIf.oppType) ? b.pIf.p : b.p ?? 1);
  const liab = (xm.bench || []).filter((b) => b.prizes >= 2 && benchP(b) >= 0.4 && b.hp <= yHit && !(b.immuneEx && yMain.ex));
  if (liab.length) {
    const names = uniq(liab.map((b) => `${b.name} (${b.hp} HP)`));
    edges.push(`Their benched ${listNames(names)} ${liab.length > 1 ? 'are' : 'is'} worth 2 prizes and go${liab.length > 1 ? '' : 'es'} down to one ${yMain.name} attack. Boss's Orders them when you can.`);
  }

  // Their Pokémon that give your attackers Weakness (Lillie's Clefairy ex) are the first gust target.
  for (const b of xm.bench || []) {
    if (b.grantWeakness && benchP(b) >= 0.4 && b.grantWeakness[yMain.type])
      plan.unshift(`Gust and KO their ${b.name} (${b.hp} HP) first: while it's in play your ${yMain.type} Pokémon are weak to ${b.grantWeakness[yMain.type]}.`);
  }

  // Bench spread.
  if (yMain.spread && (yMain.spreadP ?? 1) >= 0.5) {
    const smalls = (xm.bench || []).filter((b) => b.hp <= yMain.spread && !b.effectImmune);
    const immune = (xm.bench || []).filter((b) => b.effectImmune);
    if (smalls.length) edges.push(`${yMain.spreadName || `${yMain.name}'s spread`} (${yMain.spread} bench damage) KOs their ${listNames(uniq(smalls.map((b) => `${b.name} (${b.hp} HP)`)))} for free prizes.`);
    if (immune.length >= 2 || (xm.starter && xm.starter.effectImmune))
      dangers.push(`Their Hide 'n' Sneak Pokémon (${listNames(uniq(immune.map((b) => b.name)))}) ignore your bench damage counters, so spread only lands on Dhelmise and their Pokémon ex.`);
  }

  // Snipes (Dusknoir's Cursed Blast).
  if (ym.snipe) {
    const s = ym.snipe;
    const easy = [...xm.attackers, ...(xm.bench || [])].filter((b) => b.prizes >= 2 && b.hp <= s.dmg && !b.effectImmune);
    if (easy.length) edges.push(`${s.name}'s Cursed Blast (${s.dmg} in damage counters) KOs their ${listNames(uniq(easy.map((b) => b.name)))} outright.`);
    if (!xMain.effectImmune && typical(yMain) + s.dmg >= xMain.hp && typical(yMain) < xMain.hp)
      edges.push(`Cursed Blast plus ${yMain.name} (${about(yMain)}${typical(yMain)}) adds up to a KO on ${xMain.name} (${xMain.hp} HP).`);
    plan.push(`Each Cursed Blast gives them a prize, so only use it when it wins you more than one.`);
  }
  if (xm.snipe) {
    edges.push(`Every ${xm.snipe.name} they Cursed Blast with is a free prize for you.`);
    const mine = (ym.bench || []).filter((b) => b.prizes >= 2 && b.hp <= xm.snipe.dmg);
    if (mine.length) dangers.push(`Cursed Blast (${xm.snipe.dmg}) KOs your benched ${listNames(uniq(mine.map((b) => b.name)))} outright. Keep them off the bench late.`);
  }

  // Ability locks.
  for (const k of Object.keys(ym.locks || {})) if ((xm.reliesOn?.[k] || 0) >= 0.25) edges.push(`Your ${LOCK_LABEL[k]} shuts off ${them.engine?.[k] || 'their key abilities'}.`);
  for (const k of Object.keys(xm.locks || {})) if ((ym.reliesOn?.[k] || 0) >= 0.25) dangers.push(`Their ${LOCK_LABEL[k]} shuts off ${you.engine?.[k] || 'your key abilities'}. Carry a stadium to replace it.`);

  // Damage walls.
  const wall = xm.attackers.find((a) => a.immuneEx && (a.weight ?? 1) >= 0.5);
  if (wall) {
    const nonEx = ym.attackers.filter((a) => !a.ex);
    const unlock = wall.wallLockedBy && ym.locks?.[wall.wallLockedBy];
    if (unlock) edges.push(`Your ${LOCK_LABEL[wall.wallLockedBy]} turns off Mysterious Rock Inn, because it's an Ability on an Evolution Pokémon. Keep the stadium in play and your ex attacks work again.`);
    if (nonEx.length) edges.push(`Your non-ex ${listNames(uniq(nonEx.map((a) => a.name)))} can damage Crustle; Mysterious Rock Inn only stops Pokémon ex.`);
    else if (!yMain.counters) dangers.push(`Crustle's Mysterious Rock Inn stops all damage from your Pokémon ex attacks${unlock ? ' whenever your stadium is not in play' : ''}.`);
    if (yMain.alt?.mill) edges.push(`Undermine (${yMain.alt.dmg} and discard their top ${yMain.alt.mill} cards) wins by decking them out. Crustle can't stop the mill.`);
    const around = (xm.bench || []).filter((b) => !b.immuneEx).map((b) => b.name);
    const exAtt = xm.attackers.filter((a) => !a.immuneEx).map((a) => a.name);
    if (around.length || exAtt.length) plan.push(`Gust around the wall: ${listNames(uniq([...around, ...exAtt]))} can still be damaged.`);
  }
  const youWall = ym.attackers.some((a) => a.immuneEx && (a.weight ?? 1) >= 0.5);
  if (youWall) {
    if (xm.attackers.every((a) => a.ex || a.counters)) edges.push(`Their attackers are Pokémon ex, so Crustle walls them${xMain.counters ? ' (except damage counters)' : ''}.`);
    else dangers.push(`Their non-ex attackers get around Crustle's wall.`);
  }

  // Disruption.
  if ((ym.disrupt?.energy || 0) >= 0.2 && energyNeed(xm) >= 0.5)
    edges.push(energyNeed(xm) >= 0.8 ? 'Crushing Hammer hits hard: their damage is counted from Energy in play, so every Energy you remove lowers it.' : 'Crushing Hammer slows them: their attackers need several Energy each.');
  if ((ym.disrupt?.hand || 0) >= 0.15 && (xm.handFragility ?? 0.5) >= 0.6) edges.push("Hand disruption (Judge, Unfair Stamp) shrinks their hand, and Powerful Hand's damage with it.");
  if ((xm.disrupt?.energy || 0) >= 0.2 && energyNeed(ym) >= 0.5) dangers.push('They run Crushing Hammer. Keep a spare Energy in hand.');

  // Speed.
  const ry = readyTurn(ym);
  const rx = readyTurn(xm);
  if (ry <= rx - 0.5) edges.push('You usually attack about a turn before they do.');
  else if (rx <= ry - 0.5) dangers.push('They usually attack about a turn before you do. Plan to survive their first big hit.');
  if ((xm.setupFragility || 0) >= 0.4 && ry <= rx) {
    const pieces = uniq([xm.starter?.name, ...(xm.bench || []).filter((b) => b.line).map((b) => b.name)].filter(Boolean));
    plan.unshift(`Early turns: KO or gust their ${listNames(pieces)} before ${xMain.name} is online. Losing those pieces delays them.`);
  } else if (rx < ry) {
    plan.unshift(`Early turns: set up two copies of ${yMain.name}'s line and expect to lose your first Active.`);
  }

  return { edges: uniq(edges), dangers: uniq(dangers), plan: uniq(plan) };
}
