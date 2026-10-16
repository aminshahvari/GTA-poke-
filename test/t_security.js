// A bad Origin header can't crash the server, and wrong PINs are limited per name no matter what IP header is sent.
const assert = require('assert');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const PORT = 3990 + Math.floor(Math.random() * 9), BASE = 'http://localhost:' + PORT;
const srv = spawn('node', ['server/index.js'], { cwd: __dirname + '/..', env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: require('os').tmpdir() + '/t_sec_' + process.pid + '.json', FAST: '' }, stdio: 'ignore' });
const post = (p, body, ip) => fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(ip ? { 'x-forwarded-for': ip } : {}) }, body: JSON.stringify(body) });
(async () => {
  await new Promise(r => setTimeout(r, 900));
  assert.strictEqual((await post('/api/setup', { code: 'secret', name: 'Sean', pin: '1234', agree: true })).status, 200, 'owner set up');
  for(const origin of ['null', 'not a url', '://']){
    await new Promise(r => { const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws', { headers: { Origin: origin } }); ws.on('close', r); ws.on('error', r); });
  }
  assert.strictEqual((await fetch(BASE + '/healthz')).status, 200, 'server still up after bad origins');
  let codes = [];
  for(let i = 0; i < 12; i++) codes.push((await post('/api/login', { name: 'Sean', pin: String(1000 + i) }, `10.0.${i}.1`)).status);
  assert.ok(codes.slice(0, 10).every(c => c === 400), 'first 10 wrong PINs answered normally');
  assert.deepStrictEqual(codes.slice(10), [429, 429], 'name locked after 10 wrong PINs, even with a new IP each time');
  assert.strictEqual((await post('/api/login', { name: 'Sean', pin: '1234' }, '10.9.9.9')).status, 429, 'locked name stays locked');
  assert.strictEqual((await post('/api/constructor', {})).status, 404, 'inherited names are not API calls');
  console.log('security test passed'); srv.kill(); process.exit(0);
})().catch(e => { console.error(e); srv.kill(); process.exit(1); });
