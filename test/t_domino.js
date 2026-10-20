// Domino tournaments through the real server (DOMINO=1, club switching on): the flag, who may run one, registration,
// partnerships, bracket and tables, the scorepad over HTTP (server-side totals, idempotent taps, concurrent phones,
// confirmation, dispute, override and its log), live pushes and reconnect over WebSocket, club isolation, and that
// poker data is untouched.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let n = 0; const check = (c, msg) => { assert.ok(c, msg); n++; console.log('ok  ', msg); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't_domino_'));
const procs = [];
const end = code => { procs.forEach(p => { try{ p.kill(); }catch(e){} }); try{ fs.rmSync(tmp, { recursive: true, force: true }); }catch(e){} process.exit(code); };
async function boot(name, env){
  const PORT = 7100 + Math.floor(Math.random() * 400), BASE = 'http://localhost:' + PORT;
  const p = spawn('node', ['server/index.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: path.join(tmp, name + '.json'), FAST: '1', STAGING: '', CLUBS_DEFAULT: 'on', CLUB_SWITCHING: '1', DATABASE_URL: '', ...env }, stdio: 'ignore' });
  procs.push(p);
  for(let i = 0; i < 60; i++){ try{ if((await fetch(BASE + '/healthz')).ok) break; }catch(e){} await sleep(150); }
  const call = async (api, body, tok, club) => { const r = await fetch(BASE + '/api/' + api, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}), ...(club ? { 'x-club': club } : {}) }, body: JSON.stringify(body || {}) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
  const ok = async (...a) => { const r = await call(...a); assert.strictEqual(r.status, 200, a[0] + ': ' + JSON.stringify(r.body)); return r.body; };
  const ws = (tok, club) => new Promise((res, rej) => {
    const w = new WebSocket(BASE.replace('http', 'ws') + '/ws'), s = { w, dom: [] };
    w.on('open', () => w.send(JSON.stringify({ t: 'hello', token: tok, club })));
    w.on('message', m => { m = JSON.parse(m); if(m.t === 'domino') s.dom.push(m.v); if(m.t === 'club') s.club = m.club; if(m.t === 'club' && !s.ready){ s.ready = true; setTimeout(() => res(s), 100); } });
    w.on('error', rej); setTimeout(() => rej(new Error('ws timeout')), 5000);
  });
  return { call, ok, ws };
}
let k = 0; const opId = () => 'tap' + String(++k).padStart(8, '0');
(async () => {
  // ---------- flag off: nothing ----------
  const off = await boot('off', { DOMINO: '' });
  const O0 = (await off.ok('setup', { code: 'secret', name: 'Founder', pin: '1234', agree: true })).token;
  check((await off.call('dominoState', {}, O0)).status === 404 && (await off.call('dominoCreate', { preset: 'block', format: 'hu', tables: 1 }, O0)).status === 404, 'DOMINO unset: every domino call is a 404');

  const s = await boot('on', { DOMINO: '1' });
  const O = (await s.ok('setup', { code: 'secret', name: 'Founder', pin: '1234', agree: true })).token;
  const mk = async (name, club) => (await s.ok('redeem', { code: (await s.ok('invite', {}, O, club)).code, name, pin: '1357', agree: true })).token;
  const P = {}; for(const nm of ['Ann', 'Ben', 'Cid', 'Dee']) P[nm] = await mk(nm);
  const viewOf = async tok => (await s.ok('dominoState', {}, tok)).t;
  const me = async tok => (await s.ok('dominoState', {}, tok));
  check((await me(P.Ann)).t === null, 'no domino tournament yet');

  // who may run one
  check((await s.call('dominoCreate', { preset: 'block', format: 'hu', tables: 1 }, P.Ann)).status === 403, 'a member cannot create a domino tournament');
  const Bo = await mk('Bo Baker');
  await s.ok('bizSave', { name: 'Bo Bakery', category: 'food', tagline: 'Fresh', about: 'A bakery.' }, Bo); await s.ok('bizPublish', { on: true }, Bo);
  const BC = (await s.ok('createClub', { name: 'Bakery Club', rulesV: 1, acceptRules: true }, Bo)).club;
  const r403 = await s.call('dominoCreate', { preset: 'block', format: 'hu', tables: 1 }, Bo, BC);
  check(r403.status === 403 && /run by Blindrise/.test(r403.body.error), 'a club a member opened cannot run one either (Blindrise only): ' + r403.body.error);
  check((await s.call('dominoCreate', { preset: 'block', format: 'hu', tables: 0 }, O)).status === 400, 'the director must say how many tables there are');

  // ---------- heads-up Block, single elimination, one table ----------
  await s.ok('dominoCreate', { name: 'Tuesday Dominoes', preset: 'block', format: 'hu', target: 100, tables: 1, roundMin: 0 }, O);
  check((await s.call('dominoCreate', { preset: 'draw', format: 'hu', tables: 1 }, O)).status === 400, 'one domino tournament at a time');
  for(const nm of ['Ann', 'Ben', 'Cid', 'Dee']) await s.ok('dominoJoin', {}, P[nm]);
  await s.ok('dominoJoin', {}, P.Ann);
  let t = await viewOf(O);
  check(t.entrants.length === 4 && t.status === 'registering', 'four players registered (joining twice counts once)');
  const live = await s.ws(P.Ann, 'main'), before = live.dom.length;
  await s.ok('dominoStart', {}, O);
  t = await viewOf(O);
  const r1 = t.matches.filter(m => m.round === 1);
  check(t.status === 'running' && r1.length === 2 && r1.filter(m => m.status === 'live').length === 1 && r1.filter(m => m.status === 'ready').length === 1, 'started: two semi-finals, one table, so one is live and one waits');
  const m1 = r1.find(m => m.status === 'live');
  check(m1.table === 1, 'the live match is at table 1');
  await sleep(200);
  check(live.dom.length > before && live.dom[live.dom.length - 1].t.status === 'running', 'members with the app open get the new state live');
  const uidName = Object.fromEntries(t.entrants.map(e => [e.name, e.uid]));
  const [a, b] = m1.sides.map(x => x[0]);
  const tokOf = uid => P[Object.keys(uidName).find(nm => uidName[nm] === uid)];
  // authorization on the scorepad
  const other = r1.find(m => m !== m1).sides[0][0];
  const notMine = await s.call('dominoOp', { mid: m1.id, op: { opId: opId(), type: 'hand', end: 'blocked', pips: { [a]: 1, [b]: 2 }, base: 0 } }, tokOf(other));
  check(notMine.status === 403, 'a player from another match cannot write this one');
  // scoring over HTTP, totals from the server
  const op = (mid, tok, o, base) => s.call('dominoOp', { mid, op: { opId: o.opId || opId(), base, ...o } }, tok);
  let r = await op(m1.id, tokOf(a), { type: 'hand', end: 'domino', out: a, pips: { [a]: 0, [b]: 60 }, scores: [99, 0] }, 0);
  check(r.status === 200 && r.body.match.scores[0] === 60 && r.body.match.scores[1] === 0, 'a hand is scored by the server from the pips (60), the client\'s total is ignored');
  // the same tap again (lost answer, retry)
  const tap = opId();
  r = await op(m1.id, tokOf(b), { opId: tap, type: 'hand', end: 'blocked', pips: { [a]: 20, [b]: 5 } }, 1);
  const again = await op(m1.id, tokOf(b), { opId: tap, type: 'hand', end: 'blocked', pips: { [a]: 20, [b]: 5 } }, 1);
  check(r.body.match.scores[1] === 20 && again.status === 200 && again.body.dup && again.body.match.scores[1] === 20 && again.body.match.seq === 2, 'a retried tap is recorded once (b 20, two events)');
  // two phones at once
  const [x1, x2] = await Promise.all([op(m1.id, tokOf(a), { type: 'hand', end: 'blocked', pips: { [a]: 3, [b]: 9 } }, 2), op(m1.id, tokOf(b), { type: 'hand', end: 'blocked', pips: { [a]: 3, [b]: 9 } }, 2)]);
  check([x1.status, x2.status].sort().join() === '200,409', 'two phones send the same hand at once: one is recorded, the other is told the score changed (409)');
  r = await me(O); const cur = r.t.matches.find(m => m.id === m1.id);
  check(cur.scores[0] === 69 && cur.seq === 3, 'the score is 69 v 20 after three hands, not 78');
  // reach 100 -> review -> confirm both -> final -> winner moves on, the table goes to the waiting match
  r = await op(m1.id, tokOf(a), { type: 'hand', end: 'domino', out: a, pips: { [a]: 0, [b]: 40 } }, 3);
  check(r.body.match.status === 'review' && r.body.match.result.winner === 0, '109: review, a ahead');
  check((await s.call('dominoOp', { mid: m1.id, op: { opId: opId(), type: 'confirm' } }, O)).status === 403, 'the director cannot confirm for the players');
  await s.ok('dominoOp', { mid: m1.id, op: { opId: opId(), type: 'confirm' } }, tokOf(a));
  await s.ok('dominoOp', { mid: m1.id, op: { opId: opId(), type: 'confirm' } }, tokOf(b));
  t = await viewOf(O);
  const fin = t.matches.find(m => m.round === 2), m2 = t.matches.find(m => m.round === 1 && m.id !== m1.id);
  check(t.matches.find(m => m.id === m1.id).status === 'final' && fin.sides.flat().includes(a) && m2.status === 'live' && m2.table === 1, 'final: a goes to the final, and the waiting semi-final takes table 1');
  // the second semi: dispute, then override with the log
  const [c, d] = m2.sides.map(x => x[0]);
  await op(m2.id, tokOf(c), { type: 'hand', end: 'domino', out: c, pips: { [c]: 0, [d]: 84 } }, 0);
  r = await op(m2.id, tokOf(c), { type: 'hand', end: 'domino', out: c, pips: { [c]: 0, [d]: 30 } }, 1);
  check(r.body.match.status === 'review', 'second semi reaches 114: review');
  await s.ok('dominoOp', { mid: m2.id, op: { opId: opId(), type: 'dispute', reason: 'Second hand was 3 pips, not 30' } }, tokOf(d));
  t = await viewOf(O);
  check(t.matches.find(m => m.id === m2.id).status === 'disputed' && t.matches.find(m => m.round === 2).status === 'waiting', 'disputed: the final waits');
  check((await s.call('dominoOp', { mid: m2.id, op: { opId: opId(), type: 'override', winner: 1, reason: 'x' } }, tokOf(c))).status === 403, 'only the director overrides');
  await s.ok('dominoOp', { mid: m2.id, op: { opId: opId(), type: 'override', winner: 0, reason: 'Checked at the table: 30 was right' } }, O);
  const lg = await s.ok('dominoLog', {}, O);
  check(lg.some(e => e.action === 'override' && e.reason === 'Checked at the table: 30 was right' && e.winner === 0), 'the override and its reason are in the director\'s log');
  check((await s.call('dominoLog', {}, P.Ann)).status === 403, 'members cannot read the director\'s log');
  t = await viewOf(O);
  const F = t.matches.find(m => m.round === 2);
  check(F.status === 'live' && F.sides.flat().includes(c) && F.sides.flat().includes(a) && F.table === 1, 'the final is set (a v c) and live at table 1');
  // reconnect: a new socket gets the whole state at once
  const re = await s.ws(tokOf(c), 'main');
  check(re.dom.length >= 1 && re.dom[0].mine === F.id, 'reconnecting, a player gets the scorepad state at once, with their own match marked');
  re.w.close(); live.w.close();
  await op(F.id, tokOf(a), { type: 'hand', end: 'domino', out: a, pips: { [a]: 0, [c]: 84 } }, 0);
  await op(F.id, tokOf(a), { type: 'hand', end: 'domino', out: a, pips: { [a]: 0, [c]: 30 } }, 1);
  await s.ok('dominoOp', { mid: F.id, op: { opId: opId(), type: 'confirm' } }, tokOf(a));
  await s.ok('dominoOp', { mid: F.id, op: { opId: opId(), type: 'confirm' } }, tokOf(c));
  r = await me(tokOf(a));
  check(r.t.status === 'finished' && r.stats && r.stats.played === 2 && r.stats.won === 2 && r.stats.points === 223, 'the tournament finishes; the champion\'s domino stats: 2 played, 2 won, 223 points');
  // poker untouched
  const pv = await s.ws(tokOf(a), 'main'); pv.w.close(); const club = pv.club;
  const mine = (club.members || []).find(x => x.id === a) || {};
  check(!club.tourney && !(mine.points > 0) && !(mine.played > 0), 'poker: no tournament, no points, nothing played (domino results never reach poker)');

  // ---------- isolation ----------
  check((await s.call('dominoState', {}, Bo, 'main')).status === 200, '(Bo is also in main)');
  const outsider = (await s.ok('redeem', { code: (await s.ok('invite', {}, Bo, BC)).code, name: 'Outsider', pin: '2468', agree: true })).token;
  check((await s.call('dominoState', {}, outsider, 'main')).status === 403, 'a member only of another club cannot read this club\'s dominoes');
  check((await s.ok('dominoState', {}, outsider, BC)).t === null, 'and their own club shows nothing of it');
  check((await s.call('dominoOp', { mid: F.id, op: { opId: opId(), type: 'confirm' } }, outsider, BC)).status === 404, 'a match id from another club is not found there');

  // ---------- partnership: teams ----------
  await s.ok('dominoCreate', { preset: 'allfives', format: 'pairs', tables: 2 }, O);
  for(const nm of ['Ann', 'Ben', 'Cid']) await s.ok('dominoJoin', {}, P[nm]);
  const odd = await s.call('dominoTeams', { mode: 'random' }, O);
  check(odd.status === 400 && /odd number/.test(odd.body.error), 'partnerships need an even number: ' + odd.body.error);
  await s.ok('dominoJoin', {}, P.Dee);
  const u = Object.fromEntries((await viewOf(O)).entrants.map(e => [e.name, e.uid]));
  check((await s.call('dominoTeams', { mode: 'manual', pairs: [[u.Ann, u.Ben], [u.Ann, u.Dee]] }, O)).status === 400, 'manual pairs must use every player exactly once');
  await s.ok('dominoTeams', { mode: 'manual', pairs: [[u.Ann, u.Cid], [u.Ben, u.Dee]] }, O);
  await s.ok('dominoStart', {}, O);
  t = await viewOf(O);
  const pm = t.matches[0];
  check(t.matches.length === 1 && pm.status === 'live' && JSON.stringify(pm.sides.map(x => [...x].sort())) === JSON.stringify([[u.Ann, u.Cid].sort(), [u.Ben, u.Dee].sort()]), 'Ann & Cid v Ben & Dee, live');
  r = await op(pm.id, P.Ann, { type: 'count', side: 0, points: 10 }, 0);
  r = await op(pm.id, P.Ben, { type: 'hand', end: 'domino', out: u.Ann, pips: { [u.Ann]: 0, [u.Cid]: 9, [u.Ben]: 11, [u.Dee]: 12 } }, 1);
  check(r.body.match.scores[0] === 35 && r.body.match.scores[1] === 0, 'All Fives partnership: 10 in play, then Ann goes out on 11 + 12 = 23 -> 25: 35 (Cid\'s 9 does not count)');
  await s.ok('dominoCancel', { reason: 'test' }, O);
  check((await viewOf(O)).status === 'cancelled', 'the director cancels');
  console.log(`t_domino: ${n} ok, 0 failed`); end(0);
})().catch(e => { console.error('FAIL', e); end(1); });
