# Ian Plays TCG

A small static site for my Pokémon TCG decks:

- **Meta** (`index.html`): the top 10 decks of the current Standard format, a countdown to the next set change, the latest major event, and a "who beats who" chart (grid or list) from Limitless and Trainer Hill.
- **Guides** (`guides.html`, `guide.html?id=…`): one long page per top-10 deck, in numbered chapters. First how to play it: the reference list, every card's job, the first turns, the middle game, closing, key decisions, three turn-by-turn playthroughs and a matchup cheat sheet. Then its streamed matches from Limitless, with links that open at the match. Then how every other top deck beats it: real win rates, a plan per matchup, streamed games for that pair, and a quick simulation.
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
- `data/archetypes.json`: one profile per meta deck: how it plays, how to beat it, a sample list, and the simulator model. The guide pages' matchup notes are worked out from these profiles by `assets/js/insights.js`, so getting HP, damage, Weakness, prizes and flags right there is what keeps the guides right.

After changing meta data or archetype models, run `node tools/calibrate.mjs` to re-check the simulator against real results. It rewrites `data/sim-calibration.json`.

## Write or update a guide

Each top-10 deck has a Markdown file, `data/guides/<archetype id>.md`. The page turns every `## ` heading into a numbered chapter. Start the file with:

```
---
list: [Player, place at Event](https://limitlesstcg.com/decks/list/…)
updated: 2026-11-25
---
```

Chapters `At a glance`, `The list`, `Card by card`, `Playthroughs` and `Matchup cheat sheet` are required (`node tools/check.mjs` checks them). Two special blocks:

- ` ```decklist ` holds the 60 in TCG Live export form (`Pokémon: 19`, then `4 Dreepy TWM 128` lines). It renders as three columns with a copy button and must add up to 60.
- ` ```play ` is a playthrough: one line each for `setup:`, `you 1:`, `opp 1:` and so on, and a `lesson:`. It renders as a turn-by-turn timeline.

Everything else is plain Markdown (paragraphs, `-` and `1.` lists, `>` callouts, tables, **bold**, links). Keep every number to the card text on Limitless, and say "estimate" where something is one.

## Streamed matches

`data/streams.json` lists matches from the "Latest stream matches" table on each deck's Limitless page (`https://limitlesstcg.com/decks/<limitlessId>`; the ids are in `data/archetypes.json`). Each match has the event, round, both players with their archetype ids (or `null` and a `label` for decks outside the top 10), the score from player one's side, and the video link with its timestamp. When Limitless's own link is broken, leave `video` as `null`, put the timestamp in seconds in `t`, and give the event a `page` (its Limitless stream page) so the site links there instead.

## How the simulator works

Each simulated game is a race to six prizes between two deck models. Your deck comes online when a goldfish of your actual 60 cards says it does (opening hands, search, evolutions, Energy). Meta decks use hand-built profiles. The sim tracks which factors show up in won and lost games: faster setup, prize trade, one-hit KOs, gust and spread prizes, damage walls, ability locks, disruption.

It's a model, not the real game. Checked against real Limitless matchups between the top 10 decks, it picks the favored side about 4 times in 5 but is still off by around 7 points on average, so its raw numbers are pulled about two-thirds of the way toward 50% before they're shown (the exact factor is in `data/sim-calibration.json`). The real-data columns are the score; the sim is for understanding why.

## Sources

- Limitless: https://limitlesstcg.com and https://play.limitlesstcg.com
- Trainer Hill: https://www.trainerhill.com
