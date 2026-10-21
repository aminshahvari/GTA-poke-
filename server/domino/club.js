// Domino tournaments in one club: registration, teams, bracket or pods, physical tables, match clocks and the
// Smart Scorepad record. One instance per club, made with that club's scoped store (server/clubs.js), so every read
// and write stays inside the club. Nothing here reads or writes poker data: poker tournaments, points, stats and the
// leaderboard are untouched, and domino stats are kept under their own keys.
//
// Storage (additive kv keys in the club's scope; see docs/domino/DESIGN.md):
//   dom:t:<tid>        a tournament { id, name, rules, structure, podSize, advance, playoff, tables, roundMin, status, entrants, teams,
//                      matches: [bracket/pod places], createdAt, startedAt, endedAt, by }
//   dom:m:<mid>        a match: its append-only event record (server/domino/match.js)
//   dom:stats:<uid>    { played, won, lost, hands, points } domino only
//   dom:log:<t>-<rnd>  director actions (create, start, cancel, override, team changes), append-only
//   dom:current        the id of the tournament the club shows
const crypto = require('crypto');
const rules = require('./rules');
const M = require('./match');
const B = require('./bracket');

const fail = (status, msg) => Object.assign(new Error(msg), { status });
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const ROUND_MIN = [0, 20, 30, 45, 60], TABLES_MAX = 50, ENTRANTS_MAX = 128;

