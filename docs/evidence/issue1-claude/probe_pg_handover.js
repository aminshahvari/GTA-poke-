// Claude triage probe (issue #1, concern 2). Runs the REAL server/store.js + real `pg` driver against a throwaway local
// Postgres (scratchpad cluster, not production). Simulates a Render deploy overlap: instance A runs a tournament,
// instance B boots on the same database (claims the lease), A must fence itself; then B gets SIGTERM and C boots.
// usage: PGURL=postgres://... node probe_pg_handover.js <repo dir>
const { spawn } = require('child_process');
const path = require('path'), net = require('net');
const REPO = path.resolve(process.argv[2]);
const WebSocket = require(path.join(REPO, 'node_modules', 'ws'));
const { Client } = require(path.join(REPO, 'node_modules', 'pg'));
const URL_ = process.env.PGURL;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 8000) => { const t0 = Date.now(); while(!(await f()) && Date.now() - t0 < ms) await sleep(50); };
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const out = []; const ok = (c, m) => { out.push((c ? 'ok   ' : 'FAIL ') + m); console.log((c ? 'ok   ' : 'FAIL ') + m); };
const procs = [];
process.on('exit', () => procs.forEach(p => { try{ p.kill('SIGKILL'); }catch(e){} }));

async function boot(name){
  const port = await freePort(), log = [];
  const p = spawn(process.execPath, ['server/index.js'], { cwd: REPO, env: { ...process.env, DATABASE_URL: URL_, DATA_FILE: '', PORT: String(port), FAST: '1', NO_BEACON: '1', DEBUG_CHIPS: '1', OWNER_CODE: 'probe-local-only', RENDER_INSTANCE_ID: name }, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', d => log.push(...String(d).split('\n').filter(Boolean)));
  p.stderr.on('data', d => log.push(...String(d).split('\n').filter(Boolean)));
  procs.push(p);
  const base = `http://127.0.0.1:${port}`;
  await until(async () => { try{ return (await fetch(base + '/healthz')).ok; }catch(e){ return false; } }, 10000);
  return { name, p, port, base, log };
}
const health = async i => { try{ const r = await fetch(i.base + '/healthz'); return { status: r.status, ...(await r.json()) }; }catch(e){ return { status: 'down' }; } };
const post = async (i, p, body, token) => { const r = await fetch(i.base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }); return { status: r.status, ...(await r.json()) }; };

function player(i, tok){
  const c = { tok, closes: [] };
  c.connect = inst => new Promise(res => {
    const ws = new WebSocket(`ws://127.0.0.1:${inst.port}/ws`); c.ws = ws;
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: tok, device: 'd' + i })));
    ws.on('close', code => c.closes.push(code));
    ws.on('message', raw => { const m = JSON.parse(raw);
      if(m.t === 'club'){ c.club = m.club; res(c); }
      if(m.t === 'table' && m.table.actUid === c.club?.me.id && m.table.legal && c.seq !== m.table.tid + m.table.seq){
        c.seq = m.table.tid + m.table.seq; const L = m.table.legal;
        ws.send(JSON.stringify({ t: 'act', tid: m.table.tid, hand: m.table.handNo, seq: m.table.seq, a: L.canCheck ? { t: 'check' } : { t: 'call' } }));
      } });
  });
  return c;
}
const dbCount = async () => { const c = new Client({ connectionString: URL_ }); await c.connect(); const r = await c.query("select count(*)::int n, (select v from kv where k='lease') lease, (select v->>'status' from kv where k='tourney') st from kv"); await c.end(); return r.rows[0]; };

