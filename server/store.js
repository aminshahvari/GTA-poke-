// Tiny key-value store. Everything is kept in memory for fast, synchronous reads.
// Writes are persisted to Postgres when DATABASE_URL is set, otherwise to a JSON file.
// Postgres mode is single-writer: a lease row kv('lease') = {epoch, instance, at}. On boot an instance bumps the epoch
// (claiming the lease) BEFORE loading state; every flush is one transaction that first locks the lease row and checks
// the epoch is still ours. If a newer instance took over (a Render deploy), the flush rolls back, the store stops
// writing for good and onLost() fires. File mode (local dev/tests) has no fencing: run one process per file.
const fs = require('fs');
const path = require('path');
const os = require('os');

const LEASE = 'lease', BEAT_MS = 3000;
const UPSERT = 'insert into kv (k, v) values ($1, $2) on conflict (k) do update set v = excluded.v';
const INSTANCE = (process.env.RENDER_INSTANCE_ID || os.hostname()) + ':' + process.pid;
const cache = new Map();
let pool = null, file = null, saveTimer = null;
const dirty = new Set();
let flushP = null, epoch = null, lost = false, frozen = false, beat = false, lastWriteError = null, onLost = () => {};
const sleep = ms => new Promise(r => setTimeout(r, ms));

// one transaction on one pooled connection; any throw rolls back
async function tx(fn){
  const c = await pool.connect();
  let bad = null;
  try{ await c.query('begin'); const r = await fn(c); await c.query('commit'); return r; }
  catch(e){ bad = e; try{ await c.query('rollback'); }catch(_){} throw e; }
  finally{ c.release(bad && !bad.lost ? bad : undefined); }
}
const leaseRow = async c => { const { rows } = await c.query('select v from kv where k = $1 for update', [LEASE]); return (rows[0] && rows[0].v) || {}; };

async function init(){
  if(process.env.DATABASE_URL){
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === '1' ? { rejectUnauthorized: false } : undefined, max: 4 });
    pool.on('error', e => console.error('store: idle client error', e.message));
    await pool.query('create table if not exists kv (k text primary key, v jsonb not null)');
    // claim the lease first, then load: anything the previous instance writes after this is fenced out
    await pool.query('insert into kv (k, v) values ($1, $2) on conflict (k) do nothing', [LEASE, JSON.stringify({ epoch: 0 })]);
    await tx(async c => { const cur = await leaseRow(c); epoch = (+cur.epoch || 0) + 1; await c.query(UPSERT, [LEASE, JSON.stringify({ epoch, instance: INSTANCE, at: Date.now() })]); });
    const { rows } = await pool.query('select k, v from kv');
    rows.forEach(r => { if(r.k !== LEASE) cache.set(r.k, r.v); });
    console.log(`store: postgres, ${cache.size} keys, lease epoch ${epoch} (${INSTANCE})`);
    // heartbeat: also notices a lost lease while nothing is dirty
    setInterval(() => { beat = true; schedule(); }, BEAT_MS).unref();
  } else {
    file = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'club.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if(fs.existsSync(file)){ const obj = JSON.parse(fs.readFileSync(file, 'utf8')); Object.entries(obj).forEach(([k, v]) => cache.set(k, v)); }
    console.log(`store: file ${file}, ${cache.size} keys`);
  }
}

function writeFile(){ const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(cache))); fs.renameSync(tmp, file); }
function schedule(){
  if(file){ clearTimeout(saveTimer); saveTimer = setTimeout(writeFile, 150); return; }
  if(flushP || lost) return;
  // starts on the next tick, so writes made in one synchronous step of game logic land in the same batch
  flushP = new Promise(r => setImmediate(r)).then(drain).finally(() => { flushP = null; });
}
async function drain(){
  while((dirty.size || beat) && !lost){
    const keys = [...dirty], hb = beat; dirty.clear(); beat = false;
    try{
      await tx(async c => {
        const cur = await leaseRow(c);
        if(cur.epoch !== epoch){ const e = new Error(`lease lost: epoch ${cur.epoch} held by ${cur.instance}, ours was ${epoch}`); e.lost = true; throw e; }
        for(const k of keys){
          if(cache.has(k)) await c.query(UPSERT, [k, JSON.stringify(cache.get(k))]);
          else await c.query('delete from kv where k = $1', [k]);
        }
        if(hb) await c.query(UPSERT, [LEASE, JSON.stringify({ epoch, instance: INSTANCE, at: Date.now() })]);
      });
      lastWriteError = null;
    }catch(e){
      keys.forEach(k => dirty.add(k)); // the whole batch stays dirty and is retried
      if(e.lost){ lost = true; console.error('store:', e.message); try{ onLost(e); }catch(_){} return; }
      lastWriteError = { message: String(e.message).replace(/\w+:\/\/\S+/g, '<url>'), at: Date.now() };
      console.error('store write failed', keys.length, 'keys:', e.message);
      await sleep(1000);
    }
  }
}
// Final save on shutdown: resolves true once nothing is left dirty (false if the lease is lost or the db is down).
async function flush(){
  if(file){ clearTimeout(saveTimer); writeFile(); return true; }
  if(lost) return false;
  schedule();
  while(flushP) await flushP;
  return !lost && !dirty.size;
}

