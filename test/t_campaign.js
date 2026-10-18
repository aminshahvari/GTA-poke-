// Public campaign links (CAMPAIGNS=1): cap, expiry, cancel, no tournament sign-up, concurrency, per-connection limit, what a
// campaign joiner can see, the optional email with its own consent, the printed /v/<source> path, and the owner's counts.
// Also checks that personal, group and member links still behave as before (including tournament sign-up).
const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const WebSocket = require('ws');
const PORT = 4100 + Math.floor(Math.random() * 90), BASE = 'http://127.0.0.1:' + PORT;
const DATA = path.join(os.tmpdir(), 't_campaign_' + process.pid + '.json'); try{ fs.unlinkSync(DATA); }catch(e){}
const sleep = ms => new Promise(r => setTimeout(r, ms));
let srv, ipN = 0, passed = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passed++; };
const eq = (a, b, msg) => { assert.deepStrictEqual(a, b, msg); passed++; };
const nextIp = () => '198.18.' + Math.floor(++ipN / 250) + '.' + (ipN % 250 + 1);
async function start(){
  srv = spawn(process.execPath, ['server/index.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '', CAMPAIGNS: '1', STAGING: '', DATABASE_URL: '' }, stdio: 'ignore' });
  for(let i = 0; i < 50; i++){ await sleep(100); try{ if((await fetch(BASE + '/healthz')).ok) return; }catch(e){} }
  throw new Error('server did not start');
}
async function stop(){ await sleep(400); srv.kill(); await new Promise(r => srv.once('exit', r)); }
const post = async (p, body, token, ip = nextIp()) => {
  const r = await fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
  return { status: r.status, ...(await r.json()) };
};
// open a socket, take the first club view, optionally send messages, and return the latest view
function session(token){
  return new Promise((res, rej) => {
    const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws'); let view = null, err = null;
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token, device: 'd' + Math.random() })));
    ws.on('message', raw => { const m = JSON.parse(raw); if(m.t === 'club'){ const first = !view; view = m.club; if(first) res(api); } if(m.t === 'error') err = m.error; });
    ws.on('error', rej);
    const api = { send: async m => { ws.send(JSON.stringify(m)); await sleep(150); return api; }, view: () => view, error: () => err, close: () => ws.close() };
  });
}
const join = (code, name, ip) => post('/api/redeem', { code, name, pin: '4321', agree: true }, null, ip);
const campaign = (token, source, max, hours) => post('/api/campaign', { source, max, hours }, token);

