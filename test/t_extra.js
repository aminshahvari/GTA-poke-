// Extra-time cards: tapping adds 30 seconds; a lone (final) table gives each player 5, then they run out.
const { spawn } = require('child_process');
const { watchServer, waitReady } = require('./ready');
const path = require('path'), fs = require('fs'), os = require('os');
const WebSocket = require('ws');
const PORT = 3800 + Math.floor(Math.random() * 90), base = `http://127.0.0.1:${PORT}`;
const dataFile = path.join(os.tmpdir(), `extra-${PORT}.json`); try{ fs.unlinkSync(dataFile); }catch(e){}
let fails = 0; const fail = m => { fails++; console.log('FAIL', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const post = async (p, body, token) => (await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) })).json();
(async () => {
  const srv = watchServer(spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: dataFile }, stdio: ['ignore', 'ignore', 'pipe'] }), { forward: true });
  await waitReady(base, srv);
  const own = await post('/api/setup', { code: 'secret', name: 'Sean', pin: '1234', agree: true });
  const { code } = await post('/api/invite', {}, own.token);
  const fr = await post('/api/redeem', { code, name: 'Friend', pin: '4321', agree: true });
  const seen = [];
  const clients = await Promise.all([own.token, fr.token].map((tok, i) => new Promise(res => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { 'x-forwarded-for': '10.0.0.' + (i + 1) } }), c = { ws };
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: tok, device: 'd' + i })));
    ws.on('message', raw => {
      const m = JSON.parse(raw);
      if(m.t === 'club' && !c.id){ c.id = m.club.me.id; res(c); }
      if(m.t === 'table' && m.table.actUid === c.id && m.table.legal) seen.push({ c, tb: m.table, at: Date.now() });
    });
  })));
  clients[0].ws.send(JSON.stringify({ t: 'create', name: 'X', stack: 30000, levelMin: 20 }));
  await sleep(200); clients.forEach(c => c.ws.send(JSON.stringify({ t: 'join' }))); await sleep(200);
  clients[0].ws.send(JSON.stringify({ t: 'start' }));
  for(let k = 0; k < 50 && !seen.length; k++) await sleep(100);
  if(!seen.length) fail('nobody was asked to act');
  else {
    const first = seen[seen.length - 1], who = first.c;
    if(first.tb.extras !== 5) fail('final table should give 5 extra-time cards, got ' + first.tb.extras);
    let last = first.tb;
    for(let n = 1; n <= 6; n++){
      const before = seen.length; who.ws.send(JSON.stringify({ t: 'extend' })); await sleep(250);
      const now = seen[seen.length - 1].tb;
      if(n <= 5){
        if(seen.length === before) { fail('no update after extend ' + n); continue; }
        if(now.extras !== 5 - n) fail(`after ${n} taps expected ${5 - n} left, got ${now.extras}`);
        if(now.deadline - last.deadline < 29000) fail('extend did not add 30 seconds');
        if(!now.usingBank) fail('clock not marked as extra time');
        last = now;
      } else if(seen.length !== before) fail('a sixth extend was allowed');
    }
  }
  clients.forEach(c => c.ws.close()); srv.kill();
  console.log(fails ? `extra-time test FAILED (${fails})` : 'extra-time test passed'); process.exit(fails ? 1 : 0);
})();
