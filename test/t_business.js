// Business Club: members-only directory. Privacy (drafts, hidden contact fields), authorization, validation,
// search, spotlight, moderation, deletion, removed members and the Home feed.
const assert = require('assert');
const fs = require('fs');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const PORT = 4100 + Math.floor(Math.random() * 50), BASE = 'http://localhost:' + PORT;
const DATA = require('os').tmpdir() + '/t_biz_' + process.pid + '.json';
const srv = spawn('node', ['server/index.js'], { cwd: __dirname + '/..', env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '', STAGING: '', CLUBS_DEFAULT: 'on' }, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function call(p, body, tok){
  const r = await fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body || {}) });
  return { status: r.status, body: await r.json().catch(() => ({})), headers: r.headers };
}
const ok = async (p, body, tok) => { const r = await call(p, body, tok); assert.strictEqual(r.status, 200, `${p} should succeed: ${JSON.stringify(r.body)}`); return r.body; };
const status = async (p, body, tok) => (await call(p, body, tok)).status;
const logo = tok => uid => fetch(BASE + '/bizlogo/' + uid, { headers: tok ? { authorization: 'Bearer ' + tok } : {} });
// a tiny valid JPEG-shaped buffer (start and end markers), like the avatar test uses
const JPG = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7), Buffer.from([0xff, 0xd9])]).toString('base64');
function meId(tok){
  return new Promise((res, rej) => {
    const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws');
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: tok })));
    ws.on('message', m => { m = JSON.parse(m); if(m.t === 'club'){ ws.close(); res(m.club.me.id); } if(m.t === 'auth' && !m.ok) rej(new Error('auth')); });
    ws.on('error', rej);
  });
}
const base = (over = {}) => ({ name: 'Rivera Plumbing', category: 'trades', description: 'Leaks fixed fast.', services: 'Repairs, water heaters', area: 'Toronto', fullName: 'Alex Rivera', jobTitle: 'Owner',
  website: 'riverapl.example.com', instagram: '@rivera_pl', email: 'alex@example.com', phone: '416-555-0100', address: '1 Main St', referrals: true,
  show: { website: true, email: true, phone: false, instagram: false, address: false, fullName: false }, ...over });

