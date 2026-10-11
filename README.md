# FPL League Live

A live view of a whole Fantasy Premier League mini-league in one screen. It's built for following a gameweek while the matches are still going on.

The official app shows one team at a time and a single total, which is misleading mid-gameweek: a manager whose players have all played looks miles ahead of one who has had only two. This viewer shows each manager's score split by how far through the gameweek they are:

- **Live points**, including provisional bonus worked out from live BPS. These are marked with a dotted underline and `+3 bonus?` until FPL confirms them.
- **Done / avg**: players finished, and average points per player who played.
- **Live**: players in a match right now, and what they've scored.
- **To play**: players yet to start. `(C)` means the captain is among them.
- **Projected** final score. There are four options, and the page shows a one-line explanation of the selected one:
  - **Pace** (the default): finished players count at their real score. Every player not yet finished gets the manager's average per finished player, and the captain counts double. When everyone has played, Pace equals the final score.
  - **League average**: points so far, plus the average of every finished player in the league this week for each match still to come.
  - **Own average**: as above, but using the manager's own average.
  - **FPL expected pts**: as above, but using FPL's predicted score for each player.

  For the three average-based options, players in live matches are scaled by the time left.
- A progress bar of the 11 (15 with Bench Boost) counting players: green finished, amber live, hatched yet to play, red didn't play.

Each manager is one row: the starting 11 from goalkeeper to forwards, then the bench. Click a player to see where their points came from, match by match, including provisional bonus with their BPS.

Automatic substitutions and vice-captain promotion are projected as soon as they're certain, marked ↑ ↓. If the next bench player hasn't played yet, the sub is shown as pending (`sub?`).

**Compare** picks two managers. Players they both own at the same multiplier fade out as "cancelled out". The rest are split into each side's edge (you want these to score) and the other side's edge (you want these to blank), with what's still to play listed first. A one-line summary says who leads and what the trailing manager needs.

**Show: Unique picks / Shared by 2** fades out every player except those in exactly one (or two) managers' scoring line-ups, so you can see each week's differentials. Each row is tagged with how many it has and the points they've brought in so far.

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

## Development

```sh
node --test tests/*.test.js
```

| File | What it does |
| --- | --- |
| `web/fpl.js` | Pure scoring model: live and provisional bonus, auto-subs, vice-captain promotion, projections, comparison |
| `web/app.js` | Fetching and rendering |
| `web/demo.js` | Sample gameweek in the FPL API's own response shapes |
| `serve.py` | Local server and API proxy |
| `worker/index.js`, `wrangler.jsonc` | Cloudflare Worker: hosts `web/` and proxies the API |

FPL endpoints used: `bootstrap-static/`, `fixtures/?event={gw}`, `event/{gw}/live/`, `leagues-classic/{id}/standings/` (with `leagues-h2h/` as a fallback), `entry/{id}/event/{gw}/picks/`, and `entry/{id}/history/`. For leagues over 50 managers, only the first page of standings is shown.
