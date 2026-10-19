// Campaign consent fails closed, and the staging flag does not switch campaigns on.
// 1. A campaign join must send back the consent token that the welcome and consent page received (POST /api/campaignInfo)
//    for that link and that notice version. Missing, null, empty, non-string, malformed, forged, another link's, another
//    version's, oversized, and pre-restart tokens are all refused, and nothing is stored or shared: no account, no name
//    reserved, no contact (email) record, no use of the link, nothing in the owner's report, nothing in member payloads.
//    A closed link's page gets no token at all. An ordinary invite never stores an email.
// 2. Flags: campaigns are on only with CAMPAIGNS=1 exactly. STAGING=1 alone, CAMPAIGNS=true/yes/0/" 1" are off.
const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const WebSocket = require('ws');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, ipN = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passed++; };
const eq = (a, b, msg) => { assert.deepStrictEqual(a, b, msg); passed++; };
const nextIp = () => '198.19.' + Math.floor(++ipN / 250) + '.' + (ipN % 250 + 1);
const ROOT = path.join(__dirname, '..');
async function start(port, data, extra = {}){
  const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: port, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: data, FAST: '', CAMPAIGNS: '', STAGING: '', DATABASE_URL: '', CLUBS_DEFAULT: '', ...extra }, stdio: 'ignore' });
  for(let i = 0; i < 80; i++){ await sleep(100); try{ if((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) return srv; }catch(e){} }
  throw new Error('server did not start');
}
const stop = async srv => { await sleep(400); srv.kill(); await new Promise(r => srv.once('exit', r)); };
const post = async (base, p, body, token) => {
  const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': nextIp(), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
  return { status: r.status, ...(await r.json()) };
};
function view(base, token){
  return new Promise((res, rej) => {
    const ws = new WebSocket(base.replace('http', 'ws') + '/ws');
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token, device: 'consent' })));
    ws.on('message', raw => { const m = JSON.parse(raw); if(m.t === 'club'){ ws.close(); res(m.club); } });
    ws.on('error', rej);
  });
}

