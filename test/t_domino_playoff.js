// Domino pods feeding a playoff (server/domino/club.js with an in-memory store, no server):
// - 8 heads-up players in 2 pods of 4, top 2 of each pod go through: every pod match is played, then the playoff is
//   drawn from the standings (pod winners seeded first; no pod meets itself in the semi-finals)
// - a pod result the director changes before any playoff hand is recorded redraws the playoff; after, it is refused
// - the playoff winner finishes the tournament; pods only (no playoff) still finish when the pods are done
// - bad settings are refused: an unknown playoff size, or pods too small for what they send on
const assert = require('assert');
const makeDomino = require('../server/domino/club');
let n = 0; const check = (c, msg) => { assert.ok(c, msg); n++; console.log('ok  ', msg); };
const throws = (fn, re, msg) => { let e = null; try{ fn(); }catch(x){ e = x; } check(e && re.test(e.message), msg + (e ? ` ("${e.message}")` : ' (did not throw)')); return e; };
function memStore(){ const m = new Map(); return { get: k => m.has(k) ? JSON.parse(JSON.stringify(m.get(k))) : undefined, set: (k, v) => m.set(k, JSON.parse(JSON.stringify(v))),
  keys: p => [...m.keys()].filter(k => k.startsWith(p)), values: p => [...m.keys()].filter(k => k.startsWith(p)).map(k => m.get(k)) }; }
let ids = 0; const opId = () => 'op' + String(++ids).padStart(8, '0');
function setup(players){
  const store = memStore(), own = { id: 'own', name: 'Director' };
  const users = Array.from({ length: players }, (_, i) => ({ id: 'u' + (i + 1), name: 'P' + (i + 1) }));
  [own, ...users].forEach(u => store.set('user:' + u.id, u));
  let now = 1e12; const D = makeDomino(store, { isOwner: u => u.id === 'own', now: () => now });
  const byId = Object.fromEntries([own, ...users].map(u => [u.id, u]));
  return { store, own, users, D, byId, tick: ms => now += ms };
}
const A = (x, name, d, u) => x.D.api[name](d || {}, u);
// play one live match to the target: the side with the lower player number wins (so standings are predictable)
function play(x, m){
  const [a, b] = [m.sides[0][0], m.sides[1][0]], w = +a.slice(1) < +b.slice(1) ? 0 : 1, wu = m.sides[w][0], lu = m.sides[1 - w][0];
  let v = A(x, 'dominoOp', { mid: m.id, op: { opId: opId(), type: 'hand', end: 'domino', out: wu, pips: { [wu]: 0, [lu]: 50 }, base: m.seq } }, x.byId[wu]).match;
  A(x, 'dominoOp', { mid: m.id, op: { opId: opId(), type: 'confirm' } }, x.byId[a]);
  return A(x, 'dominoOp', { mid: m.id, op: { opId: opId(), type: 'confirm' } }, x.byId[b]).match;
}
const live = x => A(x, 'dominoState', {}, x.own).t.matches.filter(m => m.status === 'live');
const playAll = (x, filter = () => true) => { for(let i = 0; i < 100; i++){ const ls = live(x).filter(filter); if(!ls.length) return; ls.forEach(m => play(x, m)); } };
const start = (x, d) => { A(x, 'dominoCreate', { preset: 'block', format: 'hu', target: 50, tables: 8, ...d }, x.own); x.users.forEach(u => A(x, 'dominoJoin', {}, u)); return A(x, 'dominoStart', {}, x.own); };

// ---------- 2 pods of 4, top 2 go through ----------
let x = setup(8);
let v = start(x, { structure: 'pods', podSize: 4, advance: 2 });
check(v.t.advance === 2 && v.t.playoff === false && v.t.matches.length === 12, 'pods of 4 with a top-2 playoff: 12 pod matches, no playoff drawn yet');
playAll(x, m => !m.place.stage);
v = A(x, 'dominoState', {}, x.own);
const po = v.t.matches.filter(m => m.place.stage === 'playoff');
check(v.t.playoff === true && po.length === 3 && v.t.status === 'running', 'every pod match final: the playoff is drawn (2 semi-finals and a final)');
const podOf = Object.fromEntries(v.t.standings.flatMap(s => s.rows.map(r => [r.id, s.pod])));
const semis = po.filter(m => m.place.pround === 1);
check(semis.every(m => podOf[m.place.teams[0]] !== podOf[m.place.teams[1]]), 'no pod meets itself in the semi-finals (winner of one pod v runner-up of the other)');
const top2 = v.t.standings.flatMap(s => s.rows.slice(0, 2).map(r => r.id)).sort();
check(JSON.stringify(semis.flatMap(m => m.place.teams).sort()) === JSON.stringify(top2), 'the semi-finalists are exactly the top 2 of each pod');
check(semis.every(m => m.status === 'live' && m.table) && Math.min(...semis.map(m => m.round)) > Math.max(...v.t.matches.filter(m => !m.place.stage).map(m => m.round)), 'semi-finals are seated at tables, after every pod round');

