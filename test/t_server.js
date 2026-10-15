// Full-stack test: owner + invited friends play a whole tournament over WebSockets.
const { spawn } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os');
const WebSocket = require('ws');
const N = +process.argv[2] || 23, PORT = 3900 + Math.floor(Math.random() * 90);
const base = `http://127.0.0.1:${PORT}`;
const dataFile = path.join(os.tmpdir(), `club-${PORT}.json`); try{ fs.unlinkSync(dataFile); }catch(e){}
let fails = 0; const fail = m => { fails++; if(fails < 15) console.log('FAIL', m); };
const post = async (p, body, token) => { const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }); return r.json(); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT, FAST: '1', OWNER_CODE: 'secret', DATA_FILE: dataFile }, stdio: ['ignore', 'pipe', 'inherit'] });
  srv.stdout.on('data', d => process.env.VERBOSE && process.stdout.write(d));
  await sleep(700);
  // setup + negative auth checks
  if(!(await post('/api/setup', { code: 'nope', name: 'Sean', pin: '1234', agree: true })).error) fail('bad setup code accepted');
  if(!(await post('/api/setup', { code: 'secret', name: 'Sean', pin: '1234' })).error) fail('setup without agreeing accepted');
  const own = await post('/api/setup', { code: 'secret', name: 'Sean', pin: '1234', agree: true });
  if(!own.token) fail('owner setup ' + JSON.stringify(own));
  if(!(await post('/api/setup', { code: 'secret', name: 'Other', pin: '1234', agree: true })).error) fail('second owner allowed');
  if(!(await post('/api/login', { name: 'Sean', pin: '9999' })).error) fail('wrong pin accepted');
  if(!(await post('/api/login', { name: 'sean', pin: '1234' })).token) fail('login failed');
  if(!(await post('/api/invite', {}, 'garbage')).error) fail('invite without auth allowed');
  const tokens = [own.token];
  for(let i = 1; i < N; i++){
    const { code } = await post('/api/invite', {}, own.token);
    const r = await post('/api/redeem', { code, name: 'Friend ' + i, pin: '4321', agree: true });
    if(!r.token) fail('redeem ' + JSON.stringify(r));
    tokens.push(r.token);
    if(i === 1 && !(await post('/api/redeem', { code, name: 'Again', pin: '4321', agree: true })).error) fail('invite reused');
  }
  // members cannot run owner actions
  const clients = await Promise.all(tokens.map((tok, i) => new Promise(res => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { 'x-forwarded-for': '10.0.0.' + (i === 0 ? 200 : Math.ceil(i / 2)) } }), c = { i, ws, id: null, club: null, tables: {}, acted: 0, cardsSeen: new Set() };
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: tok, device: 'dev' + i })));
    ws.on('message', raw => {
      const m = JSON.parse(raw);
      if(m.t === 'club'){ c.club = m.club; c.id = m.club.me.id; if(!c.ready){ c.ready = true; res(c); } }
      if(m.t === 'error') c.lastError = m.error;
      if(m.t === 'skillq') c.q = m.q;
      if(m.t === 'claimed') c.claimed = (c.claimed || 0) + 1;
      if(m.t === 'table'){
        const tb = m.table; c.tables[tb.tid] = tb;
        const seated = tb.seats.some(s => s && s.uid === c.id);
        if(m.you && !seated) fail('cards sent to a player not at the table');
        if(!seated && m.you) fail('leak');
        if(m.you) c.cards = m.you;
        tb.seats.forEach(s => { if(s && s.shown && s.uid !== c.id && tb.phase === 'hand' && !tb.result && tb.legal && tb.legal.canRaise === undefined) fail('shown early'); });
        if(tb.actUid === c.id && tb.legal && c.lastSeq !== tb.tid + tb.seq){
          c.lastSeq = tb.tid + tb.seq;
          const L = tb.legal, r = Math.random();
          let a;
          if(c.i % 7 === 6 && Math.random() < .5) return; // some players time out sometimes
          if(r < .3) a = L.canCheck ? { t: 'check' } : { t: 'fold' };
          else if(r < .4 && L.canRaise) a = { t: 'raise', to: L.maxTo };
          else if(r < .55 && L.canRaise) a = { t: 'raise', to: L.minTo + Math.floor(Math.random() * 4) * 100 };
          else a = L.canCheck ? { t: 'check' } : { t: 'call' };
          setTimeout(() => { ws.send(JSON.stringify({ t: 'act', tid: tb.tid, hand: tb.handNo, seq: tb.seq, a })); c.acted++; }, Math.random() * 30);
        }
      }
    });
  })));
  const owner = clients[0], m1 = clients[1];
  m1.ws.send(JSON.stringify({ t: 'create', name: 'Hack' })); await sleep(150);
  if(!m1.lastError) fail('member could create a tournament');
  owner.ws.send(JSON.stringify({ t: 'create', name: 'Friday Night', stack: 30000, levelMin: 1 }));
  await sleep(200);
  clients.forEach(c => c.ws.send(JSON.stringify({ t: 'join' })));
  await sleep(300);
  if(owner.club.tourney.regs.length !== N) fail('regs ' + owner.club.tourney.regs.length);
  // manual household: owner and Friend 3 live together
  owner.ws.send(JSON.stringify({ t: 'household', uid: owner.id, with: clients[3].id })); await sleep(200);
  const conf = owner.club.conflicts || [];
  const expectPairs = Math.floor((N - 1) / 2) + 1;
  if(conf.length !== expectPairs) fail(`expected ${expectPairs} linked pairs before start, got ${conf.length}`);
  if(m1.club.conflicts) fail('members can see link info');
  owner.ws.send(JSON.stringify({ t: 'start' }));
  await sleep(400);
  if(N > 9 && (owner.club.conflicts || []).length) fail('linked players seated together at start: ' + JSON.stringify(owner.club.conflicts));
  const t0 = Date.now(); let maxTables = 0, checks = 0;
  while(Date.now() - t0 < 600000){
    await sleep(250);
    const d = await (await fetch(base + '/debug/chips')).json();
    if(d.expected != null){ checks++; maxTables = Math.max(maxTables, d.tables.length); if(d.chips !== d.expected) fail(`chips ${d.chips} != ${d.expected}`); if(d.tables.some(t => t.players > 9)) fail('table over 9'); }
    const t = owner.club.tourney;
    if(t && t.status === 'finished') break;
  }
  const t = owner.club.tourney;
  const places = (t.places || []).map(p => p.place).sort((a, b) => a - b).join();
  if(t.status !== 'finished') fail('not finished: ' + t.status + ' remaining ' + t.remaining);
  if(places !== Array.from({ length: N }, (_, i) => i + 1).join()) fail('places ' + places);
  const h = owner.club.history[0];
  if(!h || h.results.length !== N) fail('history');
  // points + rewards shop
  const win = clients.find(c => c.id === h.results[0].uid), loser = clients.find(c => c.id === h.results[N - 1].uid);
  const pct1 = h.payouts[0];
  if(h.results[0].pts !== Math.max(2, Math.round(pct1 * N / 10))) fail('winner points ' + h.results[0].pts);
  if(h.results[N - 1].pts !== 1) fail('last place points');
  loser.ws.send(JSON.stringify({ t: 'addReward', name: 'x', cost: 1, qty: 1 })); await sleep(150);
  if(!loser.lastError) fail('member could add a reward');
  owner.ws.send(JSON.stringify({ t: 'addReward', name: 'Gift card', cost: h.results[0].pts, qty: 1, value: '$25' })); await sleep(250);
  const rw = win.club.shop.rewards[0];
  if(!rw || rw.left !== 1) fail('reward not listed');
  const bal0 = win.club.shop.balance;
  win.ws.send(JSON.stringify({ t: 'skillq', rid: rw.id })); await sleep(150);
  win.lastError = null; win.ws.send(JSON.stringify({ t: 'claim', rid: rw.id, answer: '-1' })); await sleep(150);
  if(!win.lastError) fail('wrong skill answer accepted');
  win.ws.send(JSON.stringify({ t: 'skillq', rid: rw.id })); await sleep(150);
  const ans = Function('return ' + win.q.replace('×', '*').replace('÷', '/').replace('−', '-'))();
  win.ws.send(JSON.stringify({ t: 'claim', rid: rw.id, answer: String(ans) })); await sleep(300);
  if(win.claimed !== 1) fail('claim failed ' + win.lastError);
  if(win.club.shop.balance !== bal0 - rw.cost) fail('balance not reduced');
  loser.lastError = null; loser.ws.send(JSON.stringify({ t: 'skillq', rid: rw.id })); await sleep(150);
  if(!loser.lastError) fail('could claim without enough points / sold out');
  if(!(owner.club.shop.requests || []).length) fail('owner cannot see requests');
  console.log(`server test: ${N} players, max ${maxTables} tables, ${checks} chip checks, ${clients.reduce((a, c) => a + c.acted, 0)} actions, ${Math.round((Date.now() - t0) / 1000)}s, champion ${h && h.results[0].name}`);
  console.log(fails ? `${fails} FAILURES` : 'server test passed');
  clients.forEach(c => c.ws.close()); srv.kill();
  process.exit(fails ? 1 : 0);
})();
