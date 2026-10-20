// Disconnect protection (Issue #9): a player to act with no live connection gets 30 more seconds (here DC_PROTECT_MS)
// once per hand, without an extra-time card and without being marked away. Plays a real tournament over WebSockets
// (FAST) with one player, V, whose connection the test drops, and checks: a connected player never gets it; a socket
// closing mid-decision gets it at once (the close event; also while paused, when the clock check is idle); reconnecting
// inside the window lets V act, not away; a second drop in the same hand gets nothing and times out as today; a decision
// that starts while V is offline gets it from the start, and with no reconnect the old timeout follows the longer
// deadline; a pause during protection does not use it up; a connection that goes silent without closing (no close event)
// is found by the server's ping within DC_GONE_MS and protected, and its recovery lets V act.
const { spawn } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os'), net = require('net');
const WebSocket = require('ws');

let fails = 0, oks = 0;
const ok = (c, m) => { if(c) oks++; else { fails++; console.log('FAIL', m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 4000) => { const t0 = Date.now(); while(!f() && Date.now() - t0 < ms) await sleep(15); return f(); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

const BANK = 4000, DC = 4000, GONE = 1200;
let srv = null, dir = null;
process.on('exit', () => { try{ srv && srv.kill('SIGKILL'); }catch(e){} try{ dir && fs.rmSync(dir, { recursive: true, force: true }); }catch(e){} });
async function boot(){
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tdc-'));
  const port = await freePort(), base = `http://127.0.0.1:${port}`;
  const env = { ...process.env, PORT: String(port), FAST: '1', NO_BEACON: '1', OWNER_CODE: 'secret', DATA_FILE: path.join(dir, 'club.json'),
    TIME_BANK_MS: String(BANK), DC_PROTECT_MS: String(DC), DC_GONE_MS: String(GONE) };
  delete env.STAGING; delete env.GAMEPLAY_OPTIONS; delete env.CLUB_SWITCHING;
  srv = spawn(process.execPath, ['server/index.js'], { cwd: path.join(__dirname, '..'), env, stdio: ['ignore', 'ignore', 'inherit'] });
  let up = false; const t0 = Date.now();
  while(!up && srv.exitCode === null && Date.now() - t0 < 10000){ try{ up = (await fetch(base + '/healthz')).ok; }catch(e){} if(!up) await sleep(40); }
  if(!up) throw new Error('server did not start');
  return { port, base };
}
const post = async (base, p, body, token) => (await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) })).json();

// a player: checks, else calls (so V stays in the hand); c.hold(tb) true leaves that decision alone; every table update is logged
function connect(s, tok, i, hold){
  return new Promise(res => {
    const ws = new WebSocket(`ws://127.0.0.1:${s.port}/ws`, { headers: { 'x-forwarded-for': '10.3.' + i + '.1' } });
    const c = { i, ws, tok, id: null, club: null, log: [], seen: new Set(), hold: hold || null, last: null, send: o => ws.readyState === 1 && ws.send(JSON.stringify(o)) };
    c.actNow = () => { const tb = c.last; if(!tb || tb.actUid !== c.id || !tb.legal) return; const L = tb.legal; c.send({ t: 'act', tid: tb.tid, hand: tb.handNo, seq: tb.seq, a: L.canCheck ? { t: 'check' } : { t: 'call' } }); };
    ws.on('open', () => c.send({ t: 'hello', token: tok, device: 'd' + i }));
    ws.on('message', raw => {
      const m = JSON.parse(raw);
      if(m.t === 'club'){ c.club = m.club; c.id = m.club.me.id; if(!c.ready){ c.ready = true; res(c); } }
      if(m.t !== 'table') return;
      const tb = m.table; c.last = tb; c.log.push({ at: Date.now(), ...tb });
      if(tb.actUid === c.id && tb.legal && !c.seen.has(tb.seq)){
        c.seen.add(tb.seq);
        if(!(c.hold && c.hold(tb))) setTimeout(c.actNow, 5);
      }
    });
    ws.on('close', () => { c.closed = true; });
  });
}
const T = c => c.club && c.club.tourney;

