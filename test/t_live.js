// Live at Blindrise (Issue #25, owner directives of 2026-10-20) and game notifications to every club (owner, 2026-10-21):
// - every member club's home carries the platform's games: the Blindrise club's tournament and its dominoes, public
//   state only (what, when, counts, level) and the member's own place in them; never who registered
// - any member of any club can watch a live table (and the domino board) read-only, without joining anything: a
//   spectator gets the tournament, the tables and the table it watches; no members, results, chat, sponsor or cards
// - a spectator can do nothing but watch: every other message is ignored, and the Blindrise club's calls stay 403
// - a registered player is sent to their seat; the platform's own clubs (main, the Open) carry no headline
// - when a Blindrise game opens or starts, members of every club are notified too
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't_live_'));
const DATA = path.join(tmp, 'data.json');
const PORT = 5900 + Math.floor(Math.random() * 200), BASE = 'http://localhost:' + PORT;
const srv = spawn('node', ['server/index.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', PUSH_LOG: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '1', STAGING: '', CLUBS_DEFAULT: 'on', CLUB_SWITCHING: '1', DOMINO: '1', TIME_BANK_MS: '300', LEVEL_MS: '60000', BREAKS: '0' }, stdio: ['ignore', 'pipe', 'ignore'] });
let log = ''; srv.stdout.on('data', d => { log += d; });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let n = 0; const check = (c, msg) => { assert.ok(c, msg); n++; console.log('ok  ', msg); };
async function call(p, body, tok, club){
  const r = await fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}), ...(club ? { 'x-club': club } : {}) }, body: JSON.stringify(body || {}) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
