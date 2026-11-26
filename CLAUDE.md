# Notes for Claude

This repo is Ian's Pokémon TCG site: a static site (no build, no dependencies) that reads JSON from `data/`. See README.md for the layout.

## Research sources

Use both Limitless and Trainer Hill for meta data.

- Limitless online results for a format: `https://play.limitlesstcg.com/decks?format=standard&set=<SET>` (e.g. `DLR`). Each deck has `/matchups` with the same query string.
- Limitless major events: `https://limitlesstcg.com/decks`.
- Card text: search `limitlesstcg.com` for the card (card pages may not fetch directly; search snippets include the text).
- Trainer Hill renders in the browser, so fetching returns "Loading…". Use web search restricted to `trainerhill.com` (e.g. "trainerhill decklist <deck> matchups"); the indexed snippets contain the matchup rows and meta shares. Trainer Hill counts a tie as one third of a win.

## Adding one of Ian's decks

1. Save the TCG Live export and run `node tools/new-deck.mjs <id> "<name>" <file> [format]`.
2. Look up card text for every Pokémon and fill `pokemon` (hp, ex, evolvesFrom), `lines`, and `model` (attackers with HP, prizes, type, Weakness, Energy attached, damage; easy gust targets on the bench; `setupFragility` for evolution decks). Copy the shape of `data/decks/example-hammerpult.json`.
3. Set `archetypeRef` to the closest meta deck id if there is one.
4. Run `node tools/sim-cli.mjs <id>` and use its output plus the archetype profiles to write `gameplan` and `matchups` (setup, turns, tips) for each top-10 deck. Keep claims to card text and real data; say "estimate" where it is one.
5. Run `node tools/check.mjs` (must pass), then commit. Ask Ian whether to push to `main` or open a PR if he hasn't said.

Don't add Ian's decks from the claude.ai project docs unless he asks.

## Refreshing the meta

- When a new set becomes legal: add a format to `data/formats.json`, add `data/meta/<format>.json` with the new top 10 and the Limitless matchup rows, add any new archetypes to `data/archetypes.json`, then run `node tools/calibrate.mjs`.
- Ranks 11 to 20 go in the meta file's `next` list (same row shape as `top`, with `nextCaptured` for their capture date). Add Limitless rows for each of them against all 20 decks; challengers on every guide page stay the top 10, and `tools/calibrate.mjs` reads only `top`.
- Keep `setChanges` in `data/formats.json` current; mark unconfirmed dates with `"confirmed": false`.
- Matrix rows are `[rowDeck, colDeck, wins, losses, ties]` (Trainer Hill rows add a sixth field: `"meta"` or `"deck"` for which page they came from).

## Guide pages

Each top-20 deck (`top` plus `next`) has a written guide in `data/guides/<id>.md` (format in README.md). When the top 20 changes, write a guide for each new deck from its best recent list on Limitless: fetch the list, then the card text for every Pokémon and every Trainer you describe (`limitlesstcg.com/cards/<SET>/<number>` fetches once the URL has appeared in a search or list page). Three playthroughs per guide, each legal turn by turn, with the arithmetic checked. Update `data/streams.json` from each deck's Limitless page ("Latest stream matches"). Run `node tools/check.mjs`, then read the rendered page.

`guide.html?id=<archetype>` builds its matchup notes from `data/archetypes.json` with the rules in `assets/js/insights.js`. When you add or edit an archetype, fill the fields those rules read:
- attackers: `hp`, `prizes`, `type`, `weakness`, `resist`, `ex`, `energy` (usually attached), `dmg`, `spread` + `spreadName`, `counters`, `immuneEx` + `wallLockedBy`, `grantWeakness`.
- model: `locks`, `reliesOn`, `disrupt`, `snipe`, `bench` (with `p`, `pIf`, `line`, `effectImmune`), `setupFragility`, `energyFragility`, `handFragility`.
- `engine`: plain words for what a lock shuts off (e.g. `{ "evolved": "Drakloak's Recon Directive" }`).
Then read the generated notes for every pair (node one-liner calling `matchupNotes`) and fix any profile number that produces a wrong claim.
