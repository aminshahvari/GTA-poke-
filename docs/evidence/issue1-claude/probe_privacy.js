// Claude triage probe (issue #1, concern 3). Read-only against the code: spawns a local FAST server on a temp DATA_FILE,
// plays a tournament with a railbird (unregistered member watching every table) and players that randomly disconnect
// and reconnect mid-hand, and checks every 'table' message for hole-card leaks.
// usage: node probe_privacy.js <repo dir>
const { spawn } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os'), net = require('net');
const REPO = path.resolve(process.argv[2]);
const WebSocket = require(path.join(REPO, 'node_modules', 'ws'));
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 5000) => { const t0 = Date.now(); while(!f() && Date.now() - t0 < ms) await sleep(20); };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-')), dataFile = path.join(dir, 'club.json');
let srv, base, PORT;
const fails = []; const fail = m => { if(fails.length < 20) console.log('FAIL', m); fails.push(m); };
const stats = { tableMsgs: 0, watcherMsgs: 0, shownMidHand: 0, shownAtResult: 0, youMsgs: 0, reconnects: 0, reconnectYou: 0, hands: new Set() };
const post = async (p, body, token) => (await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) })).json();
const dealt = new Map(); // tid#hand#uid -> cards string (from that player's own `you`)
process.on('exit', () => { try{ srv.kill('SIGKILL'); }catch(e){} try{ fs.rmSync(dir, { recursive: true, force: true }); }catch(e){} });

function checkTable(c, m){
  const tb = m.table; stats.tableMsgs++; if(c.watcher) stats.watcherMsgs++;
  const seated = tb.seats.some(s => s && s.uid === c.id);
  if(m.you){
    stats.youMsgs++; if(c.justReconnected) stats.reconnectYou++;
    if(!seated) fail(`you sent to non-seated ${c.name}`);
    if(c.watcher) fail('railbird received hole cards');
    if(tb.phase === 'hand' && m.you.hand !== tb.handNo) fail(`you.hand ${m.you.hand} != table hand ${tb.handNo}`);
    const k = tb.tid + '#' + m.you.hand + '#' + c.id, prev = dealt.get(k), cs = m.you.cards.join();
    if(prev && prev !== cs) fail('own cards changed within a hand');
    dealt.set(k, cs);
  }
  if(tb.phase === 'hand') stats.hands.add(tb.tid + '#' + tb.handNo);
  const live = tb.seats.filter(s => s && s.inHand && !s.folded);
  const canAct = live.filter(s => !s.allIn).length;
  tb.seats.forEach(s => {
    if(!s || !s.shown || s.uid === c.id) return;
    if(tb.result) stats.shownAtResult++;
    else if(canAct <= 1 && tb.street >= 1) stats.shownMidHand++; // all-in run-out: hands tabled (TDA)
    else fail(`${c.name} saw ${s.name}'s cards before showdown (street ${tb.street}, canAct ${canAct})`);
    if(s.folded) fail('folded hand shown');
    const own = dealt.get(tb.tid + '#' + tb.handNo + '#' + s.uid);
    if(own && own !== s.shown.join()) fail('shown cards differ from dealt cards');
  });
}

function client(tok, name, opts = {}){
  const c = { name, tok, id: null, club: null, watcher: !!opts.watcher, ws: null };
  c.connect = () => new Promise(res => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); c.ws = ws;
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: tok, device: name })));
    ws.on('message', raw => {
      const m = JSON.parse(raw);
      if(m.t === 'club'){ c.club = m.club; c.id = m.club.me.id; res(c); }
      if(c.watcher && ['coach', 'hands', 'report'].includes(m.t)) fail('railbird got ' + m.t);
      if(m.t === 'coach' && m.hand && m.hand.cards && c.id){ /* own coach message only (server sends by uid) */ }
      if(m.t !== 'table') return;
      checkTable(c, m);
      const tb = m.table;
      if(!c.watcher && tb.actUid === c.id && tb.legal && c.lastSeq !== tb.tid + tb.seq){
        c.lastSeq = tb.tid + tb.seq;
        const L = tb.legal, r = Math.random();
        const a = r < +(process.env.RAISE || .25) && L.canRaise ? { t: 'raise', to: L.maxTo } : r < .45 ? (L.canCheck ? { t: 'check' } : { t: 'fold' }) : (L.canCheck ? { t: 'check' } : { t: 'call' });
        setTimeout(() => { try{ ws.send(JSON.stringify({ t: 'act', tid: tb.tid, hand: tb.handNo, seq: tb.seq, a })); }catch(e){} }, Math.random() * 20);
      }
    });
  });
  return c;
}

(async () => {
  PORT = await freePort(); base = `http://127.0.0.1:${PORT}`;
  srv = spawn(process.execPath, ['server/index.js'], { cwd: REPO, env: { ...process.env, DATABASE_URL: '', PORT: String(PORT), FAST: '1', NO_BEACON: '1', OWNER_CODE: 'probe-local-only', DATA_FILE: dataFile }, stdio: ['ignore', 'ignore', 'inherit'] });
  let up = false; const t0 = Date.now();
  while(!up && Date.now() - t0 < 10000){ try{ up = (await fetch(base + '/healthz')).ok; }catch(e){} if(!up) await sleep(50); }
  if(!up) throw new Error('server did not start');
  const own = await post('/api/setup', { code: 'probe-local-only', name: 'Director', pin: '1234', agree: true });
  const toks = [own.token];
  for(let i = 1; i <= 13; i++){ const { code } = await post('/api/invite', {}, own.token); toks.push((await post('/api/redeem', { code, name: 'Probe ' + i, pin: '4321', agree: true })).token); }
  const players = toks.slice(0, 13).map((t, i) => client(t, i ? 'Probe ' + i : 'Director'));
  const rail = client(toks[13], 'Railbird', { watcher: true });
  await Promise.all([...players, rail].map(c => c.connect()));
  const owner = players[0];
  owner.ws.send(JSON.stringify({ t: 'create', name: 'Probe', stack: 10000, levelMin: 1, tableSize: 6 }));
  await until(() => owner.club.tourney && owner.club.tourney.status === 'registering');
  players.forEach(c => c.ws.send(JSON.stringify({ t: 'join' })));
  await until(() => owner.club.tourney.regs.length === 13);
  owner.ws.send(JSON.stringify({ t: 'start' }));
  await until(() => owner.club.tourney.status === 'running');
  // railbird watches every table in turn; players drop and come back mid-hand
  const deadline = Date.now() + 90000;
  let k = 0;
  while(Date.now() < deadline && owner.club.tourney && owner.club.tourney.status === 'running'){
    const tabs = owner.club.tables; if(tabs.length) rail.ws.send(JSON.stringify({ t: 'watch', tid: tabs[k++ % tabs.length].tid }));
    if(k % 3 === 0){
      const c = players[1 + Math.floor(Math.random() * 12)];
      try{ c.ws.terminate(); }catch(e){}
      await sleep(30); c.justReconnected = true; await c.connect(); stats.reconnects++;
      setTimeout(() => { c.justReconnected = false; }, 300);
      // a reconnected player re-watches some *other* table too (should get no `you` there)
      const other = owner.club.tables.find(t => t.tid !== c.club.myTable); if(other) c.ws.send(JSON.stringify({ t: 'watch', tid: other.tid }));
    }
    await sleep(150);
  }
  const st = owner.club.tourney && owner.club.tourney.status;
  console.log(JSON.stringify({ status: st, ...stats, hands: stats.hands.size, fails: fails.length }));
  console.log(fails.length ? 'PROBE FAIL' : 'PROBE PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