(async () => {
  const A = await boot('A');
  ok((await health(A)).epoch === 1 && (await health(A)).mode === 'postgres', 'A: postgres mode, lease epoch 1');
  const own = await post(A, '/api/setup', { code: 'probe-local-only', name: 'Director', pin: '1234', agree: true });
  const toks = [own.token];
  for(let i = 1; i < 8; i++){ const { code } = await post(A, '/api/invite', {}, own.token); toks.push((await post(A, '/api/redeem', { code, name: 'Probe ' + i, pin: '4321', agree: true })).token); }
  const ps = toks.map((t, i) => player(i, t)); await Promise.all(ps.map(c => c.connect(A)));
  ps[0].ws.send(JSON.stringify({ t: 'create', name: 'PG probe', stack: 10000, levelMin: 5, tableSize: 6 }));
  await until(() => ps[0].club.tourney && ps[0].club.tourney.status === 'registering');
  ps.forEach(c => c.ws.send(JSON.stringify({ t: 'join' })));
  await until(() => ps[0].club.tourney.regs.length === 8);
  ps[0].ws.send(JSON.stringify({ t: 'start' }));
  await until(() => ps[0].club.tourney.status === 'running');
  await sleep(4000); // let hands be played and flushed
  const chipsA = await (await fetch(A.base + '/debug/chips')).json();
  const before = await dbCount();
  ok(before.st === 'running', `db before handover: ${before.n} rows, tourney running, lease epoch ${before.lease.epoch}`);
  // --- deploy overlap: B boots on the same database while A is mid-tournament
  const B = await boot('B');
  const hB = await health(B);
  ok(hB.status === 200 && hB.epoch === 2, `B: healthz 200, epoch ${hB.epoch}`);
  ok(B.log.some(l => /resumed running tournament/.test(l)), 'B: resumed running tournament from postgres');
  await until(async () => (await health(A)).status === 503, 8000);
  const hA = await health(A);
  ok(hA.status === 503 && hA.leaseLost === true, `A: fenced after B took over (healthz ${hA.status}, leaseLost ${hA.leaseLost}, dirty ${hA.dirty})`);
  ok(A.log.some(l => /lease lost/.test(l)), 'A logged "lease lost": ' + (A.log.find(l => /lease lost/.test(l)) || '').slice(0, 90));
  ok(ps.every(c => c.closes.includes(4001)), 'A closed every player socket with 4001');
  const apiA = await post(A, '/api/login', { name: 'Director', pin: '1234' });
  ok(apiA.status === 503, 'A: API answers 503 after fencing');
  await Promise.all(ps.map(c => c.connect(B)));
  ok(ps.every(c => c.club && c.club.tourney.status === 'running' && c.club.myTable), 'all players reconnect to B and are seated in the running tournament');
  const loginB = await post(B, '/api/login', { name: 'Probe 3', pin: '4321' });
  ok(!!loginB.token, 'accounts created on A sign in on B');
  await sleep(3000);
  const chipsB = await (await fetch(B.base + '/debug/chips')).json();
  ok(chipsB.chips === chipsB.expected, `B: chips conserved after handover (${chipsB.chips} / expected ${chipsB.expected}; A had ${chipsA.chips})`);
  const leaseRow = (await dbCount()).lease;
  ok(leaseRow.epoch === 2 && leaseRow.instance.startsWith('B'), 'db lease row held by B at epoch 2 (A never reclaimed)');
  // --- plain restart: SIGTERM B (final save), boot C
  B.p.kill('SIGTERM'); await until(() => B.p.exitCode !== null, 8000);
  ok(B.log.some(l => /final save done/.test(l)), 'B: SIGTERM -> ' + (B.log.find(l => /final save/.test(l)) || 'no final save line').slice(0, 120));
  const C = await boot('C');
  const hC = await health(C);
  ok(hC.epoch === 3, `C: epoch ${hC.epoch}; boot line: ` + (C.log.find(l => /store: postgres/.test(l)) || '').replace(/\(.*\)/, '').trim());
  ok(!!(await post(C, '/api/login', { name: 'Director', pin: '1234' })).token, 'owner signs in on C');
  await Promise.all(ps.map(c => c.connect(C)));
  ok(ps.every(c => c.club.tourney.status === 'running' && c.club.myTable), 'tournament still running and everyone seated on C');
  A.p.kill('SIGTERM'); await until(() => A.p.exitCode !== null, 3000);
  ok(A.p.exitCode === 0 && A.log.some(l => /after lease loss: exiting/.test(l)), 'fenced A exits 0 on SIGTERM without saving');
  const fails = out.filter(l => l.startsWith('FAIL')).length;
  console.log(fails ? `PG PROBE FAIL (${fails})` : 'PG PROBE PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
