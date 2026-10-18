// Table extras: show or muck after an uncontested pot, rabbit hunt, pause between hands.
// Part 1 checks the pure pieces (timing, rabbit draw against the committed deck).
// Part 2 plays real hands over WebSockets with the extras on and checks what every viewer sees.
// Part 3 runs a server without GAMEPLAY_OPTIONS and checks nothing of the extras exists there.
const { spawn } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os'), net = require('net');
const WebSocket = require('ws');
const E = require('../server/engine');
const fair = require('../server/fair');

let fails = 0, oks = 0;
const ok = (c, m) => { if(c) oks++; else { fails++; console.log('FAIL', m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 4000) => { const t0 = Date.now(); while(!f() && Date.now() - t0 < ms) await sleep(20); };
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
// public/fair-verify.js's dealing, ported: the order the table pops the deck
function dealt(deck, nPlayers, boardLen){
  const d = deck.slice(), hole = Array.from({ length: nPlayers }, () => []);
  for(let r = 0; r < 2; r++) for(let i = 0; i < nPlayers; i++) hole[i].push(d.pop());
  const board = [];
  if(boardLen >= 3){ d.pop(); board.push(d.pop(), d.pop(), d.pop()); }
  if(boardLen >= 4){ d.pop(); board.push(d.pop()); }
  if(boardLen >= 5){ d.pop(); board.push(d.pop()); }
  return { hole, board };
}

const servers = [];
process.on('exit', () => servers.forEach(s => { try{ s.p.kill('SIGKILL'); }catch(e){} try{ fs.rmSync(s.dir, { recursive: true, force: true }); }catch(e){} }));
async function boot(extraEnv){
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'textras-'));
  for(let tries = 0; ; tries++){
    const port = await freePort(), base = `http://127.0.0.1:${port}`;
    const env = { ...process.env, PORT: String(port), FAST: '1', NO_BEACON: '1', OWNER_CODE: 'secret', DATA_FILE: path.join(dir, 'club.json'), ...extraEnv };
    delete env.STAGING; if(!extraEnv.GAMEPLAY_OPTIONS) delete env.GAMEPLAY_OPTIONS;
    const p = spawn(process.execPath, ['server/index.js'], { cwd: path.join(__dirname, '..'), env, stdio: ['ignore', 'ignore', 'inherit'] });
    let up = false; const t0 = Date.now();
    while(!up && p.exitCode === null && Date.now() - t0 < 10000){ try{ up = (await fetch(base + '/healthz')).ok; }catch(e){} if(!up) await sleep(40); }
    if(up){ const s = { p, dir, port, base }; servers.push(s); return s; }
    try{ p.kill('SIGKILL'); }catch(e){}
    if(tries >= 2) throw new Error('server did not start');
  }
}
const post = async (base, p, body, token) => (await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) })).json();

// Players see the flop cheaply, then one bets and the rest mostly fold: lots of pots won on the flop or turn.
async function makeClub(s, n){
  const own = await post(s.base, '/api/setup', { code: 'secret', name: 'Owner', pin: '1234', agree: true });
  const toks = [own.token];
  for(let i = 1; i <= n; i++){ const { code } = await post(s.base, '/api/invite', {}, own.token); toks.push((await post(s.base, '/api/redeem', { code, name: 'Player ' + i, pin: '4321', agree: true })).token); }
  return Promise.all(toks.map((tok, i) => new Promise(res => {
    const ws = new WebSocket(`ws://127.0.0.1:${s.port}/ws`, { headers: { 'x-forwarded-for': '10.1.' + i + '.1' } });
    const c = { i, ws, id: null, club: null, msgs: [], cards: {}, offers: [], send: o => ws.send(JSON.stringify(o)) };
    ws.on('open', () => c.send({ t: 'hello', token: tok, device: 'd' + i }));
    ws.on('message', raw => {
      const m = JSON.parse(raw);
      if(m.t === 'club'){ c.club = m.club; c.id = m.club.me.id; if(!c.ready){ c.ready = true; res(c); } }
      if(m.t === 'fair') c.fair = m.report;
      if(m.t !== 'table') return;
      const tb = m.table; c.msgs.push(tb);
      if(m.you) c.cards[tb.tid + '#' + m.you.hand] = m.you.cards;
      if(c.onTable) c.onTable(tb);
      if(tb.actUid === c.id && tb.legal && c.lastSeq !== tb.tid + tb.seq){
        c.lastSeq = tb.tid + tb.seq;
        const L = tb.legal, r = Math.random();
        let a;
        if(tb.street === 0) a = L.canCheck ? { t: 'check' } : L.toCall <= 3 * L.bb ? { t: 'call' } : { t: 'fold' };
        else if(L.canCheck) a = L.canRaise && r < .6 ? { t: 'raise', to: L.minTo } : { t: 'check' };
        else a = r < .8 ? { t: 'fold' } : { t: 'call' };
        setTimeout(() => c.send({ t: 'act', tid: tb.tid, hand: tb.handNo, seq: tb.seq, a }), Math.random() * 20);
      }
    });
  })));
}

