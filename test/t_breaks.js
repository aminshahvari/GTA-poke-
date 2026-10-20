// Tournament breaks (Issue #11): after every 10th blind level the whole tournament stops for the set break time.
// Plays a real 2-table tournament over WebSockets with short levels (FAST, LEVEL_MS, BREAK_MS) and checks:
// the break starts after level 10 on every table at once, a hand in play is finished, no new hand is dealt until the break
// ends, every table resumes on the next level, a reconnect sees the same end time, pause/resume during a break keeps the
// time left, a restart keeps the end time, the 3-5 minute setting, and that BREAKS=0 turns breaks off.
const { spawn } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os'), net = require('net');
const WebSocket = require('ws');
const E = require('../server/engine');

let fails = 0, oks = 0;
const ok = (c, m) => { if(c) oks++; else { fails++; console.log('FAIL', m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 4000) => { const t0 = Date.now(); while(!f() && Date.now() - t0 < ms) await sleep(20); return f(); };
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

const servers = [];
process.on('exit', () => servers.forEach(s => { try{ s.p.kill('SIGKILL'); }catch(e){} }));
const dirs = [];
process.on('exit', () => dirs.forEach(d => { try{ fs.rmSync(d, { recursive: true, force: true }); }catch(e){} }));
async function boot(extraEnv, dir){
  if(!dir){ dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tbreaks-')); dirs.push(dir); }
  const port = await freePort(), base = `http://127.0.0.1:${port}`;
  const env = { ...process.env, PORT: String(port), FAST: '1', NO_BEACON: '1', OWNER_CODE: 'secret', DATA_FILE: path.join(dir, 'club.json'), LEVEL_MS: '1000', BREAK_MS: '5000', ...extraEnv };
  delete env.STAGING; delete env.GAMEPLAY_OPTIONS; delete env.CLUB_SWITCHING;
  for(const k of Object.keys(env)) if(env[k] === null) delete env[k];
  const p = spawn(process.execPath, ['server/index.js'], { cwd: path.join(__dirname, '..'), env, stdio: ['ignore', 'ignore', 'inherit'] });
  let up = false; const t0 = Date.now();
  while(!up && p.exitCode === null && Date.now() - t0 < 10000){ try{ up = (await fetch(base + '/healthz')).ok; }catch(e){} if(!up) await sleep(40); }
  if(!up) throw new Error('server did not start');
  const s = { p, dir, port, base }; servers.push(s); return s;
}
const post = async (base, p, body, token) => (await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) })).json();

// a client that plays every decision at once (check, else call small, else fold) and records every table update with its time
function connect(s, tok, i){
  return new Promise(res => {
    const ws = new WebSocket(`ws://127.0.0.1:${s.port}/ws`, { headers: { 'x-forwarded-for': '10.2.' + i + '.1' } });
    const c = { i, ws, tok, id: null, club: null, log: [], send: o => ws.send(JSON.stringify(o)) };
    ws.on('open', () => c.send({ t: 'hello', token: tok, device: 'd' + i }));
    ws.on('message', raw => {
      const m = JSON.parse(raw);
      if(m.t === 'club'){ c.club = m.club; c.id = m.club.me.id; if(!c.ready){ c.ready = true; res(c); } }
      if(m.t !== 'table') return;
      const tb = m.table; c.log.push({ at: Date.now(), tid: tb.tid, handNo: tb.handNo, phase: tb.phase, result: !!tb.result, blinds: tb.blinds });
      if(tb.actUid === c.id && tb.legal && c.lastSeq !== tb.tid + tb.seq){
        c.lastSeq = tb.tid + tb.seq;
        const L = tb.legal, a = L.canCheck ? { t: 'check' } : L.toCall <= 2 * L.bb ? { t: 'call' } : { t: 'fold' };
        setTimeout(() => c.send({ t: 'act', tid: tb.tid, hand: tb.handNo, seq: tb.seq, a }), 5);
      }
    });
    ws.on('close', () => { c.closed = true; });
  });
}
async function makeClub(s, n){
  const own = await post(s.base, '/api/setup', { code: 'secret', name: 'Owner', pin: '1234', agree: true });
  const toks = [own.token];
  for(let i = 1; i < n; i++){ const { code } = await post(s.base, '/api/invite', {}, own.token); toks.push((await post(s.base, '/api/redeem', { code, name: 'Player ' + i, pin: '4321', agree: true })).token); }
  return Promise.all(toks.map((tok, i) => connect(s, tok, i)));
}
const T = c => c.club && c.club.tourney;
// the first time each (table, hand) was seen in any client's log
function firstSeen(cs){
  const m = new Map();
  for(const c of cs) for(const e of c.log) if(e.phase === 'hand'){ const k = e.tid + '#' + e.handNo; if(!m.has(k) || m.get(k) > e.at) m.set(k, e.at); }
  return m;
}

