// Domino tournaments in one club: registration, teams, bracket or pods, physical tables, match clocks and the
// Smart Scorepad record. One instance per club, made with that club's scoped store (server/clubs.js), so every read
// and write stays inside the club. Nothing here reads or writes poker data: poker tournaments, points, stats and the
// leaderboard are untouched, and domino stats are kept under their own keys.
//
// Storage (additive kv keys in the club's scope; see docs/domino/DESIGN.md):
//   dom:t:<tid>        a tournament { id, name, rules, structure, podSize, tables, roundMin, status, entrants, teams,
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
    const tables = Math.round(+d.tables || 0); if(!(tables >= 1 && tables <= TABLES_MAX)) throw fail(400, `Say how many tables you have (1 to ${TABLES_MAX}).`);
    const roundMin = d.roundMin == null ? 0 : +d.roundMin; if(!ROUND_MIN.includes(roundMin)) throw fail(400, 'Pick a match time from the list.');
    const name = clean(d.name, 60) || `${r.name} ${r.format === 'pairs' ? 'Partnership' : 'Heads-up'}`;
    const id = 'd' + crypto.randomBytes(5).toString('hex');
    const t = { id, name, rules: r, structure, podSize, tables, roundMin, status: 'registering', entrants: [], teams: [], matches: [], pods: null, createdAt: h.now(), by: u.id };
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
    if(m.counted) return;
    const p = t.matches.find(x => t.id + '-' + x.id === m.id);
    saveM({ ...m, counted: true });
    const { scores, hands } = M.score(m);
    m.sides.forEach((side, i) => side.forEach(uid => {
      const s = store.get('dom:stats:' + uid) || { played: 0, won: 0, lost: 0, hands: 0, points: 0 };
      store.set('dom:stats:' + uid, { played: s.played + 1, won: s.won + (m.result.winner === i ? 1 : 0), lost: s.lost + (m.result.winner === i ? 0 : 1), hands: s.hands + hands, points: s.points + scores[i] });
    }));
    if(t.structure === 'elim' && p) { B.advance(t.matches, p.id, p.teams[m.result.winner], id => started(t, id)); syncSides(t); }
    const all = t.matches.map(x => Mget(t.id + '-' + x.id));
    const done = all.every(x => x && x.status === 'final');
    saveT(done ? { ...t, status: 'finished', endedAt: h.now() } : t);
    if(!done) seat(T(t.id));
  }
  // An override can change the winner of a match that was already final and counted. Stats move with it, and the
  // bracket takes the new winner only while the next match has not started (otherwise the director is told).
  function recount(t, before, after){
    if(!before.counted) return finished(t, after);
    const { scores, hands } = M.score(after);
    before.sides.forEach((side, i) => side.forEach(uid => {
      const s = store.get('dom:stats:' + uid); if(!s) return;
      const was = before.result.winner === i, now = after.result.winner === i;
      store.set('dom:stats:' + uid, { ...s, won: s.won - (was ? 1 : 0) + (now ? 1 : 0), lost: s.lost - (was ? 0 : 1) + (now ? 0 : 1), hands: s.hands - M.score(before).hands + hands, points: s.points - M.score(before).scores[i] + scores[i] });
    }));
    const p = t.matches.find(x => t.id + '-' + x.id === after.id);
    if(t.structure === 'elim' && p){ B.advance(t.matches, p.id, p.teams[after.result.winner], id => started(t, id)); syncSides(t); saveT(t); }
  }

  // ---------- the scorepad ----------
  function op(d, u){
    member(u);
    const t = current(), mid = d && d.mid, m0 = typeof mid === 'string' ? Mget(mid) : null;
    if(!t || !m0 || m0.tid !== t.id) throw fail(404, 'That match was not found.');
    const actor = { uid: u.id, director: h.isOwner(u) };
    if(d.op && d.op.type === 'override' && actor.director && t.structure === 'elim'){
      // check the bracket can take a new winner before recording anything
      const p = t.matches.find(x => t.id + '-' + x.id === mid);
      if(p && p.next && m0.result && m0.result.winner !== d.op.winner && m0.counted && started(t, p.next.id)) throw fail(409, 'The next match already started with the earlier winner. Reset it first.');
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

  // ---------- what members see ----------
  function view(u){
    const t = current(), owner = !!(u && h.isOwner(u));
    if(!t) return { t: null, now: h.now(), owner, canHost: h.canHost(), mine: null, stats: u ? store.get('dom:stats:' + u.id) || null : null };
    const team = id => { const x = teamOf(t, id); return x ? { id: x.id, members: x.members.map(uid => ({ uid, name: nameOf(uid) })) } : null; };
    const matches = t.matches.map(p => { const m = Mget(t.id + '-' + p.id); return { ...M.view(m, h.now()), place: p, teams: p.teams.map(team) }; });
    const mine = u ? matches.find(m => m.sides.flat().includes(u.id) && ['ready', 'live', 'review', 'disputed'].includes(m.status)) || null : null;
    const standings = t.pods ? t.pods.map(pd => ({ pod: pd.id, rows: B.standings(pd, matches.filter(m => m.place.pod === pd.id && m.status === 'final' && m.result).map(m => ({ teams: m.place.teams, winner: m.result.winner, scores: m.result.scores })), id => +id.slice(1)) })) : null;
    return { now: h.now(), owner, canHost: h.canHost(), t: { id: t.id, name: t.name, rules: t.rules, structure: t.structure, podSize: t.podSize, tables: t.tables, roundMin: t.roundMin, status: t.status,
      entrants: t.entrants.map(e => ({ uid: e.uid, name: nameOf(e.uid) })), registered: !!(u && t.entrants.some(e => e.uid === u.id)),
      teams: t.teams.map(x => team(x.id)), matches: t.status === 'registering' ? [] : matches, standings },
      mine: mine ? mine.id : null, stats: u ? store.get('dom:stats:' + u.id) || null : null };
  }
  // the director's log for this club
  const auditLog = u => { director(u); return store.values('dom:log:').sort((a, b) => a.at - b.at).slice(-100); };

  const api = { dominoState: (d, u) => { member(u); return view(u); }, dominoCreate: create, dominoJoin: join, dominoLeave: leave, dominoTeams: teams,
    dominoStart: start, dominoCancel: cancel, dominoOp: op, dominoLog: (d, u) => auditLog(u) };
  return { api, view, sweep, setHooks: x => Object.assign(h, x) };
};
