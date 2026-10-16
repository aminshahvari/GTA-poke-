// Shared helpers for the phase-1 robustness tests. Local only: spawns throwaway servers on random ports with data in
// a fresh temp dir. Never touches DATABASE_URL or any production host.
const { spawn } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os'), net = require('net');
const WebSocket = require('ws');

const ROOT = path.resolve(__dirname, '..', '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const tmpdir = name => fs.mkdtempSync(path.join(os.tmpdir(), 'p1-' + name + '-'));

// never leave a server behind, even when a test crashes
const children = new Set();
process.on('exit', () => children.forEach(p => { try{ p.kill('SIGKILL'); }catch(e){} }));

function freePort(){
  return new Promise((res, rej) => { const s = net.createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
}

// Start a server. mode 'file' uses DATA_FILE; mode 'pg' uses the real store.js Postgres path against test/phase1/pgstub.js.
async function startServer({ mode = 'file', dataFile, dbDir, fast = true, env = {}, fault = null, port = null, label = 'srv' } = {}){
  port = port || await freePort();
  const e = { PATH: process.env.PATH, HOME: process.env.HOME, PORT: String(port), NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'p1-secret', DEBUG_CHIPS: '1', ...env };
  if(fast) e.FAST = '1';
  delete e.DATABASE_URL;
  const args = [];
  if(mode === 'pg'){ args.push('-r', path.join(__dirname, 'pgstub.js')); e.P1_DB_DIR = dbDir; if(fault) e.P1_FAULT = JSON.stringify(fault); }
  else e.DATA_FILE = dataFile;
  args.push(path.join(ROOT, 'server', 'index.js'));
  const proc = spawn(process.execPath, args, { env: e, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT });
  children.add(proc); proc.on('exit', () => children.delete(proc));
  const s = { proc, port, base: `http://127.0.0.1:${port}`, log: '', exit: null, label };
  proc.stdout.on('data', d => { s.log += d; if(process.env.VERBOSE) process.stdout.write(`[${label}] ` + d); });
  proc.stderr.on('data', d => { s.log += d; if(process.env.VERBOSE) process.stderr.write(`[${label}] ` + d); });
  s.exited = new Promise(r => proc.on('exit', (code, signal) => { s.exit = { code, signal }; r(s.exit); }));
  const t0 = Date.now();
  while(Date.now() - t0 < 8000){
    if(s.exit) throw new Error(`${label} exited early ${JSON.stringify(s.exit)}: ${s.log.slice(-500)}`);
    try{ const r = await fetch(s.base + '/healthz'); if(r.ok) return s; }catch(err){}
    await sleep(40);
  }
  throw new Error(label + ' did not become healthy');
}
async function stop(s, sig = 'SIGKILL'){ if(!s || s.exit) return s && s.exit; try{ s.proc.kill(sig); }catch(e){} return s.exited; }

async function post(base, p, body, token){
  const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
  return { status: r.status, ...(await r.json()) };
}
const chips = async base => (await fetch(base + '/debug/chips')).json();

// Owner + n-1 invited members. Returns tokens (index 0 = owner).
async function setupClub(base, n){
  const own = await post(base, '/api/setup', { code: 'p1-secret', name: 'Owner', pin: '1234', agree: true });
  if(!own.token) throw new Error('setup failed ' + JSON.stringify(own));
  const tokens = [own.token];
  for(let i = 1; i < n; i++){
    const { code } = await post(base, '/api/invite', {}, own.token);
    const r = await post(base, '/api/redeem', { code, name: 'Player ' + i, pin: '4321', agree: true });
    if(!r.token) throw new Error('redeem failed ' + JSON.stringify(r));
    tokens.push(r.token);
  }
  return tokens;
}

// A websocket player. policy: 'shove' (all-in or call), 'call', 'none' (never acts), or a function(c, tb) -> action|null.
function connect(port, token, { policy = 'shove', i = 0, ip } = {}){
  return new Promise((res, rej) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { 'x-forwarded-for': ip || ('10.9.' + Math.floor(i / 200) + '.' + (i % 200 + 1)) } });
    const c = { i, ws, token, id: null, club: null, tables: {}, msgs: [], events: [], policy, seen: new Set(), cards: {}, acts: 0, closed: false, authOk: null };
    const send = m => { if(ws.readyState === 1) ws.send(JSON.stringify(m)); };
    c.send = send;
    ws.on('open', () => send({ t: 'hello', token, device: 'p1dev' + i }));
    ws.on('error', e => { if(!c.ready) rej(e); });
    ws.on('close', () => { c.closed = true; });
    ws.on('message', raw => {
      const m = JSON.parse(raw); c.msgs.push({ at: Date.now(), t: m.t });
      if(m.t === 'auth'){ c.authOk = m.ok; if(!m.ok && !c.ready){ c.ready = true; res(c); } }
      if(m.t === 'club'){ c.club = m.club; c.id = m.club.me.id; if(!c.ready){ c.ready = true; res(c); } }
      if(m.t === 'error') c.lastError = m.error;
      if(m.t === 'fair') c.fair = m.report;
      if(m.t === 'table'){
        const tb = m.table; c.tables[tb.tid] = tb; c.lastTable = tb;
        if(m.you) c.cards[tb.tid + '#' + m.you.hand] = m.you.cards.slice();
        c.events.forEach(f => f(tb, m));
        if(tb.actUid === c.id && tb.legal){
          const key = tb.tid + ':' + tb.handNo + ':' + tb.seq;
          if(c.seen.has(key)) return; c.seen.add(key);
          c.turn = { tid: tb.tid, hand: tb.handNo, seq: tb.seq, legal: tb.legal, deadline: tb.deadline, at: Date.now() };
          let a = null; const L = tb.legal;
          if(typeof c.policy === 'function') a = c.policy(c, tb);
          else if(c.policy === 'shove') a = L.canRaise ? { t: 'raise', to: L.maxTo } : L.canCheck ? { t: 'check' } : { t: 'call' };
          else if(c.policy === 'call') a = L.canCheck ? { t: 'check' } : { t: 'call' };
          if(a){ send({ t: 'act', tid: tb.tid, hand: tb.handNo, seq: tb.seq, a }); c.acts++; }
        }
      }
    });
  });
}
const closeAll = cs => cs.forEach(c => { try{ c.ws.terminate(); }catch(e){} });

