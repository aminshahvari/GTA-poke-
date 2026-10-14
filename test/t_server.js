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
  if(!(await post('/api/setup', { code: 'nope', name: 'Sean', pin: '1234' })).error) fail('bad setup code accepted');
  const own = await post('/api/setup', { code: 'secret', name: 'Sean', pin: '1234' });
  if(!own.token) fail('owner setup ' + JSON.stringify(own));
  if(!(await post('/api/setup', { code: 'secret', name: 'Other', pin: '1234' })).error) fail('second owner allowed');
  if(!(await post('/api/login', { name: 'Sean', pin: '9999' })).error) fail('wrong pin accepted');
  if(!(await post('/api/login', { name: 'sean', pin: '1234' })).token) fail('login failed');
  if(!(await post('/api/invite', {}, 'garbage')).error) fail('invite without auth allowed');
  const tokens = [own.token];
  for(let i = 1; i < N; i++){
    const { code } = await post('/api/invite', {}, own.token);
    const r = await post('/api/redeem', { code, name: 'Friend ' + i, pin: '4321' });
    if(!r.token) fail('redeem ' + JSON.stringify(r));
    tokens.push(r.token);
    if(i === 1 && !(await post('/api/redeem', { code, name: 'Again', pin: '4321' })).error) fail('invite reused');
  }
  // members cannot run owner actions
  const clients = await Promise.all(tokens.map((tok, i) => new Promise(res => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`), c = { i, ws, id: null, club: null, tables: {}, acted: 0, cardsSeen: new Set() };
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: tok })));
    ws.on('message', raw => {
      const m = JSON.parse(raw);
      if(m.t === 'club'){ c.club = m.club; c.id = m.club.me.id; if(!c.ready){ c.ready = true; res(c); } }
      if(m.t === 'error') c.lastError = m.error;
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
  owner.ws.send(JSON.stringify({ t: 'start' }));
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
  console.log(`server test: ${N} players, max ${maxTables} tables, ${checks} chip checks, ${clients.reduce((a, c) => a + c.acted, 0)} actions, ${Math.round((Date.now() - t0) / 1000)}s, champion ${h && h.results[0].name}`);
  console.log(fails ? `${fails} FAILURES` : 'server test passed');
  clients.forEach(c => c.ws.close()); srv.kill();
  process.exit(fails ? 1 : 0);
})();