(async () => {
  await start();
  const owner = (await post('/api/setup', { code: 'secret', name: 'Director', pin: '246810', agree: true })).token;
  const o = await session(owner);
  await o.send({ t: 'create', name: 'Friday Night', stack: 30000, levelMin: 10, tableSize: 9 });
  eq(o.view().tourney.status, 'registering', 'a tournament is open for sign-up');

  // ---- the three existing link kinds still sign the new player up for the open tournament ----
  const personal = (await post('/api/invite', {}, owner)).code;
  const p1 = await join(personal, 'Personal One');
  ok(p1.token, 'personal link works');
  ok((await join(personal, 'Personal Two')).error, 'personal link works once');
  await o.send({ t: 'invite', group: true });
  const group = o.view().invites.find(i => i.multi && i.by === o.view().me.id).code;
  const g1 = await join(group, 'Group One');
  ok(g1.token, 'group link works');
  const m1 = await session(g1.token);
  await m1.send({ t: 'invite' });
  const memberLink = (await post('/api/invite', {}, g1.token)).code;
  const ml1 = await join(memberLink, 'Member Link');
  ok(ml1.token, 'member link works');
  await sleep(250);
  const ids = o.view().members.reduce((a, m) => (a[m.name] = m.id, a), {});
  for(const n of ['Personal One', 'Group One', 'Member Link']) ok(o.view().tourney.regs.includes(ids[n]), n + ' was signed up for the open tournament (unchanged)');
  const g = (await session(owner)).view().invites.find(i => i.code === group);
  eq([g.max, Math.round((g.expiresAt - g.createdAt) / 864e5)], [100, 30], 'owner group link is still 100 people, 30 days');
  const ml = (await session(owner)).view().invites.find(i => i.code === memberLink);
  eq([ml.max, Math.round((ml.expiresAt - ml.createdAt) / 864e5)], [10, 7], 'member link is still 10 people, 7 days');

  // ---- creating a campaign link: owner only, validated ----
  ok((await campaign(g1.token, 'instagram', 10, 24)).error, 'a member cannot create a campaign link');
  ok((await campaign(null, 'instagram', 10, 24)).error, 'nobody signed out can create a campaign link');
  for(const [s, m, h] of [['x', 10, 24], ['Insta Gram', 10, 24], ['a'.repeat(25), 10, 24], ['ig', 0, 24], ['ig', 2001, 24], ['ig', 1.5, 24], ['ig', 10, 0.5], ['ig', 10, 721]])
    ok((await campaign(owner, s, m, h)).error, `rejected source=${s} cap=${m} hours=${h}`);
  const camp = (await campaign(owner, 'celestia', 3, 72)).code;
  ok(/^[A-Za-z0-9_-]{12}$/.test(camp), 'campaign link created');
  await o.send({ t: 'invite', group: true });
  eq(o.view().invites.find(i => i.multi && i.by === o.view().me.id).code, group, 'the owner group link is still reused, not swapped for the campaign link');
  ok(!o.view().invites.some(i => i.code === camp), 'campaign links are kept out of the ordinary invite list');

  // ---- campaign info, cap, no tournament sign-up ----
  eq(await post('/api/campaignInfo', { code: camp }).then(r => [r.campaign, r.open, r.source, r.venue]), [true, true, 'celestia', 'Celestia Restaurant & Lounge'], 'join page learns it is an open campaign link, its source and the venue line');
  const info = await post('/api/campaignInfo', { code: camp });
  eq(Object.keys(info).filter(k => k !== 'status').sort(), ['campaign', 'emailConsent', 'open', 'source', 'venue'], 'campaign info reveals nothing else (no code, cap, count or owner)');
  eq((await post('/api/campaignInfo', { code: group })).campaign, false, 'a group link is not a campaign link');
  eq((await post('/api/campaignInfo', { code: 'nope' })).campaign, false, 'an unknown code reveals nothing');
  ok((await post('/api/redeem', { code: camp, name: 'No Tick', pin: '4321' })).error.includes('tick'), 'campaign join needs the consent box');
  // ---- the optional email: its own consent box, validated, never required ----
  ok(/email box/.test((await post('/api/redeem', { code: camp, name: 'Mail NoOk', pin: '4321', agree: true, email: 'a@example.com' })).error), 'an email without its consent box is refused');
  ok(/does not look right/.test((await post('/api/redeem', { code: camp, name: 'Mail Bad', pin: '4321', agree: true, email: 'not-an-email', emailOk: true })).error), 'a malformed email is refused');
  const c1 = await post('/api/redeem', { code: camp, name: 'Camp One', pin: '4321', agree: true, email: 'one@example.com', emailOk: true });
  const c2 = await post('/api/redeem', { code: camp, name: 'Camp Two', pin: '4321', agree: true, email: '', emailOk: true }), c3 = await join(camp, 'Camp Three');
  ok(c1.token && c2.token && c3.token, 'three people joined with the campaign link');
  ok((await join(camp, 'Camp Four')).error, 'cap of 3 holds');
  eq((await post('/api/campaignInfo', { code: camp })).open, false, 'a full campaign link reads as closed');
  const cv = await session(c1.token); await sleep(250);
  ok(!o.view().tourney.regs.includes(cv.view().me.id), 'campaign joiner was NOT signed up for the open tournament');
  ok(cv.view().tourney && cv.view().tourney.status === 'registering', 'campaign joiner lands in the lobby and sees the tournament');
  ok(!cv.view().myTable, 'campaign joiner is not seated anywhere');

  // ---- what a campaign joiner can see ----
  const v = cv.view(), json = JSON.stringify(v);
  for(const k of ['invites', 'campaigns', 'campaignSources', 'conflicts', 'households', 'mutedIds']) ok(!(k in v), 'campaign joiner does not get ' + k);
  for(const c of [personal, group, memberLink, camp, owner, c1.token, 'secret', 'one@example.com', '@example.com']) ok(!json.includes(c), 'no invite code, session, setup code or email in the view');
  ok(!/"(salt|pin|seen|household|session|token|campaign|campRet|email|consent|vpath|cstat)"/.test(json), 'no PIN hash, salt, IPs, devices, household, campaign tag, email, consent or counters in the view');
  const fields = ['id', 'name', 'role', 'createdAt', 'invitedBy', 'av', 'tier', 'color', 'score'];
  ok(v.members.every(m => Object.keys(m).every(k => fields.includes(k))), 'members carry only id, name, role, joined date, invitedBy, avatar and rating');
  ok(v.members.every(m => m.invitedBy === null), 'campaign joiner sees no inviter for anyone (invite privacy)');
  const gv = (await session(g1.token)).view(), gjson = JSON.stringify(gv);
  ok(gv.members.every(m => m.invitedBy === null), 'ordinary members see no inviter for anyone (invite privacy)');
  ok(!gjson.includes('one@example.com') && !/"(email|consent|campaign|cstat|vpath)"/.test(gjson), 'ordinary members never get an email, campaign tag or counters');
  ok(o.view().members.some(m => m.name === 'Member Link' && m.invitedBy === ids['Group One']), 'the owner still sees who invited whom');
  ok(!('invites' in gv) && !JSON.stringify(gv).includes(group), 'ordinary members never get invite codes');

  // ---- cancel ----
  const camp2 = (await campaign(owner, 'flyer', 50, 24)).code;
  ok((await join(camp2, 'Flyer One')).token, 'second campaign link works');
  await o.send({ t: 'revoke', code: camp2 });
  ok((await join(camp2, 'Flyer Two')).error, 'a cancelled campaign link stops working');

  // ---- concurrency: 50 at once against a cap of 10 ----
  const camp3 = (await campaign(owner, 'rush', 10, 24)).code;
  const rush = await Promise.all(Array.from({ length: 50 }, (_, i) => join(camp3, 'Rush ' + i)));
  eq(rush.filter(r => r.token).length, 10, '50 parallel joins against a cap of 10 give exactly 10 accounts');
  eq(rush.filter(r => r.error).length, 40, 'the other 40 are told the link is full');

  // ---- per-connection limit on successful campaign sign-ups ----
  const camp4 = (await campaign(owner, 'ip-test', 100, 24)).code, shared = '203.0.113.50';
  const fromOne = [];
  for(let i = 0; i < 6; i++) fromOne.push(await join(camp4, 'Same Ip ' + i, shared));
  eq(fromOne.map(r => !!r.token), [true, true, true, true, true, false], 'five campaign accounts per connection per hour, the sixth is refused');
  ok(/Too many new accounts/.test(fromOne[5].error), 'the refusal says why');
  ok((await join(camp4, 'Other Ip', '203.0.113.51')).token, 'another connection can still join');
  ok((await join(group, 'Group Same Ip', shared)).token, 'the limit does not touch ordinary group links');
  ok((await post('/api/login', { name: 'Same Ip 0', pin: '4321' }, null, shared)).token, 'people already signed up can still sign in from that connection');

  // ---- Director report ----
  const rep = (await session(owner)).view().campaigns;
  const by = s => rep.find(r => r.source === s);
  eq(['celestia', 'flyer', 'rush', 'ip-test'].map(s => by(s).status), ['full', 'cancelled', 'full', 'active'], 'report status per campaign');
  eq([by('celestia').joined, by('celestia').remaining, by('celestia').max, by('celestia').emails], [3, 0, 3, 1], 'report counts for celestia, one of whom shared an email');
  eq(by('celestia').members.find(m => m.name === 'Camp One').email, 'one@example.com', 'the owner sees the email the member opted to share');
  ok(by('celestia').members.filter(m => m.name !== 'Camp One').every(m => m.email === null), 'no email for those who left it empty');
  eq([by('ip-test').joined, by('ip-test').remaining], [6, 94], 'report counts for ip-test');
  eq(by('rush').joined, 10, 'report counts the concurrent joins exactly');
  eq(by('celestia').members.map(m => m.name).sort(), ['Camp One', 'Camp Three', 'Camp Two'], 'report lists who joined through each link');
  ok(rep.every(r => r.members.length === r.joined), 'every report count equals the members it lists');
  eq(by('rush').members.map(m => m.name).sort(), rush.map((r, i) => r.token ? 'Rush ' + i : null).filter(Boolean).sort(), 'the rush list is exactly the 10 who got accounts');
  ok(rep.every(r => r.code && r.createdAt && r.expiresAt && typeof r.played === 'number' && typeof r.returned === 'number'), 'report has code, created, expires, played and returned');
  eq([by('celestia').played, by('celestia').returned], [0, 0], 'nobody from celestia has played or come back yet: the report says 0, nothing invented');

  // ---- the printed path /v/<source> ----
  const get = (p, ip = nextIp()) => fetch(BASE + p, { redirect: 'manual', headers: { 'cf-connecting-ip': ip } });
  const vmap = (slug, code, token = owner) => post('/api/vmap', { slug, code }, token);
  const neutral = await (await get('/v/celestia')).text();
  ok(/This invitation is not active right now/.test(neutral) && !/celestia|club|offer|prize|discount/i.test(neutral.replace(/<[^>]+>/g, ' ').replace('BLINDRISE', '')), 'unmapped /v/celestia gives the neutral page with no venue, club or offer claim');
  ok((await vmap('celestia', camp4, g1.token)).error, 'a member cannot set a path');
  ok((await vmap('celestia', camp4, null)).error, 'nobody signed out can set a path');
  ok((await vmap('celestia', group)).error, 'a path cannot point at an ordinary group link');
  ok((await vmap('celestia', camp4)).error, 'a path must match the link\'s source (ip-test is not celestia)');
  ok((await vmap('celestia', camp)).error, 'a path cannot point at a full link');
  const live = (await campaign(owner, 'celestia', 50, 720)).code;
  ok((await vmap('celestia', live)).ok, 'the owner points /v/celestia at the open celestia link');
  let r = await get('/v/celestia');
  eq([r.status, r.headers.get('location')], [302, '/join/' + live], '/v/celestia redirects to the join page of the mapped link');
  ok(/no-store/.test(r.headers.get('cache-control')) && /noindex/.test(r.headers.get('x-robots-tag')) && r.headers.get('referrer-policy') === 'no-referrer', 'never cached, not indexed, no referrer');
  ok(!r.headers.get('set-cookie'), 'no cookie is set');
  ok(/^\/join\/[A-Za-z0-9_-]{12}$/.test(r.headers.get('location')), 'the target is always /join/ plus a 12-character code');
  r = await get('/v/celestia?next=https://evil.example/');
  eq(r.headers.get('location'), '/join/' + live, 'a query string is never copied into the redirect');
  const bodies = [];
  for(const p of ['/v/nothing-here', '/v/a..b', '/v/%2F%2Fevil.example', '/v/CELESTIA', '/v/' + 'a'.repeat(25), '/v/caf%C3%A9', '/v/a%2Fb', '/v/', '/v/%E0%A4%A']){
    const x = await get(p); bodies.push(await x.text());
    ok(x.status === 200 && !x.headers.get('location') && /no-store/.test(x.headers.get('cache-control')), p + ' gives the neutral page, no redirect, not cached');
  }
  ok(bodies.every(b => b === neutral), 'every failure gives byte-for-byte the same page');
  const flyer2 = (await campaign(owner, 'flyer', 5, 24)).code;
  ok((await vmap('flyer', flyer2)).ok, 'a second path for another source');
  await o.send({ t: 'revoke', code: flyer2 });
  eq([(await get('/v/flyer')).status, await (await get('/v/flyer')).text() === neutral], [200, true], 'a path to a cancelled link gives the neutral page');
  const live2 = (await campaign(owner, 'celestia', 20, 24)).code;
  ok((await vmap('celestia', live2)).ok, 'the owner re-points the printed path to a new link');
  eq((await get('/v/celestia')).headers.get('location'), '/join/' + live2, 're-pointing takes effect on the next scan (nothing cached)');
  // a scan, the welcome page and a join through the path are counted under celestia; the joiner is not signed up for the tournament
  const before = (await session(owner)).view().campaignSources.find(x => x.source === 'celestia');
  await get('/v/celestia'); await post('/api/campaignInfo', { code: live2 });
  const vj = await join(live2, 'Via Path');
  const after = (await session(owner)).view(), srcRow = after.campaignSources.find(x => x.source === 'celestia');
  eq([srcRow.visits - before.visits, srcRow.views - before.views], [1, 1], 'one scan and one welcome view counted, no more');
  ok(after.campaigns.find(c => c.code === live2).members.some(m => m.name === 'Via Path'), 'the join is reported under celestia');
  ok(!after.tourney.regs.includes(after.members.find(m => m.name === 'Via Path').id), 'and the joiner is not signed up for the open tournament');
  eq((await post('/api/campaignInfo', { code: 'zzzzzzzzzzzz' })).campaign, false, 'an unknown code counts nothing');
  // rate limit: 60 scans a minute per connection, then 429 with the same neutral page
  const scanner = '203.0.113.90', scans = [];
  for(let i = 0; i < 61; i++) scans.push((await get('/v/celestia', scanner)).status);
  eq([scans.slice(0, 60).every(x => x === 302), scans[60]], [true, 429], 'the 61st scan in a minute from one connection gets 429');
  eq((await get('/v/celestia', '203.0.113.91')).status, 302, 'other connections are not affected');
  ok(!JSON.stringify((await session(g1.token)).view()).includes(live2), 'members never get path data or codes');
  ok((await vmap('celestia', null)).ok && (await get('/v/celestia')).status === 200, 'the owner can clear the path; it then gives the neutral page');
  ok((await vmap('celestia', live2)).ok, 'and point it again');

  // ---- expiry (move the expiry into the past on disk and restart) ----
  const camp5 = (await campaign(owner, 'expiring', 10, 1)).code;
  ok((await join(camp5, 'Before Expiry')).token, 'link works before it expires');
  [o, m1, cv].forEach(s => s.close());
  await stop();
  const db = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  db['invite:' + camp5].expiresAt = Date.now() - 1000;
  // what is stored for the email: only the address, the exact consent wording, its version and the time
  const uid1 = Object.values(db).find(x => x && x.name === 'Camp One' && x.salt).id, contact = db['contact:' + uid1];
  eq(Object.keys(contact).sort(), ['consent', 'email'], 'the contact record holds the email and its consent only');
  eq([contact.consent.v, contact.consent.text, typeof contact.consent.at], [1, info.emailConsent, 'number'], 'the consent stored is the exact wording shown, with its version and time');
  ok(!Object.keys(db).some(k => k.startsWith('contact:') && db[k].email !== 'one@example.com'), 'nobody else has a contact record');
  ok(Object.keys(db).filter(k => k.startsWith('cstat:')).every(k => Object.keys(db[k]).every(f => ['visits', 'views'].includes(f) && Number.isInteger(db[k][f]))), 'counters are plain integers: no address, time or device');
  // a celestia member who comes back on a later day (within 30 days) counts once as returned
  db['user:' + uid1].createdAt = Date.now() - 2 * 864e5;
  fs.writeFileSync(DATA, JSON.stringify(db));
  await start();
  ok((await join(camp5, 'After Expiry')).error, 'an expired campaign link stops working');
  eq((await session(owner)).view().campaigns.find(r => r.source === 'expiring').status, 'expired', 'report shows it expired');
  const back = (await post('/api/login', { name: 'Camp One', pin: '4321' })).token;
  ok(back, 'campaign members keep their accounts across a restart');
  (await session(back)).close(); (await session(back)).close(); await sleep(200);
  eq((await session(owner)).view().campaigns.find(c => c.code === camp).returned, 1, 'coming back on a later day counts once as returned');

  // ---- failures on a dead campaign link still count toward the /api/redeem rate limit, and the message stays generic ----
  const hammer = '203.0.113.77', tries = [];
  for(let i = 0; i < 31; i++) tries.push(await join(camp5, 'Hammer ' + i, hammer));
  ok(tries.slice(0, 30).every(r => r.status === 400 && /full, expired or was cancelled/.test(r.error)), 'a dead campaign link gives the generic full/expired/cancelled message');
  ok(tries.slice(0, 30).every(r => !/Camp|Director|instagram|expiring/i.test(r.error)), 'the refusal names no member and no source');
  eq(tries[30].status, 429, 'after 30 failed tries from one connection, /api/redeem answers 429');
  ok((await join(camp5, 'Hammer Again', '203.0.113.78')).status === 400, 'another connection is not blocked');

  console.log(`campaign test passed (${passed} checks)`);
  srv.kill(); try{ fs.unlinkSync(DATA); }catch(e){} process.exit(0);
})().catch(e => { console.error(e); if(srv) srv.kill(); process.exit(1); });
