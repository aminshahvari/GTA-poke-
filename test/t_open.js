// The Blindrise Open with club switching (owner decisions 2026-10-20, Issue #10): Blindrise tournaments that members of
// every club can join, run by the founder in their own context (server/clubs.js EVENTS).
// - only the founder runs it; members register from their own club, and registering is what lets them in
// - other clubs see a card with counts only: never who registered (the list belongs to Blindrise)
// - players show under their table name only; names that look alike get their club's name, so none render the same
// - no real-name field (a business's full name) in any Blindrise Open payload: seats, members, standings, results
// - no Exchange, invites or rewards inside it
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't_open_'));
const DATA = path.join(tmp, 'data.json');
const PORT = 5700 + Math.floor(Math.random() * 200), BASE = 'http://localhost:' + PORT;
const srv = spawn('node', ['server/index.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '1', STAGING: '', CLUBS_DEFAULT: 'on', CLUB_SWITCHING: '1', TIME_BANK_MS: '300', LEVEL_MS: '400', BREAKS: '0' }, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let n = 0; const check = (c, msg) => { assert.ok(c, msg); n++; console.log('ok  ', msg); };
async function call(p, body, tok, club){
  const r = await fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}), ...(club ? { 'x-club': club } : {}) }, body: JSON.stringify(body || {}) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