(async () => {
  const s = await boot();
  const own = await post(s.base, '/api/setup', { code: 'secret', name: 'Owner', pin: '1234', agree: true });
  const toks = [own.token];
  for(let i = 1; i < 3; i++){ const { code } = await post(s.base, '/api/invite', {}, own.token); toks.push((await post(s.base, '/api/redeem', { code, name: 'Player ' + i, pin: '4321', agree: true })).token); }
  const o = await connect(s, toks[0], 0), a = await connect(s, toks[1], 1);
  let v = await connect(s, toks[2], 2);
  const V = v.id;
  o.send({ t: 'create', name: 'DC Test', stack: 100000, levelMin: 20 });
  await until(() => T(o) && T(o).status === 'registering');
  [o, a, v].forEach(c => c.send({ t: 'join' }));
  await until(() => T(o).regs.length === 3);
  o.send({ t: 'start' });
  ok(await until(() => T(o).status === 'running'), 'tournament running');

  // the observer (the owner, seated at the same and only table) sees everything; helpers read its log
  const snaps = seq => o.log.filter(e => e.seq === seq && e.actUid === V);
  const turn = async (pred, ms = 15000, from = 0) => { let hit = null; await until(() => (hit = o.log.find((e, k) => k >= from && e.actUid === V && e.legal && pred(e))), ms); return hit; };
  const ended = seq => o.log.find(e => e.seq > seq || (e.seq === seq && e.actUid !== V));
  const vSeat = () => (o.last.seats.find(p => p && p.uid === V) || {});
  const lastHand = () => o.last.handNo;

  // ---------- 1. a connected player never gets protection: the timeout comes after the normal clock ----------
  const h1 = lastHand() + 1;
  v.hold = tb => tb.handNo >= h1;
  const d1 = await turn(e => e.handNo >= h1);
  ok(d1 && !d1.dcProtect && near(d1.deadline - d1.at, BANK, 400), 'a connected player to act gets the normal clock (' + (d1 && d1.deadline - d1.at) + ' ms)');
  v.hold = null;
  await until(() => ended(d1.seq), BANK + 2000);
  const e1 = ended(d1.seq);
  ok(e1 && !snaps(d1.seq).some(x => x.dcProtect) && near(e1.at, d1.deadline, 700), 'connected and silent: no protection, timed out at the normal deadline');
  ok(await until(() => vSeat().away), 'and marked away as today');
  v.send({ t: 'back' });
  ok(await until(() => !vSeat().away), 'back() clears away');

  // ---------- 2. socket closes mid-decision (close event): protection at once; reconnect inside the window and act ----------
  const h2 = lastHand() + 1;
  v.hold = tb => tb.handNo >= h2;
  const d2 = await turn(e => e.handNo >= h2);
  const H2 = d2.handNo, ex2 = d2.extras;
  ok(!d2.dcProtect && d2.extras >= 1, 'decision starts connected: no protection yet, ' + d2.extras + ' extra-time cards');
  await sleep(300);
  const closedAt = Date.now(); v.ws.close();
  ok(await until(() => snaps(d2.seq).some(x => x.dcProtect), 2000), 'the table shows "disconnected, protection time" after the socket closes');
  const p2 = snaps(d2.seq).find(x => x.dcProtect);
  ok(p2 && p2.at - closedAt < 400, 'granted on the close event (' + (p2 && p2.at - closedAt) + ' ms after the close)');
  ok(p2 && p2.deadline - d2.deadline === DC, 'deadline extended by exactly the protection time: +' + (p2 && p2.deadline - d2.deadline) + ' ms');
  ok(p2 && p2.extras === ex2 && !p2.usingBank, 'no extra-time card used (' + (p2 && p2.extras) + ' left), not shown as extra time');
  ok(p2 && near(p2.bank, p2.deadline - p2.at, 100), 'the clock bar restarts from the new time left');
  await until(() => Date.now() > d2.deadline + 600, BANK + 1000);
  ok(!ended(d2.seq) && !vSeat().away, 'past the original deadline the hand is still live and V is not away');
  // reconnect: act on this decision, hold the next one in the same hand
  v = await connect(s, toks[2], 22, tb => tb.handNo === H2 && tb.seq !== d2.seq);
  ok(await until(() => ended(d2.seq), 2000), 'after reconnecting V acts normally');
  const e2 = ended(d2.seq);
  ok(e2 && e2.at < p2.deadline - 300 && !vSeat().away, 'V acted inside the window and is not away');
  ok(snaps(d2.seq).filter(x => x.at > p2.at).every(x => x.deadline === p2.deadline), 'the given time stays on the clock after the reconnect');

  // ---------- 3. once per hand: a second drop in the same hand gets nothing and times out as today ----------
  const d3 = await turn(e => e.handNo === H2 && e.seq > d2.seq, 8000);
  ok(!!d3, 'V has a second decision in the same hand');
  if(d3){
    await sleep(300); v.ws.close();
    await until(() => ended(d3.seq), BANK + 2000);
    const e3 = ended(d3.seq);
    ok(!snaps(d3.seq).some(x => x.dcProtect) && snaps(d3.seq).every(x => x.deadline === d3.deadline), 'second drop in the same hand: no protection, deadline unchanged');
    ok(e3 && near(e3.at, d3.deadline, 700), 'it times out at the normal deadline');
    ok(await until(() => vSeat().away), 'and V is marked away as today');
  }

  // ---------- 4. a decision that starts while offline is protected from the start; no reconnect: timeout after it ----------
  await until(() => lastHand() > H2, 8000);
  v = await connect(s, toks[2], 23, () => true);
  // back, then gone straight away: V's next decision starts with no connection
  const m4 = o.log.length, s4 = o.last.seq;
  v.send({ t: 'back' }); v.ws.close();
  ok(await until(() => !vSeat().away), 'back() still works');
  const d4 = await turn(e => e.seq > s4, 15000, m4);
  ok(d4 && d4.dcProtect && near(d4.deadline - d4.at, BANK + DC, 400), 'a decision starting while offline shows protection and the longer clock (' + (d4 && d4.deadline - d4.at) + ' ms)');
  ok(d4 && d4.extras === ex2 && !d4.usingBank, 'still no extra-time card used');
  await until(() => ended(d4.seq), BANK + DC + 2000);
  const e4 = ended(d4.seq);
  ok(e4 && e4.at > d4.at + BANK + 500 && near(e4.at, d4.deadline, 700), 'no reconnect: the usual timeout comes at the extended deadline');
  ok(await until(() => vSeat().away), 'then V is marked away, as today');

  // ---------- 5. pause: a close while paused is still caught (event path); pause time does not use protection up ----------
  await until(() => lastHand() > d4.handNo, 8000);
  v = await connect(s, toks[2], 24, () => true);
  const m5 = o.log.length, s5 = o.last.seq;
  v.send({ t: 'back' });
  await until(() => !vSeat().away);
  const d5 = await turn(e => e.seq > s5, 15000, m5);
  ok(d5 && !d5.dcProtect, 'decision starts connected');
  o.send({ t: 'pause' });
  await until(() => T(o).paused);
  await sleep(300);
  v.ws.close();
  ok(await until(() => snaps(d5.seq).some(x => x.dcProtect), 1500), 'a socket closing during a pause is protected at once');
  const p5 = snaps(d5.seq).find(x => x.dcProtect);
  await sleep(1500);
  o.send({ t: 'resume' }); await until(() => !T(o).paused);
  const resumedAt = Date.now();
  await sleep(200);
  ok(!ended(d5.seq) && !vSeat().away, 'still live after the pause');
  v = await connect(s, toks[2], 25, () => true);
  ok(await until(() => snaps(d5.seq).some(x => x.at > resumedAt && !x.dcProtect), 1500), 'reconnecting clears the disconnected mark');
  const r5 = snaps(d5.seq).find(x => x.at > resumedAt && !x.dcProtect);
  const shift = r5 ? r5.deadline - p5.deadline : 0, pausedFor = resumedAt - p5.at;
  ok(r5 && near(shift, pausedFor, 500), `pause time is added back: deadline +${shift} ms for ${pausedFor} ms paused after the grant`);
  v.actNow();
  ok(await until(() => ended(d5.seq), 1500) && !vSeat().away, 'V acts after the pause and is not away');

  // ---------- 6. a connection that goes silent without closing (no close event): found by ping, protected; recovers ----------
  const h6 = lastHand() + 1;
  v.hold = tb => tb.handNo >= h6;
  const d6 = await turn(e => e.handNo >= h6);
  ok(d6 && !d6.dcProtect, 'decision starts connected');
  await sleep(200);
  const quietAt = Date.now(); v.ws._socket.pause(); // stops reading: no pongs, no close
  ok(await until(() => snaps(d6.seq).some(x => x.dcProtect), BANK), 'a silent connection is detected by the ping and protected');
  const p6 = snaps(d6.seq).find(x => x.dcProtect);
  ok(p6 && p6.at < d6.deadline && p6.at - quietAt < GONE + 1200, 'detected before the normal deadline (' + (p6 && p6.at - quietAt) + ' ms after going silent)');
  ok(p6 && p6.deadline - d6.deadline === DC && p6.extras === d6.extras, 'deadline +' + (p6 && p6.deadline - d6.deadline) + ' ms, no card used');
  ok(!v.closed, 'the socket never closed (no close event involved)');
  await sleep(500);
  v.ws._socket.resume();
  ok(await until(() => snaps(d6.seq).some(x => x.at > p6.at && !x.dcProtect), 2000), 'when it answers again the disconnected mark clears');
  await until(() => v.last && v.last.seq === d6.seq && !v.last.dcProtect, 1000); v.actNow();
  ok(await until(() => ended(d6.seq), 2000) && !vSeat().away, 'and V acts normally, not away');

  // ---------- 7. the connected players never got protection ----------
  const others = [o.id, a.id];
  ok(!o.log.some(e => others.includes(e.actUid) && e.dcProtect), 'connected players never get protection');

  console.log(`t_disconnect: ${oks} ok, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