module.exports = function makeDomino(store, hooks = {}){
  const h = { changed(){}, canHost: () => true, isOwner: () => false, now: () => Date.now(), ...hooks };
  const T = id => store.get('dom:t:' + id);
  const saveT = t => store.set('dom:t:' + t.id, t);
  const Mget = id => store.get('dom:m:' + id);
  const saveM = m => store.set('dom:m:' + m.id, m);
  const current = () => { const id = store.get('dom:current'); return id ? T(id) : null; };
  const log = (by, action, detail) => { const at = h.now(); store.set(`dom:log:${String(at).padStart(15, '0')}-${crypto.randomBytes(4).toString('hex')}`, { at, by, action, ...detail }); };
  const director = u => { if(!u || !h.isOwner(u)) throw fail(403, 'Only the club director can do that.'); };
  const member = u => { if(!u || u.removed) throw fail(403, 'Sign in as a member of this club.'); };
  const nameOf = uid => { const x = store.get('user:' + uid); return x ? x.name : 'Former member'; };
  const active = t => t && (t.status === 'registering' || t.status === 'running');

  // ---------- director: create, teams, start, cancel ----------
  function create(d, u){
    director(u);
    if(!h.canHost()) throw fail(403, 'Tournaments are run by Blindrise. Your members play them in the Blindrise Open.');
    if(active(current())) throw fail(400, 'Finish or cancel the current domino tournament first.');
    const r = rules.make(d || {});
    const structure = d.structure === 'pods' ? 'pods' : 'elim';
    const podSize = structure === 'pods' ? Math.round(+d.podSize || 4) : null;
    if(structure === 'pods' && !(podSize >= 3 && podSize <= 8)) throw fail(400, 'A pod has 3 to 8 teams.');
    // pods can feed a knockout playoff: the top 1 or 2 of each pod go through (0 = pods only)
    const advance = structure === 'pods' ? Math.round(+d.advance || 0) : 0;
    if(![0, 1, 2].includes(advance)) throw fail(400, 'Pick how many from each pod go to the playoff (none, 1 or 2).');
    const tables = Math.round(+d.tables || 0); if(!(tables >= 1 && tables <= TABLES_MAX)) throw fail(400, `Say how many tables you have (1 to ${TABLES_MAX}).`);
    const roundMin = d.roundMin == null ? 0 : +d.roundMin; if(!ROUND_MIN.includes(roundMin)) throw fail(400, 'Pick a match time from the list.');
    const name = clean(d.name, 60) || `${r.name} ${r.format === 'pairs' ? 'Partnership' : 'Heads-up'}`;
    const id = 'd' + crypto.randomBytes(5).toString('hex');
    const t = { id, name, rules: r, structure, podSize, advance, playoff: false, tables, roundMin, status: 'registering', entrants: [], teams: [], matches: [], pods: null, createdAt: h.now(), by: u.id };
    saveT(t); store.set('dom:current', id); log(u.id, 'create', { tid: id, name });
    h.changed(); return view(u);
  }
  function join(d, u){
    member(u); const t = current();
    if(!t || t.status !== 'registering') throw fail(400, 'Registration is not open.');
    if(t.entrants.some(e => e.uid === u.id)) return view(u);
    if(t.entrants.length >= ENTRANTS_MAX) throw fail(400, 'This tournament is full.');
    saveT({ ...t, entrants: [...t.entrants, { uid: u.id, at: h.now() }] }); h.changed(); return view(u);
  }
  function leave(d, u){
    member(u); const t = current();
    if(!t || t.status !== 'registering') throw fail(400, 'You can only leave before it starts.');
    saveT({ ...t, entrants: t.entrants.filter(e => e.uid !== u.id), teams: t.teams.filter(x => !x.members.includes(u.id)) }); h.changed(); return view(u);
  }
  // Partnerships: random pairs, or the director's own pairs (every registered player exactly once).
  function teams(d, u){
    director(u); const t = current();
    if(!t || t.status !== 'registering') throw fail(400, 'Teams are set before the start.');
    if(t.rules.perSide !== 2) throw fail(400, 'Heads-up has no partnerships.');
    let pairs;
    if(d.mode === 'manual'){
      pairs = Array.isArray(d.pairs) ? d.pairs : [];
      const ids = pairs.flat(), reg = new Set(t.entrants.map(e => e.uid));
      if(pairs.some(p => !Array.isArray(p) || p.length !== 2) || new Set(ids).size !== ids.length || ids.some(x => !reg.has(x)) || ids.length !== reg.size)
        throw fail(400, 'Pair every registered player exactly once.');
    } else {
      const ids = shuffle(t.entrants.map(e => e.uid));
      if(ids.length % 2) throw fail(400, 'An odd number registered: one more player is needed, or one must leave.');
      pairs = []; for(let i = 0; i < ids.length; i += 2) pairs.push([ids[i], ids[i + 1]]);
    }
    saveT({ ...t, teams: pairs.map((p, i) => ({ id: 'T' + (i + 1), members: p })) });
    log(u.id, 'teams', { tid: t.id, mode: d.mode === 'manual' ? 'manual' : 'random' }); h.changed(); return view(u);
  }
  function shuffle(a){ a = [...a]; for(let i = a.length - 1; i > 0; i--){ const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function start(d, u){
    director(u); const t = current();
    if(!t || t.status !== 'registering') throw fail(400, 'There is no tournament waiting to start.');
    if(!h.canHost()) throw fail(403, 'Tournaments are run by Blindrise. Your members play them in the Blindrise Open.');
    let tm = t.teams;
    if(t.rules.perSide === 1) tm = shuffle(t.entrants.map(e => e.uid)).map((uid, i) => ({ id: 'T' + (i + 1), members: [uid] }));
    else if(!tm.length || tm.flatMap(x => x.members).length !== t.entrants.length) throw fail(400, 'Set the partnerships first.');
    const need = t.structure === 'pods' ? 3 : 2;
    if(tm.length < need) throw fail(400, `At least ${need} ${t.rules.perSide === 2 ? 'teams' : 'players'} are needed.`);
    const s = t.structure === 'pods' ? B.pods(tm, t.podSize) : B.elimination(tm);
    if(t.advance){
      const smallest = Math.min(...s.pods.map(p => p.teams.length));
      if(s.pods.length * t.advance < 2) throw fail(400, 'The playoff needs at least 2 teams: send 2 from each pod, or have more pods.');
      if(smallest <= t.advance) throw fail(400, 'Each pod needs more teams than it sends to the playoff.');
    }
    const next = { ...t, teams: tm, matches: s.matches, pods: s.pods || null, status: 'running', startedAt: h.now() };
    for(const p of s.matches) saveM(M.create({ id: t.id + '-' + p.id, tid: t.id, round: p.round, slot: p.slot, sides: sidesOf(next, p), rules: t.rules }));
    if(t.structure === 'elim'){ B.byes(next.matches, id => started(next, id)); syncSides(next); }
    saveT(next); log(u.id, 'start', { tid: t.id, teams: tm.length });
    seat(next); h.changed(); return view(u);
  }
  function cancel(d, u){
    director(u); const t = current();
    if(!active(t)) throw fail(400, 'There is no domino tournament to cancel.');
    saveT({ ...t, status: 'cancelled', endedAt: h.now() }); log(u.id, 'cancel', { tid: t.id, reason: clean(d && d.reason, 300) || null });
    h.changed(); return view(u);
  }

  // ---------- structure helpers ----------
  const teamOf = (t, id) => t.teams.find(x => x.id === id);
  const sidesOf = (t, p) => p.teams.map(id => id ? teamOf(t, id).members : []);
  const started = (t, pid) => { const m = Mget(t.id + '-' + pid); return !!m && !['waiting', 'ready'].includes(m.status); };
  // copy teams placed by the bracket into their scoring matches (only matches that have not started)
  function syncSides(t){
    for(const p of t.matches){
      if(p.bye) { const m = Mget(t.id + '-' + p.id); if(m && m.status !== 'final') saveM({ ...m, status: 'final', result: { winner: p.teams[0] ? 0 : 1, scores: [0, 0], by: 'bye' } }); continue; }
      const m = Mget(t.id + '-' + p.id); if(!m || !['waiting', 'ready'].includes(m.status)) continue;
      const sides = p.teams.map(id => id ? teamOf(t, id).members : []);
      if(JSON.stringify(sides) !== JSON.stringify(m.sides)) saveM({ ...m, sides, status: sides[0].length && sides[1].length ? 'ready' : 'waiting' });
    }
  }
  // Physical tables: each match being played holds one numbered table; ready matches take free tables in bracket
  // order (lower rounds first) and start their clocks. A match with no free table waits, and shows "waiting for a table".
  function seat(t){
    if(t.status !== 'running') return;
    const ms = t.matches.map(p => Mget(t.id + '-' + p.id)).filter(Boolean);
    const busy = new Set(ms.filter(m => ['live', 'review', 'disputed'].includes(m.status)).map(m => m.table));
    // a player can only be at one table: a ready match waits while any of its players is still playing elsewhere
    const playing = new Set(ms.filter(m => ['live', 'review', 'disputed'].includes(m.status)).flatMap(m => m.sides.flat()));
    const ready = ms.filter(m => m.status === 'ready').sort((a, b) => a.round - b.round || a.slot - b.slot);
    for(const m of ready){
      if(m.sides.flat().some(x => playing.has(x))) continue;
      let n = 1; while(busy.has(n) && n <= t.tables) n++;
      if(n > t.tables) break;
      busy.add(n); m.sides.flat().forEach(x => playing.add(x));
      saveM(M.start({ ...m, table: n }, h.now(), t.roundMin));
    }
  }
  // a match became final: stats once, the winner moves on, tables free up, and the tournament may be over
  function finished(t, m){
    if(m.counted || (m.result && m.result.by === 'bye')) return;
    const p = t.matches.find(x => t.id + '-' + x.id === m.id);
    saveM({ ...m, counted: true });
    const { scores, hands } = M.score(m);
    m.sides.forEach((side, i) => side.forEach(uid => {
      const s = store.get('dom:stats:' + uid) || { played: 0, won: 0, lost: 0, hands: 0, points: 0 };
      store.set('dom:stats:' + uid, { played: s.played + 1, won: s.won + (m.result.winner === i ? 1 : 0), lost: s.lost + (m.result.winner === i ? 0 : 1), hands: s.hands + hands, points: s.points + scores[i] });
    }));
    if(p && knockout(t, p)) { B.advance(t.matches, p.id, p.teams[m.result.winner], id => started(t, id)); syncSides(t); }
    const all = t.matches.map(x => Mget(t.id + '-' + x.id));
    let done = all.every(x => x && x.status === 'final');
    if(done && t.advance && !t.playoff){ buildPlayoff(t); done = false; }
    saveT(done ? { ...t, status: 'finished', endedAt: h.now() } : t);
    if(!done) seat(T(t.id));
  }
  // An override can change the winner of a match that was already final and counted. Stats move with it, and the
  // bracket takes the new winner only while the next match has not started (otherwise the director is told).
  function recount(t, before, after){
    if(before.result && before.result.by === 'bye') return; // a bye is never counted, so there is nothing to move
    if(!before.counted) return finished(t, after);
    const { scores, hands } = M.score(after);
    before.sides.forEach((side, i) => side.forEach(uid => {
      const s = store.get('dom:stats:' + uid); if(!s) return;
      const was = before.result.winner === i, now = after.result.winner === i;
      store.set('dom:stats:' + uid, { ...s, won: s.won - (was ? 1 : 0) + (now ? 1 : 0), lost: s.lost - (was ? 0 : 1) + (now ? 0 : 1), hands: s.hands - M.score(before).hands + hands, points: s.points - M.score(before).scores[i] + scores[i] });
    }));
    const p = t.matches.find(x => t.id + '-' + x.id === after.id);
    if(p && knockout(t, p)){ B.advance(t.matches, p.id, p.teams[after.result.winner], id => started(t, id)); syncSides(t); saveT(t); }
    // a pod result changed after the playoff was drawn but before any playoff match began: draw it again
    else if(p && t.playoff && !p.stage){ const pods = { ...t, matches: t.matches.filter(x => !x.stage), playoff: false }; buildPlayoff(pods); saveT(pods); seat(T(t.id)); }
  }
  // ---------- pods into a playoff ----------
  const knockout = (t, p) => t.structure === 'elim' || p.stage === 'playoff';
  // a playoff match counts as begun once anything is recorded on it (being seated at a table is not enough; a bye
  // does not count)
  const playoffBegun = t => t.matches.some(p => { if(p.stage !== 'playoff') return false; const m = Mget(t.id + '-' + p.id); return !!m && (m.events.length > 0 || (m.status === 'final' && !(m.result && m.result.by === 'bye'))); });
  function podStandings(t){
    return t.pods.map(pd => ({ pod: pd.id, rows: B.standings(pd, t.matches.filter(p => p.pod === pd.id).map(p => ({ p, m: Mget(t.id + '-' + p.id) }))
      .filter(x => x.m && x.m.status === 'final' && x.m.result).map(x => ({ teams: x.p.teams, winner: x.m.result.winner, scores: x.m.result.scores })), id => +id.slice(1)) }));
  }
  // Every pod is final: the top `advance` of each pod go into a knockout. Seeds: all pod winners first, then the
  // runners-up; within each group the better record seeds higher (wins, points difference, points scored). Two teams
  // from the same pod are kept apart in the first playoff round where a swap allows it.
  // Mutates t (matches, playoff); the caller saves it.
  function buildPlayoff(t){
    const st = podStandings(t), better = (a, b) => (b.wins - a.wins) || ((b.pf - b.pa) - (a.pf - a.pa)) || (b.pf - a.pf) || (+a.id.slice(1) - +b.id.slice(1));
    const qs = [];
    for(let k = 0; k < t.advance; k++) qs.push(...st.map(x => x.rows[k]).filter(Boolean).sort(better));
    const s = B.elimination(qs.map(r => teamOf(t, r.id)), 'k'), podOf = Object.fromEntries(st.flatMap(x => x.rows.map(r => [r.id, x.pod])));
    // no pod meets itself in the first playoff round: swap the lower seed with another first-round match's lower seed
    const first = s.matches.filter(p => p.round === 1), same = p => p.teams[0] && p.teams[1] && podOf[p.teams[0]] === podOf[p.teams[1]];
    for(const p of first) if(same(p)){
      const q = first.find(o => o !== p && o.teams[1] && podOf[o.teams[1]] !== podOf[p.teams[0]] && podOf[p.teams[1]] !== podOf[o.teams[0]]);
      if(q) [p.teams[1], q.teams[1]] = [q.teams[1], p.teams[1]];
    }
    const off = Math.max(0, ...t.matches.map(p => p.round));
    const places = s.matches.map(p => ({ ...p, stage: 'playoff', prounds: s.rounds, pround: p.round, round: p.round + off }));
    t.matches = [...t.matches, ...places]; t.playoff = true;
    for(const p of places) saveM(M.create({ id: t.id + '-' + p.id, tid: t.id, round: p.round, slot: p.slot, sides: sidesOf(t, p), rules: t.rules }));
    for(const p of places) if(p.pround === 1 && p.bye){ const team = p.teams.find(Boolean); if(team) B.advance(t.matches, p.id, team, id => started(t, id)); }
    syncSides(t);
  }

  // ---------- the scorepad ----------
  function op(d, u){
    member(u);
    const t = current(), mid = d && d.mid, m0 = typeof mid === 'string' ? Mget(mid) : null;
    if(!t || !m0 || m0.tid !== t.id) throw fail(404, 'That match was not found.');
    const actor = { uid: u.id, director: h.isOwner(u) };
    // a bye (or a match still waiting for a side) has nothing to score or decide: refuse every op, override included
    if(!m0.sides[0].length || !m0.sides[1].length) throw fail(400, m0.result && m0.result.by === 'bye' ? 'This is a bye: there is no match to score or decide.' : 'This match is still waiting for its players.');
    if(d.op && d.op.type === 'override' && actor.director){
      // check the bracket can take a new winner before recording anything
      const p = t.matches.find(x => t.id + '-' + x.id === mid);
      if(p && knockout(t, p) && p.next && m0.result && m0.result.winner !== d.op.winner && m0.counted && started(t, p.next.id)) throw fail(409, 'The next match already started with the earlier winner. Reset it first.');
    }
    if(d.op && d.op.type === 'override' && actor.director && t.playoff && m0.counted && m0.result && m0.result.winner !== d.op.winner){
      const p = t.matches.find(x => t.id + '-' + x.id === mid);
      if(p && !p.stage && playoffBegun(t)) throw fail(409, 'The playoff has already begun with these pod results.');
    }
    const { match: m, dup } = M.apply(m0, d.op, actor, h.now());
    if(dup) return { match: M.view(m0, h.now()), dup: true };
    saveM(m);
    if(d.op.type === 'override') log(u.id, 'override', { tid: t.id, mid, winner: d.op.winner, reason: m.events[m.events.length - 1].reason });
    if(m.status === 'final'){ const tt = T(t.id); if(m0.status === 'final') recount(tt, m0, Mget(mid)); else finished(tt, Mget(mid)); }
    h.changed();
    return { match: M.view(Mget(mid), h.now()), dup: false };
  }
  // the clock: matches whose time ran out (with the hand finished and a leader) move to review
  function sweep(){
    const t = current(); if(!t || t.status !== 'running') return false;
    let moved = false;
    for(const p of t.matches){ const m = Mget(t.id + '-' + p.id); if(!m) continue; const n = M.tick(m, h.now()); if(n !== m){ saveM(n); moved = true; } }
    if(moved) h.changed();
    return moved;
  }

  // ---------- club rankings (dominoes only) ----------
  // The winner of a finished tournament: its knockout final (straight knockout or the playoff), or the top of the
  // table when it was a single pod. Several pods without a playoff have no single winner. Worked out from the stored
  // results every time, so a director's override after the end is reflected.
  function champion(t){
    if(t.status !== 'finished') return null;
    const fin = t.matches.find(p => knockout(t, p) && !p.next);
    if(fin){ const m = Mget(t.id + '-' + fin.id); return m && m.result ? fin.teams[m.result.winner] : null; }
    if(t.pods && t.pods.length === 1){ const st = podStandings(t)[0]; return st.rows[0] ? st.rows[0].id : null; }
    return null;
  }
  // Ranked by titles, then match wins, then win rate, then matches played. Only players still in the club; no points
  // are invented and nothing is mixed with poker.
  function ranking(u){
    const titles = {};
    for(const t of store.values('dom:t:')){ const c = champion(t), tm = c && teamOf(t, c); if(tm) tm.members.forEach(uid => titles[uid] = (titles[uid] || 0) + 1); }
    const rows = store.keys('dom:stats:').map(k => { const uid = k.slice('dom:stats:'.length), x = store.get('user:' + uid), s = store.get(k);
      return x && !x.removed && s.played ? { uid, name: x.name, titles: titles[uid] || 0, won: s.won, played: s.played } : null; }).filter(Boolean);
    rows.sort((a, b) => (b.titles - a.titles) || (b.won - a.won) || (b.won / b.played - a.won / a.played) || (b.played - a.played) || a.name.localeCompare(b.name));
    rows.forEach((r, i) => r.rank = i + 1);
    const me = u ? rows.find(r => r.uid === u.id) : null;
    return { top: rows.slice(0, 10), me: me && me.rank > 10 ? me : null, players: rows.length };
  }

  // ---------- what members see ----------
  function view(u){
    const t = current(), owner = !!(u && h.isOwner(u));
    if(!t) return { t: null, now: h.now(), owner, canHost: h.canHost(), mine: null, stats: u ? store.get('dom:stats:' + u.id) || null : null, ranking: ranking(u) };
    const team = id => { const x = teamOf(t, id); return x ? { id: x.id, members: x.members.map(uid => ({ uid, name: nameOf(uid) })) } : null; };
    const matches = t.matches.map(p => { const m = Mget(t.id + '-' + p.id); return { ...M.view(m, h.now()), place: p, teams: p.teams.map(team) }; });
    const mine = u ? matches.find(m => m.sides.flat().includes(u.id) && ['ready', 'live', 'review', 'disputed'].includes(m.status)) || null : null;
    const standings = t.pods ? podStandings(t) : null;
    return { now: h.now(), owner, canHost: h.canHost(), t: { id: t.id, name: t.name, rules: t.rules, structure: t.structure, podSize: t.podSize, advance: t.advance || 0, playoff: !!t.playoff, tables: t.tables, roundMin: t.roundMin, status: t.status,
      entrants: t.entrants.map(e => ({ uid: e.uid, name: nameOf(e.uid) })), registered: !!(u && t.entrants.some(e => e.uid === u.id)),
      teams: t.teams.map(x => team(x.id)), matches: t.status === 'registering' ? [] : matches, standings },
      champion: t.status === 'finished' ? team(champion(t)) : null,
      mine: mine ? mine.id : null, stats: u ? store.get('dom:stats:' + u.id) || null : null, ranking: ranking(u) };
  }
  // what the other clubs' Live at Blindrise headline shows of this club's tournament (Issue #25): what it is, its state
  // and counts, and whether this account is in it. No names: those are only on the read-only board a member chooses to watch.
  function card(uid){
    const t = current(); if(!active(t)) return null;
    const playing = t.status === 'running' ? t.matches.filter(p => { const m = Mget(t.id + '-' + p.id); return m && ['live', 'review', 'disputed'].includes(m.status); }).length : 0;
    return { id: t.id, name: t.name, rules: t.rules, status: t.status, count: t.entrants.length, playing, registered: !!uid && t.entrants.some(e => e.uid === uid) };
  }
  const entrants = () => { const t = current(); return active(t) ? t.entrants.map(e => e.uid) : null; };
  // the director's log for this club
  const auditLog = u => { director(u); return store.values('dom:log:').sort((a, b) => a.at - b.at).slice(-100); };

  const api = { dominoState: (d, u) => { member(u); return view(u); }, dominoCreate: create, dominoJoin: join, dominoLeave: leave, dominoTeams: teams,
    dominoStart: start, dominoCancel: cancel, dominoOp: op, dominoLog: (d, u) => auditLog(u) };
  return { api, view, card, entrants, sweep, setHooks: x => Object.assign(h, x) };
};
