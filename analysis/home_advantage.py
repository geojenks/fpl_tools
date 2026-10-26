#!/usr/bin/env python3
"""How much more do FPL players score at home than away?

Downloads every gameweek of past FPL seasons from the public archive
vaastav/Fantasy-Premier-League (a copy of FPL's own player data, one row per
player per match, with a was_home flag), then compares points per appearance
at home and away: overall, by position, by season, by player quality, and by
where the points come from. Standard library only.

    python3 analysis/home_advantage.py                   # all seasons
    python3 analysis/home_advantage.py --seasons 2023-24 2024-25
    python3 analysis/home_advantage.py --min-minutes 60  # only near-full games

Downloads are cached (default analysis/.cache), so re-runs are instant. The
report is printed and written to analysis/home_vs_away.md.
"""
import argparse
import csv
import math
import sys
import urllib.error
import urllib.request
from collections import defaultdict, namedtuple
from pathlib import Path

BASE = "https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data"
SEASONS = ["2016-17", "2017-18", "2018-19", "2019-20", "2020-21",
           "2021-22", "2022-23", "2023-24", "2024-25", "2025-26"]
# Seasons played behind closed doors: the last 92 matches of 2019-20, and almost
# all of 2020-21. Only 2020-21 is left out of the "with fans" figure.
CLOSED_DOORS = {"2019-20": "last 92 matches closed doors", "2020-21": "almost all closed doors"}
NO_FANS = {"2020-21"}
POSITIONS = {1: "GKP", 2: "DEF", 3: "MID", 4: "FWD"}
POS_NAMES = {v: k for k, v in POSITIONS.items()}
GOAL_PTS = {"GKP": 6, "DEF": 6, "MID": 5, "FWD": 4}
CS_PTS = {"GKP": 4, "DEF": 4, "MID": 1, "FWD": 0}
TIERS = [(0, 3, "under 3"), (3, 4, "3 to 4"), (4, 5, "4 to 5"), (5, 6, "5 to 6"), (6, 99, "6 and over")]
Z95 = 1.96

Row = namedtuple("Row", "season element pos minutes points home goals assists cs gc saves bonus yc rc og pm ps")


# ---------------------------------------------------------------- download

def fetch(url, dest):
    """Download url to dest unless it is already cached."""
    if dest.exists() and dest.stat().st_size > 0:
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "fpl_tools home-advantage analysis"})
    print(f"downloading {url}", file=sys.stderr)
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read()
    dest.write_bytes(data)


def read_csv(path):
    raw = Path(path).read_bytes()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:  # the oldest seasons are latin-1
        text = raw.decode("latin-1")
    return list(csv.DictReader(text.splitlines()))


def num(r, key):
    try:
        return int(float(r.get(key) or 0))
    except ValueError:
        return 0


def load_season(season, cache):
    gw = cache / season / "merged_gw.csv"
    fetch(f"{BASE}/{season}/gws/merged_gw.csv", gw)
    rows = read_csv(gw)
    positions = None
    if rows and "position" not in rows[0]:
        raw = cache / season / "players_raw.csv"
        fetch(f"{BASE}/{season}/players_raw.csv", raw)
        positions = {r["id"]: POSITIONS.get(int(r["element_type"])) for r in read_csv(raw)}
    out, fixtures, unknown = [], {}, 0
    for r in rows:
        pos = r["position"] if positions is None else positions.get(r["element"])
        if pos == "GK":
            pos = "GKP"
        if pos not in POS_NAMES:
            unknown += 1
            continue
        home = r["was_home"].strip().lower() in ("true", "1")
        out.append(Row(season, r["element"], pos, num(r, "minutes"), num(r, "total_points"), home,
                       num(r, "goals_scored"), num(r, "assists"), num(r, "clean_sheets"),
                       num(r, "goals_conceded"), num(r, "saves"), num(r, "bonus"),
                       num(r, "yellow_cards"), num(r, "red_cards"), num(r, "own_goals"),
                       num(r, "penalties_missed"), num(r, "penalties_saved")))
        try:  # one entry per match, for the team-level context
            fixtures[r["fixture"]] = (season, int(r["team_h_score"]), int(r["team_a_score"]))
        except (KeyError, ValueError):
            pass
    return out, list(fixtures.values()), unknown


# ---------------------------------------------------------------- statistics

class Acc:
    """Running count, mean and variance."""
    __slots__ = ("n", "s1", "s2")

    def __init__(self):
        self.n = 0
        self.s1 = 0.0
        self.s2 = 0.0

    def add(self, x):
        self.n += 1
        self.s1 += x
        self.s2 += x * x

    @property
    def mean(self):
        return self.s1 / self.n if self.n else float("nan")

    @property
    def var(self):
        return (self.s2 - self.s1 * self.s1 / self.n) / (self.n - 1) if self.n > 1 else float("nan")


def welch(home, away):
    """Home minus away: (difference, 95% half-width)."""
    diff = home.mean - away.mean
    se = math.sqrt(home.var / home.n + away.var / away.n)
    return diff, Z95 * se


