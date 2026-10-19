// Campaigns switched off (no CAMPAIGNS, no STAGING), as on production: the campaign endpoints answer like any unknown one,
// /v/ is an unknown path, a campaign invite left in the data cannot be redeemed, and no payload carries campaign data.
// With BASELINE=<dir of a checkout of the previous release>, it also compares the club views of both servers on the same data.
const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const WebSocket = require('ws');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passed++; };
const eq = (a, b, msg) => { assert.deepStrictEqual(a, b, msg); passed++; };
const DATA = path.join(os.tmpdir(), 't_campaign_off_' + process.pid + '.json');
async function start(dir, port, data, extra = {}){
  const srv = spawn(process.execPath, ['server/index.js'], { cwd: dir, env: { ...process.env, PORT: port, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: data, FAST: '1', CAMPAIGNS: '', STAGING: '', DATABASE_URL: '', CLUBS_DEFAULT: '', ...extra }, stdio: 'ignore' });
  for(let i = 0; i < 50; i++){ await sleep(100); try{ if((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) return srv; }catch(e){} }
  throw new Error('server did not start');
}
const stop = async srv => { await sleep(300); srv.kill(); await new Promise(r => srv.once('exit', r)); };
const post = async (base, p, body, token) => { const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
function view(base, token){
  return new Promise((res, rej) => {
    const ws = new WebSocket(base.replace('http', 'ws') + '/ws');
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token, device: 'parity' })));
    ws.on('message', raw => { const m = JSON.parse(raw); if(m.t === 'club'){ ws.close(); res(m.club); } });
    ws.on('error', rej);
  });
}
const strip = v => JSON.parse(JSON.stringify(v, (k, x) => ['now', 'version', 'pushOn'].includes(k) ? undefined : x));

(async () => {
  const port = 4300 + Math.floor(Math.random() * 90), base = 'http://127.0.0.1:' + port;
  try{ fs.unlinkSync(DATA); }catch(e){}
  // build some club data with campaigns ON, then restart with them OFF on the same data
  let srv = await start(path.join(__dirname, '..'), port, DATA, { CAMPAIGNS: '1' });
  const owner = (await post(base, '/api/setup', { code: 'secret', name: 'Director', pin: '246810', agree: true })).body.token;
  const personal = (await post(base, '/api/invite', {}, owner)).body.code;
  const a = (await post(base, '/api/redeem', { code: personal, name: 'Alice', pin: '1111', agree: true })).body.token;
  const camp = (await post(base, '/api/campaign', { source: 'celestia', max: 10, hours: 24 }, owner)).body.code;
  ok(camp && (await post(base, '/api/vmap', { slug: 'celestia', code: camp }, owner)).body.ok, 'with campaigns on: a campaign link and a path exist');
  const consent = (await post(base, '/api/campaignInfo', { code: camp })).body.consent;
  ok((await post(base, '/api/redeem', { code: camp, name: 'Bea', pin: '2222', agree: true, consent, email: 'bea@example.com', emailOk: true })).body.token, 'with campaigns on: someone joined through it with an email');
  await stop(srv);

  srv = await start(path.join(__dirname, '..'), port, DATA);
  const unknown = await post(base, '/api/noSuchThing', {}, owner);
  for(const [p, b] of [['/api/campaign', { source: 'x1', max: 5, hours: 5 }], ['/api/vmap', { slug: 'celestia', code: camp }], ['/api/campaignInfo', { code: camp }]]){
    const r = await post(base, p, b, owner);
    eq([r.status, r.body], [unknown.status, unknown.body], p + ' answers exactly like an unknown endpoint');
  }
  const v = await fetch(base + '/v/celestia', { redirect: 'manual' }), nf = await fetch(base + '/no-such-file', { redirect: 'manual' });
  eq([v.status, await v.text(), v.headers.get('location')], [nf.status, await nf.text(), null], '/v/celestia is an unknown path (no redirect)');
  ok((await post(base, '/api/redeem', { code: camp, name: 'Cid', pin: '3333', agree: true })).body.error, 'a campaign invite left in the data cannot be redeemed');
  ok((await post(base, '/api/redeem', { code: camp, name: 'Cid', pin: '3333', agree: true, consent })).body.error, 'not even with a consent token issued while campaigns were on');
  const fresh = (await post(base, '/api/invite', {}, owner)).body.code;
  ok((await post(base, '/api/redeem', { code: fresh, name: 'Dee', pin: '4444', agree: true })).body.token, 'ordinary invite links still work');
  const ov = await view(base, owner), mv = await view(base, a), oj = JSON.stringify(ov), mj = JSON.stringify(mv);
  for(const k of ['campaigns', 'campaignSources']) ok(!(k in ov), 'the owner payload has no ' + k);
  ok(!oj.includes(camp) && !mj.includes(camp), 'no payload carries the campaign code');
  ok(!/bea@example\.com|"email"|"consent"|"cstat"|"vpath"|"campRet"/.test(oj + mj), 'no payload carries the email, consent, counters, path or return flag');
  ok(mv.members.every(m => m.invitedBy === null), 'members see no inviter (invite privacy)');
  await stop(srv);

  // compare with the previous release on a copy of the same data (campaign records removed, as production has none)
  if(process.env.BASELINE){
    const db = JSON.parse(fs.readFileSync(DATA, 'utf8'));
    for(const k of Object.keys(db)) if(/^(invite|vpath|cstat|contact):/.test(k) && (db[k].campaign || !k.startsWith('invite:'))) delete db[k];
    for(const k of Object.keys(db)) if(k.startsWith('user:') && db[k].campaign){ delete db[k].campaign; delete db[k].campRet; }
    const d1 = DATA + '.a', d2 = DATA + '.b'; fs.writeFileSync(d1, JSON.stringify(db)); fs.writeFileSync(d2, JSON.stringify(db));
    const s1 = await start(process.env.BASELINE, port + 1, d1), s2 = await start(path.join(__dirname, '..'), port + 2, d2);
    const b1 = 'http://127.0.0.1:' + (port + 1), b2 = 'http://127.0.0.1:' + (port + 2);
    for(const [n, pin] of [['Director', '246810'], ['Alice', '1111'], ['Bea', '2222']]){
      const t1 = (await post(b1, '/api/login', { name: n, pin })).body.token, t2 = (await post(b2, '/api/login', { name: n, pin })).body.token;
      const was = strip(await view(b1, t1)), now = strip(await view(b2, t2));
      // the one intended difference is invite privacy (06e6e9c, Muse PASS): members no longer receive who invited whom
      if(!was.me.owner) was.members = was.members.map(m => ({ ...m, invitedBy: null }));
      eq(now, was, n + ': club view identical to the previous release' + (was.me.owner ? '' : ' apart from invite privacy'));
    }
    for(const p of ['/v/celestia', '/join/abcdefghijkl', '/']){ const r1 = await fetch(b1 + p, { redirect: 'manual' }), r2 = await fetch(b2 + p, { redirect: 'manual' }); eq(r2.status, r1.status, p + ': same status as the previous release'); }
    eq((await post(b2, '/api/campaignInfo', { code: 'x' })), (await post(b1, '/api/campaignInfo', { code: 'x' })), '/api/campaignInfo answers exactly as in the previous release');
    await stop(s1); await stop(s2); fs.unlinkSync(d1); fs.unlinkSync(d2);
  }
  try{ fs.unlinkSync(DATA); }catch(e){}
  console.log(`campaigns-off test passed (${passed} checks${process.env.BASELINE ? ', compared with ' + path.basename(process.env.BASELINE) : ''})`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
