// Run with: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const FPL = require('../web/fpl.js');
const Demo = require('../web/demo.js');

test('bonus follows FPL tie rules', () => {
  const b = (vals) => [...FPL.bonusFromBps(vals.map((value, i) => ({ element: i + 1, value }))).entries()];
  assert.deepEqual(b([40, 30, 20, 10]), [[1, 3], [2, 2], [3, 1]]);
  assert.deepEqual(b([40, 40, 20, 10]), [[1, 3], [2, 3], [3, 1]]);
  assert.deepEqual(b([40, 30, 30, 10]), [[1, 3], [2, 2], [3, 2]]);
  assert.deepEqual(b([40, 30, 20, 20]), [[1, 3], [2, 2], [3, 1], [4, 1]]);
});

// Minimal world: one finished fixture (bonus pending), one upcoming.
function world({ minutes = {}, points = {}, chip = null, captain = 1, vice = 2 } = {}) {
  const teams = [1, 2, 3, 4].map((id) => ({ id, short_name: 'T' + id, name: 'Team ' + id }));
  // 15-man squad: ids 1..15 → GK, 4 DEF, 4 MID, 2 FWD in XI; bench GK, DEF, MID, FWD.
  const pos = [1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 1, 2, 3, 4];
  const elements = pos.map((p, i) => ({ id: i + 1, web_name: 'P' + (i + 1), team: i < 8 ? 1 : 3, element_type: p, ep_this: '4.0' }));
  const fixtures = [
    { id: 1, team_h: 1, team_a: 2, started: true, finished: false, finished_provisional: true, minutes: 90, kickoff_time: '2026-10-10T14:00:00Z',
      team_h_score: 1, team_a_score: 0, stats: [{ identifier: 'bps', h: [{ element: 1, value: 30 }, { element: 2, value: 20 }], a: [] }] },
    { id: 2, team_h: 3, team_a: 4, started: false, finished: false, finished_provisional: false, minutes: 0, kickoff_time: '2026-10-11T14:00:00Z', stats: [] },
  ];
  const live = {
    elements: elements.map((e) => ({
      id: e.id,
      stats: { minutes: minutes[e.id] ?? (e.team === 1 ? 90 : 0), total_points: points[e.id] ?? (e.team === 1 ? 2 : 0) },
      explain: [],
    })),
  };
  const picks = {
    active_chip: chip,
    automatic_subs: [],
    entry_history: { event_transfers_cost: 0 },
    picks: elements.map((e, i) => ({
      element: e.id, position: i + 1, multiplier: i < 11 ? (e.id === captain ? 2 : 1) : 0,
      is_captain: e.id === captain, is_vice_captain: e.id === vice,
    })),
  };
  // 2.5h after kick-off: full time, bonus not yet confirmed.
  return { now: Date.parse('2026-10-10T16:30:00Z'), bootstrap: { teams, elements, events: [] }, fixtures, live, standings: [{ entry: 9, player_name: 'X', entry_name: 'Y', rank: 1 }], picksByEntry: { 9: picks } };
}

test('provisional bonus is added and flagged until the fixture is confirmed', () => {
  const m = FPL.buildLeague(world());
  const p1 = m.players.player(1);
  assert.equal(p1.bonusProv, 3);
  assert.equal(p1.points, 5);
  assert.equal(p1.provisional, true);
  const t = m.teams[0];
  // Players 1-8 finished: 8×2 + bonus 3 + 2 = 21, captain (1) doubles 5 → +5.
  assert.equal(t.live, 8 * 2 + 3 + 2 + 5);
  assert.equal(t.done.count, 8);
  assert.equal(t.toPlay.count, 3);
});

test('non-playing starter is auto-subbed by the first eligible bench player', () => {
  // Starter 2 (DEF) didn't play; bench DEF 13 is on team 1 and played.
  const w = world({ minutes: { 2: 0, 13: 90 }, points: { 2: 0, 13: 2 } });
  w.bootstrap.elements[12].team = 1;
  const t = FPL.buildLeague(w).teams[0];
  const s2 = t.slots.find((s) => s.player.id === 2);
  const s13 = t.slots.find((s) => s.player.id === 13);
  assert.equal(s2.subOut, true);
  assert.equal(s13.subIn, true);
  assert.equal(s13.mult, 1);
});

test('sub waits when the next bench player has not played yet', () => {
  // Bench GK 12 is yet to play, so non-playing GK 1 can't be resolved.
  const t = FPL.buildLeague(world({ minutes: { 1: 0 }, points: { 1: 0 }, captain: 6 })).teams[0];
  const gk = t.slots.find((s) => s.player.id === 1);
  assert.equal(gk.subPending, true);
  assert.equal(gk.mult, 1);
});

