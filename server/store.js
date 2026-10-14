// Tiny key-value store. Everything is kept in memory for fast, synchronous reads.
// Writes are persisted to Postgres when DATABASE_URL is set, otherwise to a JSON file.
const fs = require('fs');
const path = require('path');

const cache = new Map();
let pool = null, file = null, saveTimer = null;
const dirty = new Set();
let flushing = false;

async function init(){
  if(process.env.DATABASE_URL){
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === '1' ? { rejectUnauthorized: false } : undefined, max: 4 });
    await pool.query('create table if not exists kv (k text primary key, v jsonb not null)');
    const { rows } = await pool.query('select k, v from kv');
    rows.forEach(r => cache.set(r.k, r.v));
    console.log(`store: postgres, ${rows.length} keys`);
  } else {
    file = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'club.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if(fs.existsSync(file)){ const obj = JSON.parse(fs.readFileSync(file, 'utf8')); Object.entries(obj).forEach(([k, v]) => cache.set(k, v)); }
    console.log(`store: file ${file}, ${cache.size} keys`);
  }
}

function schedule(){
  if(file){
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(cache)));
      fs.renameSync(tmp, file);
    }, 150);
    return;
  }
  if(flushing) return;
  flushing = true;
  setImmediate(async () => {
    while(dirty.size){
      const keys = [...dirty]; dirty.clear();
      for(const k of keys){
        try{
          if(cache.has(k)) await pool.query('insert into kv (k, v) values ($1, $2) on conflict (k) do update set v = excluded.v', [k, JSON.stringify(cache.get(k))]);
          else await pool.query('delete from kv where k = $1', [k]);
        }catch(e){ console.error('store write failed', k, e.message); dirty.add(k); await new Promise(r => setTimeout(r, 1000)); }
      }
    }
    flushing = false;
  });
}

const get = k => cache.get(k);
function set(k, v){ cache.set(k, v); dirty.add(k); schedule(); return v; }
function del(k){ cache.delete(k); dirty.add(k); schedule(); }
const keys = prefix => [...cache.keys()].filter(k => k.startsWith(prefix));
const values = prefix => keys(prefix).map(k => cache.get(k));

module.exports = { init, get, set, del, keys, values };
