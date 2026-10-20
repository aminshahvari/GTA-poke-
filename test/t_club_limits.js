// Club switching (CLUB_SWITCHING=1), limits and account closure, with the real rate limits on (no FAST):
// - opening a club asks for the setup code, so wrong codes are limited exactly like setup and owner recovery
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

  console.log(`t_club_limits: ${n} ok, 0 failed`);
  end(0);
})().catch(e => { console.error('FAIL', e.message); end(1); });