test('vice captain takes the armband when the captain does not play', () => {
  const t = FPL.buildLeague(world({ minutes: { 1: 0 }, points: { 1: 0 } })).teams[0];
  assert.equal(t.slots.find((s) => s.player.id === 2).mult, 2);
  assert.equal(t.slots.find((s) => s.player.id === 1).captainLost, true);
});

test('bench boost counts all 15; triple captain triples', () => {
  const bb = FPL.buildLeague(world({ chip: 'bboost' })).teams[0];
  assert.equal(bb.counted.length, 15);
  const tc = FPL.buildLeague(world({ chip: '3xc' })).teams[0];
  assert.equal(tc.slots[0].mult, 3);
});

test('projection adds a basis for each match still to come', () => {
  const m = FPL.buildLeague({ ...world(), projection: 'xp' });
  const t = m.teams[0];
  // 3 starters yet to play at 4.0 xP each.
  assert.equal(Math.round(t.projected - t.live), 12);
});

test('compare cancels shared players and keeps captaincy differences', () => {
  const d = Demo.make();
  const m = FPL.buildLeague({ bootstrap: d.bootstrap, fixtures: d.fixtures, live: d.live, standings: d.league.standings.results, picksByEntry: d.picks });
  const byName = (n) => m.teams.find((t) => t.entry.player_name === n);
  const c = FPL.compare(byName('Tom Reilly'), byName('Alex Harper'));
  const haaland = c.edgeA.find((r) => r.player.name === 'Haaland');
  assert.equal(haaland.net, 1); // TC ×3 vs C ×2
  assert.ok(c.shared.some((r) => r.player.name === 'Palmer'));
  // Differentials fully explain the live gap.
  const banked = [...c.edgeA, ...c.edgeB].reduce((a, r) => a + r.banked, 0);
  assert.equal(banked - c.a.hits + c.b.hits, c.liveDiff);
});

test('pace adds the manager average for each match still to come', () => {
  const m = FPL.buildLeague(world());
  const t = m.teams[0];
  // 8 finished: P1 (C) 2+3 bonus, P2 2+2 bonus, six on 2 → avg 21/8, banked 5×2 + 4 + 12.
  assert.equal(t.avg, 21 / 8);
  assert.equal(t.projected, 26 + (21 / 8) * 3);
  // A finished week projects exactly its score.
  const d = Demo.make(5);
  const past = FPL.buildLeague({ bootstrap: d.bootstrap, fixtures: d.fixtures, live: d.live, standings: d.league.standings.results, picksByEntry: d.picks });
  for (const team of past.teams) assert.equal(team.projected, team.live);
});

test('ownership counts managers with the player in their scoring line-up', () => {
  const d = Demo.make();
  const m = FPL.buildLeague({ bootstrap: d.bootstrap, fixtures: d.fixtures, live: d.live, standings: d.league.standings.results, picksByEntry: d.picks });
  const id = (n) => d.bootstrap.elements.find((e) => e.web_name === n).id;
  assert.equal(m.ownership.get(id('Haaland')), 6);
  assert.equal(m.ownership.get(id('Wood')), 1);
  const alex = m.teams.find((t) => t.entry.player_name === 'Alex Harper');
  assert.ok(FPL.ownedBy(alex, m.ownership, 1).count >= 1);
});

test('standings add live week points to the total before the week', () => {
  const d = Demo.make();
  const m = FPL.buildLeague({ bootstrap: d.bootstrap, fixtures: d.fixtures, live: d.live, standings: d.league.standings.results, picksByEntry: d.picks });
  const rows = FPL.standingsTable(m.teams, d.history, d.gw);
  for (const r of rows) {
    const hist = d.history[r.team.entry.entry].current;
    assert.equal(r.before, hist[hist.length - 1].total_points);
    assert.equal(r.total, r.before + r.team.live);
  }
  assert.deepEqual(rows.map((r) => r.total), rows.map((r) => r.total).slice().sort((a, b) => b - a));
  assert.equal(rows[0].rank, 1);
});

test('past sample weeks are complete', () => {
  const d = Demo.make(5);
  assert.ok(d.fixtures.every((f) => f.finished));
});

test('ownership filter: up to n includes unique picks, exactly n does not', () => {
  assert.equal(FPL.ownedMatch(1, 2, true), true);
  assert.equal(FPL.ownedMatch(2, 2, true), true);
  assert.equal(FPL.ownedMatch(3, 2, true), false);
  assert.equal(FPL.ownedMatch(1, 2, false), false);
  assert.equal(FPL.ownedMatch(undefined, 6, true), false);
});

