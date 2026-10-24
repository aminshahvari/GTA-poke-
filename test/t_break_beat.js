// The winner beat and the break's start (Issue #34, the owner's live game of 2026-10-23), over real WebSockets:
// 1. after every hand the result (winner, amount, winning hand) stays in every table update for the whole winner beat,
//    3 seconds here (WIN_BEAT_MS 3000 with FAST), uncontested pots and showdowns alike, held by the server;
// 2. a break that waits for the last hand starts the moment that hand (with its beat) is over, not on the clock's next
//    second; it still lasts exactly the set time, no hand is dealt during it, and the next level gets its full time.
const { spawn } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os'), net = require('net');
const WebSocket = require('ws');

let fails = 0, oks = 0;
const ok = (c, m) => { if(c) oks++; else fails++; console.log((c ? 'ok   ' : 'FAIL ') + m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 4000) => { const t0 = Date.now(); while(!f() && Date.now() - t0 < ms) await sleep(20); return f(); };
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const servers = [], dirs = [];
process.on('exit', () => { servers.forEach(s => { try{ s.p.kill('SIGKILL'); }catch(e){} }); dirs.forEach(d => { try{ fs.rmSync(d, { recursive: true, force: true }); }catch(e){} }); });
async function boot(extraEnv){
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tbeat-')); dirs.push(dir);
  const port = await freePort(), base = `http://127.0.0.1:${port}`;
  const env = { ...process.env, PORT: String(port), FAST: '1', NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: path.join(dir, 'club.json'), DATABASE_URL: '', ...extraEnv };
  delete env.STAGING; delete env.GAMEPLAY_OPTIONS; delete env.CLUB_SWITCHING;
  for(const k of Object.keys(env)) if(env[k] === null) delete env[k];
  const p = spawn(process.execPath, ['server/index.js'], { cwd: path.join(__dirname, '..'), env, stdio: ['ignore', 'ignore', 'inherit'] });
  let up = false; const t0 = Date.now();
  while(!up && p.exitCode === null && Date.now() - t0 < 10000){ try{ up = (await fetch(base + '/healthz')).ok; }catch(e){} if(!up) await sleep(40); }
  if(!up) throw new Error('server did not start');
  const s = { p, dir, port, base }; servers.push(s); return s;
}
const stop = s => { try{ s.p.kill('SIGKILL'); }catch(e){} };
const post = async (base, p, body, token) => (await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) })).json();
// a player that answers at once with the given style (fold: folds to any bet, so pots go uncontested; call: checks or
// calls, so hands reach a showdown), recording every table update and every club update with its time
function connect(s, tok, i, style){
  return new Promise(res => {
    const ws = new WebSocket(`ws://127.0.0.1:${s.port}/ws`, { headers: { 'x-forwarded-for': '10.3.' + i + '.1' } });
    const c = { i, ws, id: null, club: null, log: [], clubs: [], send: o => ws.send(JSON.stringify(o)) };
    ws.on('open', () => c.send({ t: 'hello', token: tok, device: 'b' + i }));
    ws.on('message', raw => {
      const m = JSON.parse(raw);
      if(m.t === 'club'){ c.club = m.club; c.id = m.club.me.id; c.clubs.push({ at: Date.now(), T: m.club.tourney }); if(!c.ready){ c.ready = true; res(c); } }
      if(m.t !== 'table') return;
      const tb = m.table; c.log.push({ at: Date.now(), tid: tb.tid, handNo: tb.handNo, phase: tb.phase, result: tb.result });
      if(tb.actUid === c.id && tb.legal && c.lastSeq !== tb.tid + tb.seq){
        c.lastSeq = tb.tid + tb.seq;
        const L = tb.legal, a = L.canCheck ? { t: 'check' } : style === 'fold' ? { t: 'fold' } : { t: 'call' };
        setTimeout(() => c.send({ t: 'act', tid: tb.tid, hand: tb.handNo, seq: tb.seq, a }), 5);
      }
    });
  });
}
async function club(s, n, style){
  const own = await post(s.base, '/api/setup', { code: 'secret', name: 'Owner', pin: '1234', agree: true });
  const toks = [own.token];
  for(let i = 1; i < n; i++){ const { code } = await post(s.base, '/api/invite', {}, own.token); toks.push((await post(s.base, '/api/redeem', { code, name: 'Player ' + i, pin: '4321', agree: true })).token); }
  return Promise.all(toks.map((tok, i) => connect(s, tok, i, style)));
}
const T = c => c.club && c.club.tourney;
// every finished hand in one client's log: when its result first showed, and when the table first showed anything else
function beats(c){
  const out = [], seen = new Set();
  c.log.forEach((e, k) => {
    const id = e.tid + '#' + e.handNo;
    if(!e.result || seen.has(id)) return; seen.add(id);
    const end = c.log.slice(k + 1).find(x => x.tid === e.tid && !(x.result && x.handNo === e.handNo));
    if(end) out.push({ id, from: e.at, ms: end.at - e.at, res: e.result, gap: c.log.slice(k + 1).filter(x => x.tid === e.tid && x.at < end.at).every(x => x.result) });
  });
  return out;
}