def paired(rows, min_each=5):
    """Within-player comparison: each player-season's home minus away mean,
    weighted by how much data each side has. Returns (difference, 95% half-width,
    number of player-seasons)."""
    groups = defaultdict(lambda: ([], []))
    for r in rows:
        groups[(r.season, r.element)][0 if r.home else 1].append(r.points)
    diffs = []
    for h, a in groups.values():
        if len(h) >= min_each and len(a) >= min_each:
            weight = len(h) * len(a) / (len(h) + len(a))
            diffs.append((sum(h) / len(h) - sum(a) / len(a), weight))
    if len(diffs) < 2:
        return float("nan"), float("nan"), len(diffs)
    total_w = sum(w for _, w in diffs)
    mean = sum(d * w for d, w in diffs) / total_w
    se = math.sqrt(sum((w * (d - mean)) ** 2 for d, w in diffs)) / total_w
    return mean, Z95 * se, len(diffs)


def accumulate(rows, keyfn):
    """{key: (home Acc, away Acc)} of points per appearance."""
    out = defaultdict(lambda: (Acc(), Acc()))
    for r in rows:
        key = keyfn(r)
        if key is not None:
            out[key][0 if r.home else 1].add(r.points)
    return out


def components(r):
    """Split a row's points by source, using FPL's scoring rules; whatever the
    rules don't explain (e.g. 2025-26 defensive contributions) goes to Other."""
    full = r.minutes >= 60
    parts = {
        "Appearance (1 or 2 for minutes)": (2 if full else 1) if r.minutes > 0 else 0,
        "Goals": r.goals * GOAL_PTS[r.pos],
        "Assists": 3 * r.assists,
        "Clean sheets": CS_PTS[r.pos] * r.cs if full else 0,
        "Goals conceded": -(r.gc // 2) if full and r.pos in ("GKP", "DEF") else 0,
        "Saves": r.saves // 3 if r.pos == "GKP" else 0,
        "Bonus": r.bonus,
        "Cards, own goals, penalties": -r.yc - 3 * r.rc - 2 * r.og - 2 * r.pm + 5 * r.ps,
    }
    parts["Other (e.g. defensive contributions)"] = r.points - sum(parts.values())
    return parts


# ---------------------------------------------------------------- report

def fmt_diff(d, ci):
    return f"{d:+.2f} ±{ci:.2f}"


def table(header, rows):
    lines = ["| " + " | ".join(header) + " |", "|" + "|".join(["---"] + ["---:"] * (len(header) - 1)) + "|"]
    lines += ["| " + " | ".join(str(c) for c in r) + " |" for r in rows]
    return "\n".join(lines)


def compare_row(label, accs):
    home, away = accs
    d, ci = welch(home, away)
    return [label, f"{home.n + away.n:,}", f"{home.mean:.2f}", f"{away.mean:.2f}", fmt_diff(d, ci), f"{100 * d / away.mean:+.0f}%"]


COMPARE_HEAD = ["", "Appearances", "Home", "Away", "Home − away (95% CI)", "Relative"]


def build_report(rows, fixtures, args):
    played = [r for r in rows if r.minutes >= args.min_minutes]
    seasons = sorted({r.season for r in played})
    out = []
    w = out.append

    overall = accumulate(played, lambda r: "all")["all"]
    d, ci = welch(*overall)
    pd, pci, pn = paired(played)
    with_fans = [r for r in played if r.season not in NO_FANS]
    fans = accumulate(with_fans, lambda r: "all")["all"]
    fd, fci = welch(*fans)

    by_pos = accumulate(played, lambda r: r.pos)
    by_season = accumulate(played, lambda r: r.season)

    # Player quality tiers use each player-season's average over all their games.
    per_player = defaultdict(Acc)
    for r in played:
        per_player[(r.season, r.element)].add(r.points)
    tier_of = {}
    for key, acc in per_player.items():
        if acc.n >= 10:
            for lo, hi, label in TIERS:
                if lo <= acc.mean < hi:
                    tier_of[key] = label
    by_tier = accumulate(played, lambda r: tier_of.get((r.season, r.element)))

    # Where the gap comes from.
    sums = {side: defaultdict(float) for side in (True, False)}
    counts = {True: 0, False: 0}
    for r in played:
        counts[r.home] += 1
        for name, v in components(r).items():
            sums[r.home][name] += v
    comp_rows, top = [], []
    for name in components(played[0]):
        h, a = sums[True][name] / counts[True], sums[False][name] / counts[False]
        comp_rows.append([name, f"{h:.3f}", f"{a:.3f}", f"{h - a:+.3f}", f"{100 * (h - a) / (overall[0].mean - overall[1].mean):.0f}%"])
        top.append((h - a, name))
    top.sort(reverse=True)

    hg = sum(h for _, h, _ in fixtures) / len(fixtures)
    ag = sum(a for _, _, a in fixtures) / len(fixtures)
    hcs = 100 * sum(1 for _, _, a in fixtures if a == 0) / len(fixtures)
    acs = 100 * sum(1 for _, h, _ in fixtures if h == 0) / len(fixtures)
    goals_by_season = defaultdict(lambda: [0, 0, 0])
    for season, h, a in fixtures:
        g = goals_by_season[season]
        g[0] += 1
        g[1] += h
        g[2] += a

    scope = f"{len(seasons)} seasons ({seasons[0]} to {seasons[-1]})"
    cond = "every appearance" if args.min_minutes <= 1 else f"appearances of {args.min_minutes}+ minutes"
    w("# FPL points: home vs away\n")
    w(f"Source: vaastav/Fantasy-Premier-League archive of FPL's player data. {scope}, {cond}: "
      f"{len(played):,} player appearances in {len(fixtures):,} matches.\n")
    w("## Headline\n")
    w(f"- Players average **{overall[0].mean:.2f} points at home and {overall[1].mean:.2f} away**: "
      f"**{d:+.2f} per appearance ({100 * d / overall[1].mean:+.0f}%)**, 95% CI ±{ci:.2f}.")
    w(f"- Comparing each player with himself (same season, ≥5 games each way, {pn:,} player-seasons): "
      f"**{pd:+.2f}** (±{pci:.2f}). That the two agree says the gap isn't just down to who happens to play at home.")
    w(f"- Leaving out 2020-21, which was played almost entirely behind closed doors: {fans[0].mean:.2f} vs {fans[1].mean:.2f}, "
      f"**{fd:+.2f}** (±{fci:.2f}).")
    best = max(by_pos.items(), key=lambda kv: welch(*kv[1])[0])
    w(f"- By position the home bonus is biggest for {best[0]} ({welch(*best[1])[0]:+.2f}). A captain's score is doubled, so double any of these for the armband.")
    w(f"- Teams score {hg:.2f} goals at home against {ag:.2f} away, and keep a clean sheet {hcs:.0f}% of the time at home against {acs:.0f}% away. "
      f"Most of the points gap comes from {top[0][1].lower()} and {top[1][1].lower()}.\n")

    w("## By position\n")
    w(table(COMPARE_HEAD, [compare_row(p, by_pos[p]) for p in ("GKP", "DEF", "MID", "FWD") if p in by_pos]) + "\n")

    w("## By player quality\n")
    w("Players grouped by their average points per appearance that season (≥10 appearances), so the gap is "
      "shown for budget players and premiums separately.\n")
    w(table(["Average points per appearance"] + COMPARE_HEAD[1:],
            [compare_row(label, by_tier[label]) for _, _, label in TIERS if label in by_tier]) + "\n")

    w("## By season\n")
    w("The last two columns are average goals per match for the home and away team, as a cross-check on the points.\n")
    season_rows = []
    for s in seasons:
        n, hgoals, agoals = goals_by_season[s]
        label = s + (f" ({CLOSED_DOORS[s]})" if s in CLOSED_DOORS else "")
        season_rows.append(compare_row(label, by_season[s]) + [f"{hgoals / n:.2f}", f"{agoals / n:.2f}"])
    w(table(COMPARE_HEAD + ["Home goals", "Away goals"], season_rows) + "\n")

    w("## Where the extra points come from\n")
    w("Average points per appearance by source, using FPL's scoring rules.\n")
    w(table(["Source", "Home", "Away", "Home − away", "Share of gap"], comp_rows) + "\n")

    w("## Notes\n")
    w("- An appearance is a player who got on the pitch (minutes above the cut-off). Double-gameweek matches count separately.")
    w("- Intervals treat appearances as independent, which understates the uncertainty slightly; the within-player figure is the more cautious one.")
    w("- Quality tiers use the whole season's average, so a player on a lucky home run can land in a higher tier. The effect is small.")
    w("- 2019-20 is shown in full: only its last 92 of 380 matches were played behind closed doors.")
    w("- Early seasons' files lack positions, which are filled in from each season's player list.")
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--seasons", nargs="+", default=SEASONS, help="seasons to include, e.g. 2023-24 2024-25")
    ap.add_argument("--min-minutes", type=int, default=1, help="minimum minutes for an appearance to count (default 1)")
    ap.add_argument("--cache", type=Path, default=Path(__file__).resolve().parent / ".cache", help="download cache folder")
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parent / "home_vs_away.md", help="report file")
    args = ap.parse_args()

    rows, fixtures = [], []
    for season in args.seasons:
        try:
            r, f, unknown = load_season(season, args.cache)
        except (urllib.error.URLError, OSError) as exc:
            sys.exit(f"Couldn't get {season}: {exc}")
        print(f"{season}: {len(r):,} rows" + (f" ({unknown} skipped, position unknown)" if unknown else ""), file=sys.stderr)
        rows += r
        fixtures += f
    report = build_report(rows, fixtures, args)
    args.out.write_text(report + "\n", encoding="utf-8")
    print(report)
    print(f"\nwritten to {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
