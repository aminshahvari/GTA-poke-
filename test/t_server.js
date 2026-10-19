// Full-stack test: owner + invited friends play a whole tournament over WebSockets.
const { spawn } = require('child_process');
const { watchServer, waitReady } = require('./ready');
const path = require('path'), fs = require('fs'), os = require('os'), net = require('net');
const WebSocket = require('ws');
// a real free port (other test servers run on this machine; a random 3900+n port collided -> ECONNRESET)
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const N = +process.argv[2] || 23;
let PORT, base;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsrv-')), dataFile = path.join(dir, 'club.json');
let fails = 0; const fail = m => { fails++; if(fails < 15) console.log('FAIL', m); };
const post = async (p, body, token) => { const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }); return r.json(); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// wait for a condition instead of a fixed sleep (fixed sleeps failed under load); the caller still asserts it
const until = async (f, ms = 3000) => { const t0 = Date.now(); while(!f() && Date.now() - t0 < ms) await sleep(20); };
let srv; process.on('exit', () => { try{ srv.kill('SIGKILL'); }catch(e){} try{ fs.rmSync(dir, { recursive: true, force: true }); }catch(e){} });
(async () => {
  // start on a free port and wait for /healthz; retry on a new port if ours was taken in between (EADDRINUSE)
  for(let tries = 0; ; tries++){
    PORT = await freePort(); base = `http://127.0.0.1:${PORT}`;
    srv = watchServer(spawn(process.execPath, ['server/index.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(PORT), FAST: '1', NO_BEACON: '1', DEBUG_CHIPS: '1', OWNER_CODE: 'secret', DATA_FILE: dataFile }, stdio: ['ignore', 'pipe', 'pipe'] }), { forward: true });
    srv.stdout.on('data', d => process.env.VERBOSE && process.stdout.write(d));
    // the last try is fatal: waitReady prints the diagnostic (port, elapsed, last error, stderr tail) and exits 1
    const up = await waitReady(base, srv, { fatal: tries >= 2 });
    if(up !== null && srv.exitCode === null) break;
    try{ srv.kill('SIGKILL'); }catch(e){}
  }
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
      if(m.t === 'chat'){ (c.chats = c.chats || []).push(m.msg); }
      if(m.t === 'chaterr') c.chatErr = m.error;
      if(m.t === 'fair') c.fair = m.report;
      if(m.t === 'invite') c.invite = m;
            if(m.t === 'claimed') c.claimed = (c.claimed || 0) + 1;
      if(m.t === 'table'){
        const tb = m.table; c.tables[tb.tid] = tb;
        const seated = tb.seats.some(s => s && s.uid === c.id);
        if(m.you && !seated) fail('cards sent to a player not at the table');
        if(!seated && m.you) fail('leak');
        if(m.you) c.cards = m.you;
        if(m.you){ c.dealt = c.dealt || {}; c.dealt[tb.tid + '#' + m.you.hand] = m.you.cards.join(); }
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
  m1.ws.send(JSON.stringify({ t: 'create', name: 'Hack' })); await until(() => m1.lastError);
  if(!m1.lastError) fail('member could create a tournament');
  const SIZE = +(process.env.SIZE || 6); owner.ws.send(JSON.stringify({ t: 'create', name: 'Friday Night', stack: 30000, levelMin: 1, tableSize: SIZE, lateLevels: 2 }));
  await until(() => owner.club.tourney && owner.club.tourney.status === 'registering');
  const late = clients.slice(-2); // these two use late registration
  clients.filter(c => !late.includes(c)).forEach(c => c.ws.send(JSON.stringify({ t: 'join' })));
  await until(() => owner.club.tourney.regs.length === N - 2);
  if(owner.club.tourney.regs.length !== N - 2) fail('regs ' + owner.club.tourney.regs.length);
  // manual household: owner and Friend 3 live together
  owner.ws.send(JSON.stringify({ t: 'household', uid: owner.id, with: clients[3].id })); await until(() => (owner.club.households || {})[owner.id]); await sleep(100);
  const conf = owner.club.conflicts || [];
  const expectPairs = Math.floor((N - 3) / 2) + 1;
  if(conf.length !== expectPairs) fail(`expected ${expectPairs} linked pairs before start, got ${conf.length}`);
  if(m1.club.conflicts) fail('members can see link info');
  owner.ws.send(JSON.stringify({ t: 'start' }));
  await until(() => owner.club.tourney.status === 'running');
  if(owner.club.tables.length !== Math.ceil((N - 2) / SIZE)) fail(`tables at start ${owner.club.tables.length}, expected ${Math.ceil((N - 2) / SIZE)}`);
  await sleep(280);
  if(N > 9 && N > 2 * SIZE && (owner.club.conflicts || []).length) fail('linked players seated together at start: ' + JSON.stringify(owner.club.conflicts));
  // shuffle seal is public, the secret is not
  if(!/^[0-9a-f]{64}$/.test(owner.club.tourney.seal || '')) fail('no shuffle seal');
  if(JSON.stringify(m1.club).includes('fairSeed')) fail('shuffle secret leaked while running');
  // table chat: only the sender's table hears it; mute works. The tournament is paused and seating taken from the server
  // (not each client's lagging club.myTable): a player busted or moved between the check and the send made the throw
  // silently drop ("throw not delivered") and mis-sorted mates/others. Isolation in depth: test/t_chat.js.
  { owner.ws.send(JSON.stringify({ t: 'pause' })); await until(() => owner.club.tourney.paused);
    let seat = null;
    for(let prev = '', i = 0; i < 40; i++){ const d = await (await fetch(base + '/debug/chips')).json(), k = JSON.stringify(d.detail.map(x => [x.tid, x.seats.map(q => q[1])]));
      if(k === prev){ seat = new Map(); d.detail.forEach(x => x.seats.forEach(q => seat.set(q[1], x.tid))); break; } prev = k; await sleep(400); }
    if(!seat) fail('seating never settled while paused');
    const tidOf = c => seat && seat.get(c.id), a = clients.find(c => c !== owner && tidOf(c) && clients.filter(m => tidOf(m) === tidOf(c)).length > 1);
    const mates = clients.filter(c => c !== a && tidOf(c) === tidOf(a)), others = clients.filter(c => tidOf(c) && tidOf(c) !== tidOf(a));
    a.ws.send(JSON.stringify({ t: 'chat', text: '  nice   hand <b>x</b> ' }));
    const heard = c => (c.chats || []).some(x => x.text === 'nice hand <b>x</b>' && x.from === a.id);
    await until(() => mates.every(heard)); await sleep(150);
    if(!mates.length || !mates.every(heard)) fail('table chat not delivered to tablemates');
    if(others.some(c => (c.chats || []).length)) fail('chat leaked to another table');
    a.chatErr = null; a.ws.send(JSON.stringify({ t: 'chat', text: 'spam' })); await until(() => a.chatErr);
    if(!a.chatErr) fail('chat rate limit missing');
    const target = mates[0]; await sleep(900);
    a.ws.send(JSON.stringify({ t: 'throw', item: 'tomato', to: target.id }));
    const hit = () => (target.chats || []).some(x => x.kind === 'throw' && x.item === 'tomato'); await until(hit);
    if(!hit()) fail('throw not delivered');
    owner.ws.send(JSON.stringify({ t: 'mute', uid: a.id, muted: true })); await until(() => (owner.club.mutedIds || []).includes(a.id)); a.chatErr = null;
    a.ws.send(JSON.stringify({ t: 'chat', text: 'muted?' })); await until(() => a.chatErr); await sleep(150);
    if(!a.chatErr || (target.chats || []).some(x => x.text === 'muted?')) fail('muted player could chat');
    owner.ws.send(JSON.stringify({ t: 'mute', uid: a.id, muted: false })); await until(() => !(owner.club.mutedIds || []).includes(a.id));
    owner.ws.send(JSON.stringify({ t: 'resume' })); await until(() => !owner.club.tourney.paused);
    if(owner.club.tourney.paused) fail('could not resume'); }
  // late registration: two players join after the start and get seats
  late.forEach(c => c.ws.send(JSON.stringify({ t: 'join' }))); await until(() => late.every(c => c.club.myTable));
  if(late.some(c => !c.club.myTable)) fail('late registrant not seated');
  if(owner.club.tourney.entrants !== N) fail('entrants after late reg ' + owner.club.tourney.entrants);
  late[0].lastError = null; late[0].ws.send(JSON.stringify({ t: 'join' })); await until(() => late[0].lastError);
  if(!late[0].lastError) fail('joined twice');
  const t0 = Date.now(); let maxTables = 0, checks = 0, hfhRounds = 0;
  while(Date.now() - t0 < 600000){
    await sleep(250);
    const d = await (await fetch(base + '/debug/chips')).json();
    if(d.hfh && d.hfh.on) hfhRounds = Math.max(hfhRounds, d.hfh.round);
    if(d.expected != null){ checks++; maxTables = Math.max(maxTables, d.tables.length); if(d.chips !== d.expected){ if(!global.dumped && d.detail){ global.dumped = 1; console.log(JSON.stringify(d.detail)); } fail(`chips ${d.chips} != ${d.expected}`); } if(d.tables.some(t => t.players > SIZE)) fail('table over ' + SIZE); }
    const t = owner.club.tourney;
    if(t && t.status === 'finished') break;
  }
  const t = owner.club.tourney;
  const places = (t.places || []).map(p => p.place).sort((a, b) => a - b).join();
  if(t.status !== 'finished') fail('not finished: ' + t.status + ' remaining ' + t.remaining);
  if(places !== Array.from({ length: N }, (_, i) => i + 1).join()) fail('places ' + places);
  const h = owner.club.history[0];
  if(!h || h.results.length !== N) fail('history');
  const paidN = h.payouts.length;
  if(paidN !== Math.max(1, Math.ceil(N * 0.15))) fail('paid places ' + paidN);
  if(N >= 40 && Math.max(1, Math.ceil(N * 0.15)) + 1 > SIZE && !hfhRounds) fail('no hand-for-hand at the bubble');
  // provably fair: the revealed secret rebuilds every deck, and matches the cards each player was actually sent
  { m1.ws.send(JSON.stringify({ t: 'fair', id: h.id })); await sleep(1500);
    const rep = m1.fair;
    if(!rep || !rep.seed || !rep.hands.length) fail('no fairness report');
    else {
      global.window = {}; require('../public/fair-verify.js'); const r = await window.FAIR.verify(rep);
      if(!r.sealOk) fail('seal does not match seed');
      if(r.bad || r.ok !== rep.hands.length) fail(`fair check: ${r.bad} bad of ${rep.hands.length}`);
      const E2 = require('../server/engine.js'); let compared = 0, wrong = 0;
      for(const c of clients) for(const [k, cards] of Object.entries(c.dealt || {})){
        const [tid, no] = k.split('#'), recs = rep.hands.filter(x => x.tid === tid && String(x.hand) === no);
        const rec = recs[recs.length - 1]; if(!rec) continue;
        const p = rec.players.find(x => x.uid === c.id); if(!p) continue;
        compared++; if(p.cards.join() !== E2.parse(cards.split(',').join(' ')).join()) wrong++;
      }
      if(!compared || wrong) fail(`dealt cards vs fair record: ${wrong} wrong of ${compared}`);
      // tamper: one changed card must be caught
      const bad = JSON.parse(JSON.stringify(rep)); bad.hands[0].board = bad.hands[0].board.length ? [(bad.hands[0].board[0] + 1) % 52, ...bad.hands[0].board.slice(1)] : bad.hands[0].board;
      bad.hands[0].players[0].cards[0] = (bad.hands[0].players[0].cards[0] + 1) % 52;
      if((await window.FAIR.verify(bad)).bad !== 1) fail('tampered hand not detected');
      console.log(`fair deal: ${r.ok} hands verified, ${compared} dealt hands cross-checked`);
    } }
  // group invite link: many people, then cancelled
  { owner.invite = null; owner.ws.send(JSON.stringify({ t: 'invite', group: true })); await until(() => owner.invite, 5000);
    const code = owner.invite && owner.invite.code;
    if(!code || !owner.invite.group) fail('no group invite');
    const a1 = await post('/api/redeem', { code, name: 'Group A', pin: '1111', agree: true }), a2 = await post('/api/redeem', { code, name: 'Group B', pin: '1111', agree: true });
    if(!a1.token || !a2.token) fail('group link should work for several people');
    const findGi = () => (owner.club.invites || []).find(i => i.code === code); await until(() => findGi() && findGi().used === 2, 5000); const gi = findGi();
    if(!gi || gi.used !== 2) fail('group link use count ' + JSON.stringify(gi));
    owner.ws.send(JSON.stringify({ t: 'revoke', code })); await until(() => !findGi(), 5000);
    if(!(await post('/api/redeem', { code, name: 'Group C', pin: '1111', agree: true })).error) fail('cancelled group link still works'); }
  // points + rewards shop
  const win = clients.find(c => c.id === h.results[0].uid), loser = clients.find(c => c.id === h.results.find(r => r.pts === 1 && r.uid !== owner.id).uid);
  if(process.env.VERBOSE_T) console.log(JSON.stringify(h.results.filter(r => r.tie)), JSON.stringify((t.places||[]).filter(r=>r.tie)));
  const pct1 = h.payouts[0];
  if(!h.results[0].tie && h.results[0].pts !== Math.max(2, Math.round(pct1 * N / 10))) fail('winner points ' + h.results[0].pts);
  if(h.results.filter(r => !r.tie && r.place > h.payouts.length).some(r => r.pts !== 1)) fail('unpaid places should get 1 point');
  const mem = clients.find(c => c !== owner && c !== win); mem.lastError = null; mem.ws.send(JSON.stringify({ t: 'addReward', name: 'x', cost: 1, qty: 1 })); await until(() => mem.lastError, 5000);
  if(!mem.lastError) fail('member could add a reward');
  owner.ws.send(JSON.stringify({ t: 'addReward', name: 'Gift card', cost: h.results[0].pts, qty: 1, value: '$25' })); await until(() => win.club.shop && win.club.shop.rewards[0], 5000);
  const rw = win.club.shop.rewards[0];
  if(!rw || rw.left !== 1) fail('reward not listed');
  const bal0 = win.club.shop.balance;
  win.q = null; win.ws.send(JSON.stringify({ t: 'skillq', rid: rw.id })); await until(() => win.q, 5000);
  win.lastError = null; win.ws.send(JSON.stringify({ t: 'claim', rid: rw.id, answer: '-1' })); await until(() => win.lastError, 5000);
  if(!win.lastError) fail('wrong skill answer accepted');
  win.q = null; win.ws.send(JSON.stringify({ t: 'skillq', rid: rw.id })); await until(() => win.q, 5000);
  const ans = Function('return ' + win.q.replace('×', '*').replace('÷', '/').replace('−', '-'))();
  win.ws.send(JSON.stringify({ t: 'claim', rid: rw.id, answer: String(ans) })); await until(() => win.claimed === 1 && win.club.shop.balance === bal0 - rw.cost, 5000);
  if(win.claimed !== 1) fail('claim failed ' + win.lastError);
  if(win.club.shop.balance !== bal0 - rw.cost) fail('balance not reduced');
  loser.lastError = null; loser.ws.send(JSON.stringify({ t: 'skillq', rid: rw.id })); await until(() => loser.lastError, 5000);
  if(!loser.lastError) fail('could claim without enough points / sold out');
  if(!(owner.club.shop.requests || []).length) fail('owner cannot see requests');
  console.log(`server test: ${N} players, max ${maxTables} tables, ${hfhRounds} hand-for-hand rounds, ${h.results.filter(r => r.tie).length} tied, ${checks} chip checks, ${clients.reduce((a, c) => a + c.acted, 0)} actions, ${Math.round((Date.now() - t0) / 1000)}s, champion ${h && h.results[0].name}`);
  console.log(fails ? `${fails} FAILURES` : 'server test passed');
  clients.forEach(c => c.ws.close()); srv.kill();
  process.exit(fails ? 1 : 0);
})();
