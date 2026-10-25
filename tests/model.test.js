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
  return { bootstrap: { teams, elements, events: [] }, fixtures, live, standings: [{ entry: 9, player_name: 'X', entry_name: 'Y', rank: 1 }], picksByEntry: { 9: picks } };
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
