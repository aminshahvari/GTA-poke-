// Club switching + join QR: a club opened with club switching gets its own join page and QR straight away, its owner
// sees that club's card while in it, and with club switching off again (rollback) only the main club has a join page.
const assert = require('assert');
const fs = require('fs');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const DATA = require('os').tmpdir() + '/t_join_qr_clubs_' + process.pid + '.json';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let n = 0; const pass = m => { n++; console.log('ok', n, m); };
function start(sw){
  const PORT = 4400 + Math.floor(Math.random() * 50), BASE = 'http://localhost:' + PORT;
  const srv = spawn('node', ['server/index.js'], { cwd: __dirname + '/..', env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '', STAGING: '', CLUB_SWITCHING: sw ? '1' : '' }, stdio: 'ignore' });
  const call = async (p, body, tok, club) => {
    const r = await fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}), ...(club ? { 'x-club': club } : {}) }, body: JSON.stringify(body || {}) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const ok = async (...a) => { const r = await call(...a); assert.strictEqual(r.status, 200, a[0] + ': ' + JSON.stringify(r.body)); return r.body; };
  const view = (tok, club) => new Promise((res, rej) => {
    const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws');
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: tok, ...(club ? { club } : {}) })));
    ws.on('message', m => { m = JSON.parse(m); if(m.t === 'club'){ ws.close(); res(m.club); } });
    ws.on('error', rej); setTimeout(() => rej(new Error('timeout')), 5000);
  });
  const up = async () => { for(let i = 0; i < 40; i++){ try{ if((await fetch(BASE + '/healthz')).ok) return; }catch(e){} await sleep(150); } };
  const stop = () => new Promise(r => { srv.on('exit', r); srv.kill(); });
  return { call, ok, view, up, stop, BASE };
}
(async () => {
  let s = start(true); await s.up();
  const O = (await s.ok('setup', { code: 'secret', name: 'Sean', pin: '1234', agree: true })).token;
  const { club: cid } = await s.ok('createClub', { name: 'Sean Ventures', code: 'secret' }, O);
  const info = await s.ok('joinInfo', { slug: 'sean-ventures' });
  assert.deepStrictEqual([info.club, info.name, info.initials], [true, 'Sean Ventures', 'SV']);
  pass('a newly opened club has its own join page at once: /join/sean-ventures');
  const main = await s.view(O), mine = await s.view(O, cid);
  assert.deepStrictEqual(main.joinQr.map(c => c.slug), ['blindrise']);
  assert.deepStrictEqual(mine.joinQr.map(c => [c.slug, c.path, c.members]), [['sean-ventures', '/join/sean-ventures', 1]]);
  pass('in each club the owner sees that club\'s QR card (main: blindrise, new club: sean-ventures, 1 member)');
  await s.ok('joinClub', { slug: 'sean-ventures', email: 'fan@example.com', agree: true, token: info.token });
  assert.deepStrictEqual((await s.view(O, cid)).joinQr[0].leads.map(l => l.email), ['fan@example.com']);
  assert.strictEqual((await s.view(O)).joinQr[0].leads.length, 0);
  pass('a sign-up on the new club\'s page shows only in that club\'s card');
  await s.stop(); await sleep(300);
  // rollback: club switching off, same data
  s = start(false); await s.up();
  assert.deepStrictEqual(await s.ok('joinInfo', { slug: 'sean-ventures' }), { club: false });
  assert.strictEqual((await s.ok('joinInfo', { slug: 'blindrise' })).club, true);
  assert.deepStrictEqual((await s.view(O)).joinQr.map(c => c.slug), ['blindrise']);
  pass('club switching off (rollback): only the main club keeps a join page; the other club\'s page is not active');
  await s.stop();
  console.log(`t_join_qr_clubs: ${n} ok, 0 failed`); try{ fs.unlinkSync(DATA); }catch(e){} process.exit(0);
})().catch(e => { console.error(e); try{ fs.unlinkSync(DATA); }catch(x){} process.exit(1); });
