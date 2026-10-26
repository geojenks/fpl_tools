# FPL points: home vs away

Source: vaastav/Fantasy-Premier-League archive of FPL's player data. 10 seasons (2016-17 to 2025-26), every appearance: 108,687 player appearances in 3,800 matches.

## Headline

- Players average **3.09 points at home and 2.73 away**: **+0.36 per appearance (+13%)**, 95% CI ±0.04.
- Comparing each player with himself (same season, ≥5 games each way, 3,924 player-seasons): **+0.36** (±0.04). That the two agree says the gap isn't just down to who happens to play at home.
- Leaving out 2020-21, which was played almost entirely behind closed doors: 3.10 vs 2.70, **+0.40** (±0.04).
- By position the home bonus is biggest for DEF (+0.52). A captain's score is doubled, so double any of these for the armband.
- Teams score 1.56 goals at home against 1.28 away, and keep a clean sheet 30% of the time at home against 23% away. Most of the points gap comes from clean sheets and goals.

## By position

|  | Appearances | Home | Away | Home − away (95% CI) | Relative |
|---|---:|---:|---:|---:|---:|
| GKP | 7,677 | 3.65 | 3.39 | +0.26 ±0.13 | +8% |
| DEF | 36,357 | 3.06 | 2.55 | +0.52 ±0.06 | +20% |
| MID | 49,842 | 2.97 | 2.71 | +0.27 ±0.05 | +10% |
| FWD | 14,811 | 3.25 | 2.92 | +0.33 ±0.10 | +11% |

## By player quality

Players grouped by their average points per appearance that season (≥10 appearances), so the gap is shown for budget players and premiums separately.

| Average points per appearance | Appearances | Home | Away | Home − away (95% CI) | Relative |
|---|---:|---:|---:|---:|---:|
| under 3 | 56,802 | 2.32 | 2.04 | +0.28 ±0.04 | +13% |
| 3 to 4 | 30,215 | 3.65 | 3.23 | +0.41 ±0.07 | +13% |
| 4 to 5 | 11,473 | 4.61 | 4.14 | +0.47 ±0.13 | +11% |
| 5 to 6 | 3,425 | 5.66 | 5.08 | +0.58 ±0.29 | +12% |
| 6 and over | 1,637 | 7.25 | 6.18 | +1.07 ±0.48 | +17% |

## By season

The last two columns are average goals per match for the home and away team, as a cross-check on the points.

|  | Appearances | Home | Away | Home − away (95% CI) | Relative | Home goals | Away goals |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2016-17 | 10,474 | 3.25 | 2.69 | +0.55 ±0.11 | +21% | 1.60 | 1.20 |
| 2017-18 | 10,448 | 3.27 | 2.75 | +0.52 ±0.11 | +19% | 1.53 | 1.15 |
| 2018-19 | 10,480 | 3.17 | 2.76 | +0.41 ±0.12 | +15% | 1.57 | 1.25 |
| 2019-20 (last 92 matches closed doors) | 10,614 | 3.16 | 2.68 | +0.48 ±0.11 | +18% | 1.52 | 1.21 |
| 2020-21 (almost all closed doors) | 10,393 | 3.03 | 3.02 | +0.01 ±0.12 | +0% | 1.35 | 1.34 |
| 2021-22 | 10,485 | 3.14 | 2.85 | +0.30 ±0.12 | +10% | 1.51 | 1.31 |
| 2022-23 | 11,345 | 3.06 | 2.53 | +0.53 ±0.11 | +21% | 1.63 | 1.22 |
| 2023-24 | 11,384 | 2.95 | 2.55 | +0.40 ±0.11 | +16% | 1.80 | 1.48 |
| 2024-25 | 11,566 | 2.74 | 2.67 | +0.08 ±0.11 | +3% | 1.51 | 1.42 |
| 2025-26 | 11,498 | 3.16 | 2.83 | +0.33 ±0.11 | +12% | 1.53 | 1.22 |

## Where the extra points come from

Average points per appearance by source, using FPL's scoring rules.

| Source | Home | Away | Home − away | Share of gap |
|---|---:|---:|---:|---:|
| Appearance (1 or 2 for minutes) | 1.732 | 1.726 | +0.006 | 2% |
| Goals | 0.501 | 0.416 | +0.085 | 24% |
| Assists | 0.285 | 0.236 | +0.049 | 14% |
| Clean sheets | 0.538 | 0.409 | +0.128 | 36% |
| Goals conceded | -0.139 | -0.182 | +0.043 | 12% |
| Saves | 0.040 | 0.051 | -0.011 | -3% |
| Bonus | 0.247 | 0.201 | +0.046 | 13% |
| Cards, own goals, penalties | -0.131 | -0.147 | +0.017 | 5% |
| Other (e.g. defensive contributions) | 0.017 | 0.020 | -0.002 | -1% |

## Notes

- An appearance is a player who got on the pitch (minutes above the cut-off). Double-gameweek matches count separately.
- Intervals treat appearances as independent, which understates the uncertainty slightly; the within-player figure is the more cautious one.
- Quality tiers use the whole season's average, so a player on a lucky home run can land in a higher tier. The effect is small.
- 2019-20 is shown in full: only its last 92 of 380 matches were played behind closed doors.
- Early seasons' files lack positions, which are filled in from each season's player list.
