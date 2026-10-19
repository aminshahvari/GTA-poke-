// Hole-card privacy over WebSockets (Issue #1, concern 3; the probe of Claude's triage made a regression test).
// 13 players at 6-max with Show Cards and rabbit hunt on, plus a railbird (a member who never registers) watching
// every table in turn, while seated players drop and reconnect mid-hand and then watch some other table. Every
// 'table' message any of them gets is checked:
//  - `you` (hole cards) only ever goes to the player seated at that table, never to the railbird or a watcher, and a
//    player's own cards never change within a hand
//  - before the result, an opponent's cards show only when the hands are tabled (all-in, at most one player who can
//    still act) and never for a folded hand
//  - after the result, a folded hand or an uncontested winner shows only the cards that player chose to show; players
//    also ask to show before the result, which must be ignored
//  - any card shown is the card that player was dealt
// It also asserts the run covered enough (hands, reconnects, all-in tabling, shows by choice) to mean something.
// node test/t_privacy.js [ms]   (default 30000: how long the railbird and the reconnects run)
const { spawn } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os'), net = require('net');
const WebSocket = require('ws');
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 5000) => { const t0 = Date.now(); while(!f() && Date.now() - t0 < ms) await sleep(20); };
const RUN_MS = +process.argv[2] || 30000;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tpriv-')), dataFile = path.join(dir, 'club.json');
let srv, base, PORT;
let fails = 0; const fail = m => { fails++; if(fails < 15) console.log('FAIL', m); };
const stats = { tableMsgs: 0, railMsgs: 0, youMsgs: 0, shownTabled: 0, shownAtResult: 0, shownByChoice: 0, earlyShowAsks: 0, reconnects: 0, hands: new Set() };
const post = async (p, body, token) => (await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) })).json();
const dealt = new Map(); // tid#hand#uid -> that player's own cards, from their own `you`
const picks = new Map(); // tid#hand#uid -> every card index that player asked to show in that hand
const offered = new Set(); // tid#hand#uid where that player answered the offer to show
const early = new Set(); // tid#hand#uid where that player asked to show before the result
const asked = (k, pick) => picks.set(k, [...new Set([...(picks.get(k) || []), ...pick])]);
process.on('exit', () => { try{ srv.kill('SIGKILL'); }catch(e){} try{ fs.rmSync(dir, { recursive: true, force: true }); }catch(e){} });

function checkTable(c, m){
  const tb = m.table; stats.tableMsgs++; if(c.rail) stats.railMsgs++;
  const seated = tb.seats.some(s => s && s.uid === c.id);
  if(m.you){
    stats.youMsgs++;
    if(!seated) fail(`hole cards sent to ${c.name}, who is not seated at ${tb.tid}`);
    if(c.rail) fail('the railbird received hole cards');
    if(tb.phase === 'hand' && m.you.hand !== tb.handNo) fail(`hole cards of hand ${m.you.hand} sent with hand ${tb.handNo}`);
    const k = tb.tid + '#' + m.you.hand + '#' + c.id, prev = dealt.get(k), cs = m.you.cards.join();
    if(prev && prev !== cs) fail(`${c.name}'s own cards changed within a hand`);
    dealt.set(k, cs);
  }
  if(tb.phase === 'hand') stats.hands.add(tb.tid + '#' + tb.handNo);
  const live = tb.seats.filter(s => s && s.inHand && !s.folded), canAct = live.filter(s => !s.allIn).length;
  tb.seats.forEach(s => {
    if(!s || !s.shown || s.uid === c.id) return;
    const k = tb.tid + '#' + tb.handNo + '#' + s.uid, idx = [0, 1].filter(j => s.shown[j] != null);
    if(!tb.result){
      if(s.folded) fail(`${c.name} saw ${s.name}'s folded hand before the result`);
      else if(canAct <= 1 && tb.street >= 1) stats.shownTabled++; // all-in: hands are tabled
      else fail(`${c.name} saw ${s.name}'s cards before the result (street ${tb.street}, ${canAct} can act)`);
    } else if(s.folded || !tb.result.showdown){
      // a folded hand, or the winner of an uncontested pot: only what that player chose to show
      const p = picks.get(k);
      if(!p || idx.some(j => !p.includes(j))){ fail(`${c.name} saw ${s.name}'s card(s) ${idx} that ${s.name} did not choose to show`); if(process.env.DEBUG && fails < 3) console.log(JSON.stringify({ seat: s, result: tb.result, offer: tb.showOffer, pick: p, street: tb.street, board: tb.board, seats: tb.seats.map(x => x && [x.name, x.folded, x.allIn, x.inHand, x.shown]) })); }
      else stats.shownByChoice++;
    } else stats.shownAtResult++;
    const own = dealt.get(k);
    if(own){ const oc = own.split(','); if(idx.some(j => s.shown[j] !== oc[j])) fail(`${s.name}'s shown cards differ from the cards dealt`); }
  });
}

