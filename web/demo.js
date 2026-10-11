/*
 * Sample gameweek in the exact shape of the FPL API responses, used for the
 * demo mode and the tests. Scores are randomly generated (seeded), not real.
 */
(function (root) {
  'use strict';

  const TEAMS = [
    ['ARS', 'Arsenal'], ['AVL', 'Aston Villa'], ['BOU', 'Bournemouth'], ['BRE', 'Brentford'],
    ['BHA', 'Brighton'], ['BUR', 'Burnley'], ['CHE', 'Chelsea'], ['CRY', 'Crystal Palace'],
    ['EVE', 'Everton'], ['FUL', 'Fulham'], ['LEE', 'Leeds'], ['LIV', 'Liverpool'],
    ['MCI', 'Man City'], ['MUN', 'Man Utd'], ['NEW', 'Newcastle'], ['NFO', "Nott'm Forest"],
    ['SUN', 'Sunderland'], ['TOT', 'Spurs'], ['WHU', 'West Ham'], ['WOL', 'Wolves'],
  ];

  // [name, team, position(1-4), expected points]
  const PLAYERS = [
    ['Raya', 'ARS', 1, 4.2], ['Saliba', 'ARS', 2, 4.6], ['Gabriel', 'ARS', 2, 4.8], ['Timber', 'ARS', 2, 4.3],
    ['Saka', 'ARS', 3, 6.1], ['Rice', 'ARS', 3, 4.9], ['Gyökeres', 'ARS', 4, 5.8],
    ['Martínez', 'AVL', 1, 3.6], ['Konsa', 'AVL', 2, 3.4], ['Rogers', 'AVL', 3, 4.7], ['Watkins', 'AVL', 4, 5.0],
    ['Petrović', 'BOU', 1, 3.2], ['Senesi', 'BOU', 2, 3.6], ['Semenyo', 'BOU', 3, 5.4], ['Evanilson', 'BOU', 4, 3.9],
    ['Kelleher', 'BRE', 1, 3.5], ['Collins', 'BRE', 2, 3.4], ['Damsgaard', 'BRE', 3, 3.9], ['Thiago', 'BRE', 4, 4.8],
    ['Verbruggen', 'BHA', 1, 3.6], ['Dunk', 'BHA', 2, 3.4], ['Mitoma', 'BHA', 3, 4.5], ['Welbeck', 'BHA', 4, 4.0],
    ['Dúbravka', 'BUR', 1, 2.9], ['Esteve', 'BUR', 2, 2.7], ['Anthony', 'BUR', 3, 3.6], ['Flemming', 'BUR', 4, 3.2],
    ['Sánchez', 'CHE', 1, 3.9], ['Cucurella', 'CHE', 2, 4.4], ['James', 'CHE', 2, 4.0], ['Palmer', 'CHE', 3, 6.4],
    ['Enzo', 'CHE', 3, 5.0], ['João Pedro', 'CHE', 4, 5.6],
    ['Henderson', 'CRY', 1, 3.8], ['Muñoz', 'CRY', 2, 4.3], ['Lacroix', 'CRY', 2, 3.7], ['Sarr', 'CRY', 3, 4.6], ['Mateta', 'CRY', 4, 4.9],
    ['Pickford', 'EVE', 1, 3.9], ['Tarkowski', 'EVE', 2, 3.8], ['Ndiaye', 'EVE', 3, 4.4], ['Beto', 'EVE', 4, 3.6],
    ['Leno', 'FUL', 1, 3.4], ['Robinson', 'FUL', 2, 3.5], ['Iwobi', 'FUL', 3, 4.1], ['Jiménez', 'FUL', 4, 3.9],
    ['Perri', 'LEE', 1, 3.1], ['Struijk', 'LEE', 2, 3.0], ['Aaronson', 'LEE', 3, 3.5], ['Calvert-Lewin', 'LEE', 4, 3.7],
    ['Alisson', 'LIV', 1, 4.3], ['Van Dijk', 'LIV', 2, 4.9], ['Frimpong', 'LIV', 2, 4.6], ['Salah', 'LIV', 3, 7.2],
    ['Wirtz', 'LIV', 3, 5.6], ['Gakpo', 'LIV', 3, 5.0], ['Ekitiké', 'LIV', 4, 5.9],
    ['Donnarumma', 'MCI', 1, 4.1], ['Gvardiol', 'MCI', 2, 4.6], ["O'Reilly", 'MCI', 2, 4.4], ['Foden', 'MCI', 3, 5.1],
    ['Reijnders', 'MCI', 3, 5.0], ['Haaland', 'MCI', 4, 7.8],
    ['Lammens', 'MUN', 1, 3.5], ['Dalot', 'MUN', 2, 3.6], ['B.Fernandes', 'MUN', 3, 5.8], ['Mbeumo', 'MUN', 3, 5.7], ['Šeško', 'MUN', 4, 4.7],
    ['Pope', 'NEW', 1, 4.0], ['Burn', 'NEW', 2, 3.9], ['Hall', 'NEW', 2, 4.0], ['Gordon', 'NEW', 3, 4.9], ['Barnes', 'NEW', 3, 4.2], ['Woltemade', 'NEW', 4, 5.1],
    ['Sels', 'NFO', 1, 3.4], ['Murillo', 'NFO', 2, 3.6], ['Hudson-Odoi', 'NFO', 3, 4.2], ['Wood', 'NFO', 4, 4.6],
    ['Roefs', 'SUN', 1, 3.3], ['Mukiele', 'SUN', 2, 3.1], ['Le Fée', 'SUN', 3, 3.6], ['Isidor', 'SUN', 4, 3.9],
    ['Vicario', 'TOT', 1, 3.8], ['Van de Ven', 'TOT', 2, 4.4], ['Porro', 'TOT', 2, 4.5], ['Kudus', 'TOT', 3, 4.8],
    ['Simons', 'TOT', 3, 4.6], ['Richarlison', 'TOT', 4, 4.2],
    ['Areola', 'WHU', 1, 3.1], ['Wan-Bissaka', 'WHU', 2, 3.4], ['Bowen', 'WHU', 3, 5.0], ['Paquetá', 'WHU', 3, 4.1],
    ['Sá', 'WOL', 1, 3.0], ['Mosquera', 'WOL', 2, 3.0], ['Hwang', 'WOL', 3, 3.6], ['Strand Larsen', 'WOL', 4, 3.9],
  ];

  // [home, away, state, elapsed]. Kick-offs are relative to "now".
  const FIXTURES = [
    ['BRE', 'BHA', 'final'], ['CHE', 'NFO', 'final'], ['EVE', 'FUL', 'final'], ['BUR', 'WOL', 'final'],
    ['MCI', 'BOU', 'bonus'], ['ARS', 'SUN', 'live', 71], ['NEW', 'AVL', 'live', 34],
    ['LIV', 'CRY', 'upcoming'], ['TOT', 'MUN', 'upcoming'], ['LEE', 'WHU', 'upcoming'],
  ];

  // Starting XI in formation order, then bench (GK first). Names must be unique in PLAYERS.
  const MANAGERS = [
    { name: 'Alex Harper', team: 'Haaland Globetrotters', cap: 'Haaland', vice: 'Salah',
      squad: ['Raya', 'Gabriel', 'Van Dijk', 'Cucurella', 'Salah', 'Saka', 'Palmer', 'Semenyo', 'Haaland', 'João Pedro', 'Wood',
        'Kelleher', 'Mbeumo', 'Muñoz', 'Calvert-Lewin'] },
    { name: 'Priya Shah', team: 'Saka Potatoes', cap: 'Saka', vice: 'Haaland', hits: 4,
      squad: ['Pope', 'Saliba', 'Gvardiol', 'Porro', 'Robinson', 'Saka', 'Salah', 'B.Fernandes', 'Gordon', 'Haaland', 'Watkins',
        'Sels', 'Ndiaye', 'Burn', 'Isidor'] },
    { name: 'Tom Reilly', team: 'Palmer Violets', cap: 'Haaland', vice: 'Palmer', chip: '3xc',
      squad: ['Sánchez', 'Gabriel', 'Frimpong', 'Muñoz', 'Palmer', 'Wirtz', 'Kudus', 'Bowen', 'Haaland', 'Gyökeres', 'Mateta',
        'Roefs', 'Rogers', 'Senesi', 'Welbeck'] },
    { name: 'Jess Okafor', team: 'Wirtz Case Scenario', cap: 'Salah', vice: 'Palmer',
      squad: ['Raya', 'Van Dijk', 'Timber', 'Hall', 'Salah', 'Palmer', 'Iwobi', 'Rogers', 'Mitoma', 'Haaland', 'Ekitiké',
        'Dúbravka', 'Hudson-Odoi', 'Esteve', 'Thiago'] },
    { name: 'Ben Carter', team: 'Ctrl Alt Delap', cap: 'Salah', vice: 'Haaland', hits: 8,
      squad: ['Alisson', 'Gabriel', 'Saliba', 'Van de Ven', 'Senesi', 'Salah', 'Saka', 'Foden', 'Haaland', 'Woltemade', 'Šeško',
        'Pickford', 'Sarr', 'Dalot', 'Richarlison'] },
    { name: 'Maya Lewis', team: 'Expected Toulouse', cap: 'Saka', vice: 'Salah', chip: 'bboost',
      squad: ['Donnarumma', 'Cucurella', 'Gabriel', 'Van Dijk', 'Lacroix', 'Saka', 'Salah', 'Palmer', 'Semenyo', 'Haaland', 'Thiago',
        'Pickford', 'Damsgaard', 'Tarkowski', 'Jiménez'] },
  ];

  // Force a couple of situations worth showing: a non-playing starter (auto-sub)
  // and a quiet captain.
  const OVERRIDES = { Iwobi: { minutes: 0 }, 'Calvert-Lewin': { minutes: 0 }, Haaland: { minutes: 90 } };

  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const GOAL_PTS = { 1: 10, 2: 6, 3: 5, 4: 4 };
  const CS_PTS = { 1: 4, 2: 4, 3: 1, 4: 0 };

  const CURRENT = 8;

  /** One gameweek of sample data. Weeks before CURRENT are complete. */
  function make(gw = CURRENT) {
    const r = rng(gw * 7919 + 8);
    const pick = (list, weight) => {
      const total = list.reduce((a, x) => a + weight(x), 0);
      if (!total) return null;
      let v = r() * total;
      for (const x of list) { v -= weight(x); if (v <= 0) return x; }
      return list[list.length - 1];
    };

    const teams = TEAMS.map(([short, name], i) => ({ id: i + 1, short_name: short, name }));
    const teamId = Object.fromEntries(teams.map((t) => [t.short_name, t.id]));
    const elements = PLAYERS.map(([name, team, pos, xp], i) => ({
      id: i + 1, web_name: name, team: teamId[team], element_type: pos, ep_this: xp.toFixed(1),
    }));
    const byName = Object.fromEntries(elements.map((e) => [e.web_name, e]));
    const now = Date.now() - (CURRENT - gw) * 7 * 24 * 3600e3;
    const hour = 3600e3;

    const fixtures = [];
    const liveEls = new Map(elements.map((e) => [e.id, { id: e.id, stats: blankStats(), explain: [] }]));

    FIXTURES.forEach(([h, a, fixtureState, liveElapsed], i) => {
      const state = gw < CURRENT ? 'final' : fixtureState;
      const elapsed = gw < CURRENT ? 90 : liveElapsed;
      const f = {
        id: 1000 + i, event: gw, team_h: teamId[h], team_a: teamId[a],
        kickoff_time: new Date(now + (state === 'upcoming' ? (i - 6) * 2.5 * hour : state === 'live' ? -(elapsed + 15) * 60e3 : -(9 - i) * hour)).toISOString(),
        started: state !== 'upcoming', finished: state === 'final', finished_provisional: state === 'final' || state === 'bonus',
        minutes: state === 'live' ? elapsed : state === 'upcoming' ? 0 : 90,
        team_h_score: null, team_a_score: null, stats: [],
      };
      fixtures.push(f);
      if (state === 'upcoming') return;
      const clock = f.minutes;
      const sides = { h: elements.filter((e) => e.team === f.team_h), a: elements.filter((e) => e.team === f.team_a) };
      const mins = new Map();
      for (const e of [...sides.h, ...sides.a]) {
        const o = OVERRIDES[e.web_name];
        let m;
        if (o && 'minutes' in o) m = o.minutes;
        else if (r() < 0.85) m = clock === 90 && r() < 0.25 ? 60 + Math.floor(r() * 29) : clock;
        else m = clock > 60 && r() < 0.6 ? Math.floor(r() * (clock - 60)) + 1 : 0;
        mins.set(e.id, m);
      }
      const goals = new Map(), assists = new Map();
      const score = { h: 0, a: 0 };
      for (const side of ['h', 'a']) {
        const n = pick([0, 1, 2, 3, 4], (k) => [5, 7, 5, 2.5, 1][k]) * clock / 90;
        for (let g = 0; g < Math.round(n); g++) {
          score[side]++;
          const onPitch = sides[side].filter((e) => mins.get(e.id) > 0);
          const scorer = pick(onPitch, (e) => [0, 0, 1.2, 3, 4.5][e.element_type]);
          if (!scorer) continue;
          goals.set(scorer.id, (goals.get(scorer.id) || 0) + 1);
          if (r() < 0.75) {
            const assister = pick(onPitch.filter((e) => e !== scorer), (e) => [0, 0.1, 1.5, 3, 1.5][e.element_type]);
            if (assister) assists.set(assister.id, (assists.get(assister.id) || 0) + 1);
          }
        }
      }
      f.team_h_score = score.h;
      f.team_a_score = score.a;

      const bps = { h: [], a: [] };
      for (const side of ['h', 'a']) {
        const conceded = side === 'h' ? score.a : score.h;
        for (const e of sides[side]) {
          const m = mins.get(e.id);
          const pos = e.element_type;
          const st = blankStats();
          const ex = [];
          const add = (id, value, points) => { if (value) { st[id] = value; ex.push({ identifier: id, value, points, points_modification: 0 }); } };
          st.minutes = m;
          add('minutes', m, m >= 60 ? 2 : m > 0 ? 1 : 0);
          if (m > 0) {
            add('goals_scored', goals.get(e.id) || 0, (goals.get(e.id) || 0) * GOAL_PTS[pos]);
            add('assists', assists.get(e.id) || 0, (assists.get(e.id) || 0) * 3);
            if (m >= 60 && conceded === 0 && CS_PTS[pos]) add('clean_sheets', 1, CS_PTS[pos]);
            if (pos <= 2 && conceded >= 2) add('goals_conceded', conceded, -Math.floor(conceded / 2));
            if (pos === 1) { const sv = Math.floor(r() * 6); add('saves', sv, Math.floor(sv / 3)); }
            if ((pos === 2 && r() < 0.3) || (pos === 3 && r() < 0.15)) add('defensive_contribution', pos === 2 ? 10 : 12, 2);
            if (r() < 0.1) add('yellow_cards', 1, -1);
            st.bps = (m >= 60 ? 6 : 3) + (goals.get(e.id) || 0) * [0, 12, 12, 18, 24][pos] + (assists.get(e.id) || 0) * 9 +
              (conceded === 0 && pos <= 2 ? 12 : 0) + Math.floor(r() * 14) - (st.yellow_cards ? 3 : 0);
            bps[side].push({ value: st.bps, element: e.id });
          }
          st.total_points = ex.reduce((acc, x) => acc + x.points, 0);
          const le = liveEls.get(e.id);
          le.stats = st;
          le.explain.push({ fixture: f.id, stats: ex });
        }
      }
      bps.h.sort((x, y) => y.value - x.value);
      bps.a.sort((x, y) => y.value - x.value);
      f.stats.push({ identifier: 'bps', h: bps.h, a: bps.a });

      if (f.finished) {
        const all = [...bps.h, ...bps.a].sort((x, y) => y.value - x.value);
        const bonus = [];
        for (const b of all) {
          const rank = 1 + all.filter((o) => o.value > b.value).length;
          if (rank > 3) break;
          const pts = 4 - rank;
          bonus.push({ value: pts, element: b.element });
          const le = liveEls.get(b.element);
          le.stats.bonus = pts;
          le.stats.total_points += pts;
          le.explain[le.explain.length - 1].stats.push({ identifier: 'bonus', value: pts, points: pts, points_modification: 0 });
        }
        f.stats.push({ identifier: 'bonus', h: bonus.filter((b) => byId(b.element).team === f.team_h), a: bonus.filter((b) => byId(b.element).team === f.team_a) });
      }
    });

    function byId(id) { return elements[id - 1]; }

    // Season history is fixed across weeks so the table is consistent.
    const rs = rng(4242);
    const history = {};
    const standings = MANAGERS.map((m, i) => {
      let total = 0;
      const current = [];
      for (let g = 1; g < CURRENT; g++) {
        const points = 38 + Math.floor(rs() * 40);
        total += points;
        current.push({ event: g, points, total_points: total, event_transfers_cost: 0 });
      }
      history[5000 + i] = { current };
      return { id: i + 1, entry: 5000 + i, entry_name: m.team, player_name: m.name, rank: 0, last_rank: 0, total, event_total: 0 };
    }).sort((x, y) => y.total - x.total).map((s, i) => ({ ...s, rank: i + 1, last_rank: i + 1 }));

    const picks = {};
    MANAGERS.forEach((m, i) => {
      const bb = m.chip === 'bboost';
      picks[5000 + i] = {
        active_chip: m.chip || null,
        automatic_subs: [],
        entry_history: { event: gw, points: 0, event_transfers: m.hits ? m.hits / 4 + 1 : 1, event_transfers_cost: m.hits || 0 },
        picks: m.squad.map((name, j) => {
          const el = byName[name];
          if (!el) throw new Error(`Unknown demo player ${name}`);
          const cap = name === m.cap;
          return {
            element: el.id, position: j + 1,
            multiplier: j >= 11 ? (bb ? 1 : 0) : cap ? (m.chip === '3xc' ? 3 : 2) : 1,
            is_captain: cap, is_vice_captain: name === m.vice,
          };
        }),
      };
    });

    return {
      gw,
      bootstrap: {
        events: Array.from({ length: 38 }, (_, i) => ({
          id: i + 1, name: `Gameweek ${i + 1}`, is_current: i + 1 === CURRENT, finished: i + 1 < CURRENT, data_checked: i + 1 < CURRENT,
        })),
        teams, elements,
        element_types: [1, 2, 3, 4].map((id) => ({ id, singular_name_short: ['GKP', 'DEF', 'MID', 'FWD'][id - 1] })),
      },
      fixtures,
      live: { elements: [...liveEls.values()] },
      league: { league: { id: 0, name: 'Sample League' }, standings: { results: standings } },
      picks,
      history,
    };
  }

  function blankStats() {
    return { minutes: 0, goals_scored: 0, assists: 0, clean_sheets: 0, goals_conceded: 0, saves: 0, bonus: 0, bps: 0, total_points: 0 };
  }

  /** Answer API paths from the sample data, as the network source would. */
  function source() {
    const weeks = new Map();
    const week = (gw) => {
      const g = Math.min(Math.max(+gw || CURRENT, 1), CURRENT);
      if (!weeks.has(g)) weeks.set(g, make(g));
      return weeks.get(g);
    };
    return {
      demo: true,
      async get(path) {
        const d = week(CURRENT);
        if (path.startsWith('bootstrap-static')) return d.bootstrap;
        if (path.startsWith('leagues-classic')) return d.league;
        let m = path.match(/^fixtures\/\?event=(\d+)/);
        if (m) return week(m[1]).fixtures;
        m = path.match(/^event\/(\d+)\/live/);
        if (m) return week(m[1]).live;
        m = path.match(/^entry\/(\d+)\/event\/(\d+)\/picks/);
        if (m && d.picks[m[1]]) return week(m[2]).picks[m[1]];
        m = path.match(/^entry\/(\d+)\/history/);
        if (m && d.history[m[1]]) return d.history[m[1]];
        throw new Error(`Sample data has no ${path}`);
      },
    };
  }

  const api = { make, source };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FPLDemo = api;
})(typeof window !== 'undefined' ? window : globalThis);