(async () => {
  // ---------- 1. pure pieces ----------
  const clubMod = require('../server/club');
  const { resultMs, rabbitCards } = clubMod._extras;
  ok(resultMs(0, false, false, 1800) === 1800 && resultMs(0, true, false, 4500) === 4500, 'no pause set: today\'s timing');
  ok(resultMs(2, false, false, 1800) === 800, 'pause 2 s: 0.8 s result + 1.2 s idle');
  ok(resultMs(6, false, false, 1800) === 4800, 'pause 6 s: 4.8 s result + 1.2 s idle');
  ok(resultMs(2, true, false, 4500) === 4500 && resultMs(6, true, false, 4500) === 4800, 'showdown never under 4.5 s');
  ok(resultMs(0, false, true, 1800) === 2500 && resultMs(2, false, true, 1800) === 2500 && resultMs(5, false, true, 1800) === 3800, 'show window at least 2.5 s');
  for(let k = 0; k < 300; k++){
    const deck = fair.deckFrom('seed|beacon|t1-1|' + k), n = 2 + (k % 8), boardLen = [0, 3, 4, 5][k % 4];
    const ex = dealt(deck, n, boardLen), full = dealt(deck, n, 5);
    // simulate the engine's pops to get the deck as it stands when the hand ends
    const h = { deck: deck.slice(), board: [] };
    for(let i = 0; i < 2 * n; i++) h.deck.pop();
    if(boardLen >= 3){ h.deck.pop(); h.board.push(h.deck.pop(), h.deck.pop(), h.deck.pop()); }
    if(boardLen >= 4){ h.deck.pop(); h.board.push(h.deck.pop()); }
    if(boardLen >= 5){ h.deck.pop(); h.board.push(h.deck.pop()); }
    const before = h.deck.join();
    const r = rabbitCards(h);
    if(boardLen === 3 || boardLen === 4){
      if(!r || r.length !== 5 - boardLen || r.join() !== full.board.slice(boardLen).join()){ ok(false, 'rabbit cards differ from the committed deck at ' + k); break; }
      if(r.some(c => ex.board.includes(c) || ex.hole.flat().includes(c))){ ok(false, 'rabbit card already dealt'); break; }
    } else if(r){ ok(false, 'rabbit drawn for board of ' + boardLen); break; }
    if(h.deck.join() !== before){ ok(false, 'rabbit draw changed the deck'); break; }
  }
  ok(true, '300 decks: rabbit = next burn-and-turn cards, never already dealt, deck untouched');

  // ---------- 2. extras on ----------
  const on = await boot({ GAMEPLAY_OPTIONS: '1' });
  const cs = await makeClub(on, 6), owner = cs[0], ps = cs.slice(1);
  ok(owner.club.features.tableExtras === true, 'extras offered when GAMEPLAY_OPTIONS=1');
  owner.send({ t: 'create', name: 'Extras', stack: 30000, levelMin: 1, showMuck: 'on', rabbit: 'on', handPause: 3 });
  await until(() => owner.club.tourney && owner.club.tourney.status === 'registering');
  const T0 = owner.club.tourney;
  ok(T0.showMuck === true && T0.rabbit === true && T0.handPause === 3, 'options stored: ' + JSON.stringify([T0.showMuck, T0.rabbit, T0.handPause]));
  owner.send({ t: 'edit', name: 'Extras', stack: 30000, levelMin: 1, actSec: 20, lateLevels: 0, handPause: 7 });
  await until(() => owner.club.tourney.handPause !== 3);
  ok(owner.club.tourney.handPause === 0 && owner.club.tourney.showMuck === true, 'edit: out-of-range pause falls back to standard, untouched options kept');
  ps.forEach(c => c.send({ t: 'join' }));
  await until(() => owner.club.tourney.regs.length === 6);
  owner.send({ t: 'start' });
  await until(() => owner.club.tourney.status === 'running' && owner.club.myTable === null && owner.club.tables.length);
  const tid = owner.club.tables[0].tid;
  owner.send({ t: 'watch', tid }); // the owner is a spectator here
  // winners answer the offer in turn: one card, the other, both, muck; then try again (must be ignored)
  const picks = [[0], [1], [0, 1], []], chosen = {}; let tries = 0, earlyTries = 0;
  ps.forEach(c => c.onTable = tb => {
    const key = tb.tid + '#' + tb.handNo;
    if(tb.showOffer && tb.showOffer.uid === c.id && !tb.showOffer.done && !chosen[key]){
      const pick = picks[Object.keys(chosen).length % 4]; chosen[key] = { uid: c.id, pick };
      c.send({ t: 'show', tid: tb.tid, hand: tb.handNo, cards: pick });
      setTimeout(() => c.send({ t: 'show', tid: tb.tid, hand: tb.handNo, cards: [0, 1] }), 5); // a second answer
    }
    // a loser (or anyone mid-hand) asking to show is ignored
    if(tb.result && tb.showOffer && tb.showOffer.uid !== c.id && tb.seats.some(s => s && s.uid === c.id) && tries++ % 3 === 0) c.send({ t: 'show', tid: tb.tid, hand: tb.handNo, cards: [0, 1] });
    if(!tb.result && tb.phase === 'hand' && earlyTries++ % 5 === 0) c.send({ t: 'show', tid: tb.tid, hand: tb.handNo, cards: [0, 1] });
  });
  await until(() => Object.keys(chosen).length >= 16 && owner.msgs.filter(m => m.rabbit).length >= 8, 90000);
  owner.send({ t: 'pause' }); await sleep(300);
  // everything every viewer saw
  let rabbits = 0, early = 0, badRabbit = 0, badOffer = 0, shownOk = 0, shownBad = 0;
  const all = cs.flatMap(c => c.msgs.map(m => [c, m]));
  for(const [c, tb] of all){
    if(tb.rabbit){
      rabbits++;
      if(!tb.result || tb.result.showdown || ![3, 4].includes(tb.board.length) || tb.rabbit.length !== 5 - tb.board.length || tb.rabbit.some(x => tb.board.includes(x))) badRabbit++;
    }
    if(!tb.result && (tb.rabbit || tb.showOffer)) early++;
    if(tb.showOffer && (!tb.result || tb.result.showdown)) badOffer++;
    // a card shown by choice: only by that hand's winner, only the cards they picked, and they must be the real cards
    tb.seats.forEach(s => {
      if(!s || !s.shown || (tb.result && tb.result.showdown)) return;
      const ch = chosen[tb.tid + '#' + tb.handNo], holder = cs.find(x => x.id === s.uid), real = holder && holder.cards[tb.tid + '#' + tb.handNo];
      const good = ch && ch.uid === s.uid && tb.result && real && [0, 1].every(j => ch.pick.includes(j) ? s.shown[j] === real[j] : s.shown[j] === null);
      if(good) shownOk++; else shownBad++;
    });
  }
  ok(rabbits > 0 && badRabbit === 0, `rabbit shown only after an early finish, right count, not on the board (${rabbits} views, ${badRabbit} bad)`);
  ok(early === 0, 'no rabbit card or show offer before the pot is awarded');
  ok(badOffer === 0, 'show offer only after a pot won without showdown');
  ok(shownOk > 0 && shownBad === 0, `shown cards are exactly the winner's pick, seen by every viewer incl. the spectator (${shownOk} ok, ${shownBad} bad)`);
  ok(owner.msgs.some(tb => tb.seats.some(s => s && s.shown && !(tb.result && tb.result.showdown))), 'the spectator saw a card shown by choice');
  const mucked = Object.entries(chosen).filter(([, v]) => !v.pick.length).map(([k]) => k);
  ok(mucked.length > 0 && !all.some(([, tb]) => mucked.includes(tb.tid + '#' + tb.handNo) && tb.seats.some(s => s && s.shown && !(tb.result && tb.result.showdown))), 'a muck shows nothing, even after a second request');
  const one = Object.entries(chosen).filter(([, v]) => v.pick.length === 1).map(([k]) => k);
  ok(!all.some(([, tb]) => one.includes(tb.tid + '#' + tb.handNo) && tb.seats.some(s => s && s.shown && s.shown.every(x => x) && !(tb.result && tb.result.showdown))), 'show one stays one card after a second request');
  const chips = await (await fetch(on.base + '/debug/chips')).json();
  ok(chips.chips === chips.expected, `chips conserved (${chips.chips} / ${chips.expected})`);
  // cancel to reveal the seed, then check the recorded rabbit cards against the deck
  owner.send({ t: 'cancel' }); await until(() => owner.club.tourney.status === 'cancelled');
  owner.send({ t: 'fair', id: T0.id }); await until(() => owner.fair);
  const rep = owner.fair, rh = (rep && rep.hands || []).filter(h => h.rabbit);
  let fairBad = 0;
  for(const h of rep.hands){
    const deck = fair.deckFrom(`${rep.seed}|${h.beacon}|${h.tid}|${h.hand}`), ex = dealt(deck, h.players.length, h.board.length), full = dealt(deck, h.players.length, 5);
    const match = h.players.every((p, i) => p.cards[0] === ex.hole[i][0] && p.cards[1] === ex.hole[i][1]) && h.board.every((c, i) => c === ex.board[i])
      && (!h.rabbit || h.rabbit.every((c, i) => c === full.board[h.board.length + i]));
    if(!match) fairBad++;
  }
  ok(rh.length > 0 && fairBad === 0, `fair report: ${rep.hands.length} hands verify, ${rh.length} with rabbit cards that match the deck`);
  // the browser verifier, run on the same report
  global.window = {}; global.crypto = global.crypto || require('crypto').webcrypto; require('../public/fair-verify.js');
  const v = await window.FAIR.verify(rep);
  ok(v.sealOk && v.bad === 0 && v.ok === rep.hands.length, `fair-verify.js accepts the report (${v.ok} ok, ${v.bad} bad)`);
  const forged = JSON.parse(JSON.stringify(rep)), fh = forged.hands.find(h => h.rabbit); fh.rabbit[0] = (fh.rabbit[0] + 1) % 52;
  const v2 = await window.FAIR.verify(forged);
  ok(v2.bad === 1, 'fair-verify.js rejects a forged rabbit card');

  // ---------- 3. extras off (production default) ----------
  const off = await boot({});
  const cs2 = await makeClub(off, 4), o2 = cs2[0];
  ok(!('tableExtras' in o2.club.features), 'no extras offered without GAMEPLAY_OPTIONS');
  o2.send({ t: 'create', name: 'Plain', stack: 30000, levelMin: 1, showMuck: 'on', rabbit: 'on', handPause: 3 });
  await until(() => o2.club.tourney && o2.club.tourney.status === 'registering');
  ok(!['showMuck', 'rabbit', 'handPause'].some(k => k in o2.club.tourney), 'options ignored and not stored');
  const df = path.join(off.dir, 'club.json'); await until(() => fs.existsSync(df) && /"registering"/.test(fs.readFileSync(df, 'utf8')), 5000);
  const stored = JSON.parse(fs.readFileSync(df, 'utf8'));
  ok(!JSON.stringify(stored.tourney || stored).match(/showMuck|rabbit|handPause/), 'nothing written to the data file');
  cs2.slice(1).forEach(c => c.send({ t: 'join' })); await until(() => o2.club.tourney.regs.length === 4);
  o2.send({ t: 'start' }); await until(() => o2.club.tourney.status === 'running' && o2.club.tables.length);
  o2.send({ t: 'watch', tid: o2.club.tables[0].tid });
  cs2.slice(1).forEach(c => c.onTable = tb => { if(tb.result && !tb.result.showdown) c.send({ t: 'show', tid: tb.tid, hand: tb.handNo, cards: [0, 1] }); });
  await until(() => o2.msgs.filter(tb => tb.result && !tb.result.showdown && tb.board.length >= 3).length >= 6, 60000);
  const views = cs2.flatMap(c => c.msgs);
  ok(views.length > 50 && !views.some(tb => 'rabbit' in tb || 'showOffer' in tb), `no rabbit or show offer in ${views.length} table views`);
  ok(!views.some(tb => tb.result && !tb.result.showdown && tb.seats.some(s => s && s.shown)), 'a show request does nothing');
  const keys = new Set(views.flatMap(tb => Object.keys(tb)));
  ok([...keys].sort().join() === 'actUid,acting,allowed,bank,blinds,board,btn,cur,deadline,extras,handNo,legal,n,note,phase,pot,result,seats,seq,size,street,tid,usingBank', 'table view has exactly the existing fields: ' + [...keys].sort().join());
  o2.send({ t: 'cancel' }); await until(() => o2.club.tourney.status === 'cancelled');
  o2.send({ t: 'fair', id: o2.club.tourney.id }); await until(() => o2.fair);
  ok(o2.fair.hands.length > 0 && !o2.fair.hands.some(h => 'rabbit' in h), 'fair records unchanged (no rabbit field)');

  console.log(`t_extras: ${oks} ok, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
