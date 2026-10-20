// Club switching (CLUB_SWITCHING=1), limits and account closure, with the real rate limits on (no FAST):
// - opening a club asks for the setup code, so wrong codes are limited exactly like setup and owner recovery
// - an invite link takes an existing name + PIN, so wrong PINs there lock the name exactly like sign-in does
// - an account the organizer closes (removed from main) also leaves every other club's member list
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't_club_limits_'));
const DATA = path.join(tmp, 'data.json');
const PORT = 5000 + Math.floor(Math.random() * 300), BASE = 'http://localhost:' + PORT;
const srv = spawn('node', ['server/index.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '', STAGING: '', CLUBS_DEFAULT: 'on', CLUB_SWITCHING: '1' }, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let n = 0; const check = (c, msg) => { assert.ok(c, msg); n++; console.log('ok  ', msg); };
// each call comes from its own address unless one is given, so only the limit under test can apply
let ipN = 0; const nextIp = () => '10.1.' + (++ipN >> 8) + '.' + (ipN & 255);
async function call(p, body, tok, ip, club){
  const r = await fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip || nextIp(), ...(tok ? { authorization: 'Bearer ' + tok } : {}), ...(club ? { 'x-club': club } : {}) }, body: JSON.stringify(body || {}) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
async function ok(...a){ const r = await call(...a); assert.strictEqual(r.status, 200, `${a[0]}: ${JSON.stringify(r.body)}`); return r.body; }
// the club view a member gets on the app connection; keep: leave the socket open and return it
const view = (tok, club, keep) => new Promise((res, rej) => {
  const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws');
  ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: tok, club })));
  ws.on('message', m => { m = JSON.parse(m); if(m.t === 'club'){ if(keep) return res({ send: x => ws.send(JSON.stringify(x)), close: () => ws.close() }); ws.close(); res(m.club); } });
  ws.on('error', rej); setTimeout(() => rej(new Error('timeout')), 5000);
});
const end = code => { srv.kill(); try{ fs.rmSync(tmp, { recursive: true, force: true }); }catch(e){} process.exit(code); };
(async () => {
  for(let i = 0; i < 60; i++){ try{ if((await fetch(BASE + '/healthz')).ok) break; }catch(e){} await sleep(150); }
  const O = (await ok('setup', { code: 'secret', name: 'Director', pin: '1234', agree: true })).token;

  // opening a club: 5 wrong setup codes from one address lock that address, even for the right code
  const ip = '10.9.9.9', st = [];
  for(let i = 0; i < 5; i++) st.push((await call('createClub', { name: 'Guess Club', code: 'guess' + i }, O, ip)).status);
  check(st.every(x => x === 400), 'wrong setup codes are refused when opening a club');
  const locked = await call('createClub', { name: 'Guess Club', code: 'secret' }, O, ip);
  check(locked.status === 429, 'after 5 wrong setup codes, opening a club from that address is locked');
  check((await call('resetOwner', { code: 'secret', pin: '1234' }, null, ip)).status === 429, 'the lock is the same one that guards owner recovery');
  const B = (await ok('createClub', { name: 'Lounge B', code: 'secret' }, O)).club;
  check(/^c[0-9a-f]{10}$/.test(B), 'from another address the organizer still opens a club (control)');

  // an invite link with an existing name: wrong PINs count against that name, from any address, like sign-in
  const M = (await ok('redeem', { code: (await ok('invite', {}, O)).code, name: 'Mina', pin: '1111', agree: true })).token;
  const bInv = (await ok('invite', {}, O, null, B)).code;
  const tries = [];
  for(let i = 0; i < 10; i++) tries.push((await call('redeem', { code: bInv, name: 'Mina', pin: String(9000 + i), agree: true })).status);
  check(tries.every(x => x === 400), '10 wrong PINs for an existing name through an invite link are refused');
  check((await call('redeem', { code: bInv, name: 'Mina', pin: '1111', agree: true })).status === 429, 'then the name is locked for invite links, even with the right PIN from a new address');
  check((await call('login', { name: 'Mina', pin: '1111' })).status === 429, 'and for sign-in: one lock per name');
  check((await ok('redeem', { code: bInv, name: 'Nika', pin: '3333', agree: true })).club === B, 'a new name still joins with the same link (control)');
  check(M && (await call('invite', {}, M, null, B)).status === 403, 'Mina did not get into B by guessing');

  // closing an account from main: it disappears from the other clubs it was in, not only from main
  const T = (await ok('redeem', { code: (await ok('invite', {}, O)).code, name: 'Tara', pin: '4444', agree: true })).token;
  await ok('joinInvite', { code: (await ok('invite', {}, O, null, B)).code }, T);
  const N = (await call('login', { name: 'Nika', pin: '3333' })).body.token;
  const tId = (await view(T, B)).me.id;
  check((await view(N, B)).members.some(m => m.id === tId), 'Tara is listed in B (control)');
  await ok('bizSave', { name: 'Tara Studio', category: 'food', tagline: 'B', about: 'In B.' }, T, null, B);
  await ok('bizPublish', { on: true }, T, null, B);
  check(JSON.stringify((await ok('bizList', {}, N, null, B))).includes('Tara Studio'), 'Tara\'s business is listed in B (control)');
  const oA = await view(O, 'main', true);
  oA.send({ t: 'remove', uid: tId }); await sleep(400); oA.close();
  const nb = await view(N, B);
  check(!nb.members.some(m => m.id === tId), 'after the organizer closes Tara\'s account in main, B no longer lists her');
  check(!JSON.stringify((await ok('bizList', {}, N, null, B))).includes('Tara Studio'), 'and B\'s Exchange no longer shows her business');
  check((await call('login', { name: 'Tara', pin: '4444' })).status === 400, 'Tara cannot sign in (account closed, as before)');

  console.log(`t_club_limits: ${n} ok, 0 failed`);
  end(0);
})().catch(e => { console.error('FAIL', e.message); end(1); });
