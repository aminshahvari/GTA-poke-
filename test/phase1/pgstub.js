// Preload (node -r) that runs the REAL server/store.js in its Postgres code path against an in-process fake `pg`
// pool, without ever putting DATABASE_URL into the real process environment. The fake pool keeps one JSON file per
// key in P1_DB_DIR (so several server processes can share one "database", like Render's overlapping deploys) and
// can inject faults described by P1_FAULT (JSON):
//   { "match": { "key": "tourney" | "prefix": "history:", "minPlaces": 1, "status": "finished" },
//     "action": "down" | "kill" }
// After the first matching upsert is persisted (with the rest of its transaction), "down" makes every later query
// throw (database unreachable) and "kill" SIGKILLs this process on the spot.
// P1_DB_LATENCY_MS adds a delay to every query, like the round trip to a hosted database.
const Module = require('module');
const fs = require('fs');
const path = require('path');

const DIR = process.env.P1_DB_DIR;
if(!DIR) throw new Error('pgstub: P1_DB_DIR not set');
fs.mkdirSync(DIR, { recursive: true });
const fault = process.env.P1_FAULT ? JSON.parse(process.env.P1_FAULT) : null;
let down = false, fired = false;
const LATENCY = +(process.env.P1_DB_LATENCY_MS || 0); // simulated network round trip per query
const fileOf = k => path.join(DIR, encodeURIComponent(k) + '.json');

function matches(k, v){
  if(!fault || fired) return false;
  const m = fault.match || {};
  if(m.key && k !== m.key) return false;
  if(m.prefix && !k.startsWith(m.prefix)) return false;
  if(m.minPlaces != null && !(v && Array.isArray(v.places) && v.places.length >= m.minPlaces)) return false;
  if(m.status && !(v && v.status === m.status)) return false;
  return true;
}

// Transactions: BEGIN takes a database-wide lock (a lock dir shared by all processes on P1_DB_DIR; stolen if its
// holder died), writes are buffered and applied at COMMIT, ROLLBACK drops them. Stronger than Postgres row locks,
// but it gives the same answers for the lease row's SELECT ... FOR UPDATE.
const LOCK = path.join(DIR, '.txlock');
const alive = pid => { try{ process.kill(pid, 0); return true; }catch(e){ return e.code === 'EPERM'; } };
async function lock(){
  for(;;){
    try{ fs.mkdirSync(LOCK); fs.writeFileSync(path.join(LOCK, 'pid'), String(process.pid)); return; }
    catch(e){
      if(e.code !== 'EEXIST') throw e;
      let pid = 0; try{ pid = +fs.readFileSync(path.join(LOCK, 'pid'), 'utf8'); }catch(_){}
      if(pid && !alive(pid)) try{ fs.rmSync(LOCK, { recursive: true, force: true }); continue; }catch(_){}
      await new Promise(r => setTimeout(r, 2));
    }
  }
}
const unlock = () => { try{ fs.rmSync(LOCK, { recursive: true, force: true }); }catch(e){} };
function readAll(){
  return fs.readdirSync(DIR).filter(f => f.endsWith('.json')).map(f => {
    try{ return { k: decodeURIComponent(f.slice(0, -5)), v: JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')) }; }catch(e){ return null; }
  }).filter(Boolean);
}
function put(k, json){ const tmp = fileOf(k) + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, json); fs.renameSync(tmp, fileOf(k)); }
// faults fire after a whole commit is on disk (Postgres commits are atomic), or after a lone upsert outside a transaction
function check(written){
  for(const [k, json] of written) if(matches(k, JSON.parse(json))){
    fired = true;
    process.stderr.write(`P1FAULT fired on ${k} action=${fault.action}\n`);
    if(fault.action === 'kill') process.kill(process.pid, 'SIGKILL');
    if(fault.action === 'down') down = true;
  }
}
async function run(sql, params, txn){
  if(LATENCY) await new Promise(r => setTimeout(r, LATENCY));
  if(down) throw new Error('p1 fake pg: connection refused');
  const s = sql.trim().toLowerCase();
  if(s.startsWith('create table')) return { rows: [] };
  if(s === 'begin'){ await lock(); txn.ops = []; return { rows: [] }; }
  if(s === 'commit'){ const ops = txn.ops || [], w = []; txn.ops = null; try{ for(const op of ops) op(w); } finally{ unlock(); } check(w); return { rows: [] }; }
  if(s === 'rollback'){ if(txn.ops) unlock(); txn.ops = null; return { rows: [] }; }
  const later = op => { if(txn && txn.ops) txn.ops.push(op); else { const w = []; op(w); check(w); } return { rows: [] }; };
  if(s.startsWith('select')){
    const rows = readAll();
    return { rows: / where k = \$1/.test(s) ? rows.filter(r => r.k === params[0]) : rows };
  }
  if(s.startsWith('insert')){
    const [k, json] = params;
    if(/do nothing/.test(s) && fs.existsSync(fileOf(k))) return { rows: [] };
    return later(w => { put(k, json); w.push([k, json]); });
  }
  if(s.startsWith('delete')) return later(() => { try{ fs.unlinkSync(fileOf(params[0])); }catch(e){} });
  throw new Error('pgstub: unexpected sql ' + sql);
}

class Pool {
  constructor(){}
  on(){}
  query(sql, params){ return run(sql, params, null); }
  async connect(){
    const txn = { ops: null };
    return { query: (sql, params) => run(sql, params, txn), release(){ if(txn.ops){ txn.ops = null; unlock(); } } };
  }
}

const storePath = path.resolve(__dirname, '..', '..', 'server', 'store.js');
const origLoad = Module._load;
Module._load = function(request, parent, isMain){
  let resolved = null;
  try{ resolved = Module._resolveFilename(request, parent, isMain); }catch(e){}
  if(resolved === storePath){
    if(Module._cache[storePath]) return Module._cache[storePath].exports;
    const m = new Module(storePath, parent); m.filename = storePath; m.paths = Module._nodeModulePaths(path.dirname(storePath));
    Module._cache[storePath] = m;
    const src = fs.readFileSync(storePath, 'utf8');
    // the real store code, with a private `process` whose env says "use Postgres" and a `require` that hands out the fake pool
    const fakeProcess = Object.create(process); fakeProcess.env = { ...process.env, DATABASE_URL: 'p1-stub://local-fake-pool' };
    const req = id => id === 'pg' ? { Pool } : m.require(id);
    new Function('require', 'module', 'exports', '__filename', '__dirname', 'process', src)(req, m, m.exports, storePath, path.dirname(storePath), fakeProcess);
    m.loaded = true;
    return m.exports;
  }
  return origLoad.apply(this, arguments);
};