// Create and start a tournament; everyone in clients joins.
async function runTourney(owner, clients, opts = {}){
  owner.send({ t: 'create', name: opts.name || 'P1 Test', stack: opts.stack || 10000, levelMin: opts.levelMin || 1, tableSize: opts.tableSize || 9, lateLevels: 0 });
  await waitFor(() => owner.club.tourney && owner.club.tourney.status === 'registering', 3000, 'tourney created');
  clients.forEach(c => c.send({ t: 'join' }));
  await waitFor(() => owner.club.tourney.regs.length === clients.length, 3000, 'all joined');
  owner.send({ t: 'start' });
  await waitFor(() => owner.club.tourney.status === 'running', 3000, 'tourney running');
}
async function waitFor(fn, ms, what = 'condition', step = 20){
  const t0 = Date.now();
  while(Date.now() - t0 < ms){ try{ const v = await fn(); if(v) return v; }catch(e){} await sleep(step); }
  throw new Error('timed out waiting for ' + what);
}

function readDb(dir){
  const out = {};
  for(const f of fs.readdirSync(dir)) if(f.endsWith('.json')) try{ out[decodeURIComponent(f.slice(0, -5))] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }catch(e){}
  return out;
}
const readFileDb = f => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};

// Consistency of a persisted state (key -> value map).
function consistency(db){
  const t = db.tourney || {}, live = db.live, issues = [];
  const places = t.places || [];
  const placeUids = places.map(r => r.uid);
  const dupPlaces = placeUids.filter((u, i) => placeUids.indexOf(u) !== i);
  if(dupPlaces.length) issues.push('duplicate uids in places: ' + [...new Set(dupPlaces)].join(','));
  const seated = live ? live.tables.flatMap(tb => tb.seats.filter(s => s && s.stack > 0)) : [];
  const both = seated.filter(s => placeUids.includes(s.uid)).map(s => s.uid);
  if(both.length) issues.push('in places AND seated with chips: ' + both.join(','));
  const sum = seated.reduce((a, s) => a + s.stack, 0);
  if(t.status === 'running' && live && sum !== t.stack * t.entrants) issues.push(`chips ${sum} != ${t.stack * t.entrants}`);
  if(t.status === 'running' && live && t.remaining != null && seated.length !== t.remaining) issues.push(`tourney.remaining=${t.remaining} but ${seated.length} seated in live`);
  return { issues, places: placeUids, seated: seated.map(s => s.uid), sum };
}

// Uniform result line. expectFail: whether failure is expected against today's code.
function result(name, { pass, expectFail, reason, notes = [] }){
  const line = `${pass ? 'PASS' : 'FAIL'} ${name}: ${reason}`;
  console.log(line);
  notes.forEach(n => console.log('  note: ' + n));
  console.log('P1RESULT ' + JSON.stringify({ name, pass, expectFail, reason, notes }));
  process.exitCode = pass ? 0 : 1;
}
function guard(name, expectFail, fn, cleanup){
  const kill = setTimeout(() => { result(name, { pass: false, expectFail, reason: 'test timed out (>45 s)' }); cleanup && cleanup(); process.exit(1); }, 45000);
  fn().then(() => { clearTimeout(kill); cleanup && cleanup(); setTimeout(() => process.exit(), 50); })
    .catch(e => { clearTimeout(kill); result(name, { pass: false, expectFail, reason: 'test error: ' + (e && e.message) }); cleanup && cleanup(); setTimeout(() => process.exit(1), 50); });
}

module.exports = { ROOT, sleep, tmpdir, freePort, startServer, stop, post, chips, setupClub, connect, closeAll, runTourney, waitFor, readDb, readFileDb, consistency, result, guard };