function client(tok, name, opts = {}){
  const c = { name, tok, id: null, club: null, rail: !!opts.rail, ws: null };
  c.send = m => { try{ c.ws.send(JSON.stringify(m)); }catch(e){} };
  c.connect = () => new Promise(res => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); c.ws = ws;
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: tok, device: name })));
    ws.on('error', () => {});
    ws.on('message', raw => {
      const m = JSON.parse(raw);
      if(m.t === 'club'){ c.club = m.club; c.id = m.club.me.id; res(c); }
      if(c.rail && ['coach', 'hands'].includes(m.t)) fail('the railbird got ' + m.t);
      if(m.t !== 'table') return;
      checkTable(c, m);
      const tb = m.table;
      if(c.rail || !tb.seats.some(s => s && s.uid === c.id)) return;
      // asking to show before the result must change nothing
      // (one hand in five, card 2 only: an ask sent just as the hand ends can reach the server after its result, where
      // it is a real choice to show that card; the other hands keep the exact check of what was chosen)
      const ek = tb.tid + '#' + tb.handNo + '#' + c.id;
      if(!tb.result && tb.phase === 'hand' && tb.handNo % 5 === 0 && !early.has(ek)){
        early.add(ek); stats.earlyShowAsks++; asked(ek, [1]); c.send({ t: 'show', tid: tb.tid, hand: tb.handNo, cards: [1] }); }
      // after the result, when offered, show one card, both, or muck
      if(tb.result && tb.showOffer && (tb.showOffer.can || []).includes(c.id)){
        const k = tb.tid + '#' + tb.handNo + '#' + c.id;
        if(!offered.has(k)){ offered.add(k); const r = Math.random(), pick = r < .3 ? [0] : r < .5 ? [1] : r < .8 ? [0, 1] : []; asked(k, pick); c.send({ t: 'show', tid: tb.tid, hand: tb.handNo, cards: pick }); }
      }
      if(tb.actUid === c.id && tb.legal && c.lastSeq !== tb.tid + tb.seq){
        c.lastSeq = tb.tid + tb.seq;
        const L = tb.legal, r = Math.random();
        const a = r < .1 && L.canRaise ? { t: 'raise', to: L.maxTo } : r < .45 ? (L.canCheck ? { t: 'check' } : { t: 'fold' }) : (L.canCheck ? { t: 'check' } : { t: 'call' });
        setTimeout(() => c.send({ t: 'act', tid: tb.tid, hand: tb.handNo, seq: tb.seq, a }), Math.random() * 20);
      }
    });
  });
  return c;
}

(async () => {
  for(let tries = 0; ; tries++){
    PORT = await freePort(); base = `http://127.0.0.1:${PORT}`;
    srv = spawn(process.execPath, ['server/index.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, DATABASE_URL: '', PORT: String(PORT), FAST: '1', NO_BEACON: '1', GAMEPLAY_OPTIONS: '1', OWNER_CODE: 'secret', DATA_FILE: dataFile }, stdio: ['ignore', 'ignore', 'inherit'] });
    let up = false; const t0 = Date.now();
    while(!up && srv.exitCode === null && Date.now() - t0 < 10000){ try{ up = (await fetch(base + '/healthz')).ok; }catch(e){} if(!up) await sleep(40); }
    if(up && srv.exitCode === null) break;
    try{ srv.kill('SIGKILL'); }catch(e){}
    if(tries >= 2) throw new Error('server did not start');
  }
  const own = await post('/api/setup', { code: 'secret', name: 'Director', pin: '1234', agree: true });
  const toks = [own.token];
  for(let i = 1; i <= 13; i++){ const { code } = await post('/api/invite', {}, own.token); toks.push((await post('/api/redeem', { code, name: 'Player ' + i, pin: '4321', agree: true })).token); }
  const players = toks.slice(0, 13).map((t, i) => client(t, i ? 'Player ' + i : 'Director'));
  const rail = client(toks[13], 'Railbird', { rail: true });
  await Promise.all([...players, rail].map(c => c.connect()));
  const owner = players[0];
  // a tournament runs until one player has everything; when it ends before the time is up, the next one starts
  let n = 0;
  async function startTourney(){
    dealt.clear(); picks.clear(); offered.clear(); early.clear(); // table ids and hand numbers start again
    owner.send({ t: 'create', name: 'Privacy ' + ++n, stack: 50000, levelMin: 5, tableSize: 6, showMuck: 'on', rabbit: 'on' });
    await until(() => owner.club.tourney && owner.club.tourney.status === 'registering');
    players.forEach(c => c.send({ t: 'join' }));
    await until(() => owner.club.tourney.regs.length === 13);
    owner.send({ t: 'start' });
    await until(() => owner.club.tourney.status === 'running');
    if(!owner.club.tourney || owner.club.tourney.status !== 'running') throw new Error('the tournament did not start');
  }
  // the railbird watches each table in turn; every third step a seated player drops and comes back mid-hand, then
  // watches another table (where it must get no hole cards)
  const end = Date.now() + RUN_MS;
  let k = 0;
  while(Date.now() < end){
    if(!owner.club.tourney || owner.club.tourney.status !== 'running'){ await startTourney(); continue; }
    const tabs = owner.club.tables; if(tabs.length) rail.send({ t: 'watch', tid: tabs[k % tabs.length].tid });
    if(++k % 3 === 0){
      const c = players[1 + Math.floor(Math.random() * 12)];
      try{ c.ws.terminate(); }catch(e){}
      await sleep(30); await c.connect(); stats.reconnects++;
      const other = owner.club.tables.find(t => t.tid !== c.club.myTable); if(other) c.send({ t: 'watch', tid: other.tid });
    }
    await sleep(150);
  }
  const summary = { tournaments: n, ...stats, hands: stats.hands.size, choices: offered.size };
  console.log(JSON.stringify(summary));
  // the run must have covered what it checks
  if(summary.hands < 60) fail(`only ${summary.hands} hands played`);
  if(summary.reconnects < 20) fail(`only ${summary.reconnects} reconnects`);
  if(!summary.railMsgs) fail('the railbird saw no table');
  if(!summary.shownTabled) fail('no all-in hands were tabled before the result');
  if(!summary.shownAtResult) fail('no showdown');
  if(!summary.shownByChoice) fail('no player chose to show');
  if(!summary.earlyShowAsks) fail('no early show asks');
  console.log(fails ? `privacy test FAILED (${fails})` : 'privacy test passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