// director changes a pod result before any playoff hand is recorded: the playoff is drawn again
const podFinal = v.t.matches.filter(m => !m.place.stage && m.status === 'final');
const flip = podFinal.find(m => v.t.standings.some(s => s.rows[1].id === m.place.teams[m.result.winner] && s.rows[2] && m.place.teams.includes(s.rows[2].id)));
check(!!flip, 'found a pod match between second and third place');
A(x, 'dominoOp', { mid: flip.id, op: { opId: opId(), type: 'override', winner: 1 - flip.result.winner, reason: 'scored the wrong way' } }, x.own);
v = A(x, 'dominoState', {}, x.own);
const top2b = v.t.standings.flatMap(s => s.rows.slice(0, 2).map(r => r.id)).sort(), semis2 = v.t.matches.filter(m => m.place.stage === 'playoff' && m.place.pround === 1);
check(JSON.stringify(top2b) !== JSON.stringify(top2) && JSON.stringify(semis2.flatMap(m => m.place.teams).sort()) === JSON.stringify(top2b) && v.t.matches.filter(m => m.place.stage).length === 3,
  'an override before any playoff hand redraws the playoff from the new standings (still 3 playoff matches)');
// record a playoff hand, then a pod override is refused
const s1 = v.t.matches.find(m => m.place.stage === 'playoff' && m.status === 'live');
const su = s1.sides[0][0];
A(x, 'dominoOp', { mid: s1.id, op: { opId: opId(), type: 'hand', end: 'blocked', pips: { [su]: 3, [s1.sides[1][0]]: 9 }, base: s1.seq } }, x.byId[su]);
const pf = v.t.matches.find(m => !m.place.stage && m.status === 'final');
const e = throws(() => A(x, 'dominoOp', { mid: pf.id, op: { opId: opId(), type: 'override', winner: 1 - pf.result.winner, reason: 'late' } }, x.own), /playoff has already begun/, 'once a playoff hand is recorded, a pod result can no longer be changed');
check(e.status === 409, 'that refusal is a 409');
playAll(x);
v = A(x, 'dominoState', {}, x.own);
const fin = v.t.matches.find(m => m.place.stage === 'playoff' && m.place.pround === 2);
check(v.t.status === 'finished' && fin.status === 'final', 'the final is played and the tournament finishes');
check(Object.values(x.store.keys('dom:stats:')).length === 8 && x.store.get('dom:stats:' + fin.sides[fin.result.winner][0]).won >= 3, 'stats are kept for every player, the champion with at least 3 wins');

// ---------- pod winners only, 3 pods: 3 qualifiers, so the best pod winner gets a bye ----------
x = setup(9);
v = start(x, { structure: 'pods', podSize: 3, advance: 1 });
playAll(x, m => !m.place.stage);
v = A(x, 'dominoState', {}, x.own);
const po3 = v.t.matches.filter(m => m.place.stage === 'playoff');
check(po3.length === 3 && po3.filter(m => m.place.bye).length === 1 && po3.find(m => m.place.pround === 2).sides.some(s => s.length), '3 pod winners: a 4-slot playoff where the best winner has a bye into the final');
playAll(x);
check(A(x, 'dominoState', {}, x.own).t.status === 'finished', 'the 3-team playoff finishes');

// ---------- pods only still finish after the pods ----------
x = setup(6); start(x, { structure: 'pods', podSize: 3 }); playAll(x);
v = A(x, 'dominoState', {}, x.own);
check(v.t.status === 'finished' && !v.t.playoff && v.t.matches.every(m => !m.place.stage), 'pods only: finished when every pod match is final, no playoff');

// ---------- bad settings ----------
x = setup(4);
throws(() => A(x, 'dominoCreate', { preset: 'block', format: 'hu', tables: 2, structure: 'pods', podSize: 4, advance: 3 }, x.own), /how many from each pod/, 'a playoff of 3 per pod is refused');
A(x, 'dominoCreate', { preset: 'block', format: 'hu', tables: 2, structure: 'pods', podSize: 3, advance: 2 }, x.own); x.users.forEach(u => A(x, 'dominoJoin', {}, u));
throws(() => A(x, 'dominoStart', {}, x.own), /more teams than it sends/, '4 players in pods of 2 cannot send 2 each to the playoff');
x = setup(4);
v = A(x, 'dominoCreate', { preset: 'block', format: 'hu', tables: 2, structure: 'elim', advance: 2 }, x.own);
check(v.t.advance === 0, 'a knockout ignores the playoff setting');

console.log(`t_domino_playoff: ${n} ok, 0 failed`);