(async () => {
  for(let i = 0; i < 40; i++){ try{ if((await fetch(BASE + '/healthz')).ok) break; }catch(e){} await sleep(150); }
  const O = (await ok('setup', { code: 'secret', name: 'Director', pin: '1234', agree: true })).token;
  const join = async name => { const { code } = await ok('invite', {}, O); return (await ok('redeem', { code, name, pin: '1111', agree: true })).token; };
  const A = await join('Alex'), B = await join('Bea'), Cc = await join('Cam'), D = await join('Dee');
  const [idO, idA, idB, idC] = [await meId(O), await meId(A), await meId(B), await meId(Cc)];

  // signed-out and bad tokens get 401, everywhere
  for(const p of ['bizList', 'bizFeed', 'bizMine', 'bizGet', 'bizSave', 'bizPublish', 'bizDelete', 'bizSpotlight', 'bizModerate', 'bizIntro'])
    assert.strictEqual(await status(p, { uid: idA }), 401, p + ' without a token');
  assert.strictEqual(await status('bizList', {}, 'not-a-token'), 401, 'bad token');
  assert.strictEqual((await logo(null)(idA)).status, 401, 'logo needs a token');
  const r0 = await call('bizList', {}, A);
  assert.strictEqual(r0.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive', 'directory responses are noindex');

  // nothing exists until a member creates it; nothing is pre-filled from the member account
  assert.strictEqual((await ok('bizMine', {}, A)).mine, null, 'no profile by default');
  assert.strictEqual((await ok('bizFeed', {}, A)).mine, 'none');

  // a saved but unpublished profile is invisible to everyone else
  const saved = await ok('bizSave', { ...base(), logo: { kind: 'photo', data: JPG } }, A);
  assert.strictEqual(saved.mine.published, false, 'saving does not publish');
  assert.strictEqual(saved.mine.website, 'https://riverapl.example.com/', 'website normalized to https');
  assert.strictEqual(saved.mine.instagram, 'rivera_pl', 'instagram stored as a handle');
  assert.strictEqual((await ok('bizList', {}, B)).items.length, 0, 'draft not in directory');
  assert.strictEqual(await status('bizGet', { uid: idA }, B), 404, 'draft detail hidden');
  assert.strictEqual((await ok('bizFeed', {}, B)).items.length, 0, 'draft not on Home');
  assert.strictEqual((await logo(B)(idA)).status, 404, 'draft logo hidden');
  assert.strictEqual((await logo(A)(idA)).status, 200, 'owner sees own draft logo');
  assert.ok(!JSON.stringify(await ok('bizList', {}, O)).includes('Rivera'), 'not even the director sees a draft');

  // publishing makes it visible, with only the contact fields the member switched on
  await ok('bizPublish', { on: true }, A);
  const seen = await ok('bizGet', { uid: idA }, B), b = seen.business;
  assert.strictEqual(b.name, 'Rivera Plumbing'); assert.strictEqual(b.member, 'Alex');
  assert.strictEqual(b.contacts.website, 'https://riverapl.example.com/'); assert.strictEqual(b.contacts.email, 'alex@example.com');
  assert.ok(!('phone' in b.contacts) && !('instagram' in b.contacts) && !('address' in b.contacts), 'hidden contact fields are not sent');
  assert.ok(!('fullName' in b) && !('jobTitle' in b), 'full name hidden unless switched on');
  const listTxt = JSON.stringify(await ok('bizList', {}, B)) + JSON.stringify(await ok('bizFeed', {}, B));
  for(const secret of ['416-555-0100', 'rivera_pl', '1 Main St', 'Alex Rivera', '"pin"', '"salt"', '"seen"', '"household"']) assert.ok(!listTxt.includes(secret), 'never sent to others: ' + secret);
  { const r = await logo(B)(idA); assert.strictEqual(r.status, 200, 'published logo visible to members');
    assert.strictEqual(r.headers.get('cache-control'), 'private, max-age=86400', 'logo kept by the browser for a day (URL carries logoV)');
    assert.ok(/authorization/i.test(r.headers.get('vary') || ''), 'logo cache keyed by token');
    assert.strictEqual((await fetch(BASE + '/bizlogo/' + idA + '?v=x')).status, 401, 'versioned URL still needs a token'); }
  const ig = await ok('bizSave', base({ show: { instagram: true, phone: true, fullName: true } }), A);
  const b2 = (await ok('bizGet', { uid: idA }, B)).business;
  assert.deepStrictEqual(b2.contacts.instagram, { handle: 'rivera_pl', url: 'https://instagram.com/rivera_pl' });
  assert.deepStrictEqual(b2.contacts.phone, { text: '416-555-0100', tel: '4165550100' });
  assert.ok(!b2.contacts.website && !b2.contacts.email, 'switched-off fields disappear again');
  assert.strictEqual(b2.fullName, 'Alex Rivera'); assert.strictEqual(ig.mine.published, true, 'editing keeps it published');
  assert.ok(b2.logoV, 'saving without a logo field keeps the logo');

  // a member can only ever change their own profile
  await ok('bizSave', base({ uid: idA, name: 'Bea Bakes', category: 'food', description: 'Sourdough', services: 'Cakes', show: {} }), B);
  assert.strictEqual((await ok('bizGet', { uid: idA }, B)).business.name, 'Rivera Plumbing', "B's save did not touch A's profile");
  assert.strictEqual((await ok('bizMine', {}, B)).mine.name, 'Bea Bakes', 'it created B\'s own draft instead');
  await ok('bizPublish', { on: true, uid: idA }, B);
  assert.strictEqual(await status('bizModerate', { uid: idA, hidden: true }, B), 403, 'members cannot moderate');
  assert.strictEqual(await status('bizSpotlight', { uid: idA }, B), 403, 'members cannot set the spotlight');

  // validation
  const bad = async (over, why) => assert.strictEqual(await status('bizSave', base(over), Cc), 400, why);
  for(const w of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:x', 'http://localhost', 'https://user:pw@example.com', 'https://example.com:8080', 'ftp://example.com', 'http://127.0.0.1', 'https://exa mple.com', 'mailto:a@b.co'])
    await bad({ website: w }, 'website rejected: ' + w);
  for(const x of ['https://evil.example.com/x', 'javascript:alert(1)', 'a b', '<script>', '@' + 'x'.repeat(31)]) await bad({ instagram: x }, 'instagram rejected: ' + x);
  for(const x of ['not-an-email', 'a@b', 'a@@b.com', '<a@b.com>', 'a@b.com?subject=x']) await bad({ email: x }, 'email rejected: ' + x);
  for(const x of ['call me', '123', '+1 (416) 555-0100 ext 5', '1'.repeat(16)]) await bad({ phone: x }, 'phone rejected: ' + x);
  await bad({ name: 'x'.repeat(61) }, 'name too long'); await bad({ name: 'x' }, 'name too short');
  await bad({ description: 'x'.repeat(401) }, 'description too long'); await bad({ services: 'x'.repeat(301) }, 'services too long');
  await bad({ area: 'x'.repeat(61) }, 'area too long'); await bad({ address: 'x'.repeat(161) }, 'address too long');
  await bad({ category: 'casino' }, 'unknown category'); await bad({ name: { $ne: 1 } }, 'non-text field');
  await bad({ logo: { kind: 'photo', data: 'data:image/png;base64,iVBORw0KGgo=' } }, 'png logo rejected');
  await bad({ logo: { kind: 'photo', data: 'data:image/jpeg;base64,' + Buffer.from('<svg onload=alert(1)>').toString('base64') } }, 'fake jpeg rejected');
  await bad({ logo: { kind: 'photo', data: 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(50000, 1), Buffer.from([0xff, 0xd9])]).toString('base64') } }, 'oversized logo rejected');
  await bad({ logo: 'https://example.com/x.jpg' }, 'logo must be an uploaded image');
  assert.strictEqual((await ok('bizMine', {}, Cc)).mine, null, 'nothing saved by rejected attempts');
  const clean = await ok('bizSave', base({ name: 'Cam\u0000 \u202eCoaching\u200b', services: 'Goal setting', category: 'other', categoryOther: 'Life coaching', description: 'Line one\r\n\r\n\r\n\r\nLine two\u0007', website: 'HTTPS://Cam.Example.org/path?q=1', show: { website: true } }), Cc);
  assert.strictEqual(clean.mine.name, 'Cam Coaching', 'control and direction characters stripped');
  assert.strictEqual(clean.mine.description, 'Line one\n\nLine two', 'blank lines collapsed, control chars gone');
  assert.strictEqual(clean.mine.categoryLabel, 'Life coaching');
  await sleep(15);
  await ok('bizPublish', { on: true }, Cc);

  // search and category filter (server side; the app also filters on the phone)
  const names = r => r.items.map(x => x.name).sort();
  assert.deepStrictEqual(names(await ok('bizList', {}, D)), ['Bea Bakes', 'Cam Coaching', 'Rivera Plumbing']);
  assert.deepStrictEqual(names(await ok('bizList', { q: 'plumb' }, D)), ['Rivera Plumbing'], 'search by name');
  assert.deepStrictEqual(names(await ok('bizList', { q: 'water heaters' }, D)), ['Rivera Plumbing'], 'search by service');
  assert.deepStrictEqual(names(await ok('bizList', { q: 'life coaching' }, D)), ['Cam Coaching'], 'search by industry');
  assert.deepStrictEqual(names(await ok('bizList', { category: 'food' }, D)), ['Bea Bakes'], 'category filter');
  assert.deepStrictEqual(names(await ok('bizList', { category: 'food', q: 'plumb' }, D)), [], 'filters combine');

  // Home feed: only published profiles, only the light fields, newest first; "New to the Club" ordered by first publish
  const feed = await ok('bizFeed', {}, D);
  assert.strictEqual(feed.total, 3);
  for(const it of [...feed.items, ...feed.recent]) assert.deepStrictEqual(Object.keys(it).sort(), ['categoryLabel', 'logoV', 'member', 'name', 'publishedAt', 'uid'], 'feed sends only permitted fields');
  assert.deepStrictEqual(feed.recent.map(x => x.name), ['Cam Coaching', 'Bea Bakes', 'Rivera Plumbing'], 'newest first');
  assert.deepStrictEqual(feed.items.map(x => x.name), ['Cam Coaching', 'Bea Bakes', 'Rivera Plumbing']);
  await ok('bizPublish', { on: false }, B); await ok('bizPublish', { on: true }, B);
  assert.strictEqual((await ok('bizFeed', {}, D)).recent[0].name, 'Cam Coaching', 're-publishing keeps the first publish date');
  // the intro prompt can be dismissed for good
  assert.strictEqual((await ok('bizFeed', {}, D)).introDismissed, false);
  await ok('bizIntro', { dismiss: true }, D);
  assert.strictEqual((await ok('bizFeed', {}, D)).introDismissed, true);

  // spotlight: director only, one at a time, clears when the business is unpublished
  await ok('bizSpotlight', { uid: idA }, O);
  assert.strictEqual((await ok('bizList', {}, D)).spotlight.uid, idA);
  assert.strictEqual((await ok('bizFeed', {}, D)).items[0].uid, idA, 'spotlight leads the Home carousel');
  await ok('bizSpotlight', { uid: idC }, O);
  assert.strictEqual((await ok('bizList', {}, D)).spotlight.uid, idC, 'only one at a time');
  await ok('bizPublish', { on: false }, Cc);
  assert.strictEqual((await ok('bizList', {}, D)).spotlight, null, 'unpublishing clears the spotlight');
  await ok('bizPublish', { on: true }, Cc);
  assert.strictEqual((await ok('bizList', {}, D)).spotlight, null, 'and it does not come back by itself');
  assert.strictEqual(await status('bizSpotlight', { uid: idO }, O), 400, 'cannot spotlight a business that does not exist');
  await ok('bizSpotlight', { uid: idA }, O); await ok('bizSpotlight', { uid: null }, O);
  assert.strictEqual((await ok('bizList', {}, D)).spotlight, null, 'director can clear it');

  // moderation: the director hides a profile; it leaves the directory but its owner keeps it
  await ok('bizSpotlight', { uid: idB }, O);
  await ok('bizModerate', { uid: idB, hidden: true }, O);
  assert.deepStrictEqual(names(await ok('bizList', {}, D)), ['Cam Coaching', 'Rivera Plumbing'], 'hidden profile gone from directory');
  assert.strictEqual((await ok('bizList', {}, D)).spotlight, null, 'hiding clears the spotlight');
  assert.strictEqual(await status('bizGet', { uid: idB }, D), 404);
  assert.deepStrictEqual((await ok('bizList', {}, O)).hidden.map(x => x.name), ['Bea Bakes'], 'director sees what they hid');
  assert.ok(!('hidden' in await ok('bizList', {}, D)), 'members do not get the hidden list');
  assert.strictEqual((await ok('bizMine', {}, B)).mine.modHidden, true, 'owner is told it is hidden');
  await ok('bizModerate', { uid: idB, hidden: false }, O);
  assert.strictEqual((await ok('bizList', {}, D)).items.length, 3, 'shown again');

  // delete removes everything, logo too
  await ok('bizSave', base({ name: 'Cam Coaching', category: 'education', logo: { kind: 'photo', data: JPG } }), Cc);
  assert.strictEqual((await logo(D)(idC)).status, 200);
  await ok('bizSpotlight', { uid: idC }, O);
  await ok('bizDelete', {}, Cc);
  assert.strictEqual(await status('bizGet', { uid: idC }, D), 404, 'deleted profile gone');
  assert.strictEqual((await logo(D)(idC)).status, 404, 'deleted logo gone');
  assert.strictEqual((await ok('bizMine', {}, Cc)).mine, null);
  assert.strictEqual((await ok('bizList', {}, D)).spotlight, null, 'deleting clears the spotlight');

  // a removed member: their business disappears, the spotlight clears and their token stops working
  await ok('bizSpotlight', { uid: idA }, O);
  await new Promise((res, rej) => {
    const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws');
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: O })));
    ws.on('message', m => { m = JSON.parse(m); if(m.t === 'auth' && m.ok){ ws.send(JSON.stringify({ t: 'remove', uid: idA })); setTimeout(() => { ws.close(); res(); }, 300); } });
    ws.on('error', rej);
  });
  assert.deepStrictEqual(names(await ok('bizList', {}, D)), ['Bea Bakes'], "removed member's business is gone");
  assert.strictEqual((await ok('bizList', {}, D)).spotlight, null, 'and so is the spotlight');
  assert.strictEqual(await status('bizGet', { uid: idA }, D), 404);
  assert.strictEqual((await logo(D)(idA)).status, 404);
  assert.strictEqual(await status('bizMine', {}, A), 401, 'removed member is signed out of the directory');
  assert.strictEqual(await status('bizList', {}, A), 401);
  await sleep(500);
  const disk = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  assert.ok(!disk['biz:' + idA] && !disk['bizlogo:' + idA], 'removed member\'s business data deleted from storage');
  assert.ok(!disk.bizSpotlight || disk.bizSpotlight.uid !== idA);
  assert.ok(Object.keys(disk).some(k => k.startsWith('user:')), 'existing keys untouched');

  // saves are rate limited per member
  let codes = [];
  for(let i = 0; i < 21; i++) codes.push(await status('bizSave', base({ name: 'Dee Designs ' + i, show: {} }), D));
  assert.ok(codes.slice(0, 20).every(c => c === 200), 'first 20 saves fine');
  assert.strictEqual(codes[20], 429, '21st save in 10 minutes is refused');
  assert.strictEqual(await status('bizSave', base({ show: {} }), B), 200, 'other members are not affected');

  // no poker data anywhere in Business Club responses
  const all = JSON.stringify(await ok('bizList', {}, B)) + JSON.stringify(await ok('bizGet', { uid: idB }, D));
  for(const k of ['tier', 'score', 'pts', 'wins', 'cashes', 'hands', 'rating', 'shop', 'balance']) assert.ok(!new RegExp('"' + k + '"').test(all), 'no poker field: ' + k);

  console.log('business club test passed'); srv.kill(); try{ fs.unlinkSync(DATA); }catch(e){} process.exit(0);
})().catch(e => { console.error(e); srv.kill(); try{ fs.unlinkSync(DATA); }catch(x){} process.exit(1); });
