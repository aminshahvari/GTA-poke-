// Opportunity Club: "I need help" / "I can help" listings and private contact requests inside Business Club.
// Auth, ownership, visibility (expired/closed/hidden), the request flow and contact reveal by choice only,
// limits, reporting with auto-hide, director moderation, member removal, validation and privacy.
const assert = require('assert');
const fs = require('fs');
const { spawn } = require('child_process');
const { watchServer, waitReady } = require('./ready');
const WebSocket = require('ws');
const PORT = 4200 + Math.floor(Math.random() * 50), BASE = 'http://localhost:' + PORT;
const DATA = require('os').tmpdir() + '/t_opp_' + process.pid + '.json';
const env = { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '', STAGING: '', CLUBS_DEFAULT: 'on' };
let srv = watchServer(spawn('node', ['server/index.js'], { cwd: __dirname + '/..', env, stdio: ['ignore', 'ignore', 'pipe'] }));
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function call(p, body, tok){
  const r = await fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body || {}) });
  return { status: r.status, body: await r.json().catch(() => ({})), headers: r.headers };
}
const ok = async (p, body, tok) => { const r = await call(p, body, tok); assert.strictEqual(r.status, 200, `${p} should succeed: ${JSON.stringify(r.body)}`); return r.body; };
const status = async (p, body, tok) => (await call(p, body, tok)).status;
const err = async (p, body, tok, code = 400) => { const r = await call(p, body, tok); assert.strictEqual(r.status, code, `${p} ${JSON.stringify(body).slice(0, 80)} should be ${code}, got ${r.status} ${JSON.stringify(r.body)}`); return r.body.error; };
function wsDo(tok, msgs){
  return new Promise((res, rej) => {
    const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws'); let me = null;
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: tok })));
    ws.on('message', m => { m = JSON.parse(m); if(m.t === 'club' && !me){ me = m.club.me.id; for(const x of msgs) ws.send(JSON.stringify(x)); setTimeout(() => { ws.close(); res(me); }, msgs.length ? 300 : 0); } if(m.t === 'auth' && !m.ok) rej(new Error('auth')); });
    ws.on('error', rej);
  });
}
const listing = (over = {}) => ({ type: 'need', title: 'Need a plumber', details: 'Kitchen sink leaks. Looking for someone a member trusts.', category: 'trades', area: 'Toronto', ...over });
const ids = r => r.items.map(x => x.id);
const disk = () => JSON.parse(fs.readFileSync(DATA, 'utf8'));

