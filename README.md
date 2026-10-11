# FPL League Live

A live view of a whole Fantasy Premier League mini-league in one screen. It's built for following a gameweek while the matches are still going on.

The official app shows one team at a time and a single total, which is misleading mid-gameweek: a manager whose players have all played looks miles ahead of one who has had only two. This viewer shows each manager's score split by how far through the gameweek they are:

- **Live points**, including provisional bonus worked out from live BPS. These are marked with a dotted underline and `+3 bonus?` until FPL confirms them.
- **Done / avg**: players finished, and average points per player who played.
- **Live**: players in a match right now, and what they've scored.
- **To play**: players yet to start. `(C)` means the captain is among them.
- **Projected** final score: points so far plus a basis for each match still to come. A captain counts at their multiplier, and live matches are scaled by the time left. You can pick the basis: league average, the manager's own average, or FPL's expected points.
- A progress bar of the 11 (15 with Bench Boost) counting players: green finished, amber live, hatched yet to play, red didn't play.

Each manager is one row: the starting 11 from goalkeeper to forwards, then the bench. Click a player to see where their points came from, match by match, including provisional bonus with their BPS.

Automatic substitutions and vice-captain promotion are projected as soon as they're certain, marked ↑ ↓. If the next bench player hasn't played yet, the sub is shown as pending (`sub?`).

**Compare** picks two managers. Players they both own at the same multiplier fade out as "cancelled out". The rest are split into each side's edge (you want these to score) and the other side's edge (you want these to blank), with what's still to play listed first. A one-line summary says who leads and what the trailing manager needs.

On a phone, the league becomes a compact table at the top. Below it you swipe between managers, each shown as a formation pitch. Tap a name in the table to jump to that manager.

## Running it

FPL's API doesn't allow calls from a browser page on another site (no CORS), so the page fetches through a small proxy. There are two options.

### 1. On your laptop (simplest)

```sh
python3 serve.py          # then open http://localhost:8000
python3 serve.py --lan    # also prints an address your phone can use on the same Wi-Fi
```

It needs only the Python 3 standard library. It serves the page from `web/` and forwards `/api/*` to `https://fantasy.premierleague.com/api/`, with short caching.

### 2. Anywhere, including your phone away from home

1. Deploy `proxy/worker.js` as a Cloudflare Worker. The free plan is enough: in the Cloudflare dashboard go to *Workers & Pages → Create → Hello World*, paste the file in, then click *Deploy*.
2. Host the `web/` folder anywhere static, such as GitHub Pages or Cloudflare Pages, or just open it locally.
3. In the viewer, open **Settings** and set *API proxy URL* to `https://<your-worker>.workers.dev/api/`.

### Settings and links

- The league ID defaults to `246924`. Change it in Settings or with `?league=123456`.
- *My team* highlights your row and makes you side A in Compare.
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
| `proxy/worker.js` | Cloudflare Worker proxy |

FPL endpoints used: `bootstrap-static/`, `fixtures/?event={gw}`, `event/{gw}/live/`, `leagues-classic/{id}/standings/` (with `leagues-h2h/` as a fallback), and `entry/{id}/event/{gw}/picks/`.
