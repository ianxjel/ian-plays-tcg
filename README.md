# Ian Plays TCG

A small static site for my Pokémon TCG decks:

- **Meta** (`index.html`): the top 10 decks of the current Standard format, a countdown to the next set change, and a matchup grid from Limitless and Trainer Hill.
- **My decks** (`decks.html`): decks I've built or made up, with simplified lists.
- **Deck page** (`deck.html?id=…`): setup odds, and every matchup against the top 10 with dropdowns for setup, turn plan, why simulated games were won or lost, and gameplay suggestions.

No build step and no dependencies: plain HTML, CSS and JavaScript modules reading JSON from `data/`.

## Run it locally

```
python3 -m http.server
```

Then open http://localhost:8000. (Opening the HTML file directly won't work because the pages load JSON.)

## Put it online

GitHub Pages: repo **Settings → Pages → Build and deployment → Deploy from a branch**, pick `main` and `/ (root)`. The site will be at `https://ianxjel.github.io/ian-plays-tcg/`.

## Add a deck

Easiest: ask Claude "add this deck to ian-plays-tcg" and paste the Pokémon TCG Live export. `CLAUDE.md` tells it what to do.

By hand:

1. Save the TCG Live export to a text file and run
   `node tools/new-deck.mjs my-deck-id "Deck name" list.txt`
   This creates `data/decks/my-deck-id.json` and adds it to `data/decks/index.json`.
2. Fill in the TODOs (see the example in `data/decks/example-hammerpult.json`):
   - `pokemon`: HP, `ex: true`, and `evolvesFrom` for each Pokémon. This builds the simplified list and the setup odds.
   - `lines`: the main attacker's evolution line and how many Energy it needs to attack.
   - `model`: what the simulator needs: attackers (HP, prizes, type, Weakness, damage), benched Pokémon that are easy gust targets, and how often you can gust.
   - `archetypeRef`: the closest meta deck id (e.g. `dragapult`), so the page can show that archetype's real results next to the sim.
   - `gameplan` and `matchups`: the written setup, turn plan and tips. Matchup keys are meta deck ids from `data/archetypes.json`.
3. Check it: `node tools/check.mjs` and `node tools/sim-cli.mjs my-deck-id`.

### Log real games

Add results to the deck's `record` list and the deck page shows them in the "Your games" column:

```json
"record": [
  { "opp": "mega-rayquaza", "w": 2, "l": 1, "t": 0, "event": "League Cup", "date": "2026-11-22" }
]
```

## Update the meta

- `data/formats.json`: formats and set changes (release and tournament-legal dates). The countdown and format rail read this.
- `data/meta/<format>.json`: top decks with shares from Limitless and Trainer Hill, and the matchup matrices.
- `data/archetypes.json`: one profile per meta deck: how it plays, how to beat it, a sample list, and the simulator model.

After changing meta data or archetype models, run `node tools/calibrate.mjs` to re-check the simulator against real results. It rewrites `data/sim-calibration.json`.

## How the simulator works

Each simulated game is a race to six prizes between two deck models. Your deck comes online when a goldfish of your actual 60 cards says it does (opening hands, search, evolutions, Energy). Meta decks use hand-built profiles. The sim tracks which factors show up in won and lost games: faster setup, prize trade, one-hit KOs, gust and spread prizes, damage walls, ability locks, disruption.

It's a model, not the real game. Checked against real Limitless matchups between the top 10 decks, it picks the favored side about 4 times in 5 but is still off by around 7 points on average, so its raw numbers are pulled about halfway toward 50% before they're shown (the exact factor is in `data/sim-calibration.json`). The real-data columns are the score; the sim is for understanding why.

## Sources

- Limitless: https://limitlesstcg.com and https://play.limitlesstcg.com
- Trainer Hill: https://www.trainerhill.com