test('bonus already in FPL live data is used as is, never added twice', () => {
  // FPL lists a provisional +3 for player 1 (already inside total_points) while the match isn't confirmed.
  const w = world();
  w.live.elements[0].stats.total_points = 5;
  w.live.elements[0].explain = [{ fixture: 1, stats: [{ identifier: 'bonus', value: 3, points: 3 }] }];
  const m = FPL.buildLeague(w);
  const p1 = m.players.player(1);
  assert.equal(p1.points, 5);
  assert.equal(p1.bonusProv, 3); // shown as +3b?
  assert.equal(p1.bonusAdded, 0);
  assert.equal(p1.provisional, true);
  // Player 2 is in the same match: no per-player "confirmed" shortcut, and we don't invent bonus on top of FPL's.
  const p2 = m.players.player(2);
  assert.equal(p2.bonusProv, 0);
  assert.equal(p2.points, 2);
  assert.equal(p2.provisional, true);
});

test('bonus race table ranks BPS and reports the gap to a bonus place', () => {
  const w = world();
  w.fixtures[0].stats = [{ identifier: 'bps', h: [{ element: 1, value: 40 }, { element: 2, value: 30 }, { element: 3, value: 25 }], a: [{ element: 9, value: 20 }, { element: 10, value: 18 }] }];
  const players = FPL.buildPlayers({ bootstrap: w.bootstrap, fixtures: w.fixtures, live: w.live });
  const t = players.bpsTable(1, 9);
  assert.deepEqual(t.rows.map((r) => [r.player.id, r.rank, r.bonus]), [[1, 1, 3], [2, 2, 2], [3, 3, 1], [9, 4, 0], [10, 5, 0]]);
  assert.equal(t.self.rank, 4);
  assert.equal(t.cutoff, 25);
  assert.equal(t.gap, 5);
  assert.equal(players.bpsTable(2, 1), null); // match not started
});

test('matches: status, events and the per-player points breakdown', () => {
  const w = world();
  const f = w.fixtures[0];
  f.stats.push(
    { identifier: 'goals_scored', h: [{ element: 1, value: 2 }], a: [] },
    { identifier: 'assists', h: [{ element: 2, value: 1 }], a: [] },
    { identifier: 'yellow_cards', h: [], a: [{ element: 9, value: 1 }] },
  );
  w.live.elements[0].explain = [{ fixture: 1, stats: [
    { identifier: 'minutes', value: 90, points: 2 },
    { identifier: 'goals_scored', value: 2, points: 12 },
  ] }];
  w.live.elements[1].explain = [{ fixture: 1, stats: [{ identifier: 'minutes', value: 90, points: 2 }] }];
  w.live.elements[4].explain = [{ fixture: 1, stats: [{ identifier: 'minutes', value: 0, points: 0 }] }]; // didn't play
  const m = FPL.buildLeague(w);
  assert.deepEqual(m.matches.map((x) => x.status), ['ft', 'upcoming']); // finished_provisional, then not started
  const first = m.matches[0];
  assert.equal(first.hasEvents, true);
  assert.deepEqual(first.home.events.map((e) => [e.identifier, e.entries[0].player.name, e.entries[0].count]),
    [['goals_scored', 'P1', 2], ['assists', 'P2', 1]]);
  assert.equal(first.away.events[0].identifier, 'yellow_cards');
  assert.equal(first.home.events[0].entries[0].owners, 1); // P1 is in the manager's line-up
  // Rows: only players who played or scored, with FPL's lines plus our provisional bonus.
  assert.deepEqual(first.home.rows.map((r) => r.player.name), ['P1', 'P2']);
  const p1 = first.home.rows[0];
  assert.equal(p1.points, 2 + 12 + 3);
  assert.deepEqual(p1.lines.map((l) => [l.identifier, l.points, !!l.provisional]), [['minutes', 2, false], ['goals_scored', 12, false], ['bonus', 3, true]]);
  assert.equal(first.home.score, 1);
  assert.equal(m.matches[1].home.score, null);
});

test('matches: bonus FPL already lists is flagged provisional until the match is final', () => {
  const w = world();
  w.live.elements[0].explain = [{ fixture: 1, stats: [
    { identifier: 'minutes', value: 90, points: 2 },
    { identifier: 'bonus', value: 3, points: 3 },
  ] }];
  const row = FPL.buildLeague(w).matches[0].home.rows[0];
  assert.equal(row.points, 5); // not added twice
  assert.equal(row.lines.find((l) => l.identifier === 'bonus').provisional, true);
  w.fixtures[0].finished = true;
  const done = FPL.buildLeague(w).matches[0];
  assert.equal(done.status, 'final');
  assert.equal(done.home.rows[0].lines.find((l) => l.identifier === 'bonus').provisional, false);
});

