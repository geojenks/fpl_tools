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

test('pace projects the average per finished player across all slots, captain twice', () => {
  const m = FPL.buildLeague(world());
  const t = m.teams[0];
  // 8 finished: seven on 2, captain (P1) on 2 + 3 bonus → avg 21/8.
  assert.equal(t.avg, 21 / 8);
  assert.equal(t.projected, (21 / 8) * 12);
  const tc = FPL.buildLeague(world({ chip: '3xc' })).teams[0];
  assert.equal(tc.projected, (21 / 8) * 13);
});