const get = k => cache.get(k);
function set(k, v){ if(frozen) return v; cache.set(k, v); dirty.add(k); schedule(); return v; }
function del(k){ if(frozen) return; cache.delete(k); dirty.add(k); schedule(); }
const keys = prefix => [...cache.keys()].filter(k => k.startsWith(prefix));
const values = prefix => keys(prefix).map(k => cache.get(k));
// freeze(): ignore all later changes, so the final flush saves the state as of shutdown
const freeze = () => { frozen = true; };
const health = () => ({ mode: file ? 'file' : pool ? 'postgres' : null, epoch, leaseLost: lost, dirty: dirty.size,
  lastWriteError: lastWriteError && { message: lastWriteError.message, ageMs: Date.now() - lastWriteError.at } });

// ---------- club switching (CLUB_SWITCHING=1 or STAGING=1 only; production uses the plain store above) ----------
// One deployment can hold several clubs that share one identity (name + PIN). A club sees the store through scoped(id):
// identity keys (accounts, names, sessions, pictures, push subscriptions, club list) are shared; everything else
// (tournaments, history, invites, settings, rewards, Exchange, stats, fairness records) lives under 'club:<id>:'.
// The default club 'main' keeps today's unprefixed keys, so existing data is read exactly as it is.
// Membership: an account belongs to 'main' unless it has noMain: true; it belongs to another club when
// user.clubs[id] exists. A club only ever sees its own members, with that club's role, invitedBy, muted, household
// and removed fields, so one club's code cannot read or write another club's members or data.
const SHARED = ['user:', 'name:', 'session:', 'avatar:', 'push:', 'clubdef:'];
const SHARED_EXACT = ['vapid', LEASE];
const MEM = ['role', 'invitedBy', 'muted', 'household', 'removed', 'joinedAt'];
const isShared = k => SHARED_EXACT.includes(k) || SHARED.some(p => k.startsWith(p));
function scoped(cid){
  const main = cid === 'main', pre = main ? '' : 'club:' + cid + ':';
  const isUser = k => k.startsWith('user:');
  const view = u => {
    if(!u) return undefined;
    if(main){ if(u.noMain) return undefined; if(!u.clubs) return u; const { clubs, ...rest } = u; return rest; }
    const m = u.clubs && u.clubs[cid]; if(!m) return undefined;
    const out = {}; for(const [k, v] of Object.entries(u)) if(k !== 'clubs' && k !== 'noMain' && !MEM.includes(k)) out[k] = v;
    return { ...out, ...m };
  };
  const s = {
    get(k){ if(isUser(k)) return view(get(k)); return isShared(k) ? get(k) : get(pre + k); },
    set(k, v){
      if(isUser(k)){
        const cur = get(k);
        if(main){ set(k, cur && cur.clubs ? { ...v, clubs: cur.clubs } : v); return v; }
        if(!cur || !(cur.clubs && cur.clubs[cid])) throw new Error('Not a member of this club.');
        // A club changes only its own membership fields, and only the ones the value carries: they are merged over the
        // stored membership, so a partial write (say { muted: true }) can never drop role, joinedAt or invitedBy.
        // To clear a field, pass it as null (as 'household' does), or as an own property set to undefined.
        const m = { ...cur.clubs[cid] };
        for(const f of MEM) if(Object.prototype.hasOwnProperty.call(v, f)){ if(v[f] === undefined) delete m[f]; else m[f] = v[f]; }
        set(k, { ...cur, clubs: { ...cur.clubs, [cid]: m } });
        return v;
      }
      if(isShared(k)){ if(!main && k.startsWith('name:')) return v; return set(k, v); } // a club cannot claim or free a name
      return set(pre + k, v);
    },
    del(k){
      if(isUser(k)) return; // accounts are never deleted through a club
      if(isShared(k)){ if(!main && k.startsWith('name:')) return; return del(k); }
      return del(pre + k);
    },
    keys(prefix){
      if(isUser(prefix) || 'user:'.startsWith(prefix) && prefix) return keys(prefix).filter(k => !isUser(k) || view(get(k)));
      if(isShared(prefix)) return keys(prefix);
      return main ? keys(prefix).filter(k => !k.startsWith('club:')) : keys(pre + prefix).map(k => k.slice(pre.length));
    },
    values(prefix){ return s.keys(prefix).map(k => s.get(k)); },
    flush, freeze, health, init, onLost: fn => { onLost = fn; }, id: cid
  };
  return s;
}

module.exports = { init, get, set, del, keys, values, flush, freeze, health, onLost: fn => { onLost = fn; }, scoped };