(async () => {
  // ---------- 1. the winner beat: 3 seconds of result after every hand ----------
  for(const style of ['fold', 'call']){
    const s = await boot({ BREAKS: '0', LEVEL_MS: '600000', WIN_BEAT_MS: '3000' });
    const cs = await club(s, 3, style), own = cs[0];
    own.send({ t: 'create', name: 'Beat Test', stack: 100000, levelMin: 20 });
    await until(() => T(own) && T(own).status === 'registering');
    cs.forEach(c => c.send({ t: 'join' })); await until(() => T(own).regs.length === 3);
    own.send({ t: 'start' });
    await until(() => beats(own).length >= 3, 20000);
    const b = beats(own).slice(0, 3), what = style === 'fold' ? 'uncontested pots' : 'showdowns';
    ok(b.length === 3, `${what}: three hands played (${b.length})`);
    ok(b.every(x => x.ms >= 2950), `${what}: the result stays up for the whole 3 s beat: ${b.map(x => x.ms).join(', ')} ms`);
    ok(b.every(x => x.ms < 4200), `${what}: and the table moves on after it: ${b.map(x => x.ms).join(', ')} ms`);
    ok(b.every(x => x.gap), `${what}: no update without the result during the beat`);
    ok(b.every(x => /^.+ (wins|split) [\d,]+/.test(x.res.lines[0])), `${what}: the winner and the amount: ${b[0] && b[0].res.lines[0]}`);
    if(style === 'call') ok(b.every(x => x.res.showdown && x.res.hand && x.res.lines[0].endsWith('· ' + x.res.hand)), `showdowns: the winning hand with the result: ${b[0] && b[0].res.hand}`);
    else ok(b.every(x => !x.res.showdown && x.res.hand === ''), 'uncontested: no winning hand to name (nobody showed)');
    // every client gets the same beat (it is the server's, not a client's)
    const other = beats(cs[1]).filter(x => b.some(y => y.id === x.id));
    ok(other.length && other.every(x => x.ms >= 2950), `${what}: another player sees the same beat: ${other.map(x => x.ms).join(', ')} ms`);
    cs.forEach(c => c.ws.close()); stop(s);
  }

  // ---------- 2. the break starts the moment the last hand is over ----------
  {
    const BREAK_MS = 2500;
    const s = await boot({ LEVEL_MS: '300', BREAK_MS: String(BREAK_MS), WIN_BEAT_MS: '1500' });
    const cs = await club(s, 10, 'call'), own = cs[0];
    own.send({ t: 'create', name: 'Break Start', stack: 100000, levelMin: 20, tableSize: 6 });
    await until(() => T(own) && T(own).status === 'registering');
    cs.forEach(c => c.send({ t: 'join' })); await until(() => T(own).regs.length === 10);
    own.send({ t: 'start' });
    ok(await until(() => T(own).status === 'running' && own.club.tables.length === 2, 6000), 'two tables running');
    ok(await until(() => T(own).breakUntil, 30000), 'the break starts after level 10');
    const Tb = T(own), bu = Tb.breakUntil, at = Tb.breakAt;
    ok(at && bu - at === BREAK_MS, `the break lasts exactly the set time from its start (${bu - at} ms)`);
    ok(Tb.levelEndsAt - bu === 300, 'level 11 keeps its full time after the break');
    // when each table's last hand before the break left the screen (the end of its beat)
    const ends = own.club.tables.map(t => { const all = cs.flatMap(c => c.log).filter(e => e.tid === t.tid && e.at <= at + 50).sort((x, y) => x.at - y.at);
      const lastHand = all.filter(e => e.phase === 'hand').pop(); const idle = lastHand && all.find(e => e.at >= lastHand.at && e.phase === 'idle'); return idle ? idle.at : 0; });
    const last = Math.max(...ends);
    ok(last > 0 && at - last <= 150 && at - last >= -50, `the break starts as the last table's hand ends: ${at - last} ms after it (was up to 1000 ms on the clock's tick)`);
    // the clubs heard about it at once
    const heard = cs.map(c => (c.clubs.find(x => x.T && x.T.breakAt === at) || {}).at).filter(Boolean);
    ok(heard.length === cs.length && Math.max(...heard) - at < 400, `every player hears of the break at once: within ${Math.max(...heard) - at} ms`);
    // no hand dealt during it, and play resumes by itself
    const dealt = cs.flatMap(c => c.log).filter(e => e.phase === 'hand' && !e.result && e.at > at + 100 && e.at < bu - 50);
    ok(!dealt.length, 'no hand is dealt during the break');
    ok(await until(() => T(own).breakUntil === null && T(own).breakAt === null, 4000), 'the break ends by itself');
    cs.forEach(c => c.ws.close()); stop(s);
  }

  console.log(`t_break_beat: ${oks} ok, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