async function ok(...a){ const r = await call(...a); assert.strictEqual(r.status, 200, `${a[0]}: ${JSON.stringify(r.body)}`); return r.body; }
function session(tok, club){
  return new Promise((res, rej) => {
    const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws'), s = { ws, msgs: [], view: null };
    s.send = m => ws.send(JSON.stringify(m));
    s.waitFor = async (pred, ms = 6000) => { const end = Date.now() + ms; while(Date.now() < end){ const m = s.msgs.find(pred); if(m) return m; await sleep(30); } return null; };
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: tok, club })));
    ws.on('message', m => { m = JSON.parse(m); s.msgs.push(m); if(m.t === 'auth' && !m.ok) res(s); if(m.t === 'club'){ s.view = m.club; if(!s.ready){ s.ready = true; res(s); } } });
    ws.on('error', rej); setTimeout(() => rej(new Error('timeout')), 5000);
  });
}
const view = async (tok, club) => { const s = await session(tok, club); s.ws.close(); return s.view; };
const CARD_KEYS = ['count', 'id', 'levelMin', 'name', 'open', 'playing', 'registered', 'remaining', 'stack', 'startAt', 'status'];
const REAL = 'Alexandra Realname';
const end = code => { srv.kill(); try{ fs.rmSync(tmp, { recursive: true, force: true }); }catch(e){} process.exit(code); };
(async () => {
  for(let i = 0; i < 60; i++){ try{ if((await fetch(BASE + '/healthz')).ok) break; }catch(e){} await sleep(150); }
  const O = (await ok('setup', { code: 'secret', name: 'Founder', pin: '1234', agree: true })).token;
  const join = async (name, tok = O, club) => (await ok('redeem', { code: (await ok('invite', {}, tok, club)).code, name, pin: '1357', agree: true })).token;
  const A = await join('Ali'), B = await join('Bea');
  // Ali's published business shows a full name to the main club's Exchange: it must never reach the Blindrise Open
  await ok('bizSave', { name: 'Ali Coffee', category: 'food', fullName: REAL, show: { fullName: true } }, A); await ok('bizPublish', { on: true }, A);
  const X = (await ok('createClub', { name: 'Harbour Club', code: 'secret', rulesV: 1, acceptRules: true }, O)).club;
  const Al2 = await join('AIi', O, X), Z = await join('Zed', O, X); // AIi: capital i, looks like Ali
  const aId = (await view(A)).me.id, a2Id = (await view(Al2, X)).me.id;

  // ---------- before there is one ----------
  check(!(await view(A)).bevent && !(await view(Al2, X)).bevent, 'no Blindrise Open card while there is no tournament');
  check((await call('eventJoin', {}, A)).status === 400, 'registering with no tournament open is refused');
  for(const [tok, club, who] of [[A, null, 'a main member'], [Al2, X, 'a member of another club']]) check((await call('eventsOpen', {}, tok, club)).status === 403, `${who} cannot run the Blindrise Open (403)`);
  check((await view(O)).canRunEvents === true && !(await view(A)).canRunEvents, 'only the founder is offered to run it');

  // ---------- the founder opens it and creates a tournament ----------
  check((await ok('eventsOpen', {}, O)).club === 'events', 'the founder opens the Blindrise Open');
  const so = await session(O, 'events');
  check(so.view.club.id === 'events' && so.view.club.name === 'Blindrise Open' && so.view.events === true && so.view.me.owner === true, 'he is its director');
  check(so.view.features.clubs === false && so.view.shop === null && so.view.membersInvite === false && !so.view.platform && !so.view.joinQr, 'no Exchange, rewards, invites, platform or QR inside it');
  so.send({ t: 'create', name: 'Blindrise Open Night', stack: 10000, levelMin: 60, tableSize: 6, lateLevels: 0 });
  await so.waitFor(m => m.t === 'club' && m.club.tourney && m.club.tourney.status === 'registering');
  so.send({ t: 'invite', group: true });
  check(await so.waitFor(m => m.t === 'error' && /no invite links/.test(m.error)), 'there are no invite links into it');
  await sleep(200);
  const card = (await view(A)).bevent, cardX = (await view(Al2, X)).bevent;
  check(card && cardX && card.name === 'Blindrise Open Night' && card.status === 'registering' && card.count === 0 && card.open && !card.registered, 'every club shows the Blindrise Open card');
  check(JSON.stringify(Object.keys(card).sort()) === JSON.stringify(CARD_KEYS) && JSON.stringify(Object.keys(cardX).sort()) === JSON.stringify(CARD_KEYS), 'the card carries only what it is, when and counts');

  // ---------- registering from each club ----------
  await ok('eventJoin', {}, A); await ok('eventJoin', {}, Al2, X); await ok('eventJoin', {}, Z, X);
  const vA = await view(A), vB = await view(B), vX = await view(Al2, X);
  check(vA.bevent.registered && vA.bevent.count === 3 && !vB.bevent.registered && vB.bevent.count === 3 && vX.bevent.registered, 'registered from main and from Harbour Club: counts and "you are in" are right in each');
  check(!JSON.stringify(vB.bevent).includes('Ali') && !JSON.stringify(vB.bevent).includes(aId), 'a club card never says who registered');
  check(vA.clubs.map(c => c.id).join() === 'main,events' && vX.clubs.map(c => c.id).join() === X + ',events', 'registering adds the Blindrise Open to the member\'s clubs, last');
  check(!vB.clubs.some(c => c.id === 'events'), 'someone who did not register does not have it');
  // someone not registered cannot get in
  check((await view(B, 'events')).club.id === 'main', 'a member who did not register is not let into it (falls back to their club)');
  check((await call('oppList', {}, B, 'events')).status === 403, 'and its calls are refused (403)');
  // inside: the table names only, look-alikes told apart, no real name anywhere
  const ve = await view(A, 'events'), names = ve.members.map(m => m.name).sort();
  check(names.includes('Ali (BLI)') && names.includes('AIi (HC)') && names.includes('Zed') && names.includes('Founder'), 'look-alike names get their club\'s name; others show just the table name: ' + names.join(', '));
  check(new Set(names).size === names.length, 'no two players show the same name');
  // two look-alikes from the same club: the club tag alone would not tell them apart
  const Zo = await join('Zoe', O, X), Z0 = await join('Z0e', O, X);
  await ok('eventJoin', {}, Zo, X); await ok('eventJoin', {}, Z0, X);
  const zs = (await view(A, 'events')).members.map(m => m.name).filter(x => /^Z[o0]e /.test(x));
  check(zs.length === 2 && zs.every(x => /^Z[o0]e \(HC·[0-9a-f]{2}\)$/.test(x)) && zs[0] !== zs[1], 'two look-alikes from one club also get the end of their account id: ' + zs.join(', '));
  await ok('eventLeave', {}, Zo, X); await ok('eventLeave', {}, Z0, X);
  check(!JSON.stringify(ve).includes(REAL) && !JSON.stringify(ve).includes('fullName') && !JSON.stringify(ve).includes('jobTitle'), 'no real name or real-name field in the Blindrise Open view');
  check(ve.members.every(m => m.invitedBy === null || m.invitedBy === undefined), 'no inviter in it');
  check((await call('bizList', {}, A, 'events')).status === 404, 'no Exchange calls in it (404)');
  // unregister: back out of it
  await ok('eventLeave', {}, Z, X);
  const vZ = await view(Z, X);
  check(!vZ.bevent.registered && vZ.bevent.count === 2 && !vZ.clubs.some(c => c.id === 'events'), 'unregistering before the start takes the member out again');
  check((await view(Z, 'events')).club.id === X, 'and they can no longer open it');

  // ---------- play ----------
  so.send({ t: 'start' });
  const sa = await session(A, 'events');
  const tb = await sa.waitFor(m => m.t === 'table' && m.table.seats.filter(Boolean).length === 2, 8000);
  check(tb, 'the tournament starts with players from both clubs at one table');
  const seatNames = tb.table.seats.filter(Boolean).map(s => s.name).sort();
  check(seatNames.join() === ['AIi (HC)', 'Ali (BLI)'].sort().join(), 'seats show table names, look-alikes told apart: ' + seatNames.join(', '));
  check(!JSON.stringify(tb).includes(REAL), 'no real name in the table payload');
  const live = (await view(B)).bevent;
  check(live && live.status === 'running' && live.count === 2 && !live.registered && !live.open, 'other clubs see it live, counts only, closed to late sign-ups');
  check((await view(A)).bevent.playing === true, 'a seated player\'s own club card says they are playing');
  check((await call('eventJoin', {}, B)).status === 400, 'no sign-ups once it started without late registration');
  check((await call('eventLeave', {}, A)).status === 400, 'no unregistering once it started');
  // let it play out: both players go all in every hand
  const s2 = await session(Al2, 'events');
  const shove = (s, me) => s.ws.on('message', raw => { const m = JSON.parse(raw); if(m.t !== 'table') return; const tb = m.table;
    if(tb.actUid === me && tb.legal && s.last !== tb.tid + tb.seq){ s.last = tb.tid + tb.seq; const a = tb.legal.canRaise ? { t: 'raise', to: tb.legal.maxTo } : tb.legal.canCheck ? { t: 'check' } : { t: 'call' }; s.send({ t: 'act', tid: tb.tid, hand: tb.handNo, seq: tb.seq, a }); } });
  shove(sa, aId); shove(s2, a2Id);
  for(const s of [sa, s2]) for(const m of s.msgs.filter(m => m.t === 'table')) s.ws.emit('message', JSON.stringify(m));
  const done = await so.waitFor(m => m.t === 'club' && m.club.tourney && m.club.tourney.status === 'finished', 90000);
  check(done, 'it plays to the end');
  await sleep(300);
  const after = await view(A, 'events'), h = after.history[0];
  check(h && h.results.length === 2 && h.results.map(r => r.name).sort().join() === ['AIi (HC)', 'Ali (BLI)'].sort().join(), 'the results show the table names, look-alikes told apart');
  check(!JSON.stringify(after).includes(REAL), 'no real name in the results or standings');
  check(!(await view(B)).bevent && !(await view(Al2, X)).bevent, 'once it ends, the card leaves every club');
  check(!(await view(A)).history.some(x => x.id === h.id) && !(await view(Al2, X)).history.some(x => x.id === h.id), 'its results stay in the Blindrise Open, not in the players\' clubs (their points are untouched)');
  check((await view(A)).clubs.some(c => c.id === 'events'), 'a player keeps it in their clubs to see the results');
  sa.ws.close(); s2.ws.close(); so.ws.close();
  console.log(`\nt_open: ${n} ok, 0 failed`); end(0);
})().catch(e => { console.error(e); end(1); });
