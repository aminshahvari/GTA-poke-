// The onboarding funnel (Issue #39, combined review package of 2026-10-23), against servers from this tree, staging seed
// data only. Board on (UI_BOARD=1):
//  - a new account made by an invite is counted as joined, in the week it joined; its welcome (finished or skipped),
//    first game (by its invite, or by itself), picture, published business, invite link and a return on a later day
//    within 7 days are each counted once, in that week; a second try never counts twice
//  - existing members (no first visit on the record) are never counted
//  - the stored counts are numbers only; the account carries one field fn = { c, m } and nothing with a time
//  - only the director's club message has the counts; a member's has none
//  - card 3 / Next game "by invite": the server's me.byInvite, from the account's invReg, true only while the invite's
//    registration stands; unregistering clears it, and registering again by hand does not bring it back
// Board off: the same actions write no funnel key, no fn, invReg or onb field, and the messages carry none of it.
const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const WebSocket = require('ws');
const funnelOf = require('../server/funnel');
const ROOT = path.join(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let n = 0; const check = (c, msg) => { assert.ok(c, msg); n++; console.log('ok  ', msg); };
const procs = [];
const DAY = 864e5;

async function server(board, DATA){
  const port = (board ? 6400 : 6480) + Math.floor(Math.random() * 80);
  const env = { ...process.env, PORT: String(port), NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '', STAGING: '1', DATABASE_URL: '', CLUB_SWITCHING: '' };
  delete env.UI_BOARD; delete env.UI_QUIET; delete env.UI_BOARD_LIVE; if(board) env.UI_BOARD = '1';
  const p = spawn('node', ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'ignore', 'inherit'] }); procs.push(p);
  const base = 'http://127.0.0.1:' + port;
  for(let i = 0; i < 100; i++){ try{ if((await fetch(base + '/healthz')).ok) break; }catch(e){} await sleep(100); }
  const api = async (name, body, tok) => { const j = await (await fetch(base + '/api/' + name, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body || {}) })).json(); if(j.error) throw new Error(name + ': ' + j.error); return j; };
  const stop = () => new Promise(r => { p.once('exit', r); p.kill('SIGTERM'); });
  return { base, api, stop };
}
function sock(base, token){
  const ws = new WebSocket(base.replace('http', 'ws') + '/ws'), c = { ws, send: o => ws.send(JSON.stringify(o)), club: null, invite: null, n: 0 };
  ws.on('open', () => c.send({ t: 'hello', token, device: 'fn' + Math.random() }));
  ws.on('error', () => {});
  ws.on('message', raw => { const m = JSON.parse(raw); if(m.t === 'club'){ c.club = m.club; c.n++; } if(m.t === 'invite') c.invite = m.code; });
  return new Promise(r => { const t = setInterval(() => { if(c.club){ clearInterval(t); r(c); } }, 30); });
}
const until = async (f, ms = 5000) => { const t0 = Date.now(); let v; while(!(v = await f()) && Date.now() - t0 < ms) await sleep(50); return v; };
const readData = DATA => JSON.parse(fs.readFileSync(DATA, 'utf8'));
const users = j => Object.entries(j).filter(([k]) => k.startsWith('user:')).map(([, v]) => v);
const byName = (j, name) => users(j).find(u => u.name === name);
const BIZ = { name: 'Newcomer Studio', category: 'education', description: 'Lessons.', services: 'Lessons', area: 'Toronto', fullName: 'Newcomer One', jobTitle: 'Owner', categoryOther: '', website: '', instagram: '', email: '', phone: '' };
// every step a member can take, through the server's own calls; returns the member's socket
async function steps(S, tok, ws, { welcome }){
  if(welcome) ws.send({ t: 'onb', step: 2, how: welcome });
  await S.api('avatar', { kind: 'gallery', id: 'fox' }, tok);
  ws.send({ t: 'invite', group: true }); await until(() => ws.invite);
  await S.api('bizSave', BIZ, tok); await S.api('bizPublish', { on: true }, tok);
  await sleep(300);
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't_funnel_'));
  const F = funnelOf({ store: null, clubs: null, on: () => true });
  check(F.weekOf(Date.parse('2026-10-23T16:00:00Z')) === '2026-10-19' && F.weekOf(Date.parse('2026-10-19T05:00:00Z')) === '2026-10-19' && F.weekOf(Date.parse('2026-10-19T03:00:00Z')) === '2026-10-12', 'weeks start on Monday in the club\'s time zone (Toronto by default)');

  // ================= board on =================
  const DATA = path.join(tmp, 'on.json');
  let S = await server(true, DATA);
  const dirTok = (await S.api('login', { name: 'Test Director', pin: '246810' })).token, dir = await sock(S.base, dirTok);
  check(Array.isArray(dir.club.funnel) && dir.club.funnel.length === 0, 'on: the director\'s club message has the funnel, empty before anyone joins');
  dir.send({ t: 'create', name: 'Saturday Night Open', stack: 30000, levelMin: 15, startAt: Date.now() + 3 * DAY, repeat: 'none', tableSize: 9, lateLevels: 2 });
  await until(() => dir.club.tourney && dir.club.tourney.status === 'registering');
  dir.send({ t: 'invite', group: true }); const code = await until(() => dir.invite);
  // newcomer 1: everything, the welcome finished
  const n1 = (await S.api('redeem', { code, name: 'Newcomer One', pin: '4826', agree: true })).token, w1 = await sock(S.base, n1);
  check(w1.club.me.onb === 1 && w1.club.me.byInvite === true && w1.club.tourney.regs.includes(w1.club.me.id), 'on: the newcomer is registered by the invite, and the club message says so (me.byInvite)');
  check(!('funnel' in w1.club), 'on: a member\'s club message carries no funnel');
  await sleep(300);
  let j = readData(DATA), u1 = byName(j, 'Newcomer One');
  const week = F.weekOf(u1.createdAt);
  check(u1.fn && u1.fn.c === 'main' && u1.fn.m === F.BIT.game && u1.invReg === 'main/' + w1.club.tourney.id, `on: the account holds fn ${JSON.stringify(u1.fn)} and invReg ${u1.invReg}`);
  check(JSON.stringify(j.funnel) === JSON.stringify({ v: 1, weeks: { [week]: { joined: 1, game: 1 } } }), `on: counted: ${JSON.stringify(j.funnel)}`);
  await steps(S, n1, w1, { welcome: 'done' });
  await steps(S, n1, w1, { welcome: 'skip' });   // all again: nothing counts twice, and the welcome is counted once
  w1.send({ t: 'join' }); await sleep(300);      // already registered: not counted as their own registration
  j = readData(DATA);
  check(JSON.stringify(j.funnel.weeks[week]) === JSON.stringify({ joined: 1, game: 1, welcomeDone: 1, picture: 1, invite: 1, business: 1 }), `on: each step counted once: ${JSON.stringify(j.funnel.weeks[week])}`);
  // unregister: the invite's sign-up is gone; registering by hand counts gameSelf, not game again, and is not "by invite"
  w1.send({ t: 'leave' }); await until(() => w1.club && !w1.club.tourney.regs.includes(w1.club.me.id)); await sleep(300);
  check(!w1.club.me.byInvite && !('invReg' in byName(readData(DATA), 'Newcomer One')), 'on: unregistering clears the invite\'s sign-up (no byInvite, no invReg)');
  w1.send({ t: 'join' }); await until(() => w1.club.tourney.regs.includes(w1.club.me.id));
  check(!w1.club.me.byInvite, 'on: registered again by hand, the club message does not say the invite did it');
  await sleep(300); j = readData(DATA);
  check(j.funnel.weeks[week].gameSelf === 1 && j.funnel.weeks[week].game === 1, 'on: registering by hand is counted as their own registration, the first game once');
  // newcomer 2: skips the welcome, does nothing else
  const n2 = (await S.api('redeem', { code, name: 'Newcomer Two', pin: '4826', agree: true })).token, w2 = await sock(S.base, n2);
  w2.send({ t: 'onb', step: 2, how: 'skip' }); w2.send({ t: 'onb', step: 3 }); await sleep(300);
  w2.send({ t: 'onb', step: 2, how: 'done' }); await sleep(300);   // after the welcome: changes nothing
  // the director and a seeded member are never counted
  const p1 = (await S.api('login', { name: 'Test Player 01', pin: '135711' })).token, wp = await sock(S.base, p1);
  await steps(S, p1, wp, { welcome: 'done' }); wp.send({ t: 'join' });
  await S.api('avatar', { kind: 'gallery', id: 'fox' }, dirTok); dir.send({ t: 'invite', group: false });
  await sleep(400); j = readData(DATA);
  const counts = { joined: 2, game: 2, welcomeDone: 1, picture: 1, invite: 1, business: 1, gameSelf: 1, welcomeSkipped: 1 };
  const sorted = o => JSON.stringify(Object.fromEntries(Object.entries(o).sort()));
  check(sorted(j.funnel.weeks[week]) === sorted(counts), `on: two newcomers counted, existing members not: ${JSON.stringify(j.funnel.weeks[week])}`);
  check(!byName(j, 'Test Player 01').fn && !byName(j, 'Test Director').fn, 'on: existing accounts carry no fn field');
  check(Object.values(j.funnel.weeks).every(w => Object.values(w).every(v => Number.isInteger(v))) && Object.keys(j.funnel).join() === 'v,weeks' && !/Newcomer|u[0-9a-f]{12}/.test(JSON.stringify(j.funnel)), 'on: the stored funnel is counts only (no names, no ids)');
  check(Object.keys(byName(j, 'Newcomer Two').fn).join() === 'c,m', 'on: fn is { c, m } and nothing else (no times)');
  const dv = await until(() => dir.club.funnel && dir.club.funnel[0] && dir.club.funnel[0].joined === 2 && dir.club.funnel);
  check(!!dv && dv[0].week === week && dv[0].welcomeSkipped === 1, `on: the director sees the counts: ${JSON.stringify(dv)}`);
  // ---- the 7-day return: a later day within 7 days counts once; the same day or after 7 days does not ----
  for(const w of [w1, w2, wp, dir]) w.ws.close();
  await S.stop();
  j = readData(DATA);
  const set = (name, at) => { const k = Object.keys(j).find(k => k.startsWith('user:') && j[k].name === name); j[k] = { ...j[k], createdAt: at }; };
  const back2 = Date.now() - 2 * DAY, back9 = Date.now() - 9 * DAY;
  set('Newcomer One', back2); set('Newcomer Two', back9);
  fs.writeFileSync(DATA, JSON.stringify(j));
  S = await server(true, DATA);
  const r1 = await sock(S.base, n1), r1b = await sock(S.base, n1), r2 = await sock(S.base, n2);
  await sleep(400); j = readData(DATA);
  const wk1 = F.weekOf(back2), wk2 = F.weekOf(back9);
  check((j.funnel.weeks[wk1] || {}).returned === 1, `on: Newcomer One (joined 2 days ago) came back: counted once in the week of ${wk1}`);
  check(!(j.funnel.weeks[wk2] || {}).returned && Object.values(j.funnel.weeks).reduce((a, w) => a + (w.returned || 0), 0) === 1, 'on: Newcomer Two (joined 9 days ago) is not a 7-day return');
  check(byName(j, 'Newcomer One').fn.m & F.BIT.returned, 'on: the return bit is on the account, so it is counted once');
  for(const w of [r1, r1b, r2]) w.ws.close();
  await S.stop();

  // ================= board off =================
  const ODATA = path.join(tmp, 'off.json');
  const O = await server(false, ODATA);
  const oTok = (await O.api('login', { name: 'Test Director', pin: '246810' })).token, od = await sock(O.base, oTok);
  od.send({ t: 'create', name: 'Saturday Night Open', stack: 30000, levelMin: 15, startAt: Date.now() + 3 * DAY, repeat: 'none', tableSize: 9, lateLevels: 2 });
  await until(() => od.club.tourney && od.club.tourney.status === 'registering');
  od.send({ t: 'invite', group: true }); const ocode = await until(() => od.invite);
  const o1 = (await O.api('redeem', { code: ocode, name: 'Newcomer Off', pin: '4826', agree: true })).token, ow = await sock(O.base, o1);
  check(ow.club.tourney.regs.includes(ow.club.me.id), 'off: the invite still signs the newcomer up, as before');
  check(!('byInvite' in ow.club.me) && !('onb' in ow.club.me) && !('funnel' in od.club), 'off: no byInvite or onb for the member, no funnel for the director');
  await steps(O, o1, ow, { welcome: 'done' });
  ow.send({ t: 'leave' }); ow.send({ t: 'join' }); await sleep(500);
  const oj = readData(ODATA);
  check(!Object.keys(oj).some(k => /funnel/.test(k)), 'off: no funnel key is written');
  check(users(oj).every(u => !('fn' in u) && !('invReg' in u) && !('onb' in u)), `off: no account holds fn, invReg or onb (${users(oj).length} accounts)`);
  check(!('funnel' in (await until(() => od.club.members.length > 13 && od.club))), 'off: the director\'s club message has no funnel');
  ow.ws.close(); od.ws.close(); await O.stop();

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\nt_funnel: ${n} passed`);
  process.exit(0);
})().catch(e => { console.error(e.stack || e); procs.forEach(p => { try{ p.kill(); }catch(_){} }); process.exit(1); });
