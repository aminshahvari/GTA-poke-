// Fills a STAGING server with fake members and an open tournament. Never runs against production.
// Usage: node scripts/seed-staging.js <staging base url> <staging OWNER_CODE> [members=12]
const [base, code, nArg] = process.argv.slice(2);
if(!base || !code){ console.error('usage: node scripts/seed-staging.js <base url> <owner code> [members]'); process.exit(1); }
const host = new URL(base).hostname;
if(!/staging|localhost|127\.0\.0\.1/.test(host)){ console.error(`Refusing: ${host} does not look like staging.`); process.exit(1); }
const n = Math.min(40, Math.max(2, +nArg || 12));
const post = async (p, body, tok) => {
  const r = await fetch(base.replace(/\/$/, '') + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})); if(!r.ok) throw new Error(`${p}: ${j.error || r.status}`); return j;
};
(async () => {
  let owner;
  try{ owner = (await post('/api/setup', { code, name: 'Test Director', pin: '246810', agree: true })).token; }
  catch(e){ owner = (await post('/api/login', { name: 'Test Director', pin: '246810' })).token; }
  for(let i = 1; i <= n; i++){
    const name = 'Test Player ' + String(i).padStart(2, '0');
    try{ const { code: inv } = await post('/api/invite', {}, owner); await post('/api/redeem', { code: inv, name, pin: '1357' + String(i % 10).repeat(2), agree: true }); }
    catch(e){ console.log('skip', name, e.message); }
  }
  console.log(`seeded ${n} fake members on ${host}. Director: "Test Director" / 246810`);
})().catch(e => { console.error(e.message); process.exit(1); });