test('bonus counts as confirmed once the match is over and enough time has passed', () => {
  const w = world();
  const at = (iso) => FPL.buildLeague({ ...w, now: Date.parse(iso) });
  // 2.5h after kick-off: still provisional (FPL's `finished` is false, as it can stay for days).
  let m = at('2026-10-10T16:30:00Z');
  assert.equal(m.players.player(1).provisional, true);
  assert.equal(m.matches[0].status, 'ft');
  assert.equal(m.status.key, 'between'); // one match awaits bonus, the other hasn't started
  // Four hours after kick-off, with FPL's flag still false: confirmed, so no provisional marker.
  m = at('2026-10-10T18:00:00Z');
  const p1 = m.players.player(1);
  assert.equal(p1.provisional, false);
  assert.equal(p1.bonusProv, 0);
  assert.equal(m.matches[0].status, 'final');
  // A match that hasn't reached full time is never confirmed, however long since kick-off.
  w.fixtures[0].finished_provisional = false;
  assert.equal(FPL.bonusFinal(w.fixtures[0], Date.parse('2026-10-12T00:00:00Z')), false);
  assert.equal(FPL.bonusFinal({ finished: true }, 0), true);
});

test('saved leagues: add, rename, dedupe, remove, cap', () => {
  let list = FPL.addLeague([], { id: 246924, name: 'The Lads' });
  list = FPL.addLeague(list, { id: '111', name: 'Work' });
  assert.deepEqual(list, [{ id: '246924', name: 'The Lads' }, { id: '111', name: 'Work' }]);
  list = FPL.addLeague(list, { id: '246924', name: 'The Lads 2026' }); // renamed, moved to the end
  assert.deepEqual(list.map((l) => l.name), ['Work', 'The Lads 2026']);
  assert.deepEqual(FPL.removeLeague(list, 111).map((l) => l.id), ['246924']);
  assert.equal(FPL.addLeague([], { id: 5 }).at(0).name, 'League 5'); // unnamed fallback
  const many = Array.from({ length: 40 }, (_, i) => ({ id: String(i), name: 'x' }));
  assert.equal(many.reduce((acc, l) => FPL.addLeague(acc, l, 30), []).length, 30);
});

test('team IDs parse from numbers and FPL links', () => {
  assert.equal(FPL.parseTeamId('123456'), '123456');
  assert.equal(FPL.parseTeamId(' https://fantasy.premierleague.com/entry/123456/event/9 '), '123456');
  assert.equal(FPL.parseTeamId('fantasy.premierleague.com/entry/42/history'), '42');
  assert.equal(FPL.parseTeamId('hello'), '');
  assert.equal(FPL.parseTeamId(''), '');
});

test("a team's leagues skip official leagues and keep rank and size", () => {
  const entry = {
    id: 7, name: 'Team Seven', player_first_name: 'Sam', player_last_name: 'Seven',
    leagues: {
      classic: [
        { id: 314, name: 'Overall', league_type: 's', entry_rank: 4000000, rank_count: 9000000 },
        { id: 246924, name: 'The Lads', league_type: 'x', entry_rank: 1, entry_last_rank: 2, rank_count: 6 },
      ],
      h2h: [{ id: 99, name: 'Head to head', league_type: 'x', entry_rank: 3, rank_count: 8 }],
    },
  };
  const r = FPL.entryLeagues(entry);
  assert.deepEqual(r.team, { id: '7', name: 'Team Seven', manager: 'Sam Seven' });
  assert.deepEqual(r.leagues.map((l) => [l.id, l.kind, l.rank, l.lastRank, l.size]),
    [['246924', 'classic', 1, 2, 6], ['99', 'h2h', 3, null, 8]]);
  assert.deepEqual(FPL.entryLeagues({ id: 1, name: 'x' }).leagues, []); // no leagues block
});

test('projection fills a no-show starter\'s slot with the bench player who will come on', () => {
  // Starter 3 (DEF) finished with no minutes; bench DEF 13 plays in a match that hasn't started.
  const w = world({ minutes: { 3: 0 }, points: { 3: 0 } });
  const t = FPL.buildLeague({ ...w, projection: 'league' }).teams[0];
  const slot = t.slots.find((s) => s.player.id === 3);
  assert.equal(slot.subPending, true);
  assert.equal(slot.replacement.player.id, 13);
  assert.equal(slot.replacementProjected, 4); // FPL's expected points for him: one match still to come
  // The slot is worth exactly that much more than when the sub is expected to score nothing.
  const none = world({ minutes: { 3: 0 }, points: { 3: 0 } });
  none.bootstrap.elements[12].ep_this = '0.0';
  assert.equal(t.projected - FPL.buildLeague({ ...none, projection: 'league' }).teams[0].projected, 4);
});

