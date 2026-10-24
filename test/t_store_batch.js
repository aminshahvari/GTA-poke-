// store.js in its Postgres path: a flush writes the whole batch in one statement (4 round trips: begin, lease, write,
// commit, whatever the number of keys), values come back exactly as they were set, removed keys are gone, flush() waits
// only for the changes made before it (a steady stream of new writes no longer holds it up: that held every deal and street
// at the 1 s cap under load), the deal record is committed when the flush a deal waits on resolves, and the lease fencing
// is unchanged: once another instance took the lease, a flush rolls back, writes nothing, returns false and onLost fires.
// Runs against test/phase1/pgstub.js (the real store code, a fake pool keeping one file per key). With STORE_PG_URL set
// (a throwaway local database: its kv table is dropped) it runs the same checks against a real Postgres as well.
// Never uses DATABASE_URL from the environment.
const path = require('path'), fs = require('fs'), os = require('os');
const { spawn } = require('child_process');
const MODE = process.argv[2] || 'main';
let fails = 0, oks = 0;
const ok = (c, m) => { if(c){ oks++; console.log('ok  ', MODE, m); } else { fails++; console.log('FAIL', MODE, m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// (jsonb keeps an object's keys in its own order, as it always did: compare with the keys sorted)
const canon = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(y => [y, x[y]])) : x);

if(MODE === 'main'){
  // the parent: the stub run, then the real-Postgres run when a test database is given
  const run = (mode, env) => new Promise(r => { const p = spawn(process.execPath, [__filename, mode], { env: { ...env }, stdio: 'inherit' }); p.on('exit', c => r(c)); });
  (async () => {
    const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tstore-'));
    const base = { PATH: process.env.PATH, HOME: process.env.HOME, NODE_PATH: process.env.NODE_PATH || '' };
    let code = await run('stub', { ...base, P1_DB_DIR: dbDir, P1_DB_LATENCY_MS: '4' });
    fs.rmSync(dbDir, { recursive: true, force: true });
    if(process.env.STORE_PG_URL) code = (await run('pg', { ...base, STORE_PG_URL: process.env.STORE_PG_URL, DATABASE_URL: process.env.STORE_PG_URL })) || code;
    else console.log('t_store_batch: real Postgres not run (set STORE_PG_URL to a throwaway local database)');
    process.exit(code ? 1 : 0);
  })();
} else {
  if(MODE === 'stub'){ delete process.env.DATABASE_URL; require('./phase1/pgstub'); }
  const store = require('../server/store');
  // round trips: the stub counts its queries; on a real database every pg client query is counted
  let q = 0;
  if(MODE === 'pg'){ const pg = require('pg'), orig = pg.Client.prototype.query; pg.Client.prototype.query = function(...a){ q++; return orig.apply(this, a); }; }
  const queries = () => MODE === 'stub' ? global.__pgstubQueries || 0 : q;
  // what the database holds, read around the store
  let dbc = null;
  async function db(){
    if(MODE === 'stub'){ const dir = process.env.P1_DB_DIR, out = {}; for(const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) out[decodeURIComponent(f.slice(0, -5))] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); return out; }
    if(!dbc){ const pg = require('pg'); dbc = new pg.Client({ connectionString: process.env.STORE_PG_URL }); await dbc.connect(); }
    const { rows } = await dbc.query('select k, v from kv'); q -= 1; return Object.fromEntries(rows.map(r => [r.k, r.v]));
  }
  // another instance booting on the same database (it bumps the lease epoch, as a Render deploy does)
  const takeover = () => new Promise((res, rej) => {
    const args = [...(MODE === 'stub' ? ['-r', path.join(__dirname, 'phase1', 'pgstub.js')] : []), '-e', `require(${JSON.stringify(path.join(__dirname, '..', 'server', 'store'))}).init().then(() => process.exit(0), e => { console.error(e); process.exit(1); })`];
    const p = spawn(process.execPath, args, { env: process.env, stdio: ['ignore', 'ignore', 'inherit'] }); p.on('exit', c => c ? rej(new Error('takeover failed')) : res());
  });
  (async () => {
    if(MODE === 'pg'){ const pg = require('pg'), c = new pg.Client({ connectionString: process.env.STORE_PG_URL }); await c.connect(); await c.query('drop table if exists kv'); await c.end(); }
    let lostWith = null; store.onLost(e => { lostWith = e; });
    await store.init();
    // 1. one batch, 4 round trips, every value back exactly
    const odd = { s: 'quote " back \\ slash, tab\t, line\n, comma, {brace}, emoji \u{1F0A1}, nul-ish \\u0000', n: -12.5e-3, b: false, nil: null, a: [1, 'two', { three: [3] }], deep: { x: { y: { z: 'é' } } } };
    const vals = { 'odd': odd, 'str': 'just a string', 'num': 42, 'bool': true, 'arr': ['a', 'b'], 'empty': {}, 'quote"key': 1, "it's": 'x', 'back\\slash': 2, 'ünï': 'ü' };
    for(let i = 0; i < 400; i++) vals['hand:u' + i + ':h1'] = { ts: i, notes: ['n' + i], cards: [i % 52, (i * 7) % 52] };
    for(const [k, v] of Object.entries(vals)) store.set(k, v);
    const q0 = queries(); ok(await store.flush() === true, 'flush resolves true'); const used = queries() - q0;
    ok(used === 4, `${Object.keys(vals).length} keys written in ${used} round trips (begin, lease, write, commit)`);
    let d = await db();
    ok(Object.entries(vals).every(([k, v]) => canon(d[k]) === canon(v)), 'every value reads back exactly as it was set');
    // 2. deletes and changes in one batch
    store.del('str'); store.del('hand:u1:h1'); store.set('num', 43); store.set('new', { n: 1 });
    const q1 = queries(); await store.flush(); ok(queries() - q1 === 4, 'deletes and upserts in one statement');
    d = await db(); ok(!('str' in d) && !('hand:u1:h1' in d) && d.num === 43 && d.new.n === 1 && d.odd.s === odd.s, 'removed keys are gone, changed keys changed, the rest untouched');
    // 3. flush waits for the changes made before it, not for the queue to run dry; the deal record is committed when it resolves
    let streaming = true, made = 0;
    (async () => { while(streaming){ for(let k = 0; k < 20; k++) store.set('stream:' + (made++ % 300), { at: Date.now(), pad: 'x'.repeat(200) }); await sleep(2); } })();
    await sleep(120);
    const waits = [];
    for(let r = 0; r < 8; r++){
      store.set('fair:t1:deal' + r, { deal: r, cards: [1, 2, 3] });
      const t0 = Date.now(), res = await Promise.race([store.flush(), sleep(3000).then(() => 'still waiting after 3 s')]); waits.push(Date.now() - t0);
      const now = await db();
      ok(res === true && now['fair:t1:deal' + r] && now['fair:t1:deal' + r].deal === r, `deal ${r}: its record is in the database when the flush resolves (${waits[r]} ms)`);
      await sleep(30);
    }
    ok(store.health().dirty > 0 || streaming, 'the stream was still writing while the flushes resolved');
    ok(Math.max(...waits) < 1000, `flush under a steady stream of writes: max ${Math.max(...waits)} ms (under the 1 s cap)`);
    streaming = false; await sleep(20); await store.flush();
    // 4. fencing: another instance takes the lease; our next flush is rolled back, writes nothing, returns false
    await takeover();
    const before = await db();
    store.set('after-takeover', { bad: true }); store.set('num', 99); store.del('odd');
    const res = await store.flush();
    const after = await db();
    ok(res === false, 'flush after the takeover resolves false');
    ok(!('after-takeover' in after) && after.num === before.num && canon(after.odd) === canon(before.odd), 'nothing written after the lease was lost (no new key, no change, no delete)');
    ok(lostWith && /lease lost/.test(lostWith.message) && store.health().leaseLost === true, 'onLost fired and health reports the lost lease');
    store.set('later', 1); ok(await store.flush() === false, 'the store stays fenced'); await sleep(50); ok(!('later' in await db()), 'and still writes nothing');
    ok(after.lease && after.lease.epoch === before.lease.epoch && after.lease.epoch > 1, 'the new instance holds the lease (epoch ' + (after.lease && after.lease.epoch) + ')');
    if(dbc) await dbc.end();
    console.log(fails ? `t_store_batch (${MODE}): ${fails} failed, ${oks} passed` : `t_store_batch (${MODE}): all ${oks} passed`);
    process.exit(fails ? 1 : 0);
  })().catch(e => { console.error(e); process.exit(1); });
}
