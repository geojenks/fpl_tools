/*
 * FPL live model: turns raw FPL API responses into per-manager live,
 * played/in-play/to-play splits and projections. Pure functions only, no DOM,
 * so it can be unit-tested under Node (see tests/model.test.js).
 */
(function (root) {
  'use strict';

  const POS = { 1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD', 5: 'MGR' };

  const STAT_LABELS = {
    minutes: 'Minutes played',
    goals_scored: 'Goals',
    assists: 'Assists',
    clean_sheets: 'Clean sheet',
    goals_conceded: 'Goals conceded',
    own_goals: 'Own goals',
    penalties_saved: 'Penalties saved',
    penalties_missed: 'Penalties missed',
    yellow_cards: 'Yellow card',
    red_cards: 'Red card',
    saves: 'Saves',
    bonus: 'Bonus',
    defensive_contribution: 'Defensive contribution',
    bps: 'BPS',
  };

  function statLabel(id) {
    return STAT_LABELS[id] || id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  }

  const fixtureDone = (f) => !!(f.finished || f.finished_provisional);

  /**
   * FPL bonus from BPS: rank 1/2/3 get 3/2/1. A player's rank is one more
   * than the number of players with strictly more BPS, which reproduces the
   * official tie rules (two tied first → 3,3,1; two tied second → 3,2,2).
   */
  function bonusFromBps(entries) {
    const out = new Map();
    const sorted = entries.filter((e) => e.value > 0).sort((a, b) => b.value - a.value);
    for (const e of sorted) {
      const rank = 1 + sorted.filter((o) => o.value > e.value).length;
      if (rank > 3) break;
      out.set(e.element, 4 - rank);
    }
    return out;
  }

  function fixtureBps(fixture) {
    const stat = (fixture.stats || []).find((s) => s.identifier === 'bps');
    if (!stat) return [];
    return [...(stat.h || []), ...(stat.a || [])];
  }

  function explainHasBonus(live, fixtureId) {
    if (!live || !live.explain) return false;
    const fx = live.explain.find((x) => x.fixture === fixtureId);
    return !!(fx && fx.stats.some((s) => s.identifier === 'bonus' && s.points > 0));
  }

  /** Build lookups and a per-player live view for one gameweek. */
  function buildPlayers({ bootstrap, fixtures, live }) {
    const elements = new Map(bootstrap.elements.map((e) => [e.id, e]));
    const teams = new Map(bootstrap.teams.map((t) => [t.id, t]));
    const liveById = new Map((live.elements || []).map((e) => [e.id, e]));

    const fixturesByTeam = new Map();
    for (const f of fixtures) {
      for (const t of [f.team_h, f.team_a]) {
        if (!fixturesByTeam.has(t)) fixturesByTeam.set(t, []);
        fixturesByTeam.get(t).push(f);
      }
    }
    for (const list of fixturesByTeam.values()) {
      list.sort((a, b) => String(a.kickoff_time).localeCompare(String(b.kickoff_time)));
    }

    // Provisional bonus for fixtures that have started but are not confirmed.
    const provBonus = new Map();
    const bpsByFixture = new Map();
    for (const f of fixtures) {
      if (!f.started) continue;
      const bps = fixtureBps(f);
      bpsByFixture.set(f.id, new Map(bps.map((b) => [b.element, b.value])));
      if (!f.finished) provBonus.set(f.id, bonusFromBps(bps));
    }

    const cache = new Map();
    function player(id) {
      if (cache.has(id)) return cache.get(id);
      const el = elements.get(id) || { id, web_name: `#${id}`, team: 0, element_type: 3 };
      const lv = liveById.get(id);
      const stats = (lv && lv.stats) || {};
      const minutes = stats.minutes || 0;
      const basePoints = stats.total_points || 0;
      let bonusProv = 0;

      const fx = (fixturesByTeam.get(el.team) || []).map((f) => {
        const home = f.team_h === el.team;
        const done = fixtureDone(f);
        const bonusConfirmed = !!f.finished || explainHasBonus(lv, f.id);
        const pb = f.started && !bonusConfirmed ? (provBonus.get(f.id) || new Map()).get(id) || 0 : 0;
        bonusProv += pb;
        const bpsMap = bpsByFixture.get(f.id);
        return {
          id: f.id,
          home,
          opponent: teams.get(home ? f.team_a : f.team_h),
          started: !!f.started,
          done,
          live: !!f.started && !done,
          elapsed: f.minutes || 0,
          kickoff: f.kickoff_time,
          score: f.started ? [f.team_h_score, f.team_a_score] : null,
          bonusConfirmed,
          provBonus: pb,
          bps: bpsMap ? bpsMap.get(id) || 0 : null,
          explain: ((lv && lv.explain) || []).find((x) => x.fixture === f.id) || null,
        };
      });

      let state;
      if (!fx.length) state = 'blank';
      else if (fx.some((f) => f.live)) state = 'live';
      else if (fx.some((f) => !f.started)) state = 'upcoming';
      else state = 'done';

      const p = {
        id,
        name: el.web_name,
        pos: el.element_type,
        posName: POS[el.element_type] || '',
        team: teams.get(el.team) || { short_name: '???', name: 'Unknown' },
        minutes,
        basePoints,
        bonusProv,
        points: basePoints + bonusProv,
        state,
        // Definitely won't score this GW: blank, or every fixture over with no minutes.
        dnp: state === 'blank' || (state === 'done' && minutes === 0),
        provisional: fx.some((f) => f.started && !f.bonusConfirmed),
        fixtures: fx,
        xp: parseFloat(el.ep_this) || 0,
        stats,
      };
      cache.set(id, p);
      return p;
    }

    return { player, elements, teams };
  }

  const isGk = (p) => p.pos === 1;

  function formationOk(players) {
    const c = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const p of players) c[p.pos] = (c[p.pos] || 0) + 1;
    return c[1] === 1 && c[2] >= 3 && c[3] >= 2 && c[4] >= 1;
  }

  /**
   * Effective multipliers after official or projected automatic substitutions
   * and vice-captain promotion. Returns 15 slots in pick order.
   */
  function buildTeam(entry, picksResp, playerFn) {
    const chip = picksResp.active_chip || null;
    const benchBoost = chip === 'bboost';
    const slots = picksResp.picks
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((pk) => ({
        position: pk.position,
        bench: pk.position > 11,
        isCaptain: !!pk.is_captain,
        isVice: !!pk.is_vice_captain,
        pickMult: pk.multiplier,
        mult: pk.position <= 11 || benchBoost ? 1 : 0,
        player: playerFn(pk.element),
        subIn: false,
        subOut: false,
        subPending: false,
        captaincy: pk.is_captain ? 'C' : pk.is_vice_captain ? 'V' : null,
        captainProjected: false,
        captainLost: false,
      }));
    // Captain multiplier as picked (2, or 3 with Triple Captain).
    const capSlot = slots.find((s) => s.isCaptain);
    const capMult = capSlot ? Math.max(capSlot.pickMult, chip === '3xc' ? 3 : 2) : 2;
    if (capSlot && capSlot.mult) capSlot.mult = capMult;

    const official = picksResp.automatic_subs || [];
    if (official.length) {
      for (const sub of official) {
        const out = slots.find((s) => s.player.id === sub.element_out);
        const inn = slots.find((s) => s.player.id === sub.element_in);
        if (out) { out.mult = 0; out.subOut = true; }
        if (inn) { inn.mult = Math.max(inn.mult, 1); inn.subIn = true; }
      }
    } else if (!benchBoost) {
      const used = new Set();
      for (const s of slots.filter((x) => !x.bench)) {
        if (!s.player.dnp) continue;
        for (const b of slots.filter((x) => x.bench)) {
          if (used.has(b) || isGk(b.player) !== isGk(s.player) || b.player.dnp) continue;
          if (b.player.minutes === 0) {
            // Next bench player hasn't played yet: can't decide this sub yet.
            s.subPending = true;
            break;
          }
          const xi = slots.filter((x) => x.mult > 0 && x !== s).map((x) => x.player).concat(b.player);
          if (!formationOk(xi)) continue;
          used.add(b);
          s.mult = 0; s.subOut = true;
          b.mult = 1; b.subIn = true;
          break;
        }
      }
    }

    // Vice captain inherits the armband if the captain definitely missed out.
    const vice = slots.find((s) => s.isVice);
    if (capSlot && vice && capSlot.player.dnp && !vice.player.dnp && vice.mult > 0) {
      if (capSlot.mult > 0) capSlot.mult = 1;
      vice.mult = capMult;
      vice.captaincy = 'C';
      vice.captainProjected = !official.length;
      capSlot.captainLost = true;
    }

    const hits = (picksResp.entry_history && picksResp.entry_history.event_transfers_cost) || 0;
    const counted = slots.filter((s) => s.mult > 0);
    const sum = (list, f) => list.reduce((a, s) => a + f(s), 0);

    const done = counted.filter((s) => s.player.state === 'done' || s.player.state === 'blank');
    const played = done.filter((s) => s.player.minutes > 0);
    const inPlay = counted.filter((s) => s.player.state === 'live');
    const toPlay = counted.filter((s) => s.player.state === 'upcoming');

    return {
      entry,
      chip,
      hits,
      slots,
      counted,
      live: sum(counted, (s) => s.mult * s.player.points) - hits,
      confirmedBase: sum(counted, (s) => s.mult * s.player.basePoints) - hits,
      provisional: counted.some((s) => s.player.provisional),
      provBonus: sum(counted, (s) => s.mult * s.player.bonusProv),
      done: { count: done.length, played: played.length, points: sum(done, (s) => s.mult * s.player.points) },
      avg: played.length ? sum(played, (s) => s.player.points) / played.length : null,
      inPlay: { count: inPlay.length, points: sum(inPlay, (s) => s.mult * s.player.points) },
      toPlay: {
        count: toPlay.length,
        captain: toPlay.some((s) => s.mult > 1),
        points: sum(toPlay, (s) => s.mult * s.player.points),
      },
    };
  }

  /** Points a player is expected to finish with, given a per-fixture basis. */
  function projectPlayer(p, basisPerFixture) {
    let extra = 0;
    for (const f of p.fixtures) {
      if (!f.started) extra += basisPerFixture;
      else if (f.live) extra += basisPerFixture * Math.max(0, 90 - f.elapsed) / 90;
    }
    return p.points + extra;
  }

  function basisFor(mode, team, p, leagueAvg) {
    if (mode === 'xp') return p.xp / Math.max(1, p.fixtures.length);
    if (mode === 'own') return team.avg != null ? team.avg : leagueAvg;
    return leagueAvg;
  }

  /**
   * 'pace': finished players count at their real score; every player not yet
   * finished (live or to play) scores the manager's average per finished
   * player, at their multiplier (captain twice). Equals the final score once
   * everyone has played. Null until someone has finished.
   * Other modes: points so far + a basis for each match still to come.
   */
  function project(team, mode, leagueAvg) {
    if (mode === 'pace') {
      if (team.avg == null) {
        for (const s of team.counted) s.projected = null;
        team.pace = null;
        return null;
      }
      let banked = 0, open = 0;
      for (const s of team.counted) {
        const finished = s.player.state === 'done' || s.player.state === 'blank';
        s.projected = finished ? s.player.points : team.avg;
        if (finished) banked += s.mult * s.player.points;
        else open += s.mult;
      }
      team.pace = { banked, open };
      return banked + team.avg * open - team.hits;
    }
    let total = -team.hits;
    for (const s of team.counted) {
      s.projected = projectPlayer(s.player, basisFor(mode, team, s.player, leagueAvg));
      total += s.mult * s.projected;
    }
    return total;
  }

  function leagueAverage(teams) {
    let n = 0, pts = 0;
    for (const t of teams) {
      for (const s of t.counted) {
        if (s.player.state === 'done' && s.player.minutes > 0) { n++; pts += s.player.points; }
      }
    }
    return n ? pts / n : 2;
  }

  function gameweekStatus(fixtures) {
    if (!fixtures.length) return { key: 'none', label: 'No fixtures' };
    if (!fixtures.some((f) => f.started)) return { key: 'upcoming', label: 'Not started' };
    if (fixtures.every((f) => f.finished)) return { key: 'final', label: 'Final' };
    if (fixtures.every(fixtureDone)) return { key: 'bonus', label: 'Bonus pending' };
    if (fixtures.some((f) => f.started && !fixtureDone(f))) return { key: 'live', label: 'Live' };
    return { key: 'between', label: 'In progress' };
  }

  /** Whole-league model for one gameweek. */
  function buildLeague({ bootstrap, fixtures, live, standings, picksByEntry, projection = 'pace' }) {
    const players = buildPlayers({ bootstrap, fixtures, live });
    const teams = standings
      .filter((e) => picksByEntry[e.entry])
      .map((e) => buildTeam(e, picksByEntry[e.entry], players.player));
    const leagueAvg = leagueAverage(teams);
    for (const t of teams) t.projected = project(t, projection, leagueAvg);
    return { teams, leagueAvg, players, status: gameweekStatus(fixtures), projection, ownership: ownership(teams) };
  }

  /** How many managers have each player in their scoring line-up. */
  function ownership(teams) {
    const counts = new Map();
    for (const t of teams) for (const s of t.counted) counts.set(s.player.id, (counts.get(s.player.id) || 0) + 1);
    return counts;
  }

  /** Does an ownership count pass "owned by exactly n" or "up to n" managers? */
  const ownedMatch = (count, n, upTo) => !!count && (upTo ? count <= n : count === n);

  /** A team's players passing the ownership test: count and points they bring. */
  function ownedBy(team, counts, n, upTo = false) {
    const slots = team.counted.filter((s) => ownedMatch(counts.get(s.player.id), n, upTo));
    return { count: slots.length, points: slots.reduce((a, s) => a + s.mult * s.player.points, 0) };
  }

  function competitionRanks(values) {
    return values.map((v) => (v == null ? null : 1 + values.filter((o) => o != null && o > v).length));
  }

  /**
   * Season table after gameweek `gw`: total before the week (from each
   * entry's history) plus this week's live points. Rank movement compares
   * with the table before the week started.
   */
  function standingsTable(teams, historyByEntry, gw) {
    const rows = teams.map((t) => {
      const hist = ((historyByEntry[t.entry.entry] || {}).current || []).filter((h) => h.event < gw);
      const known = !!historyByEntry[t.entry.entry];
      const before = known ? (hist.length ? hist[hist.length - 1].total_points : 0) : null;
      return {
        team: t,
        before,
        total: before == null ? null : before + t.live,
        projTotal: before == null || t.projected == null ? null : before + t.projected,
      };
    });
    const rank = competitionRanks(rows.map((r) => r.total));
    const prev = competitionRanks(rows.map((r) => r.before));
    rows.forEach((r, i) => { r.rank = rank[i]; r.prevRank = prev[i]; });
    return rows.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || b.team.live - a.team.live);
  }

  /**
   * Head-to-head differential: shared players with equal multipliers cancel
   * out; everything else is an edge for one side.
   */
  function compare(a, b) {
    const rows = new Map();
    const add = (team, key) => {
      for (const s of team.counted) {
        if (!rows.has(s.player.id)) rows.set(s.player.id, { player: s.player, a: 0, b: 0, projected: s.projected });
        rows.get(s.player.id)[key] += s.mult;
      }
    };
    add(a, 'a');
    add(b, 'b');
    const all = [...rows.values()].map((r) => {
      const net = r.a - r.b;
      const proj = r.projected != null ? r.projected : r.player.points;
      return { ...r, net, banked: net * r.player.points, toCome: net * (proj - r.player.points) };
    });
    const edgeA = all.filter((r) => r.net > 0).sort(byImpact);
    const edgeB = all.filter((r) => r.net < 0).sort(byImpact);
    const shared = all.filter((r) => r.net === 0);
    const sum = (list, k) => list.reduce((acc, r) => acc + r[k], 0);
    return {
      a, b, edgeA, edgeB, shared,
      liveDiff: a.live - b.live,
      projDiff: a.projected != null && b.projected != null ? a.projected - b.projected : null,
      sharedPoints: shared.reduce((acc, r) => acc + r.a * r.player.points, 0),
      remainingA: edgeA.filter((r) => r.player.state === 'live' || r.player.state === 'upcoming'),
      remainingB: edgeB.filter((r) => r.player.state === 'live' || r.player.state === 'upcoming'),
      toComeDiff: sum(all, 'toCome'),
    };
    function byImpact(x, y) {
      const order = { live: 0, upcoming: 1, done: 2, blank: 3 };
      return order[x.player.state] - order[y.player.state] || Math.abs(y.net) - Math.abs(x.net) || y.player.points - x.player.points;
    }
  }

  const api = {
    POS, statLabel, bonusFromBps, buildPlayers, buildTeam, buildLeague, compare,
    projectPlayer, leagueAverage, gameweekStatus, formationOk, fixtureDone,
    ownership, ownedBy, ownedMatch, standingsTable,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FPL = api;
})(typeof window !== 'undefined' ? window : globalThis);
