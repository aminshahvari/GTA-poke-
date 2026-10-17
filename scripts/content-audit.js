// Read-only: lists stored Opportunity listings / requests and Business Club profiles whose text breaks the contact
// rule (server/content.js), saved before the rule existed. Changes nothing; prints keys, fields and the kind only.
// Usage: node scripts/content-audit.js <kv.json>   (a DATA_FILE, or a Postgres export of the kv table as one object:
//   psql "$DATABASE_URL" -Atc "select json_object_agg(k, v) from kv where k ~ '^(opp|oppreq|biz):'" > kv.json)
const fs = require('fs');
const { find } = require('../server/content');
const file = process.argv[2];
if(!file){ console.error('usage: node scripts/content-audit.js <kv.json>'); process.exit(1); }
const kv = JSON.parse(fs.readFileSync(file, 'utf8'));
const FIELDS = { 'opp:': ['title', 'details', 'area'], 'oppreq:': ['message'], 'biz:': ['name', 'fullName', 'jobTitle', 'categoryOther', 'description', 'services', 'area'] };
let n = 0;
for(const [k, v] of Object.entries(kv)) for(const [pre, fields] of Object.entries(FIELDS)) if(k.startsWith(pre) && v && typeof v === 'object')
  for(const f of fields){ const kind = typeof v[f] === 'string' && find(v[f]); if(kind){ n++; console.log(`${k}\t${f}\t${kind}`); } }
console.log(`${n} field(s) to review. Nothing was changed.`);
