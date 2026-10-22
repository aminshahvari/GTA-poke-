// The tournament prize (owner's request, 2026-10-22): an optional line in the director's words, set on create and edit,
// kept as plain text (trimmed, at most 80 characters), amounts allowed in the app (owner ruling), and no web addresses, emails, handles or phone
// numbers (server/content.js). Sent with the tournament to members; a spectator from another club gets none.
const { spawn } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os'), net = require('net');
const WebSocket = require('ws');
let fails = 0, oks = 0;
const ok = (c, m) => { if(c) oks++; else { fails++; console.log('FAIL', m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 4000) => { const t0 = Date.now(); while(!f() && Date.now() - t0 < ms) await sleep(20); return f(); };
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let srv; process.on('exit', () => { try{ srv.kill('SIGKILL'); }catch(e){} });
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tprize-')); process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
  const port = await freePort(), base = `http://127.0.0.1:${port}`;
  const env = { ...process.env, PORT: String(port), FAST: '1', NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: path.join(dir, 'club.json'), DATABASE_URL: '' };
  delete env.STAGING; delete env.GAMEPLAY_OPTIONS; delete env.CLUB_SWITCHING;
  srv = spawn(process.execPath, ['server/index.js'], { cwd: path.join(__dirname, '..'), env, stdio: ['ignore', 'ignore', 'inherit'] });
  for(let i = 0; i < 200; i++){ try{ if((await fetch(base + '/healthz')).ok) break; }catch(e){} await sleep(50); }
  const post = async (p, body, token) => (await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) })).json();
  const own = await post('/api/setup', { code: 'secret', name: 'Owner', pin: '1234', agree: true });
  const { code } = await post('/api/invite', {}, own.token);
  const mem = await post('/api/redeem', { code, name: 'Player One', pin: '4321', agree: true });
  const connect = tok => new Promise(res => { const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`), c = { ws, send: o => ws.send(JSON.stringify(o)) };
    ws.on('open', () => c.send({ t: 'hello', token: tok }));
    ws.on('message', raw => { const m = JSON.parse(raw); if(m.t === 'club'){ c.club = m.club; if(!c.ready){ c.ready = true; res(c); } } if(m.t === 'error') c.err = m.error; }); });
  const o = await connect(own.token), m = await connect(mem.token);
  const T = c => c.club && c.club.tourney;
  // errors come back as messages; a refused prize leaves the tournament as it was
  const tryIt = async (msg) => { o.err = null; const seq = JSON.stringify(T(o)); o.send(msg); await until(() => o.err || JSON.stringify(T(o)) !== seq, 2000); return o.err; };

  ok(!await tryIt({ t: 'create', name: 'Prize Night', stack: 30000, levelMin: 20, prize: '  Dinner   for two\n& dessert  ' }), 'create with a prize');
  await until(() => T(m) && T(m).prize);
  ok(T(o).prize === 'Dinner for two & dessert', 'the prize is trimmed and its spaces folded: ' + JSON.stringify(T(o).prize));
  ok(T(m).prize === 'Dinner for two & dessert', 'members get the prize with the tournament');
  ok(!await tryIt({ t: 'edit', name: 'Prize Night', stack: 30000, levelMin: 20 }) && T(o).prize === 'Dinner for two & dessert', 'an edit without the field keeps the prize');
  for(const good of ['$100 Prize', '$50 Prize', '$100 gift card']){
    ok(!await tryIt({ t: 'edit', name: 'Prize Night', stack: 30000, levelMin: 20, prize: good }) && T(o).prize === good, `allowed in the app's lobby: ${good}`);
  }
  ok(!await tryIt({ t: 'edit', name: 'Prize Night', stack: 30000, levelMin: 20, prize: 'Dinner for two & dessert' }), 'back to the dinner');
  for(const [bad, why] of [['Visit aurora.com for details', 'a web address'], ['Call 416-555-0199', 'a phone number'], ['DM @auroracoffee', 'a handle'], ['x'.repeat(81), 'too long']]){
    const e = await tryIt({ t: 'edit', name: 'Prize Night', stack: 30000, levelMin: 20, prize: bad });
    ok(e && T(o).prize === 'Dinner for two & dessert', `refused: ${why} (${e})`);
  }
  ok(!await tryIt({ t: 'edit', name: 'Prize Night', stack: 30000, levelMin: 20, prize: 'A free latte for a month' }) && T(o).prize === 'A free latte for a month', 'an edit changes the prize');
  ok(!await tryIt({ t: 'edit', name: 'Prize Night', stack: 30000, levelMin: 20, prize: '' }) && T(o).prize === '', 'and can clear it');
  ok(!await tryIt({ t: 'edit', name: 'Prize Night', stack: 30000, levelMin: 20, prize: '<b>Mug</b> & "beans"' }) && T(o).prize === '<b>Mug</b> & "beans"', 'kept as plain text (escaped where shown)');
  o.err = null; m.send({ t: 'edit', name: 'X', prize: 'Mine' }); await sleep(300);
  ok(T(o).prize === '<b>Mug</b> & "beans"', 'a member cannot set the prize');
  o.ws.close(); m.ws.close();
  console.log(`t_prize: ${oks} ok, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
