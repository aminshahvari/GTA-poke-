// Business Club + Opportunity Club switch: closed to members by default in production, the owner can always use them,
// opening and closing is owner-only, and closing keeps everything saved.
const assert = require('assert');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const PORT = 4200 + Math.floor(Math.random() * 50), BASE = 'http://localhost:' + PORT;
const DATA = require('os').tmpdir() + '/t_clubs_' + process.pid + '.json';
const srv = spawn('node', ['server/index.js'], { cwd: __dirname + '/..', env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '', STAGING: '', CLUBS_DEFAULT: '' }, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function call(p, body, tok){
  const r = await fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body || {}) });
  return { status: r.status, body: await r.json().catch(() => ({})), headers: r.headers };
}
const ok = async (p, body, tok) => { const r = await call(p, body, tok); assert.strictEqual(r.status, 200, `${p}: ${JSON.stringify(r.body)}`); return r.body; };
// open a socket, optionally send one message, and return the next club view
function clubView(tok, msg){
  return new Promise((res, rej) => {
    const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws'); let n = 0;
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: tok })));
    ws.on('message', m => { m = JSON.parse(m);
      if(m.t === 'auth' && !m.ok) return rej(new Error('auth'));
      if(m.t !== 'club') return;
      if(++n === 1 && msg){ ws.send(JSON.stringify(msg)); return; }
      ws.close(); res(m.club); });
    ws.on('error', rej);
    setTimeout(() => { try{ ws.close(); }catch(e){} rej(new Error('timeout')); }, 5000);
  });
}
(async () => {
  for(let i = 0; i < 40; i++){ try{ if((await fetch(BASE + '/healthz')).ok) break; }catch(e){} await sleep(150); }
  const O = (await ok('setup', { code: 'secret', name: 'Director', pin: '1234', agree: true })).token;
  const { code } = await ok('invite', {}, O);
  const A = (await ok('redeem', { code, name: 'Alex', pin: '1111', agree: true })).token;

  // closed by default: members are refused, with noindex; the owner can still use them; signed-out is still 401
  assert.strictEqual((await clubView(A)).features.clubs, false);
  for(const p of ['bizList', 'bizFeed', 'bizMine', 'oppList', 'oppMine', 'oppBadge']){
    const r = await call(p, {}, A);
    assert.strictEqual(r.status, 403, p + ' should be closed to members');
    assert.match(r.headers.get('x-robots-tag') || '', /noindex/);
  }
  assert.strictEqual((await call('bizList', {}, null)).status, 401);
  await ok('oppList', {}, O);
  await ok('oppSave', { type: 'need', title: 'Looking for a plumber', details: '', category: 'trades', area: '', expiresInDays: 30 }, O);

  // a member cannot open them
  assert.strictEqual((await clubView(A, { t: 'clubs', on: true })).features.clubs, false);
  assert.strictEqual((await call('oppList', {}, A)).status, 403);

  // the owner opens them: members see the owner's listing
  assert.strictEqual((await clubView(O, { t: 'clubs', on: true })).features.clubs, true);
  const list = await ok('oppList', {}, A);
  assert.strictEqual(list.items.length, 1);

  // closing again hides them, and the listing is still there for the owner
  assert.strictEqual((await clubView(O, { t: 'clubs', on: false })).features.clubs, false);
  assert.strictEqual((await call('oppList', {}, A)).status, 403);
  assert.strictEqual((await ok('oppList', {}, O)).items.length, 1);
  console.log('clubs switch test passed');
  srv.kill(); require('fs').rmSync(DATA, { force: true }); process.exit(0);
})().catch(e => { console.error(e); srv.kill(); process.exit(1); });
