// Read-only: lists stored Opportunity listings / requests and Business Club profiles whose text breaks the contact
// rule (server/content.js), saved before the rule existed. Changes nothing; prints keys, fields and the kind only
// (never the text itself).
// Usage: node scripts/content-audit.js <kv.json>   a DATA_FILE, or an export of the kv table as one JSON object
//        node scripts/content-audit.js --db        reads DATABASE_URL directly, inside a READ ONLY transaction that is
//                                                  rolled back (for the Render shell of the service, no export file)
const fs = require('fs');
const { find } = require('../server/content');
const FIELDS = { 'opp:': ['title', 'details', 'area'], 'oppreq:': ['message'], 'biz:': ['name', 'fullName', 'jobTitle', 'categoryOther', 'description', 'services', 'area'] };
const SQL = "select k, v from kv where k like 'opp:%' or k like 'oppreq:%' or k like 'biz:%'";

function audit(entries, out = console.log){
  let n = 0, seen = 0;
  for(const [k, v] of entries) for(const [pre, fields] of Object.entries(FIELDS)) if(k.startsWith(pre) && v && typeof v === 'object'){
    seen++;
    for(const f of fields){ const kind = typeof v[f] === 'string' && find(v[f]); if(kind){ n++; out(`${k}\t${f}\t${kind}`); } }
  }
  out(`${n} field(s) to review in ${seen} record(s). Nothing was changed.`);
  return n;
}
// only these three statements ever reach the database
async function fromDb(pool){
  const c = await pool.connect();
  try{
    await c.query('begin transaction read only');
    const { rows } = await c.query(SQL);
    return rows.map(r => [r.k, typeof r.v === 'string' ? JSON.parse(r.v) : r.v]);
  }finally{ try{ await c.query('rollback'); }catch(e){} c.release(); }
}

if(require.main === module) (async () => {
  const arg = process.argv[2];
  if(arg === '--db'){
    if(!process.env.DATABASE_URL){ console.error('DATABASE_URL is not set'); process.exit(1); }
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === '1' ? { rejectUnauthorized: false } : undefined, max: 1 }); // same settings as server/store.js
    pool.on('error', e => console.error('audit: idle client error', e.message));
    try{ audit(await fromDb(pool)); }finally{ await pool.end(); }
    return;
  }
  if(!arg){ console.error('usage: node scripts/content-audit.js <kv.json> | --db'); process.exit(1); }
  audit(Object.entries(JSON.parse(fs.readFileSync(arg, 'utf8'))));
})().catch(e => { console.error('audit failed:', e.message); process.exit(1); });

module.exports = { audit, fromDb, SQL };