(async () => {
  await waitReady(BASE, srv);
  const O = (await ok('setup', { code: 'secret', name: 'Director', pin: '1234', agree: true })).token;
  const join = async name => { const { code } = await ok('invite', {}, O); return (await ok('redeem', { code, name, pin: '1111', agree: true })).token; };
  const A = await join('Alex'), B = await join('Bea'), Cc = await join('Cam'), D = await join('Dee'), E = await join('Eve'), F = await join('Fay');
  const idA = await wsDo(A, []), idB = await wsDo(B, []);

  // ---- auth: every endpoint needs a signed-in member ----
  const EPS = ['oppList', 'oppGet', 'oppSave', 'oppClose', 'oppDelete', 'oppMine', 'oppBadge', 'oppRequest', 'oppReply', 'oppRequestDelete', 'oppReport', 'oppReports', 'oppModerate'];
  for(const p of EPS) assert.strictEqual(await status(p, { id: 'o0000000000000000' }), 401, p + ' without a token');
  for(const p of EPS) assert.strictEqual(await status(p, {}, 'not-a-token'), 401, p + ' with a bad token');
  const r0 = await call('oppList', {}, A);
  assert.strictEqual(r0.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive', 'opportunity responses are noindex');
  assert.strictEqual((await call('oppList', {})).headers.get('x-robots-tag'), 'noindex, nofollow, noarchive', 'even the 401');
  assert.deepStrictEqual(r0.body.items, [], 'empty feed');

  // ---- create without a business profile; edit; close; delete ----
  const a1 = (await ok('oppSave', listing(), A)).item;
  assert.ok(/^o[0-9a-f]{16}$/.test(a1.id)); assert.strictEqual(a1.state, 'open'); assert.strictEqual(a1.mine, true);
  assert.strictEqual(a1.business, null, 'no business profile needed, none linked');
  assert.ok(Math.abs(a1.expiresAt - Date.now() - 30 * 864e5) < 60000, 'default expiry 30 days');
  const b1 = (await ok('oppSave', listing({ type: 'offer', title: 'Can help with bookkeeping', details: 'Year-end prep for freelancers.', category: 'professional', area: '', expiresInDays: 90 }), B)).item;
  assert.ok(Math.abs(b1.expiresAt - Date.now() - 90 * 864e5) < 60000, '90 days allowed');
  await err('oppSave', listing({ expiresInDays: 91 }), Cc); await err('oppSave', listing({ expiresInDays: 0 }), Cc); await err('oppSave', listing({ expiresInDays: 2.5 }), Cc);
  // the feed: newest first, the poster's club name, and a link to a published business only
  let feed = await ok('oppList', {}, Cc);
  assert.deepStrictEqual(ids(feed), [b1.id, a1.id], 'newest first');
  assert.strictEqual(feed.items[1].member, 'Alex'); assert.strictEqual(feed.items[1].mine, false); assert.strictEqual(feed.items[1].myRequest, null);
  await ok('bizSave', { name: 'Bea Books', category: 'professional', show: {} }, B);
  assert.strictEqual((await ok('oppGet', { id: b1.id }, Cc)).item.business, null, 'unpublished business is not linked');
  await ok('bizPublish', { on: true }, B);
  assert.deepStrictEqual((await ok('oppGet', { id: b1.id }, Cc)).item.business, { uid: idB, name: 'Bea Books' }, 'published business is linked');
  // filters and search
  assert.deepStrictEqual(ids(await ok('oppList', { type: 'need' }, Cc)), [a1.id]);
  assert.deepStrictEqual(ids(await ok('oppList', { type: 'offer' }, Cc)), [b1.id]);
  assert.deepStrictEqual(ids(await ok('oppList', { category: 'trades' }, Cc)), [a1.id]);
  assert.deepStrictEqual(ids(await ok('oppList', { q: 'sink' }, Cc)), [a1.id], 'search details');
  assert.deepStrictEqual(ids(await ok('oppList', { q: 'bea' }, Cc)), [b1.id], 'search poster name');
  assert.deepStrictEqual(ids(await ok('oppList', { q: 'plumber', type: 'offer' }, Cc)), [], 'filters combine');
  // edit own; others cannot edit, close or delete it (a forged id or uid changes nothing)
  const ed = (await ok('oppSave', { ...listing({ title: 'Need a licensed plumber', area: 'East end' }), id: a1.id }, A)).item;
  assert.strictEqual(ed.title, 'Need a licensed plumber'); assert.strictEqual(ed.expiresAt, a1.expiresAt, 'editing keeps the end date unless a new one is chosen');
  await err('oppSave', { ...listing({ title: 'Hijacked' }), id: a1.id, uid: idB }, B, 404);
  await err('oppClose', { id: a1.id }, B, 404); await err('oppDelete', { id: a1.id }, B, 404);
  const saveAsB = (await ok('oppSave', { ...listing({ title: 'Mine now' }), uid: idA }, Cc)).item;
  assert.strictEqual(saveAsB.member, 'Cam', 'a forged uid is ignored: the listing belongs to the caller');
  assert.strictEqual((await ok('oppGet', { id: a1.id }, B)).item.title, 'Need a licensed plumber', 'not changed by others');
  await ok('oppDelete', { id: saveAsB.id }, Cc);
  assert.strictEqual(await status('oppGet', { id: saveAsB.id }, Cc), 404, 'deleted');

  // ---- visibility: closed, expired and hidden listings leave the feed; the poster still sees them ----
  const c1 = (await ok('oppSave', listing({ title: 'Need a ride to the airport', category: 'travel', expiresInDays: 1 }), Cc)).item;
  await ok('oppClose', { id: c1.id }, Cc);
  assert.ok(!ids(await ok('oppList', {}, D)).includes(c1.id), 'closed not in feed');
  assert.strictEqual(await status('oppGet', { id: c1.id }, D), 404, 'closed detail hidden from others');
  assert.strictEqual((await ok('oppGet', { id: c1.id }, Cc)).item.state, 'closed', 'poster sees it as closed');
  await ok('oppClose', { id: c1.id, closed: false }, Cc);
  assert.ok(ids(await ok('oppList', {}, D)).includes(c1.id), 'reopened');
  // expire it by moving its end date into the past on disk (restart the server with the edited file)
  srv.kill(); await sleep(400);
  const dd = disk(); dd['opp:' + c1.id].expiresAt = Date.now() - 1000; fs.writeFileSync(DATA, JSON.stringify(dd));
  srv = watchServer(spawn('node', ['server/index.js'], { cwd: __dirname + '/..', env, stdio: ['ignore', 'ignore', 'pipe'] }));
  await waitReady(BASE, srv);
  assert.ok(!ids(await ok('oppList', {}, D)).includes(c1.id), 'expired not in feed');
  assert.strictEqual(await status('oppGet', { id: c1.id }, D), 404);
  assert.strictEqual((await ok('oppMine', {}, Cc)).listings.find(x => x.id === c1.id).state, 'expired', 'poster sees expired');
  await err('oppClose', { id: c1.id, closed: false }, Cc);
  await err('oppRequest', { id: c1.id, message: 'Can I help?' }, D, 404);
  // the director sees everything when asking for it; members asking for "all" get the normal feed
  const all = await ok('oppList', { all: true }, O);
  assert.ok(ids(all).includes(c1.id) && all.items.find(x => x.id === c1.id).state === 'expired', 'director sees expired');
  assert.ok(!ids(await ok('oppList', { all: true }, D)).includes(c1.id), 'members cannot ask for all');
  // a new end date puts it back up
  assert.strictEqual((await ok('oppSave', { ...listing({ title: 'Need a ride to the airport', category: 'travel' }), id: c1.id, expiresInDays: 7 }, Cc)).item.state, 'open');

  // ---- contact requests: a short private message; contact details only when the poster chooses ----
  await err('oppRequest', { id: a1.id, message: 'Me!' }, A, 400); // own listing
  await err('oppRequest', { id: a1.id, message: '' }, B);
  await err('oppRequest', { id: a1.id, message: 'x'.repeat(501) }, B);
  await err('oppRequest', { id: a1.id, message: 'See https://evil.example.com' }, B);
  await err('oppRequest', { id: 'o1234567890abcdef', message: 'Hello' }, B, 404);
  const rq = (await ok('oppRequest', { id: a1.id, message: 'I fixed mine last month, happy to help.‮' }, B)).request;
  assert.strictEqual(rq.status, 'sent'); assert.strictEqual(rq.shared, null);
  assert.strictEqual(rq.message, 'I fixed mine last month, happy to help.', 'direction override stripped');
  assert.strictEqual(await err('oppRequest', { id: a1.id, message: 'Again' }, B), 'You already sent a request for this listing.', 'one open request per listing');
  assert.deepStrictEqual((await ok('oppGet', { id: a1.id }, B)).item.myRequest, { id: rq.id, status: 'sent' });
  const rqD = (await ok('oppRequest', { id: a1.id, message: 'My cousin is a plumber.' }, D)).request;
  assert.strictEqual((await ok('oppBadge', {}, A)).pending, 2, 'poster has two waiting');
  assert.strictEqual((await ok('oppBadge', {}, B)).pending, 0);
  let mineA = await ok('oppMine', {}, A);
  const inc = mineA.listings.find(x => x.id === a1.id).requests;
  assert.deepStrictEqual(inc.map(r => r.from).sort(), ['Bea', 'Dee'], "poster sees the senders' club names");
  assert.deepStrictEqual(Object.keys(inc[0]).sort(), ['answeredAt', 'createdAt', 'from', 'id', 'message', 'shared', 'status'], 'only these fields about a request');
  // the poster's business contact details are never sent to the requester automatically
  await ok('bizSave', { name: 'Alex Fixes', category: 'trades', email: 'alex@example.com', phone: '416-555-0199', show: {} }, A);
  mineA = await ok('oppMine', {}, A);
  assert.deepStrictEqual(mineA.suggest, { email: 'alex@example.com', phone: '416-555-0199' }, 'suggestions only for the member themselves');
  const sentB = (await ok('oppMine', {}, B)).sent;
  assert.strictEqual(sentB.length, 1); assert.strictEqual(sentB[0].status, 'sent'); assert.strictEqual(sentB[0].shared, null);
  assert.ok(!JSON.stringify(await ok('oppMine', {}, B)).includes('416-555-0199') && !JSON.stringify(await ok('oppGet', { id: a1.id }, B)).includes('alex@example.com'), 'nothing leaks before the poster chooses');
  // only the poster can answer, once; sharing needs an email or phone they type or pick
  await err('oppReply', { id: rq.id, action: 'share', email: 'x@example.com' }, B, 404);
  await err('oppReply', { id: rq.id, action: 'share', email: 'x@example.com' }, D, 404);
  await err('oppReply', { id: rq.id, action: 'share' }, A);
  await err('oppReply', { id: rq.id, action: 'share', email: 'not an email' }, A);
  await err('oppReply', { id: rq.id, action: 'share', phone: 'call me' }, A);
  await err('oppReply', { id: rq.id, action: 'maybe' }, A);
  const rep = (await ok('oppReply', { id: rq.id, action: 'share', phone: '416-555-0199', note: 'Text me after 6.' }, A)).request;
  assert.deepStrictEqual(rep.shared, { phone: '416-555-0199', note: 'Text me after 6.' }, 'only what the poster chose (no email)');
  await err('oppReply', { id: rq.id, action: 'decline' }, A);
  const sentB2 = (await ok('oppMine', {}, B)).sent[0];
  assert.strictEqual(sentB2.status, 'shared'); assert.deepStrictEqual(sentB2.shared, { phone: '416-555-0199', note: 'Text me after 6.' });
  assert.ok(!JSON.stringify(sentB2).includes('alex@example.com'), 'unshared email never sent');
  await ok('oppReply', { id: rqD.id, action: 'decline' }, A);
  const sentD = (await ok('oppMine', {}, D)).sent[0];
  assert.strictEqual(sentD.status, 'declined'); assert.strictEqual(sentD.shared, null);
  assert.ok(!JSON.stringify(await ok('oppMine', {}, D)).includes('416-555-0199'), 'declined sender gets no contact');
  assert.strictEqual((await ok('oppBadge', {}, A)).pending, 0, 'answered requests leave the badge');
  await err('oppRequest', { id: a1.id, message: 'Please?' }, D, 400); // declined: no second request
  // the sender deletes their own request; nobody else can
  await err('oppRequestDelete', { id: rqD.id }, A, 404);
  await ok('oppRequestDelete', { id: rqD.id }, D);
  assert.strictEqual((await ok('oppMine', {}, D)).sent.length, 0);
  assert.strictEqual((await ok('oppMine', {}, A)).listings.find(x => x.id === a1.id).requests.length, 1, 'poster no longer sees it');

  // request rate limit: 10 an hour
  const f1 = (await ok('oppSave', listing({ title: 'Need a dog walker', category: 'home' }), F)).item;
  let codes = [];
  for(let i = 0; i < 9; i++){ const r = await call('oppRequest', { id: f1.id, message: 'Try ' + i }, E); codes.push(r.status); if(r.status === 200) await ok('oppRequestDelete', { id: r.body.request.id }, E); }
  codes.push(await status('oppRequest', { id: a1.id, message: 'Tenth' }, E));
  codes.push(await status('oppRequest', { id: b1.id, message: 'Eleventh' }, E));
  assert.deepStrictEqual(codes, [...Array(10).fill(200), 429], '11th request in an hour refused');
  assert.strictEqual(await status('oppRequest', { id: f1.id, message: 'Hi' }, D), 200, 'others unaffected');

  // ---- listing limits: 5 open at a time, 10 new a day ----
  const e = [];
  for(let i = 0; i < 5; i++) e.push((await ok('oppSave', listing({ title: 'Eve listing ' + i }), E)).item.id);
  assert.match(await err('oppSave', listing({ title: 'Sixth' }), E), /5 open listings/);
  await ok('oppClose', { id: e[0] }, E);
  e.push((await ok('oppSave', listing({ title: 'Eve listing 5' }), E)).item.id);
  assert.match(await err('oppClose', { id: e[0], closed: false }, E), /5 open listings/, 'reopening respects the cap');
  for(const id of e.slice(1)) await ok('oppDelete', { id }, E);
  for(let i = 6; i < 10; i++) await ok('oppSave', listing({ title: 'Eve listing ' + i }), E);
  assert.match(await err('oppSave', listing({ title: 'Eleventh today' }), E, 429), /10 new listings a day/, 'deleting does not reset the daily count');

  // ---- validation ----
  const bad = async (over, why) => assert.strictEqual(await status('oppSave', listing(over), D), 400, why);
  await bad({ type: 'sell' }, 'type'); await bad({ type: undefined }, 'type missing');
  await bad({ title: 'x'.repeat(81) }, 'title too long'); await bad({ title: 'ab' }, 'title too short');
  await bad({ details: 'x'.repeat(601) }, 'details too long'); await bad({ area: 'x'.repeat(61) }, 'area too long');
  await bad({ category: 'casino' }, 'category'); await bad({ title: { $ne: 1 } }, 'non-text');
  for(const l of ['https://example.com', 'see www.example.org', 'go to evil.com now', 'bit.ly/abc', 'mail alex@example.com', 'HTTP://X.CO', 'javascript://x'])
    await bad({ details: 'Look ' + l }, 'link rejected: ' + l);
  await bad({ title: 'Visit example.ca' }, 'link in title');
  const cleanT = (await ok('oppSave', listing({ title: 'Need\u0000 a ‮baker​', details: 'Line one\r\n\r\n\r\n\r\nLine two\u0007 (Node.js, e.g. U.S. clients)' }), D)).item;
  assert.strictEqual(cleanT.title, 'Need a baker', 'control and direction characters stripped');
  assert.strictEqual(cleanT.details, 'Line one\n\nLine two (Node.js, e.g. U.S. clients)', 'ordinary dots are fine');
  await ok('oppDelete', { id: cleanT.id }, D);

  // ---- reporting: once per member, not your own, 3 reports auto-hide pending review ----
  await err('oppReport', { id: a1.id, reason: 'spam' }, A); // own
  await err('oppReport', { id: a1.id, reason: 'because' }, B);
  await err('oppReport', { id: a1.id, reason: 'spam', note: 'x'.repeat(301) }, B);
  await ok('oppReport', { id: a1.id, reason: 'spam', note: 'Posted twice' }, B);
  assert.match(await err('oppReport', { id: a1.id, reason: 'scam' }, B), /already reported/);
  assert.strictEqual((await ok('oppGet', { id: a1.id }, B)).reported, true);
  await ok('oppReport', { id: a1.id, reason: 'offensive' }, Cc);
  assert.ok(ids(await ok('oppList', {}, F)).includes(a1.id), 'two reports: still listed');
  await ok('oppReport', { id: a1.id, reason: 'other', note: 'Odd' }, D);
  assert.ok(!ids(await ok('oppList', {}, F)).includes(a1.id), 'three reports: auto-hidden');
  assert.strictEqual(await status('oppGet', { id: a1.id }, F), 404);
  await err('oppRequest', { id: a1.id, message: 'Hi' }, F, 404);
  assert.strictEqual((await ok('oppGet', { id: a1.id }, A)).item.state, 'review', 'poster sees it is under review');
  // the director's queue; members get 403
  for(const p of ['oppReports', 'oppModerate']) assert.strictEqual(await status(p, { id: a1.id, action: 'unhide' }, B), 403, p + ' is director only');
  let q = await ok('oppReports', {}, O);
  assert.strictEqual(q.items[0].id, a1.id); assert.strictEqual(q.items[0].state, 'review');
  assert.deepStrictEqual(q.items[0].reports.map(r => [r.reason, r.by]), [['spam', 'Bea'], ['offensive', 'Cam'], ['other', 'Dee']]);
  assert.strictEqual((await ok('oppList', {}, O)).queue, 1, 'director sees the queue count');
  assert.ok(!('queue' in await ok('oppList', {}, B)), 'members do not');
  await ok('oppModerate', { id: a1.id, action: 'unhide' }, O);
  assert.ok(ids(await ok('oppList', {}, F)).includes(a1.id), 'director restored it');
  assert.strictEqual((await ok('oppReports', {}, O)).items.length, 0, 'reviewed reports leave the queue');
  await ok('oppModerate', { id: b1.id, action: 'hide' }, O);
  assert.ok(!ids(await ok('oppList', {}, F)).includes(b1.id), 'director hid it');
  assert.strictEqual((await ok('oppReports', {}, O)).items[0].state, 'hidden');
  assert.strictEqual((await ok('oppGet', { id: b1.id }, B)).item.state, 'hidden', 'poster sees hidden');
  await ok('oppModerate', { id: b1.id, action: 'unhide' }, O);
  await ok('oppModerate', { id: f1.id, action: 'delete' }, O);
  assert.strictEqual(await status('oppGet', { id: f1.id }, F), 404, 'director deleted it');
  assert.ok(!Object.keys(disk()).some(k => k.startsWith('oppreq:') && disk()[k].oppId === f1.id), 'its requests went too');
  await err('oppModerate', { id: a1.id, action: 'explode' }, O);

  // ---- removing a member deletes their listings, requests and reports ----
  const bReq = (await ok('oppRequest', { id: c1.id, message: 'I can drive you.' }, B)).request;
  const bOwn = (await ok('oppSave', listing({ title: 'Bea needs a caterer', category: 'food' }), B)).item;
  const toB = (await ok('oppRequest', { id: bOwn.id, message: 'I cater!' }, Cc)).request;
  await ok('oppReport', { id: c1.id, reason: 'spam' }, B);
  await wsDo(O, [{ t: 'remove', uid: idB }]);
  assert.strictEqual(await status('oppList', {}, B), 401, 'removed member is signed out');
  assert.strictEqual(await status('oppMine', {}, B), 401);
  assert.ok(!ids(await ok('oppList', {}, Cc)).some(id => id === b1.id || id === bOwn.id), "removed member's listings gone");
  assert.strictEqual((await ok('oppMine', {}, Cc)).listings.find(x => x.id === c1.id).requests.length, 0, 'their requests gone');
  assert.strictEqual((await ok('oppMine', {}, Cc)).sent.find(r => r.id === toB.id), undefined, 'requests to them gone');
  await sleep(400);
  const dk = disk(), vals = Object.entries(dk);
  assert.ok(!vals.some(([k, v]) => k.startsWith('opp:') && v.uid === idB), 'listing keys deleted');
  assert.ok(!vals.some(([k, v]) => k.startsWith('oppreq:') && (v.from === idB || v.to === idB)), 'request keys deleted');
  assert.ok(!vals.some(([k, v]) => k.startsWith('oppreport:') && v.by === idB), 'report keys deleted');
  assert.ok(!dk['opplimit:' + idB] && !dk['oppreq:' + bReq.id]);
  assert.ok(vals.some(([k]) => k.startsWith('user:')), 'other keys untouched');

  // ---- privacy: no poker data, no secrets ----
  const txt = JSON.stringify([await ok('oppList', {}, Cc), await ok('oppMine', {}, A), await ok('oppGet', { id: a1.id }, Cc), await ok('oppList', { all: true }, O), await ok('oppReports', {}, O)]);
  for(const k of ['pin', 'salt', 'hash', 'ip', 'device', 'seen', 'household', 'token', 'role', 'tier', 'score', 'pts', 'points', 'wins', 'cashes', 'hands', 'rating', 'shop', 'balance', 'from_uid', 'to', 'by_uid'])
    assert.ok(!new RegExp('"' + k + '"').test(txt), 'no field: ' + k);
  for(const x of JSON.parse(txt)[0].items) assert.ok(!('uid' in x), 'listings do not carry the poster id');
  assert.ok(!/"(from|by)":"u[0-9a-f]{12}"/.test(txt), 'sender and reporter ids are never sent, only club names');

  console.log('opportunity club test passed'); srv.kill(); try{ fs.unlinkSync(DATA); }catch(x){} process.exit(0);
})().catch(e => { console.error(e); srv.kill(); try{ fs.unlinkSync(DATA); }catch(x){} process.exit(1); });