test('two no-show starters get different replacements, and formation is respected', () => {
  const w = world({ minutes: { 3: 0, 4: 0 }, points: { 3: 0, 4: 0 } });
  const t = FPL.buildLeague(w).teams[0];
  const ids = [3, 4].map((id) => t.slots.find((s) => s.player.id === id).replacement.player.id);
  assert.deepEqual(ids, [13, 14]); // bench order: DEF 13, then MID 14 (GK 12 can't replace an outfielder)
  // Three no-shows are matched to the bench in priority order, each bench player used once.
  const w2 = world({ minutes: { 2: 0, 3: 0, 4: 0 }, points: { 2: 0, 3: 0, 4: 0 } });
  const picks = FPL.buildLeague(w2).teams[0].slots;
  assert.deepEqual([2, 3, 4].map((id) => picks.find((s) => s.player.id === id).replacement.player.id), [13, 14, 15]);
});

test('a starter with no minutes well into a live match is treated as out', () => {
  const w = world({ minutes: { 6: 0 }, points: { 6: 0 } });
  w.fixtures[0].finished_provisional = false;
  w.fixtures[0].minutes = 30;
  // The players who are on have minutes in this fixture; player 6 has none.
  for (const e of w.live.elements) {
    if (e.id <= 8 && e.id !== 6) e.explain = [{ fixture: 1, stats: [{ identifier: 'minutes', value: 30, points: 1 }] }];
  }
  const m = FPL.buildLeague({ ...w, projection: 'league' });
  const out = m.teams[0].slots.find((s) => s.player.id === 6);
  assert.equal(out.player.likelyOut, true);
  assert.equal(out.subOut, false); // not certain, so no auto-sub is marked
  assert.ok(out.replacement); // but the projection expects one
  assert.equal(out.projected, 0); // nothing more is added for a player who isn't on
  // A player who is on keeps getting credit for the time left.
  const on = m.teams[0].slots.find((s) => s.player.id === 1);
  assert.ok(on.projected > on.player.points);
});

// bootstrap-static's chips for 2026-27: every chip once in each half of the season.
const CHIP_WINDOWS = [
  { name: 'wildcard', start_event: 2, stop_event: 19 }, { name: 'wildcard', start_event: 20, stop_event: 38 },
  { name: 'freehit', start_event: 2, stop_event: 19 }, { name: 'bboost', start_event: 1, stop_event: 19 },
  { name: '3xc', start_event: 1, stop_event: 19 }, { name: 'freehit', start_event: 20, stop_event: 38 },
  { name: 'bboost', start_event: 20, stop_event: 38 }, { name: '3xc', start_event: 20, stop_event: 38 },
];

test('chips: played this week, spent earlier, or still to use', () => {
  const used = [{ name: '3xc', event: 3 }, { name: 'wildcard', event: 5 }, { name: 'freehit', event: 9 }];
  const at = (gw, active) => Object.fromEntries(FPL.chipStatus(CHIP_WINDOWS, used, gw, active).map((c) => [c.short, c.state + (c.usedGw ? `@${c.usedGw}` : '')]));
  assert.deepEqual(at(9, 'freehit'), { WC: 'spent@5', FH: 'active@9', BB: 'available', TC: 'spent@3' });
  // Looking back at gameweek 4: the wildcard and free hit hadn't been played yet.
  assert.deepEqual(at(4, null), { WC: 'available', FH: 'available', BB: 'available', TC: 'spent@3' });
  // The second half of the season brings every chip back.
  assert.deepEqual(at(20, null), { WC: 'available', FH: 'available', BB: 'available', TC: 'available' });
  // The picks say a chip is being played before the history lists it.
  assert.equal(at(10, 'bboost').BB, 'active@10');
  // Order is Wildcard, Free Hit, Bench Boost, Triple Captain; labels and windows are carried along.
  const list = FPL.chipStatus(CHIP_WINDOWS, [], 9, null);
  assert.deepEqual(list.map((c) => c.name), ['wildcard', 'freehit', 'bboost', '3xc']);
  assert.deepEqual([list[0].label, list[0].start, list[0].stop, list[0].windows], ['Wildcard', 2, 19, 2]);
  assert.deepEqual(FPL.chipStatus(null, null, 1, null), []); // no chip data, nothing shown
});
