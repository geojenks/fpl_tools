/* UI for the FPL live league viewer. Depends on FPL (fpl.js) and FPLDemo (demo.js). */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt1 = (n) => (n == null ? '–' : (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, ''));
  const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '±') + fmt1(Math.abs(n));

  const store = {
    get(k, d) { try { const v = localStorage.getItem('fplv.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('fplv.' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };
  let params;
  try { params = new URLSearchParams(location.search); } catch { params = new URLSearchParams(); }

  const settings = {
    league: params.get('league') || store.get('league', '246924'),
    apiBase: params.get('api') || store.get('apiBase', './api/'),
    me: store.get('me', ''),
    projection: store.get('basis', 'pace'),
    sort: store.get('sort', 'live'),
  };
  const state = {
    demo: params.has('demo') || !!window.FPL_FORCE_DEMO,
    raw: { bootstrap: null, standings: null, leagueName: '', picks: {}, gw: null },
    model: null,
    gw: params.get('gw') ? +params.get('gw') : null,
    compare: null, // { a: entryId, b: entryId }
    updatedAt: null,
    timer: null,
    loading: false,
  };

  // ---------- Team kit colours ----------
  const KITS = {
    ARS: ['#EF0107', '#fff'], AVL: ['#670E36', '#95BFE5'], BOU: ['#DA291C', '#111'], BRE: ['#E30613', '#fff'],
    BHA: ['#0057B8', '#fff'], BUR: ['#6C1D45', '#99D6EA'], CHE: ['#034694', '#fff'], CRY: ['#1B458F', '#fff'],
    EVE: ['#003399', '#fff'], FUL: ['#111111', '#fff'], IPS: ['#3A64A3', '#fff'], LEE: ['#FFCD00', '#1D428A'],
    LEI: ['#003090', '#FDBE11'], LIV: ['#C8102E', '#fff'], LUT: ['#F78F1E', '#002D62'], MCI: ['#6CABDD', '#0b1b33'],
    MUN: ['#DA291C', '#fff'], NEW: ['#241F20', '#fff'], NFO: ['#DD0000', '#fff'], SHU: ['#EE2737', '#fff'],
    SOU: ['#D71920', '#fff'], SUN: ['#EB172B', '#fff'], TOT: ['#132257', '#fff'], WHU: ['#7A263A', '#1BB1E7'],
    WOL: ['#FDB913', '#231F20'], WAT: ['#FBEE23', '#ED2127'], NOR: ['#00A650', '#FFF200'], MID: ['#E21B23', '#fff'],
    COV: ['#59CBE8', '#0b1b33'], HUL: ['#F5A12D', '#111'], SWA: ['#121212', '#fff'], STK: ['#E03A3E', '#fff'],
  };
  function kitStyle(team) {
    const k = KITS[team.short_name];
    if (k) return `--kit:${k[0]};--kit-ink:${k[1]}`;
    let h = 0;
    for (const c of team.short_name || '') h = (h * 31 + c.charCodeAt(0)) % 360;
    return `--kit:hsl(${h} 55% 38%);--kit-ink:#fff`;
  }

  // ---------- Data ----------
  class HttpError extends Error {
    constructor(status, path) { super(`HTTP ${status} for ${path}`); this.status = status; }
  }
  function netSource(base) {
    const root = base.endsWith('/') ? base : base + '/';
    return {
      demo: false,
      async get(path) {
        const r = await fetch(root + path, { cache: 'no-store' });
        if (!r.ok) throw new HttpError(r.status, path);
        return r.json();
      },
    };
  }
  let source = state.demo ? FPLDemo.source() : netSource(settings.apiBase);

  async function loadStandings() {
    try {
      const d = await source.get(`leagues-classic/${settings.league}/standings/`);
      return { name: d.league.name, results: d.standings.results };
    } catch (e) {
      if (!(e instanceof HttpError) || e.status !== 404) throw e;
      const d = await source.get(`leagues-h2h/${settings.league}/standings/`);
      return { name: d.league.name, results: d.standings.results };
    }
  }

  async function load({ full = false } = {}) {
    if (state.loading) return;
    state.loading = true;
    $('#refresh-btn').disabled = true;
    try {
      const raw = state.raw;
      if (full || !raw.bootstrap) {
        raw.bootstrap = await source.get('bootstrap-static/');
        raw.picks = {};
        raw.standings = null;
      }
      if (!raw.standings) {
        const s = await loadStandings();
        raw.standings = s.results;
        raw.leagueName = s.name;
      }
      const events = raw.bootstrap.events || [];
      const current = events.find((e) => e.is_current) || events.filter((e) => e.finished).pop() || events[0];
      if (state.gw == null) state.gw = current ? current.id : 1;
      raw.maxGw = current ? current.id : state.gw;
      const gw = state.gw;
      if (raw.gw !== gw) { raw.picks = {}; raw.gw = gw; }

      const missing = raw.standings.filter((e) => !raw.picks[e.entry]);
      const [fixtures, live] = await Promise.all([
        source.get(`fixtures/?event=${gw}`),
        source.get(`event/${gw}/live/`),
        ...missing.map((e) => source.get(`entry/${e.entry}/event/${gw}/picks/`)
          .then((p) => { raw.picks[e.entry] = p; })
          .catch((err) => { if (!(err instanceof HttpError && err.status === 404)) throw err; })),
      ]);
      raw.fixtures = fixtures;
      raw.live = live;
      state.updatedAt = new Date();
      rebuild();
      clearBanner();
      if (source.demo) {
        showBanner(window.FPL_DEMO_NOTE || 'Sample data: made-up scores to show the layout. Open Settings to connect your league.', false, !window.FPL_DEMO_NOTE);
      }
      schedule();
    } catch (err) {
      console.error(err);
      const where = source.demo ? 'sample data' : settings.apiBase;
      showBanner(
        `Couldn't load league ${esc(settings.league)} from ${esc(where)} (${esc(err.message)}). ` +
        'FPL only answers through a proxy: run <code>python3 serve.py</code> and open the address it prints, or set your proxy URL in Settings.',
        true, true);
    } finally {
      state.loading = false;
      $('#refresh-btn').disabled = false;
    }
  }

  function rebuild() {
    const r = state.raw;
    state.model = FPL.buildLeague({
      bootstrap: r.bootstrap, fixtures: r.fixtures, live: r.live, standings: r.standings,
      picksByEntry: r.picks, projection: settings.projection,
    });
    render();
  }

  function schedule() {
    clearTimeout(state.timer);
    const key = state.model && state.model.status.key;
    if (key === 'live' || key === 'bonus' || key === 'between') {
      state.timer = setTimeout(() => { if (!document.hidden) load(); else schedule(); }, 60e3);
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.updatedAt && Date.now() - state.updatedAt > 60e3) load();
  });

  // ---------- Banner ----------
  function showBanner(html, isError, withActions) {
    const b = $('#banner');
    b.className = 'banner' + (isError ? ' error' : '');
    b.innerHTML = `<p>${html}</p>` + (withActions
      ? (source.demo ? '<button type="button" class="btn" data-act="settings">Connect league</button>'
        : '<button type="button" class="btn" data-act="settings">Settings</button><button type="button" class="btn ghost" data-act="demo">Show sample data</button>')
      : '');
    b.hidden = false;
  }
  function clearBanner() { $('#banner').hidden = true; }
  $('#banner').addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (!act) return;
    if (act.dataset.act === 'demo') useDemo();
    if (act.dataset.act === 'settings') openSettings();
  });

  function useDemo() {
    state.demo = true;
    source = FPLDemo.source();
    state.gw = null;
    state.raw = { bootstrap: null, standings: null, leagueName: '', picks: {}, gw: null };
    load({ full: true });
  }

  // ---------- Render ----------
  const ORDER = { done: 0, blank: 0, live: 1, upcoming: 2 };

  function sortedTeams() {
    const teams = state.model.teams.slice();
    const key = settings.sort;
    const by = {
      live: (t) => -t.live,
      projected: (t) => -(t.projected ?? -999),
      avg: (t) => -(t.avg ?? -1),
      rank: (t) => t.entry.rank,
    }[key];
    return teams.sort((a, b) => by(a) - by(b) || b.live - a.live);
  }

  function render() {
    const m = state.model;
    if (!m) return;
    const r = state.raw;
    $('#league-name').textContent = r.leagueName || 'FPL League Live';
    document.title = (r.leagueName ? r.leagueName + ' · ' : '') + `GW${state.gw} live`;
    $('#gw-label').textContent = `GW ${state.gw}`;
    $('#gw-prev').disabled = state.gw <= 1;
    $('#gw-next').disabled = state.gw >= (r.maxGw || state.gw);
    const st = $('#gw-status');
    st.textContent = m.status.label;
    st.className = 'pill ' + m.status.key;
    $('#updated').textContent = state.updatedAt
      ? state.updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '';
    $('#projection').value = settings.projection;
    $('#sort').value = settings.sort;

    let teams = sortedTeams();
    let cmp = null;
    if (state.compare) {
      const a = m.teams.find((t) => t.entry.entry === state.compare.a);
      const b = m.teams.find((t) => t.entry.entry === state.compare.b);
      if (a && b && a !== b) {
        cmp = FPL.compare(a, b);
        teams = [a, b];
      }
    }
    renderCompare(cmp);
    renderStrip(teams);
    const rankOf = new Map(sortedTeams().map((t, i) => [t.entry.entry, i + 1]));
    $('#board').innerHTML = teams.map((t) => rowHtml(t, rankOf.get(t.entry.entry), cmp)).join('');
    observeSlides();
  }

  function barHtml(team) {
    const segs = team.counted.slice().sort((x, y) => ORDER[x.player.state] - ORDER[y.player.state]).map((s) => {
      const cls = s.player.dnp ? 'dnp' : s.player.state === 'blank' ? 'dnp' : s.player.state;
      return `<i class="${cls}"></i>`;
    });
    return `<div class="bar" aria-hidden="true">${segs.join('')}</div>`;
  }

  const CHIPS = { bboost: ['BB', 'Bench Boost'], '3xc': ['TC', 'Triple Captain'], freehit: ['FH', 'Free Hit'], wildcard: ['WC', 'Wildcard'], manager: ['AM', 'Assistant Manager'] };

  function rowHtml(t, rank, cmp) {
    const e = t.entry;
    const isMe = String(e.entry) === String(settings.me);
    const tags = [];
    if (t.chip) {
      const [short, long] = CHIPS[t.chip] || [t.chip, t.chip];
      tags.push(`<span class="tag chip" title="${esc(long)} played">${esc(short)}</span>`);
    }
    if (t.hits) tags.push(`<span class="tag hit" title="Transfer hit, already taken off">−${t.hits}</span>`);
    if (t.provBonus) tags.push(`<span class="tag provb" title="Includes ${t.provBonus} provisional bonus worked out from live BPS; may change">+${t.provBonus} bonus?</span>`);
    if (cmp) {
      const side = cmp.a === t ? 'a' : 'b';
      tags.unshift(`<span class="tag" style="color:var(--edge-${side});border-color:currentColor">${side.toUpperCase()}</span>`);
    }

    const xi = t.slots.filter((s) => !s.bench);
    const lines = [1, 2, 3, 4].map((pos) => xi.filter((s) => s.player.pos === pos));
    // Anything odd (e.g. a manager slot) goes with forwards.
    const extra = xi.filter((s) => ![1, 2, 3, 4].includes(s.player.pos));
    lines[3] = lines[3].concat(extra);
    const edgeFor = cmp ? edgeMap(cmp, t) : null;

    return `<article class="row${isMe ? ' me' : ''}" id="m-${e.entry}" data-entry="${e.entry}">
      <div class="sum">
        <div class="who"><span class="rank">${rank}</span><b title="${esc(e.player_name)}">${esc(e.player_name)}</b><small title="${esc(e.entry_name)}">${esc(e.entry_name)}</small></div>
        <div class="scoreline">
          <span class="total${t.provisional ? ' prov' : ''}" title="${t.provisional ? 'Includes points not yet final' : 'Live points'}">${t.live}</span>
          <span class="proj" title="${esc(projTitle(t))}">proj <b>${projText(t.projected)}</b></span>
          ${tags.length ? `<span class="tags">${tags.join('')}</span>` : ''}
        </div>
        ${barHtml(t)}
        <div class="splits">
          <span title="Players finished · average points per player who played"><b>${t.done.count}</b> done · avg <b>${fmt1(t.avg)}</b></span>
          <span class="live" title="Players in a match right now · their points"><b>${t.inPlay.count}</b> live${t.inPlay.count ? ` · ${t.inPlay.points}` : ''}</span>
          <span title="Players yet to play"><b>${t.toPlay.count}</b> to play${t.toPlay.captain ? ' (C)' : ''}</span>
        </div>
      </div>
      <div class="xi">${lines.map((l) => `<div class="line">${l.map((s) => cardHtml(s, edgeFor)).join('')}</div>`).join('')}</div>
      <div class="bench"><span class="bench-label">Bench</span>${t.slots.filter((s) => s.bench).map((s) => cardHtml(s, edgeFor)).join('')}</div>
    </article>`;
  }

  function edgeMap(cmp, team) {
    const map = new Map();
    for (const r of cmp.shared) map.set(r.player.id, 'shared');
    for (const r of cmp.edgeA) map.set(r.player.id, 'a');
    for (const r of cmp.edgeB) map.set(r.player.id, 'b');
    map.side = cmp.a === team ? 'a' : 'b';
    return map;
  }

  function kickoffText(iso) {
    if (!iso) return 'TBC';
    const d = new Date(iso);
    return d.toLocaleDateString([], { weekday: 'short' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  }

  function cardHtml(s, edgeFor) {
    const p = s.player;
    const cls = ['card', p.state];
    if (p.dnp) cls.push('dnp');
    if (s.subOut) cls.push('subbed-out');
    if (s.bench && !s.mult) cls.push('benched');
    let edgeAttr = '';
    if (edgeFor && s.mult > 0) {
      const e = edgeFor.get(p.id);
      if (e === 'shared') cls.push('shared');
      else if (e === edgeFor.side) { cls.push('edge'); edgeAttr = ` style="--edge-color:var(--edge-${e})"`; }
    }

    let ptsHtml;
    let meta;
    const next = p.fixtures.find((f) => !f.started);
    if (p.state === 'upcoming' && !p.fixtures.some((f) => f.started)) {
      const f = next;
      ptsHtml = `<span class="pts">${f.home ? '' : '@'}${esc(f.opponent ? f.opponent.short_name : '?')}</span>`;
      meta = kickoffText(f.kickoff);
    } else {
      const shown = s.mult > 0 ? s.mult * p.points : p.points;
      ptsHtml = `<span class="pts">${p.state === 'blank' ? '–' : shown}</span>`;
      if (p.state === 'blank') meta = 'No match';
      else if (p.dnp) meta = s.subOut ? 'DNP · subbed' : 'DNP';
      else if (p.state === 'live') meta = `${p.minutes}'`;
      else meta = `${p.minutes}'`;
      if (p.state === 'upcoming' && next) meta += ` · ${esc(next.opponent ? next.opponent.short_name : '')} next`;
      if (s.subPending) meta = 'DNP · sub?';
      if (p.bonusProv) meta += ` <span class="prov-mark">+${p.bonusProv}b?</span>`;
      else if (p.provisional && p.state === 'done' && !p.dnp) meta += ' <span class="prov-mark">b?</span>';
    }

    let badge = '';
    if (s.captaincy === 'C') badge = `<span class="badge">${s.mult >= 3 ? 'TC' : 'C'}</span>`;
    else if (s.captaincy === 'V') badge = '<span class="badge v">V</span>';
    if (s.captainLost) badge = '<span class="badge lost">C</span>';
    const sub = s.subIn ? '<span class="subm in" title="Auto-sub in">↑</span>' : s.subOut ? '<span class="subm out" title="Auto-sub out">↓</span>' : '';

    const label = `${p.name}, ${p.team.short_name}, ${s.mult > 0 ? s.mult * p.points : p.points} points`;
    return `<button type="button" class="${cls.join(' ')}" data-el="${p.id}" data-mult="${s.mult}" aria-label="${esc(label)}"${edgeAttr}>
      <span class="kit" style="${kitStyle(p.team)}">${esc(p.team.short_name)}</span>
      <span class="nm" title="${esc(p.name)}">${esc(p.name)}</span>${ptsHtml}<span class="meta">${meta}</span>${badge}${sub}
    </button>`;
  }

  // ---------- Mobile strip ----------
  function renderStrip(teams) {
    $('#strip').innerHTML = teams.map((t, i) => `
      <button type="button" data-go="${t.entry.entry}">
        <span class="r">${i + 1}</span>
        <span class="n">${esc(t.entry.player_name)}</span>
        ${barHtml(t)}
        <span class="t${t.provisional ? ' prov' : ''}">${t.live}</span>
        <span class="pj">→${projText(t.projected)}</span>
      </button>`).join('');
  }
  $('#strip').addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (!b) return;
    const row = document.getElementById('m-' + b.dataset.go);
    if (row) $('#board').scrollTo({ left: row.offsetLeft - $('#board').offsetLeft, behavior: 'smooth' });
  });
  let slideObserver;
  function observeSlides() {
    if (!('IntersectionObserver' in window)) return;
    if (slideObserver) slideObserver.disconnect();
    slideObserver = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (en.intersectionRatio < 0.6) continue;
        const id = en.target.dataset.entry;
        for (const b of document.querySelectorAll('#strip [data-go]')) b.setAttribute('aria-current', String(b.dataset.go === id));
      }
    }, { root: $('#board'), threshold: [0.6] });
    document.querySelectorAll('#board .row').forEach((r) => slideObserver.observe(r));
  }

  // ---------- Compare ----------
  function renderCompare(cmp) {
    const panel = $('#compare-panel');
    $('#compare-btn').setAttribute('aria-pressed', String(!!state.compare));
    if (!state.compare) { panel.hidden = true; return; }
    panel.hidden = false;
    const teams = state.model.teams;
    const opt = (sel) => teams.map((t) => `<option value="${t.entry.entry}"${t.entry.entry === sel ? ' selected' : ''}>${esc(t.entry.player_name)}</option>`).join('');
    const head = `<div class="cmp-head">
      <div class="cmp-pick">
        <label class="field" for="cmp-a">A <select id="cmp-a">${opt(state.compare.a)}</select></label>
        <button type="button" class="icon-btn" id="cmp-swap" aria-label="Swap sides">⇄</button>
        <label class="field" for="cmp-b">B <select id="cmp-b">${opt(state.compare.b)}</select></label>
      </div>
      ${cmp ? `<div class="versus"><span class="n a">${cmp.a.live}</span><span>–</span><span class="n b">${cmp.b.live}</span>
        <span class="proj">proj <b>${projText(cmp.a.projected)}</b> – <b>${projText(cmp.b.projected)}</b></span></div>` : ''}
      <span class="spacer"></span>
      <button type="button" class="btn ghost" id="cmp-close">Close compare</button>
    </div>`;
    if (!cmp) { panel.innerHTML = head + '<p class="verdict">Pick two different managers.</p>'; return; }

    const an = cmp.a.entry.player_name, bn = cmp.b.entry.player_name;
    const lead = cmp.liveDiff;
    const leader = lead > 0 ? an : bn, trailer = lead > 0 ? bn : an;
    const remA = cmp.remainingA, remB = cmp.remainingB;
    const capNote = (list) => {
      const c = list.find((r) => Math.abs(r.net) >= 2);
      return c ? `, including ${esc(c.player.name)} ×${Math.abs(c.net)}` : '';
    };
    const verdict = lead === 0
      ? `<b>Level on ${cmp.a.live}.</b> `
      : `<b>${esc(leader)} leads by ${Math.abs(lead)}.</b> `;
    const remaining = `${esc(an)} has ${remA.length} differential${remA.length === 1 ? '' : 's'} playing or still to play${capNote(remA)}; ` +
      `${esc(bn)} has ${remB.length}${capNote(remB)}. `;
    const need = lead === 0 ? '' : `${esc(trailer)} needs their remaining differentials to outscore ${esc(leader)}'s by ${Math.abs(lead) + 1}+ to go ahead. `;
    const projLine = cmp.projDiff == null ? ''
      : `On ${projName()} the projection is ${esc(cmp.projDiff >= 0 ? an : bn)} by ${fmt1(Math.abs(cmp.projDiff))}.`;

    const li = (r, mult) => `<li><span class="dot ${r.player.dnp ? 'dnp' : r.player.state}"></span>
      <span class="nm2">${esc(r.player.name)}<small>${esc(fixtureShort(r.player))}</small></span>
      <span class="x">${mult > 1 ? '×' + mult : ''}</span><span class="p">${r.player.state === 'upcoming' && !r.player.points ? '–' : mult * r.player.points}</span></li>`;
    const pts = (list) => list.reduce((acc, r) => acc + Math.abs(r.net) * r.player.points, 0);
    const col = (cls, title, list, empty) => {
      const open = list.filter((r) => r.player.state === 'live' || r.player.state === 'upcoming');
      const shut = list.filter((r) => !open.includes(r));
      const group = (label, rows, extra) => rows.length
        ? `<h4><span>${label}</span><span>${pts(rows)} pts</span></h4><ul${extra}>${rows.map((r) => li(r, Math.abs(r.net))).join('')}</ul>` : '';
      return `<div class="cmp-col ${cls}">
        <h3><span>${title}</span></h3>
        ${list.length ? group('Playing or to play', open, '') + group('Finished', shut, ' class="banked"') : `<p class="empty">${empty}</p>`}
      </div>`;
    };

    panel.innerHTML = head +
      `<p class="verdict">${verdict}${remaining}${need}${projLine}</p>
      <div class="cmp-cols">
        ${col('a', `${esc(an)}'s edge · want these to score`, cmp.edgeA, 'No differentials.')}
        ${col('b', `${esc(bn)}'s edge · want these to blank`, cmp.edgeB, 'No differentials.')}
        ${col('s', 'Cancelled out · same player, same multiplier', cmp.shared.map((r) => ({ ...r, net: r.a })), 'No shared players.')}
      </div>`;
  }

  function fixtureShort(p) {
    if (p.state === 'blank') return 'no match';
    const f = p.fixtures.find((x) => x.live) || p.fixtures.find((x) => !x.started) || p.fixtures[p.fixtures.length - 1];
    const opp = f.opponent ? f.opponent.short_name : '?';
    if (f.live) return `v ${opp} · ${f.elapsed}'`;
    if (!f.started) return `v ${opp} · ${kickoffText(f.kickoff)}`;
    return p.dnp ? 'DNP' : `v ${opp} · ${p.minutes}'`;
  }
  function projName() {
    return { pace: 'current-pace', league: 'league-average', own: 'own-average', xp: 'FPL expected-points' }[settings.projection] + ' basis';
  }
  const projText = (v) => (v == null ? '–' : Math.round(v));
  function projTitle(t) {
    if (settings.projection !== 'pace') return 'Projected final score';
    if (t.avg == null) return 'Pace: shown once a player has finished';
    const slots = t.counted.reduce((a, s) => a + s.mult, 0);
    return `Pace: avg ${fmt1(t.avg)} × ${slots}${t.hits ? ` − ${t.hits} hit` : ''} = ${fmt1(t.projected)}`;
  }

  function toggleCompare() {
    if (state.compare) { state.compare = null; render(); return; }
    const teams = sortedTeams();
    if (teams.length < 2) return;
    const me = teams.find((t) => String(t.entry.entry) === String(settings.me));
    const a = me || teams[0];
    const b = teams.find((t) => t !== a);
    state.compare = { a: a.entry.entry, b: b.entry.entry };
    render();
    $('#compare-panel').scrollIntoView({ block: 'nearest' });
  }
  $('#compare-btn').addEventListener('click', toggleCompare);
  $('#compare-panel').addEventListener('change', (e) => {
    if (e.target.id === 'cmp-a') state.compare.a = +e.target.value;
    if (e.target.id === 'cmp-b') state.compare.b = +e.target.value;
    render();
  });
  $('#compare-panel').addEventListener('click', (e) => {
    if (e.target.id === 'cmp-close') { state.compare = null; render(); }
    if (e.target.id === 'cmp-swap') { state.compare = { a: state.compare.b, b: state.compare.a }; render(); }
  });

  // ---------- Player breakdown ----------
  $('#board').addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (card) openPlayer(+card.dataset.el, +card.dataset.mult, card.closest('.row').dataset.entry);
  });

  function openPlayer(id, mult, entryId) {
    const m = state.model;
    const p = m.players.player(id);
    const team = m.teams.find((t) => String(t.entry.entry) === String(entryId));
    const slot = team && team.slots.find((s) => s.player.id === id);
    const role = !slot ? '' : slot.subOut ? 'Subbed out (didn\'t play)' : slot.subIn ? 'Auto-subbed in'
      : slot.bench && !slot.mult ? 'On the bench' : mult >= 3 ? 'Triple captain' : mult === 2 ? (slot.captainProjected ? 'Captain (vice promoted)' : 'Captain') : 'Starting';

    const fxHtml = p.fixtures.map((f) => {
      const opp = f.opponent ? f.opponent.short_name : '?';
      const scoreline = f.score ? (f.home
        ? `${p.team.short_name} ${f.score[0]}–${f.score[1]} ${opp}`
        : `${opp} ${f.score[0]}–${f.score[1]} ${p.team.short_name}`)
        : `${f.home ? 'v' : '@'} ${opp}`;
      let st;
      if (!f.started) st = `<span class="st">${esc(kickoffText(f.kickoff))}</span>`;
      else if (f.live) st = `<span class="st live">Live ${f.elapsed}'</span>`;
      else if (!f.bonusConfirmed) st = '<span class="st prov">Finished · bonus not confirmed</span>';
      else st = '<span class="st">Final</span>';
      const rows = ((f.explain && f.explain.stats) || [])
        .filter((x) => x.points || x.identifier === 'minutes')
        .map((x) => `<tr><td>${esc(FPL.statLabel(x.identifier))}</td><td>${x.value}</td><td>${x.points > 0 ? '+' : ''}${x.points}</td></tr>`);
      if (f.provBonus) rows.push(`<tr class="provrow"><td>Bonus (provisional)</td><td>BPS ${f.bps}</td><td>+${f.provBonus}</td></tr>`);
      else if (f.started && !f.bonusConfirmed && f.bps != null) rows.push(`<tr class="provrow"><td>Bonus (provisional)</td><td>BPS ${f.bps}</td><td>0</td></tr>`);
      const body = f.started ? (rows.length ? `<table>${rows.join('')}</table>` : '<p class="owners">No points yet.</p>') : '';
      return `<div class="fx"><h3>${esc(scoreline)} ${st}</h3>${body}</div>`;
    }).join('') || '<div class="fx"><p class="owners">No match this gameweek.</p></div>';

    const owners = m.teams.map((t) => {
      const s = t.slots.find((x) => x.player.id === id);
      if (!s) return null;
      const tag = s.mult >= 3 ? ' (TC)' : s.mult === 2 ? ' (C)' : !s.mult ? ' (bench)' : '';
      return esc(t.entry.player_name) + tag;
    }).filter(Boolean);

    const effMult = mult || 0;
    const totalLine = effMult > 1
      ? `${p.points} × ${effMult} = <b>${p.points * effMult}</b>`
      : `<b>${p.points}</b>`;
    $('#player-dlg').innerHTML = `<div class="pd">
      <div class="pd-head">
        <span class="kit" style="${kitStyle(p.team)}">${esc(p.team.short_name)}</span>
        <div><h2>${esc(p.name)}</h2><div class="sub">${esc(p.posName)} · ${esc(role)}</div></div>
        <button type="button" class="btn ghost pd-close" id="pd-close">Close</button>
      </div>
      ${fxHtml}
      <div class="pd-total"><span>${p.provisional ? 'Points so far (not final)' : 'Points'}${p.bonusProv ? ` · incl. ${p.bonusProv} provisional bonus` : ''}</span><span>${totalLine}</span></div>
      ${owners.length ? `<p class="owners">Owned in this league by ${owners.join(', ')}.</p>` : ''}
    </div>`;
    const dlg = $('#player-dlg');
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    $('#pd-close').focus();
  }
  $('#player-dlg').addEventListener('click', (e) => {
    if (e.target.id === 'pd-close' || e.target === $('#player-dlg')) $('#player-dlg').close();
  });

  // ---------- Settings ----------
  function openSettings() {
    $('#set-league').value = settings.league;
    $('#set-api').value = settings.apiBase;
    const teams = state.model ? state.model.teams : [];
    $('#set-me').innerHTML = '<option value="">None</option>' +
      teams.map((t) => `<option value="${t.entry.entry}"${String(t.entry.entry) === String(settings.me) ? ' selected' : ''}>${esc(t.entry.player_name)} · ${esc(t.entry.entry_name)}</option>`).join('');
    const dlg = $('#settings-dlg');
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }
  $('#settings-btn').addEventListener('click', openSettings);
  $('#set-cancel').addEventListener('click', () => $('#settings-dlg').close());
  $('#set-demo').addEventListener('click', () => { $('#settings-dlg').close(); useDemo(); });
  $('#settings-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const league = $('#set-league').value.trim();
    const api = $('#set-api').value.trim() || './api/';
    const changedSource = league !== String(settings.league) || api !== settings.apiBase || state.demo;
    settings.league = league;
    settings.apiBase = api;
    settings.me = $('#set-me').value;
    store.set('league', league);
    store.set('apiBase', api);
    store.set('me', settings.me);
    $('#settings-dlg').close();
    if (changedSource) {
      state.demo = false;
      source = netSource(api);
      state.gw = null;
      state.raw = { bootstrap: null, standings: null, leagueName: '', picks: {}, gw: null };
      load({ full: true });
    } else {
      render();
    }
  });

  // ---------- Controls ----------
  $('#projection').addEventListener('change', (e) => {
    settings.projection = e.target.value;
    store.set('basis', settings.projection);
    rebuild();
  });
  $('#sort').addEventListener('change', (e) => {
    settings.sort = e.target.value;
    store.set('sort', settings.sort);
    render();
  });
  $('#refresh-btn').addEventListener('click', () => load());
  $('#gw-prev').addEventListener('click', () => { if (state.gw > 1) { state.gw--; load(); } });
  $('#gw-next').addEventListener('click', () => { state.gw++; load(); });

  load();
})();
