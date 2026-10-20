// Club cap and the founder's notice (Muse #10 D2, D4): the number of clubs is set by MAX_CLUBS (1000 unless set; it
// was a fixed 50), and when a member opens a club the founder gets a notification with the club's name only.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let n = 0; const check = (c, msg) => { assert.ok(c, msg); n++; console.log('ok  ', msg); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't_club_cap_'));
const procs = [];
const end = code => { procs.forEach(p => { try{ p.kill(); }catch(e){} }); try{ fs.rmSync(tmp, { recursive: true, force: true }); }catch(e){} process.exit(code); };
async function boot(name, env){
  const PORT = 6400 + Math.floor(Math.random() * 300), BASE = 'http://localhost:' + PORT, out = [];
  const p = spawn('node', ['server/index.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', PUSH_LOG: '1', OWNER_CODE: 'secret', DATA_FILE: path.join(tmp, name + '.json'), FAST: '1', STAGING: '', CLUBS_DEFAULT: 'on', CLUB_SWITCHING: '1', ...env }, stdio: ['ignore', 'pipe', 'ignore'] });
  procs.push(p); p.stdout.on('data', d => out.push(...String(d).split('\n').filter(Boolean)));
  for(let i = 0; i < 60; i++){ try{ if((await fetch(BASE + '/healthz')).ok) break; }catch(e){} await sleep(150); }
  const call = async (api, body, tok) => { const r = await fetch(BASE + '/api/' + api, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body || {}) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
  const ok = async (...a) => { const r = await call(...a); assert.strictEqual(r.status, 200, a[0] + ': ' + JSON.stringify(r.body)); return r.body; };
  return { call, ok, out };
}
const RULES = { rulesV: 1, acceptRules: true };
(async () => {
  // ---------- MAX_CLUBS=2, and the founder's notice ----------
  const a = await boot('a', { MAX_CLUBS: '2' });
  const O = (await a.ok('setup', { code: 'secret', name: 'Founder', pin: '1234', agree: true })).token;
  const Bo = (await a.ok('redeem', { code: (await a.ok('invite', {}, O)).code, name: 'Bakery Bo', pin: '1357', agree: true })).token;
  await a.ok('bizSave', { name: 'Bo Bakery', category: 'food' }, Bo); await a.ok('bizPublish', { on: true }, Bo);
  const C = (await a.ok('createClub', { name: 'Bakery Club', ...RULES }, Bo)).club;
  await sleep(200);
  const notes = a.out.filter(l => l.startsWith('push club-'));
  check(notes.length === 1 && notes[0] === `push club-${C} A new club opened -> 1 players`, 'a member opening a club sends the founder one notification: ' + notes.join(' | '));
  await a.ok('createClub', { name: 'Founder Lounge', code: 'secret', ...RULES }, O);
  await sleep(200);
  check(a.out.filter(l => l.startsWith('push club-')).length === 1, 'the founder opening a club himself is not notified');
  const full = await a.call('createClub', { name: 'One Too Many', code: 'secret', ...RULES }, O);
  check(full.status === 400 && full.body.error === 'This server already has 2 clubs.', 'MAX_CLUBS sets the cap: ' + full.body.error);

  // ---------- unset: well past the old 50 ----------
  const b = await boot('b', {});
  const O2 = (await b.ok('setup', { code: 'secret', name: 'Founder', pin: '1234', agree: true })).token;
  for(let i = 1; i <= 51; i++) await b.ok('createClub', { name: 'Club ' + i, code: 'secret', ...RULES }, O2);
  check(true, 'with MAX_CLUBS unset, a 51st club opens (the old fixed cap was 50)');
  console.log(`t_club_cap: ${n} ok, 0 failed`); end(0);
})().catch(e => { console.error(e); end(1); });