(async () => {
  const port = 4500 + Math.floor(Math.random() * 90), base = 'http://127.0.0.1:' + port;
  const DATA = path.join(os.tmpdir(), 't_campaign_consent_' + process.pid + '.json'); try{ fs.unlinkSync(DATA); }catch(e){}

  // ================= 1. consent fails closed =================
  let srv = await start(port, DATA, { CAMPAIGNS: '1' });
  const owner = (await post(base, '/api/setup', { code: 'secret', name: 'Director', pin: '246810', agree: true })).token;
  const camp = (await post(base, '/api/campaign', { source: 'celestia', max: 10, hours: 24 }, owner)).code;
  const other = (await post(base, '/api/campaign', { source: 'flyer', max: 10, hours: 24 }, owner)).code;
  const tiny = (await post(base, '/api/campaign', { source: 'tiny', max: 1, hours: 24 }, owner)).code;
  ok(camp && other && tiny, 'three campaign links made');
  const good = (await post(base, '/api/campaignInfo', { code: camp })).consent, otherTok = (await post(base, '/api/campaignInfo', { code: other })).consent;
  ok(typeof good === 'string' && typeof otherTok === 'string' && good !== otherTok, 'each open link\'s welcome page gets its own consent token');

  const bad = [
    ['missing', undefined], ['null', null], ['empty', ''], ['number', 1], ['true', true], ['object', { v: 1 }], ['array', [good]],
    ['malformed', 'garbage'], ['forged MAC', 'c1.' + 'A'.repeat(43)], ['another link\'s token', otherTok],
    ['another notice version', good.replace(/^c1\./, 'c2.')], ['truncated', good.slice(0, -1)], ['padded', good + 'x'],
    ['oversized', 'c1.' + 'x'.repeat(5000)], ['case-changed', good.toUpperCase()]
  ];
  const tried = [];
  for(const [label, consent] of bad){
    const name = 'Bad ' + label.replace(/[^A-Za-z]/g, '').slice(0, 10);
    tried.push(name);
    const body = { code: camp, name, pin: '4321', agree: true, email: name.replace(/ /g, '') + '@example.com', emailOk: true };
    if(consent !== undefined) body.consent = consent;
    const r = await post(base, '/api/redeem', body);
    ok(r.status === 400 && !r.token && /welcome page/.test(r.error), `consent ${label}: refused with the welcome-page message`);
  }
  // a valid token is still refused without the agreement box, and stores nothing either
  const nb = await post(base, '/api/redeem', { code: camp, name: 'Bad NoAgree', pin: '4321', consent: good, email: 'noagree@example.com', emailOk: true });
  ok(nb.status === 400 && !nb.token, 'a valid consent token without the agreement box is refused'); tried.push('Bad NoAgree');

  // a closed (full) link's page gets no consent token and no venue, source or notice
  ok((await post(base, '/api/redeem', { code: tiny, name: 'Tiny One', pin: '4321', agree: true, consent: (await post(base, '/api/campaignInfo', { code: tiny })).consent })).token, 'the one-place link is used up');
  const closed = await post(base, '/api/campaignInfo', { code: tiny });
  eq(Object.keys(closed).filter(k => k !== 'status').sort(), ['campaign', 'open'], 'a closed link\'s page learns only that it is closed');
  eq([closed.campaign, closed.open, closed.consent], [true, false, undefined], 'no consent token for a closed link');

  // nothing shared: report, owner and member payloads
  let ov = await view(base, owner), row = ov.campaigns.find(r => r.code === camp);
  eq([row.joined, row.emails, row.members], [0, 0, []], 'the owner report shows no join, no email and nobody from the refused attempts');
  ok(!ov.members.some(m => tried.includes(m.name)), 'no refused attempt appears in the member list');
  const memberTok = (await post(base, '/api/login', { name: 'Tiny One', pin: '4321' })).token;
  const mj = JSON.stringify(await view(base, memberTok));
  ok(!tried.some(n => mj.includes(n)) && !/@example\.com|"email"|"consent"/.test(mj), 'a member\'s payload carries none of it');
  for(const n of tried.slice(0, 3)) ok((await post(base, '/api/login', { name: n, pin: '4321' })).error, `no account was made for ${n}`);

  // nothing stored: inspect the data on disk
  await stop(srv);
  let db = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  ok(!Object.values(db).some(x => x && tried.includes(x.name)), 'no user record for any refused attempt');
  ok(!tried.some(n => ('name:' + n.toLowerCase()) in db), 'no name was reserved');
  eq(Object.keys(db).filter(k => k.startsWith('contact:')), [], 'no contact (email) record was stored');
  ok(!JSON.stringify(db).includes('@example.com'), 'no email appears anywhere in the data');
  eq(db['invite:' + camp].uses, [], 'the link records no use');

  // after a restart, a token from the previous run is refused (the page must be read again), then a fresh one works
  srv = await start(port, DATA, { CAMPAIGNS: '1' });
  const stale = await post(base, '/api/redeem', { code: camp, name: 'Stale Tok', pin: '4321', agree: true, consent: good, email: 'stale@example.com', emailOk: true });
  ok(stale.status === 400 && /welcome page/.test(stale.error), 'a consent token issued before a restart is refused');
  const fresh = (await post(base, '/api/campaignInfo', { code: camp })).consent;
  ok(fresh !== good, 'the restarted server issues a new token');
  const j = await post(base, '/api/redeem', { code: camp, name: 'Real Join', pin: '4321', agree: true, consent: fresh, email: 'real@example.com', emailOk: true });
  ok(j.token, 'with the page\'s current token and both boxes, the join works');
  // an ordinary invite needs no campaign token and never stores an email, even if one is sent
  const personal = (await post(base, '/api/invite', {}, owner)).code;
  ok((await post(base, '/api/redeem', { code: personal, name: 'Plain Join', pin: '4321', agree: true, email: 'plain@example.com', emailOk: true })).token, 'an ordinary invite works as before');
  ov = await view(base, owner); row = ov.campaigns.find(r => r.code === camp);
  eq([row.joined, row.emails, row.members.map(m => m.name)], [1, 1, ['Real Join']], 'the report shows exactly the one consented join');
  await stop(srv);
  db = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const contacts = Object.keys(db).filter(k => k.startsWith('contact:'));
  eq(contacts.map(k => db[k].email), ['real@example.com'], 'exactly one contact record: the consented one');
  ok(!Object.values(db).some(x => x && x.name === 'Stale Tok') && !JSON.stringify(db).includes('stale@example.com') && !JSON.stringify(db).includes('plain@example.com'), 'nothing from the stale attempt or the ordinary invite\'s email was stored');
  eq(db['invite:' + camp].uses.length, 1, 'the link records one use');

  // ================= 2. the flags =================
  // with the data above (a stored campaign link): STAGING=1 alone keeps everything off
  srv = await start(port, DATA, { STAGING: '1' });
  const own2 = (await post(base, '/api/login', { name: 'Director', pin: '246810' })).token;
  const unknown = await post(base, '/api/noSuchThing', {}, own2);
  for(const [p, b] of [['/api/campaign', { source: 'zz', max: 5, hours: 5 }], ['/api/vmap', { slug: 'celestia', code: camp }], ['/api/campaignInfo', { code: camp }]]){
    const r = await post(base, p, b, own2);
    eq([r.status, r.error], [unknown.status, unknown.error], 'STAGING=1: ' + p + ' answers like an unknown endpoint');
  }
  ok((await post(base, '/api/redeem', { code: camp, name: 'Stage Join', pin: '4321', agree: true, consent: fresh })).error, 'STAGING=1: a stored campaign link cannot be redeemed');
  ok(!('campaigns' in await view(base, own2)), 'STAGING=1: the owner payload carries no campaign report');
  await stop(srv);

  // each flag combination on an empty club: on only with CAMPAIGNS=1
  const combos = [
    [{}, false], [{ STAGING: '1' }, false], [{ CAMPAIGNS: 'true' }, false], [{ CAMPAIGNS: 'yes' }, false],
    [{ CAMPAIGNS: '0' }, false], [{ CAMPAIGNS: ' 1' }, false], [{ CAMPAIGNS: '1' }, true], [{ CAMPAIGNS: '1', STAGING: '1' }, true]
  ];
  for(const [env, on] of combos){
    const d = DATA + '.flag'; try{ fs.unlinkSync(d); }catch(e){}
    const s = await start(port, d, env), label = JSON.stringify(env);
    const info = await post(base, '/api/campaignInfo', { code: 'abcdefghijkl' });
    const mk = await post(base, '/api/campaign', { source: 'zz', max: 5, hours: 5 });
    const v = await fetch(base + '/v/celestia', { redirect: 'manual', headers: { 'cf-connecting-ip': nextIp() } });
    if(on) eq([info.status, info.campaign, mk.status, v.status], [200, false, 400, 200], label + ': campaigns ON (info answers, create needs the owner, /v/ gives the neutral page)');
    else eq([info.status, info.error, mk.status, v.status], [404, 'Not found', 404, 404], label + ': campaigns OFF (404 everywhere)');
    await stop(s); try{ fs.unlinkSync(d); }catch(e){}
  }

  try{ fs.unlinkSync(DATA); }catch(e){}
  console.log(`campaign consent and flag test passed (${passed} checks)`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