async function ok(...a){ const r = await call(...a); assert.strictEqual(r.status, 200, `${a[0]}: ${JSON.stringify(r.body)}`); return r.body; }
function session(tok, club, spectate){
  return new Promise((res, rej) => {
    const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws'), s = { ws, msgs: [], view: null };
    s.send = m => ws.send(JSON.stringify(m));
    s.waitFor = async (pred, ms = 6000) => { const end = Date.now() + ms; while(Date.now() < end){ const m = s.msgs.find(pred); if(m) return m; await sleep(30); } return null; };
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: tok, club, spectate })));
    ws.on('message', m => { m = JSON.parse(m); s.msgs.push(m); if(m.t === 'auth' && !m.ok) res(s); if(m.t === 'club'){ s.view = m.club; if(!s.ready){ s.ready = true; res(s); } } });
    ws.on('error', rej); setTimeout(() => rej(new Error('timeout')), 5000);
  });
}
const view = async (tok, club) => { const s = await session(tok, club); s.ws.close(); return s.view; };
const POKER_KEYS = ['count', 'id', 'level', 'levelMin', 'name', 'open', 'paused', 'playing', 'registered', 'remaining', 'stack', 'startAt', 'status', 'tables'];
const DOMINO_KEYS = ['count', 'id', 'name', 'playing', 'registered', 'rules', 'status'];
const pushes = tag => log.split('\n').filter(l => l.startsWith('push ' + tag)).map(l => +(/-> (\d+) players/.exec(l) || [])[1]);
const end = code => { srv.kill(); try{ fs.rmSync(tmp, { recursive: true, force: true }); }catch(e){} process.exit(code); };
(async () => {
  for(let i = 0; i < 60; i++){ try{ if((await fetch(BASE + '/healthz')).ok) break; }catch(e){} await sleep(150); }
  const O = (await ok('setup', { code: 'secret', name: 'Founder', pin: '1234', agree: true })).token;
  const join = async (name, tok = O, club) => (await ok('redeem', { code: (await ok('invite', {}, tok, club)).code, name, pin: '1357', agree: true })).token;
  const A = await join('Ali'), B = await join('Bea');
  const X = (await ok('createClub', { name: 'Harbour Club', code: 'secret', rulesV: 1, acceptRules: true }, O)).club;
  const P = await join('Pia', O, X), Q = await join('Quin', O, X); // members of Harbour Club only
  await ok('joinInvite', { code: (await ok('invite', {}, O, X)).code }, A); // Ali is in both clubs
  const aId = (await view(A)).me.id, bId = (await view(B)).me.id;

  // ---------- before any game ----------
  const v0 = await view(P, X);
  check(v0.live && v0.live.poker === null && v0.live.domino === null && v0.live.member === false, 'a member club always carries the headline, empty when nothing is on');
  check(!(await view(A)).live && !(await view(O)).live, 'the Blindrise club itself carries no headline (its games are its own)');

  // ---------- the Blindrise club opens a tournament ----------
  const so = await session(O);
  so.send({ t: 'create', name: 'Tuesday Night', stack: 10000, levelMin: 60, tableSize: 6, lateLevels: 0 });
  await so.waitFor(m => m.t === 'club' && m.club.tourney && m.club.tourney.status === 'registering');
  await sleep(250);
  let lp = (await view(P, X)).live.poker;
  check(lp && lp.name === 'Tuesday Night' && lp.status === 'registering' && lp.count === 0 && lp.open && !lp.registered, 'every member club shows the Blindrise club tournament as open');
  check(JSON.stringify(Object.keys(lp).sort()) === JSON.stringify(POKER_KEYS), 'the poker card carries only what it is, its state and counts');
  check(pushes('open-').length === 2 && pushes('open-')[1] === 2, 'opening it notifies the Blindrise club and, separately, the 2 members of other clubs: ' + pushes('open-').join(', '));
  const sa = await session(A), sb = await session(B);
  sa.send({ t: 'join' }); sb.send({ t: 'join' });
  await sa.waitFor(m => m.t === 'club' && m.club.tourney && m.club.tourney.regs.length === 2);
  await sleep(250);
  const vP = await view(P, X), vAX = await view(A, X);
  check(vP.live.poker.count === 2 && !vP.live.poker.registered, 'the count updates in the other club');
  check(!JSON.stringify(vP.live).includes(aId) && !JSON.stringify(vP.live).includes('Ali') && !JSON.stringify(vP.live).includes('Bea'), 'the headline never says who registered');
  check(vAX.live.member === true && vAX.live.poker.registered === true && !vAX.live.poker.playing, 'Ali, seen from Harbour Club, is shown as registered');

  // ---------- running ----------
  so.send({ t: 'start' });
  await sa.waitFor(m => m.t === 'club' && m.club.tourney && m.club.tourney.status === 'running');
  await sleep(300);
  lp = (await view(P, X)).live.poker;
  check(lp.status === 'running' && lp.remaining === 2 && lp.count === 2 && lp.tables === 1 && lp.level === 0, 'running: players left, level and tables, from another club');
  check((await view(A, X)).live.poker.playing === true, 'a seated player sees "go to your seat" from their other club');
  check(pushes('start-').length === 2 && pushes('start-')[1] === 3, 'the start notifies the players, and everyone else in every club (3) that they can watch: ' + pushes('start-').join(', '));

  // ---------- watching from Harbour Club ----------
  const sp = await session(P, X, 'main');
  const sv = sp.view;
  check(sv.spectate === true && sv.club.id === 'main' && sv.home.id === X && sv.home.name === 'Harbour Club' && sv.me.owner === false, 'a Harbour Club member watches the Blindrise club tournament without joining it');
  check(sv.members.length === 0 && sv.history.length === 0 && sv.tourney.regs.length === 0 && sv.tourney.regCount === 2 && sv.tourney.sponsor === null && sv.shop === null && !sv.invites && !sv.joinQr && !sv.platform && !sv.blindrise && sv.myTable === null && sv.clubs.length === 0, 'a spectator gets no members, results, registration list, sponsor, prizes, invites or posts');
  check(!JSON.stringify(sv).includes(aId) && !JSON.stringify(sv).includes(bId) && !JSON.stringify(sv).includes('Ali'), 'and no one\'s name or id outside the tables');
  check(sv.tables.length === 1 && sv.tourney.status === 'running', 'it lists the tables to watch');
  const tid = sv.tables[0].tid;
  sp.send({ t: 'watch', tid });
  const tb = await sp.waitFor(m => m.t === 'table' && m.table.tid === tid);
  check(tb && tb.you === null && tb.table.seats.filter(Boolean).length === 2, 'watching a table: the live table, with no hole cards');
  check(!sp.msgs.some(m => m.t === 'chatlog'), 'no table chat log is sent to a spectator');
  // A seated player chats: the spectator does not get it
  const atTable = await session(A);
  atTable.send({ t: 'chat', text: 'good luck all' });
  await sb.waitFor(m => m.t === 'chat' && m.msg.text === 'good luck all');
  await sleep(200);
  check(!sp.msgs.some(m => m.t === 'chat'), 'table chat never reaches a spectator');
  // a spectator cannot do anything but watch
  const before = sp.msgs.length;
  for(const m of [{ t: 'join' }, { t: 'chat', text: 'hi' }, { t: 'act', a: 'fold' }, { t: 'invite', group: true }, { t: 'profile', uid: aId }, { t: 'hands' }, { t: 'create', name: 'Mine' }]) sp.send(m);
  await sleep(400);
  check(!sp.msgs.slice(before).some(m => ['error', 'chaterr', 'invite', 'profile', 'hands'].includes(m.t)), 'every other message from a spectator is ignored');
  check((await view(O)).tourney.regs.length === 2, 'and the tournament is unchanged');
  check((await call('oppList', {}, P, 'main')).status === 403 && (await call('bizList', {}, P, 'main')).status === 403, 'the Blindrise club\'s Bulletin and Exchange stay closed to the spectator (403)');
  check((await view(P, X)).clubs.map(c => c.id).join() === X, 'watching changed no membership');
  // a club that is not a platform game cannot be watched: the hello falls back to the member's own club
  const sx = await session(P, X, X); sx.ws.close();
  check(!sx.view.spectate && sx.view.club.id === X, 'only the Blindrise club and the Blindrise Open can be watched');
  const sq = await session(Q, X, 'main'); sq.ws.close();
  check(sq.view.spectate === true, 'any member of any club can watch');

  // ---------- dominoes ----------
  await ok('dominoCreate', { name: 'Domino Night', preset: 'block', format: 'hu', target: 100, tables: 1, roundMin: 0 }, O);
  await sleep(300);
  let ld = (await view(P, X)).live.domino;
  check(ld && ld.name === 'Domino Night' && ld.status === 'registering' && ld.count === 0 && !ld.registered, 'the headline shows the Blindrise domino tournament');
  check(JSON.stringify(Object.keys(ld).sort()) === JSON.stringify(DOMINO_KEYS), 'the domino card carries only what it is, its state and counts');
  check(pushes('dom-open-').length === 1 && pushes('dom-open-')[0] === 5, 'everyone in every club is told dominoes are open: ' + pushes('dom-open-').join());
  await ok('dominoJoin', {}, A); await ok('dominoJoin', {}, B);
  await ok('dominoStart', {}, O);
  await sleep(300);
  ld = (await view(P, X)).live.domino;
  check(ld.status === 'running' && ld.count === 2 && ld.playing >= 0 && !JSON.stringify(ld).includes('Ali'), 'running, with counts only');
  check(pushes('dom-start-').length === 1 && pushes('dom-start-')[0] === 5, 'and told when it starts');
  const sd = await session(P, X, 'main');
  const board = await sd.waitFor(m => m.t === 'domino' && m.v.t);
  check(board && board.v.t.name === 'Domino Night' && board.v.ranking === null && board.v.stats === null && board.v.owner === false && board.v.mine === null, 'a spectator gets the read-only domino board, without the club rankings or stats');
  check((await call('dominoState', {}, P, 'main')).status === 403 && (await call('dominoJoin', {}, P, 'main')).status === 403, 'and cannot call the Blindrise club\'s domino actions (403)');
  sd.ws.close();

  for(const s of [so, sa, sb, sp, atTable]) s.ws.close();
  console.log(`\n${n} checks passed`);
  end(0);
})().catch(e => { console.error('FAIL', e.message); end(1); });
