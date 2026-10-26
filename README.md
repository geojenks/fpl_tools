# FPL League Live

A live view of a whole Fantasy Premier League mini-league in one screen. It's built for following a gameweek while the matches are still going on.

The official app shows one team at a time and a single total, which is misleading mid-gameweek: a manager whose players have all played looks miles ahead of one who has had only two. This viewer shows each manager's score split by how far through the gameweek they are:

- **Live points**, including provisional bonus worked out from live BPS. These are marked with a dotted underline and `+3 bonus?` until FPL confirms them.
- **Done / avg**: players finished, and average points per player who played.
- **Live**: players in a match right now, and what they've scored.
- **To play**: players yet to start. `(C)` means the captain is among them.
- **Projected** final score: points so far, plus an estimate for each match still to come. The captain counts double, and players in live matches get a share for the time left. A finished week projects exactly its score. There are three options for the estimate, and the page shows a one-line explanation of the selected one:
  - **Pace** (the default): the manager's own average per finished player. Until one of their players has finished, the league average is used.
  - **League average**: the average of every finished player in the league this week.
  - **FPL expected pts**: FPL's predicted score for each player.
- A progress bar of the 11 (15 with Bench Boost) counting players: green finished, amber live, hatched yet to play, red didn't play.

Each manager is one row: the starting 11 from goalkeeper to forwards, then the bench. Click a player to see where their points came from, match by match. For a match whose bonus isn't confirmed yet, a **bonus race** table shows the live BPS ranking: who holds the 3, 2 and 1 bonus points right now, and how many BPS a player is short of a bonus place.

Bonus is taken from FPL's own live data when it already lists it for the match (FPL may add it provisionally during play), and worked out from the match's BPS ranking when it doesn't. Either way it is never counted twice, and it is marked `+3b?` until the match's bonus is confirmed.

Automatic substitutions and vice-captain promotion are projected as soon as they're certain, marked ↑ ↓. If the next bench player hasn't played yet, the sub is shown as pending (`sub?`).

Each row groups the line-up into goalkeeper, defenders, midfielders and forwards, with the formation (e.g. `4-4-2`) next to the manager's name. Players still to play have a dotted outline.

**Compare** picks two managers and lines their teams up facing each other on a pitch. A player is crossed off when the other manager has him at the same or a higher multiplier, so he cancels out. If only one of them captains him, he isn't crossed off on that side and is tagged with the net multiplier (e.g. `net ×1`). Below the pitch, each side's edge is listed: players you want to score and players you want to blank, with what's still to play first. A one-line summary says who leads and what the trailing manager needs.

**Only players owned by up to / exactly N managers** fades out everyone else, so you can see each week's differentials. Use up to 1 for unique picks. Each row is tagged with how many such players it has and the points they've brought in so far.

**Matches** lists every fixture of the gameweek below the teams, with live scores for games in progress (the minute, or `FT bonus` while bonus is still being confirmed). Press **+** on a match for its goalscorers, assists, cards and penalties. Press **++** for that plus every player's FPL points broken down by stat, with provisional bonus marked `?`. Small figures beside a name show how many managers in the league have that player in their scoring line-up. Past weeks work the same.

**Standings** shows the season table including this week's live points, with rank movement since last week and a projected total. Use the gameweek arrows to go back through past weeks: both views work for any week this season.

On a phone, the league becomes a compact table at the top. Below it you swipe between managers, each shown as a formation pitch. Tap a name in the table to jump to that manager.

## Running it

FPL's API doesn't allow calls from a browser page on another site (no CORS), so the page fetches through a small proxy. There are two options.

### 1. On your laptop (simplest)

```sh
python3 serve.py          # then open http://localhost:8000
python3 serve.py --lan    # also prints an address your phone can use on the same Wi-Fi
```

It needs only the Python 3 standard library. It serves the page from `web/` and forwards `/api/*` to `https://fantasy.premierleague.com/api/`, with short caching.

### 2. Online, for your phone and your friends (Cloudflare Workers, free)

A single Cloudflare Worker, `fpl-tools`, serves the page from `web/` and proxies `/api/*` to FPL (`worker/index.js`, configured in `wrangler.jsonc`):

1. In the Cloudflare dashboard, go to *Workers & Pages → Create → Import a repository* and pick this repository.
2. Name the Worker `fpl-tools`. It must match `name` in `wrangler.jsonc`.
3. Leave the build command empty and keep the deploy command as `npx wrangler deploy`. Under *Settings → Build → Branch control*, set the production branch to `main`.
4. Deploy. Your league is then at `https://fpl-tools.<your-subdomain>.workers.dev/?league=246924`, and Cloudflare redeploys on every push to `main`.

The `/api/` responses allow cross-origin requests, so a copy of `web/` hosted elsewhere (such as GitHub Pages) can use the Worker too. Set *API proxy URL* in Settings to `https://fpl-tools.<your-subdomain>.workers.dev/api/`.

### Links and leagues

- The league is part of the link: `?league=246924`. Share that to go straight to your league.
- Without `?league=`, the page offers a search box. A friend can enter their own league ID or paste their league's link from the FPL site. The search box in the header is always there for switching leagues.
- The address also keeps the week and view, e.g. `?league=246924&gw=5&view=table`.
- *My team* (in Settings) highlights your row and makes you side A in Compare. It's remembered for each league.
- `?demo` shows sample data with made-up scores, so you can check the layout without the API.
- Scores refresh every minute while matches are live, and whenever you return to the tab.

## Analysis: home vs away

`analysis/home_advantage.py` answers how much more FPL players score at home than away. It downloads ten seasons of player data from the public [vaastav/Fantasy-Premier-League](https://github.com/vaastav/Fantasy-Premier-League) archive (about 1 MB per season, cached after the first run), compares points per appearance, and writes the report to `analysis/home_vs_away.md`:

```sh
python3 analysis/home_advantage.py                   # all seasons
python3 analysis/home_advantage.py --min-minutes 60  # only near-full games
```

It splits the gap by position, player quality and season, and by where the points come from (clean sheets, goals, bonus and so on). It also compares each player with himself, so the result isn't just down to who plays at home. Standard library only.

## Development

```sh
node --test tests/*.test.js
python3 -m unittest discover -s tests -p "test_*.py"   # the analysis script
```

| File | What it does |
| --- | --- |
| `web/fpl.js` | Pure scoring model: live and provisional bonus, auto-subs, vice-captain promotion, projections, comparison |
| `web/app.js` | Fetching and rendering |
| `web/demo.js` | Sample gameweek in the FPL API's own response shapes |
| `serve.py` | Local server and API proxy |
| `worker/index.js`, `wrangler.jsonc` | Cloudflare Worker: hosts `web/` and proxies the API |

The page sends FPL paths base64url-encoded (`/api/v/…`). Browser content blockers otherwise mistake FPL's `/event/` and `/entry/` addresses for trackers and block them. `/api/_ping` checks that the Worker is up without contacting FPL.

FPL endpoints used: `bootstrap-static/`, `fixtures/?event={gw}`, `event/{gw}/live/`, `leagues-classic/{id}/standings/` (with `leagues-h2h/` as a fallback), `entry/{id}/event/{gw}/picks/`, and `entry/{id}/history/`. For leagues over 50 managers, only the first page of standings is shown.
