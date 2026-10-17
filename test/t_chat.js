// Table chat isolation. Chat, throwables, chat logs and table snapshots must reach only the sender's table: players seated
// there and sockets watching it. Players at other tables, railbirds of other tables, removed members and signed-out sockets
// get nothing; this holds after a rebalance move and a table break; mute works. Deterministic: every check runs while the
// tournament is paused with seating confirmed stable from the server, and every "got nothing" is proven with a per-socket
// round-trip barrier (the server writes a broadcast to every socket before it answers any later request on that socket).
const { spawn } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os'), net = require('net');
const WebSocket = require('ws');
const ROOT = path.join(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, checks = 0; const neg = {};
const fail = m => { fails++; if(fails < 30) console.log('FAIL', m); };
const ok = (c, m) => { checks++; if(!c) fail(m); return c; };
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
async function until(f, what, ms = 15000){ const t0 = Date.now(); while(!f()){ if(Date.now() - t0 > ms){ fail('timed out waiting for ' + what); return false; } await sleep(25); } return true; }

(async () => {
  const PORT = await freePort(), base = `http://127.0.0.1:${PORT}`, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-'));
  const env = { ...process.env, PORT: String(PORT), FAST: '1', NO_BEACON: '1', NO_PUSH: '1', DEBUG_CHIPS: '1', OWNER_CODE: 'secret', DATA_FILE: path.join(dir, 'club.json') };
  delete env.DATABASE_URL;
  const srv = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'inherit'] });
  srv.stdout.on('data', d => process.env.VERBOSE && process.stdout.write(d));
  process.on('exit', () => { try{ srv.kill('SIGKILL'); }catch(e){} try{ fs.rmSync(dir, { recursive: true, force: true }); }catch(e){} });
  setTimeout(() => { console.log('FAIL chat test timed out'); process.exit(1); }, 240000).unref();
  { const t0 = Date.now(); for(;;){ try{ if((await fetch(base + '/healthz')).ok) break; }catch(e){} if(Date.now() - t0 > 10000) throw new Error('server did not start'); await sleep(40); } }
  const post = async (p, body, token) => (await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) })).json();
  const debug = async () => (await fetch(base + '/debug/chips')).json();

  // ---------- sockets ----------
  const all = []; let ipN = 0, running = false;
  const shove = new Set(); // tids where the bots go all-in every hand (to force busts, moves and breaks)
  function bot(s, tb){
    if(!s.plays || tb.actUid !== s.uid || !tb.legal || s.lastSeq === tb.tid + ':' + tb.seq) return;
    s.lastSeq = tb.tid + ':' + tb.seq; const L = tb.legal;
    const a = shove.has(tb.tid) ? (L.canRaise ? { t: 'raise', to: L.maxTo } : L.canCheck ? { t: 'check' } : { t: 'call' }) : L.canCheck ? { t: 'check' } : { t: 'fold' };
    s.ws.send(JSON.stringify({ t: 'act', tid: tb.tid, hand: tb.handNo, seq: tb.seq, a }));
  }
  function onMsg(s, m){
    if(m.t === 'club'){ s.club = m.club; s.authed = true; s.uid = m.club.me.id;
      // app-like sockets follow their seat exactly like public/app.js onClub: re-watch when club.myTable changes
      if(s.app && m.club.myTable && m.club.myTable !== s.lastMy && m.club.tourney && m.club.tourney.status === 'running'){ s.watch = m.club.myTable; s.watchOk = null; s.ws.send(JSON.stringify({ t: 'watch', tid: s.watch })); }
      if(s.app) s.lastMy = m.club.myTable; }
    if(m.t === 'auth' && !m.ok) s.authed = false;
    if(m.t === 'chatlog'){ if(m.tid === s.watch) s.watchOk = m.tid; if(m.log.some(e => e.tid !== m.tid)) fail(`${s.label}: chatlog for ${m.tid} holds another table's lines`); }
    if(m.t === 'chaterr') s.chatErr = m.error;
    if(m.t === 'table'){
      const seated = m.table.seats.some(x => x && x.uid === s.uid);
      if(m.you && !seated) fail(`${s.label}: hole cards for a table it is not seated at`);
      // a socket that never watches may only ever see the table it sits at
      if(!s.app && !s.everWatched && !seated) fail(`${s.label}: got table ${m.table.tid} while seated elsewhere and not watching`);
      if(running) bot(s, m.table);
    }
    if(!s.uid && ['chat', 'chatlog', 'table', 'coach', 'club', 'closed'].includes(m.t)) fail(`${s.label}: signed-out socket got ${m.t}`);
  }
  // token: sign in with it; uid: the account (also for a socket whose token no longer works)
  function sock(label, { token, uid, app = false, plays = false } = {}){
    return new Promise(res => {
      ipN++;
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { 'x-forwarded-for': `10.7.${ipN >> 8}.${ipN & 255}` } });
      const s = { label, ws, uid: null, acct: uid || null, token, app, plays, box: [], waits: [], watch: null, open: false, authed: false, closed: null };
      all.push(s);
      ws.on('message', raw => { const m = JSON.parse(raw); s.box.push(m); onMsg(s, m); s.waits = s.waits.filter(w => !w(m)); });
      ws.on('close', code => { s.open = false; s.closed = code; s.waits.forEach(w => w(null)); s.waits = []; });
      ws.on('open', () => {
        s.open = true;
        if(!token) return res(s);
        ws.send(JSON.stringify({ t: 'hello', token, device: 'chat-dev-' + ipN }));
        s.waits.push(m => { if(m && m.t === 'club'){ s.uid = m.club.me.id; res(s); return true; } if(!m || (m.t === 'auth' && !m.ok)){ res(s); return true; } return false; });
      });
    });
  }
  const next = (s, pred, what, ms = 5000) => new Promise(res => {
    if(!s.open) return res(null);
    const tm = setTimeout(() => { fail(`${s.label}: no ${what}`); res(null); }, ms);
    s.waits.push(m => { if(m === null || pred(m)){ clearTimeout(tm); res(m); return true; } return false; });
  });
  // round-trip barrier: after this resolves, everything the server sent this socket before has arrived
  const ping = s => !s.open ? null : s.authed
    ? (s.ws.send(JSON.stringify({ t: 'hands' })), next(s, m => m.t === 'hands', 'hands reply'))
    : (s.ws.send(JSON.stringify({ t: 'ping' })), next(s, m => m.t === 'auth' && !m.ok, 'auth reply'));
  const send = (s, m) => s.ws.send(JSON.stringify(m));

  // ---------- club: owner, 17 players, 3 railbirds ----------
  const own = await post('/api/setup', { code: 'secret', name: 'Owner', pin: '1234', agree: true });
  const mk = async name => { const { code } = await post('/api/invite', {}, own.token); const r = await post('/api/redeem', { code, name, pin: '4321', agree: true }); if(!r.token) throw new Error('redeem ' + JSON.stringify(r)); return r.token; };
  const owner = await sock('owner', { token: own.token }); owner.everWatched = true;
  const P = 17, players = [];
  for(let i = 0; i < P; i++){
    const token = await mk('Player ' + (i + 1));
    const raw = await sock(`P${i + 1}`, { token, plays: true }), app = await sock(`P${i + 1}/app`, { token, app: true });
    players.push({ n: i + 1, uid: raw.uid, token, raw, app, socks: [raw, app] });
  }
  const rails = []; for(let i = 0; i < 3; i++){ const token = await mk('Rail ' + (i + 1)); const s = await sock(`R${i + 1}`, { token }); s.everWatched = true; rails.push({ token, s }); }
  const anons = [await sock('anon/no-hello'), await sock('anon/bad-token', { token: 'nope' })];
  ok(anons.every(s => s.open && !s.authed), 'anonymous sockets should be open and unauthenticated');
  send(anons[1], { t: 'watch', tid: 'x' }); // watch without a session is refused
  const byUid = new Map(players.map(p => [p.uid, p]));
  const removed = new Set(), muted = new Set();

  send(owner, { t: 'create', name: 'Chat Night', stack: 30000, levelMin: 60, tableSize: 6, lateLevels: 0 }); await ping(owner);
  for(const p of players){ send(p.raw, { t: 'join' }); await ping(p.raw); }
  running = true; send(owner, { t: 'start' }); await ping(owner);

  // ---------- truth from the server, taken while paused and stable ----------
  let truth = new Map(), tids = [];
  async function settle(){
    send(owner, { t: 'pause' }); await ping(owner);
    let prev = null, d;
    for(let i = 0; ; i++){
      d = await debug();
      const k = JSON.stringify(d.detail.map(t => [t.tid, t.seats.map(x => x[1]).sort()]));
      if(k === prev) break; prev = k;
      if(i > 40){ fail('seating never settled'); break; }
      await sleep(500);
    }
    truth = new Map(); tids = d.detail.filter(t => !t.broken).map(t => t.tid);
    d.detail.forEach(t => t.seats.forEach(x => truth.set(x[1], t.tid)));
    await until(() => players.every(p => !p.app.open || !truth.has(p.uid) || p.app.watchOk === truth.get(p.uid)), 'app sockets to follow their seats');
    await Promise.all(all.map(ping));
  }
  const resume = () => { send(owner, { t: 'resume' }); };
  const seatedAt = tid => players.filter(p => truth.get(p.uid) === tid && !removed.has(p.uid) && p.raw.open);
  const live = () => all.filter(s => s.open);
  const hears = (s, tid) => !!tid && s.authed && s.open && !removed.has(s.uid) && (truth.get(s.uid) === tid || s.watch === tid);
  const kind = (s, tid) => !s.uid ? 'signed-out socket' : removed.has(s.uid) ? 'removed member' : truth.has(s.uid) ? (s.watch && s.watch !== truth.get(s.uid) ? 'player watching another table' : 'player at another table')
    : s === owner ? 'owner not watching' : s.watch ? 'railbird of another table' : 'member in lobby';
  // rate limit: 8 lines / 20s and 800ms apart per member
  const said = new Map();
  async function paced(uid){ const now = () => Date.now(), r = () => (said.get(uid) || []).filter(x => now() - x < 20500);
    while(r().length >= 7 || (r().length && now() - r()[r().length - 1] < 900)) await sleep(50); }
  const note = uid => said.set(uid, [...(said.get(uid) || []), Date.now()]);

  // send msg from `from`, prove the server handled it, barrier every socket, then check who got a chat line
  async function check(label, from, msg, tid, { uid, expectErr = false, match } = {}){
    uid = uid || from.uid;
    if(!expectErr) await paced(uid);
    all.forEach(s => { s.mark = s.box.length; }); from.chatErr = null;
    send(from, msg); await ping(from); await Promise.all(all.filter(s => s !== from).map(ping));
    if(!expectErr && tid) note(uid);
    if(expectErr) ok(from.chatErr, `${label}: expected a chat error`);
    else ok(!from.chatErr, `${label}: unexpected chat error ${from.chatErr}`);
    let got = 0;
    for(const s of all){
      const lines = s.box.slice(s.mark).filter(m => m.t === 'chat');
      if(hears(s, tid)){ got++; ok(lines.length === 1 && lines[0].msg.tid === tid && lines[0].msg.from === uid && (!match || match(lines[0].msg)), `${label}: ${s.label} should get exactly one line, got ${JSON.stringify(lines)}`); }
      else { const k = kind(s, tid); neg[k] = (neg[k] || 0) + 1; ok(!lines.length, `${label}: LEAK to ${s.label} (${k}): ${JSON.stringify(lines)}`); }
    }
    if(tid) ok(got >= 2, `${label}: delivered to ${got} sockets only`);
  }
  const say = (p, text, tid, opt) => check(`chat ${p.raw.label}@${tid}`, p.raw, { t: 'chat', text }, tid, { ...opt, match: m => m.kind === 'text' && m.text === text });
  const toss = (p, item, to, tid, opt) => check(`throw ${item} ${p.raw.label}->${to.raw.label}`, p.raw, { t: 'throw', item, to: to.uid }, tid, { ...opt, match: m => m.kind === 'throw' && m.item === item && m.to === to.uid });
  // every table: a line and a throw from someone seated there reach that table only
  async function sweep(tag){
    for(const tid of tids){
      const at = seatedAt(tid).filter(p => !muted.has(p.uid)); if(!at.length) continue;
      await say(at[0], `${tag} hi from ${tid}`, tid);
      if(at.length > 1) await toss(at[at.length - 1], 'egg', at[0], tid);
    }
  }

  // ---------- 1. at the start ----------
  await settle();
  ok(tids.length === 3, `expected 3 tables at start, got ${tids.length}`);
  const [tA, tB, tC] = tids;
  for(const [r, tid] of [[rails[0], tA], [rails[1], tB], [rails[2], tA]]){ r.s.watch = tid; send(r.s, { t: 'watch', tid }); await next(r.s, m => m.t === 'chatlog' && m.tid === tid, 'chatlog on watch'); }
  await sweep('start');
  const a1 = seatedAt(tA), b1 = seatedAt(tB), c1 = seatedAt(tC);
  await toss(a1[1], 'tomato', a1[2], tA);
  // throws that must go nowhere: at a player at another table, at yourself, an unknown item
  await check('throw at another table', a1[3].raw, { t: 'throw', item: 'tomato', to: b1[0].uid }, null);
  await check('throw at self', a1[3].raw, { t: 'throw', item: 'egg', to: a1[3].uid }, null);
  await check('unknown throwable', a1[3].raw, { t: 'throw', item: 'brick', to: a1[0].uid }, null);
  // railbirds cannot talk; the owner talks only into the table being watched
  await check('railbird chat', rails[0].s, { t: 'chat', text: 'rail talk' }, null, { expectErr: true });
  await check('owner chat in lobby', owner, { t: 'chat', text: 'owner lobby' }, null, { expectErr: true });
  owner.watch = tB; send(owner, { t: 'watch', tid: tB }); await next(owner, m => m.t === 'chatlog' && m.tid === tB, 'owner chatlog');
  await check('owner chat at tB', owner, { t: 'chat', text: 'owner says hi' }, tB, { match: m => m.text === 'owner says hi' });
  owner.watch = null; send(owner, { t: 'watch', tid: null }); await ping(owner);
  // a railbird switching tables gets that table's log only
  rails[1].s.watch = tC; send(rails[1].s, { t: 'watch', tid: tC });
  const lg = await next(rails[1].s, m => m.t === 'chatlog' && m.tid === tC, 'chatlog tC');
  ok(lg && lg.log.length && lg.log.every(e => e.tid === tC), 'chatlog on watch should hold that table only');

  // ---------- 2. mute ----------
  const mu = a1[0];
  send(owner, { t: 'mute', uid: mu.uid, muted: true }); await ping(owner); muted.add(mu.uid);
  await check('muted chat', mu.raw, { t: 'chat', text: 'muted?' }, null, { expectErr: true });
  await check('muted throw', mu.raw, { t: 'throw', item: 'egg', to: a1[1].uid }, null, { expectErr: true });
  send(owner, { t: 'mute', uid: mu.uid, muted: false }); await ping(owner); muted.delete(mu.uid);
  await say(mu, 'unmuted again', tA);

  // ---------- 3. removed member (seated) and removed railbird; signed-out player ----------
  const gone = a1[a1.length - 1], goneRail = rails[2];
  for(const x of [gone.uid, goneRail.s.uid]){ send(owner, { t: 'remove', uid: x }); await ping(owner); removed.add(x); }
  await until(() => [...gone.socks, goneRail.s].every(s => s.closed === 4003), 'removed sockets closed with 4003');
  // their old tokens no longer sign in, and watching without a session is refused
  for(const [label, token] of [['removed/rejoin', gone.token], ['removed-rail/rejoin', goneRail.token]]){
    const s = await sock(label, { token }); ok(!s.authed && s.open, label + ' should be refused'); send(s, { t: 'watch', tid: tA }); await ping(s);
  }
  const out = b1[b1.length - 1]; out.socks.forEach(s => s.ws.close()); await until(() => out.socks.every(s => !s.open), 'sign out');
  await sock('signed-out/reload'); // the page reloads to the sign-in screen: a socket with no session
  await sweep('after-remove');

  // ---------- 4. rebalance: busts at the short table move a player in from a full one ----------
  const before = new Map(truth), short = tids.slice().sort((x, y) => seatedAt(x).length - seatedAt(y).length)[0];
  async function playUntil(what, done){
    shove.clear(); what.forEach(t => shove.add(t)); resume();
    // the waiting decision was answered or will be re-sent; nudge every bot with its latest table view
    for(const p of players) if(p.raw.open){ const tb = p.raw.box.filter(m => m.t === 'table').pop(); if(tb) bot(p.raw, tb.table); }
    const t0 = Date.now(); let d;
    for(;;){ d = await debug(); if(done(d)) break; if(Date.now() - t0 > 90000){ fail('play phase timed out'); break; } await sleep(100); }
    shove.clear(); await settle();
  }
  const seatOf = d => { const m = new Map(); d.detail.forEach(t => t.seats.forEach(x => m.set(x[1], t.tid))); return m; };
  await playUntil([short], d => { const m = seatOf(d); return [...m].some(([u, t]) => before.has(u) && before.get(u) !== t); });
  async function movedChecks(tag, prev){
    const moved = players.filter(p => truth.has(p.uid) && prev.has(p.uid) && prev.get(p.uid) !== truth.get(p.uid) && p.raw.open && !removed.has(p.uid));
    ok(moved.length, tag + ': nobody moved');
    for(const m of moved.slice(0, 3)){
      const old = prev.get(m.uid), now = truth.get(m.uid);
      ok(m.app.watch === now, `${tag}: app socket of ${m.raw.label} should follow to ${now}`);
      // the old table (when it still exists) no longer reaches the moved player; the new one does, both ways
      const oldMate = tids.includes(old) && seatedAt(old).find(p => !muted.has(p.uid));
      if(oldMate) await say(oldMate, `${tag} old table ${old}`, old);
      else ok(!tids.includes(old), `${tag}: old table ${old} still open but empty`);
      const mate = seatedAt(now).find(p => p !== m);
      if(mate){ await say(mate, `${tag} new table ${now} to ${m.raw.label}`, now); await toss(m, 'egg', mate, now); }
      await say(m, `${tag} ${m.raw.label} from new seat`, now);
      console.log(`${tag}: ${m.raw.label} moved ${old} -> ${now}${tids.includes(old) ? '' : ' (old table closed)'}`);
    }
    return moved.length;
  }
  const nMoved = await movedChecks('rebalance', before);
  await sweep('after-rebalance');

  // ---------- 5. break: busts at the biggest table until a table closes ----------
  const before2 = new Map(truth), n2 = tids.length, big = tids.slice().sort((x, y) => seatedAt(y).length - seatedAt(x).length)[0];
  await playUntil([big], d => d.detail.length < n2);
  const broke = [...new Set(before2.values())].filter(t => !tids.includes(t));
  ok(broke.length, 'no table broke');
  const nBroke = await movedChecks('break', before2);
  // a closed table's log is gone: watching it again shows nothing from before
  for(const t of broke){ const r = rails[0].s; r.watch = t; send(r, { t: 'watch', tid: t }); const lg2 = await next(r, m => m.t === 'chatlog' && m.tid === t, 'chatlog of closed table'); ok(lg2 && !lg2.log.length, 'closed table chat log still served'); }
  await sweep('after-break');

  running = false;
  const negs = Object.entries(neg).map(([k, v]) => `${k} ${v}`).join(', ');
  console.log(`chat test: ${checks} checks, ${nMoved} moved by rebalance, ${nBroke} moved by break (${broke.join()}), no-delivery proofs: ${negs}`);
  console.log(fails ? `${fails} FAILURES` : 'chat test passed');
  all.forEach(s => { try{ s.ws.close(); }catch(e){} });
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL', e.stack); process.exit(1); });