(async () => {
  // ---------- 1. a real two-table tournament reaches its first break ----------
  const s = await boot({});
  const cs = await makeClub(s, 10), own = cs[0];
  own.send({ t: 'create', name: 'Break Test', stack: 100000, levelMin: 20, tableSize: 6, breakMin: 3, sponsorSec: 5 });
  await until(() => T(own) && T(own).status === 'registering');
  ok(T(own).breakMin === 3 && T(own).breakEvery === 10 && T(own).breaks === true, 'the break setting (3 minutes) is kept and shown');
  cs.forEach(c => c.send({ t: 'join' }));
  await until(() => T(own).regs.length === 10);
  own.send({ t: 'start' });
  ok(await until(() => T(own).status === 'running' && own.club.tables.length === 2), 'two tables running');
  ok(T(own).breakUntil === null, 'no break at the start');

  ok(await until(() => T(own).breakUntil, 20000), 'a break starts after 10 levels');
  const breakAt = Date.now(), bu = T(own).breakUntil;
  ok(T(own).level === 10, 'the break comes after level 10 (the next level is 11): level index ' + T(own).level);
  ok(cs.every(c => T(c).breakUntil === bu), 'every player gets the same break end time');
  ok(Math.abs(bu - (breakAt + 5000)) < 1500, 'the break lasts the set time (BREAK_MS 5 s here)');
  ok(T(own).levelEndsAt - bu >= 999 && T(own).levelEndsAt - bu <= 1001, 'level 11 gets its full time after the break');

  // reconnect during the break: the new connection is told the same end time
  const again = await connect(s, cs[3].tok, 33);
  ok(T(again).breakUntil === bu, 'a reconnect during the break sees the same end time');

  // a hand in play when the break started is finished; no table deals a new hand during the break
  const seenBefore = new Set([...firstSeen(cs).keys()]);
  await until(() => Date.now() > bu - 300, 8000);
  const during = [...firstSeen(cs)].filter(([k, at]) => !seenBefore.has(k) && at > breakAt + 300 && at < bu - 50);
  ok(during.length === 0, 'no new hand is dealt during the break: ' + during.map(x => x[0]).join(', '));
  // a table whose last update before the break was a hand still in play gets that hand's result during the break
  const logAll = own.log;
  const inPlay = own.club.tables.map(t => logAll.filter(e => e.tid === t.tid && e.at <= breakAt).pop()).filter(e => e && e.phase === 'hand' && !e.result);
  ok(inPlay.every(e => logAll.some(x => x.tid === e.tid && x.handNo === e.handNo && x.result && x.at > breakAt - 50 && x.at < bu)),
    'a hand in play when the break started is played to the end (' + inPlay.length + ' such hands)');

  // after the break: every table deals again, on level 11 blinds, at about the same time
  await until(() => T(own).breakUntil === null, 4000);
  ok(T(own).breakUntil === null, 'the break ends by itself');
  const lv11 = E.levelFor(10, T(own).anteMode);
  ok(await until(() => {
    const fs1 = firstSeen(cs); const tids = new Set(own.club.tables.map(t => t.tid));
    return [...tids].every(tid => [...fs1].some(([k, at]) => k.startsWith(tid + '#') && at >= bu - 50));
  }, 6000), 'every table deals again after the break');
  const resumed = own.club.tables.map(t => Math.min(...[...firstSeen(cs)].filter(([k, at]) => k.startsWith(t.tid + '#') && at >= bu - 50).map(x => x[1])));
  ok(Math.max(...resumed) - Math.min(...resumed) < 2500, 'tables resume together (' + resumed.map(x => x - bu).join(', ') + ' ms after the end)');
  const after = cs.flatMap(c => c.log).filter(e => e.at >= bu - 50 && e.phase === 'hand').sort((x, y) => x.at - y.at)[0];
  ok(after && after.blinds[1] === lv11[1], 'the first hands after the break are on level 11 blinds');

  // ---------- 2. pause and resume during the second break keep the time left ----------
  ok(await until(() => T(own).breakUntil, 25000), 'the second break starts after level 20');
  ok(T(own).level === 20, 'second break after level 20');
  await sleep(1000);
  own.send({ t: 'pause' });
  await until(() => T(own).paused);
  const left = T(own).pausedBreakLeft;
  ok(T(own).paused && left > 2500 && left < 4500, 'pausing during a break keeps the break time left: ' + left);
  ok(T(own).breakUntil === null, 'while paused no break end time is shown');
  await sleep(1500);
  own.send({ t: 'resume' });
  await until(() => T(own).paused === false);
  const bu2 = T(own).breakUntil;
  ok(bu2 && Math.abs(bu2 - (Date.now() + left)) < 600, 'resuming restarts the break with the time that was left');
  await until(() => !T(own).breakUntil, 7000);
  ok(!T(own).breakUntil && Date.now() >= bu2 - 100, 'the resumed break ends at its new end time');
  cs.forEach(c => c.ws.close()); again.ws.close();
  s.p.kill('SIGKILL');

  // ---------- 3. a restart during a break keeps the end time ----------
  const r1 = await boot({ BREAK_MS: '8000' });
  const rc = await makeClub(r1, 3);
  rc[0].send({ t: 'create', name: 'Restart Test', stack: 100000, levelMin: 20 });
  await until(() => T(rc[0]) && T(rc[0]).status === 'registering');
  ok(T(rc[0]).breakMin === 5, 'the break is 5 minutes unless set');
  rc.forEach(c => c.send({ t: 'join' }));
  await until(() => T(rc[0]).regs.length === 3);
  rc[0].send({ t: 'start' });
  ok(await until(() => T(rc[0]).breakUntil, 20000), 'break started before the restart');
  const rbu = T(rc[0]).breakUntil;
  await sleep(500);
  r1.p.kill('SIGTERM');
  await new Promise(r => r1.p.once('exit', r));
  const r2 = await boot({ BREAK_MS: '8000' }, r1.dir);
  const back = await connect(r2, rc[0].tok, 70);
  ok(T(back).status === 'running' && T(back).breakUntil === rbu, 'after a restart the break keeps the same end time');
  ok(T(back).levelEndsAt === rbu + 1000, 'and the next level starts after it');
  ok(await until(() => !T(back).breakUntil, 9000), 'the break ends on time after a restart');
  back.ws.close(); r2.p.kill('SIGKILL');

  // ---------- 4. settings: 3 to 5 minutes only; editing keeps the setting ----------
  const s4 = await boot({});
  const c4 = await makeClub(s4, 2);
  c4[0].send({ t: 'create', name: 'Odd', stack: 30000, levelMin: 20, breakMin: 9 });
  await until(() => T(c4[0]) && T(c4[0]).status === 'registering');
  ok(T(c4[0]).breakMin === 5, 'an out-of-range break (9) falls back to 5 minutes');
  c4[0].send({ t: 'edit', name: 'Odd', stack: 30000, levelMin: 20, breakMin: 4 });
  await until(() => T(c4[0]).breakMin === 4);
  ok(T(c4[0]).breakMin === 4, 'editing sets the break to 4 minutes');
  c4[0].send({ t: 'edit', name: 'Odd 2', stack: 30000, levelMin: 20 });
  await until(() => T(c4[0]).name === 'Odd 2');
  ok(T(c4[0]).breakMin === 4, 'an edit without a break setting keeps it');
  c4.forEach(c => c.ws.close()); s4.p.kill('SIGKILL');

  // ---------- 5. BREAKS=0 turns them off ----------
  const s5 = await boot({ BREAKS: '0', LEVEL_MS: '600' });
  const c5 = await makeClub(s5, 3);
  c5[0].send({ t: 'create', name: 'No breaks', stack: 100000, levelMin: 20 });
  await until(() => T(c5[0]) && T(c5[0]).status === 'registering');
  c5.forEach(c => c.send({ t: 'join' }));
  await until(() => T(c5[0]).regs.length === 3);
  c5[0].send({ t: 'start' });
  let sawBreak = false;
  await until(() => { if(T(c5[0]).breakUntil) sawBreak = true; return T(c5[0]).level >= 11 || T(c5[0]).status !== 'running'; }, 20000);
  ok(T(c5[0]).breaks === false && !sawBreak && (T(c5[0]).level >= 11 || T(c5[0]).status !== 'running'), 'with BREAKS=0 levels run past 10 with no break');
  c5.forEach(c => c.ws.close()); s5.p.kill('SIGKILL');

  // ---------- 6. a hand that runs past the break's start: the break waits for it (Muse #11 D1) ----------
  // One player takes 1.5 s over every decision, so hands run across level ends. The break must start only when the last
  // hand has finished (breakUntil = max(level end, last hand's end) + the break), so every table gets the full break.
  const s6 = await boot({ LEVEL_MS: '300', BREAK_MS: '3000', TIME_BANK_MS: '4000' });
  const c6 = await makeClub(s6, 2);
  const slow = c6[1];
  slow.ws.removeAllListeners('message');
  slow.ws.on('message', raw => {
    const m = JSON.parse(raw);
    if(m.t === 'club'){ slow.club = m.club; slow.id = m.club.me.id; }
    if(m.t !== 'table') return;
    const tb = m.table; slow.log.push({ at: Date.now(), tid: tb.tid, handNo: tb.handNo, phase: tb.phase, result: !!tb.result, blinds: tb.blinds });
    if(tb.actUid === slow.id && tb.legal && slow.lastSeq !== tb.tid + tb.seq){
      slow.lastSeq = tb.tid + tb.seq;
      const L = tb.legal, a = L.canCheck ? { t: 'check' } : { t: 'call' };
      setTimeout(() => slow.send({ t: 'act', tid: tb.tid, hand: tb.handNo, seq: tb.seq, a }), 1500);
    }
  });
  c6[0].send({ t: 'create', name: 'Overrun', stack: 1000000, levelMin: 20 });
  await until(() => T(c6[0]) && T(c6[0]).status === 'registering');
  c6.forEach(c => c.send({ t: 'join' }));
  await until(() => T(c6[0]).regs.length === 2);
  c6[0].send({ t: 'start' });
  let pendingSeen = false;
  ok(await until(() => { if(T(c6[0]) && T(c6[0]).breakPending) pendingSeen = true; return T(c6[0]).breakUntil; }, 30000), 'the overrun break starts');
  const ob = T(c6[0]).breakUntil;
  ok(pendingSeen, 'while the last hand finishes, players see the break is next ("After this hand")');
  // the hand in play at the level end: its result is the last hand update before the break
  const results = c6[0].log.filter(e => e.result && e.at < ob);
  const lastEnd = results.length ? results[results.length - 1].at : 0;
  ok(lastEnd && ob - lastEnd >= 3000 - 1100, 'the break is the full break after the last hand ended: ' + (ob - lastEnd) + ' ms (break 3000, tick up to 1000)');
  const newHands = [...firstSeen(c6)].filter(([, at]) => at > lastEnd + 50 && at < ob - 50);
  ok(newHands.length === 0, 'no hand is dealt between the last hand and the end of the break');
  ok(T(c6[0]).levelEndsAt - ob >= 299 && T(c6[0]).levelEndsAt - ob <= 301, 'the next level still gets its full time after the break');
  c6.forEach(c => c.ws.close()); s6.p.kill('SIGKILL');

  console.log(`t_breaks: ${oks} ok, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
