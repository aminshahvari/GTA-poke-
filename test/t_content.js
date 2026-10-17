// Contact details in club text (server/content.js): a probe matrix of strings that must be blocked (web addresses in
// any form, emails, phone numbers) or allowed (prices, years, dates, times, ranges, postal codes, ordinary prose), then
// the rule on every member-written field of Opportunity listings and Business Club profiles, on create and on edit,
// and who can see club data at all: signed-in members only, closed clubs refused, every answer noindex.
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const content = require('../server/content');

// ---- the probe matrix: [text, expected kind or null] ----
const L = 'link', E = 'email', P = 'phone', S = 'social', _ = null;
const MATRIX = [
  // web addresses
  ['https://example.com', L], ['see http://x.io/abc', L], ['HTTP://X.CO', L], ['www.example.org', L], ['WWW.EXAMPLE.CA', L],
  ['go to evil.com now', L], ['bit.ly/abc', L], ['t.co/xyz', L], ['Visit Example.COM today', L], ['example.co.uk', L],
  ['joe.plumbing', L], ['mysite.toronto', L], ['bakery.shop', L], ['example dot com', L], ['example DOT ca', L],
  ['example [.] com', L], ['example[.]com', L], ['example(.)net', L], ['example (dot) org', L], ['example{dot}io', L],
  ['example . com', L], ['example .com', L], ['ＥＸＡＭＰＬＥ．ＣＯＭ', L], ['example。com', L], ['192.168.0.1', L],
  ['mailto:jo', L], ['tel:4165550100', L], ['whatsapp:+14165550100', L], ['ftp://files.example.net', L], ['xn--bcher-kva.example', L],
  ['example dot co dot uk', L], ['my site is rivera-plumbing.net.', L],
  // email addresses
  ['jo@example.com', E], ['mail alex@example.com', E], ['JO@EXAMPLE.CA', E], ['jo (at) example.com', E], ['jo[at]example[dot]com', E],
  ['jo at example dot com', E], ['jordan at maplemain.ca', E], ['jo @ example . com', E], ['jo＠example．com', E], ['jo{at}mail.example', E],
  ['first.last+tag@sub.example.org', E],
  // phone numbers
  ['416-555-0100', P], ['(416) 555-0100', P], ['416.555.0100', P], ['416 555 0100', P], ['4165550100', P], ['+1 416 555 0100', P],
  ['1-800-555-0199', P], ['+44 20 7946 0958', P], ['+33 1 23 45 67 89', P], ['555-0100', P], ['call 416/555/0100', P],
  ['4 1 6 5 5 5 0 1 0 0', P], ['4-1-6-5-5-5-0-1-0-0', P], ['four one six five five five zero one zero zero', P], ['416 five five five 0100', P],
  ['𝟒𝟏𝟔 𝟓𝟓𝟓 𝟎𝟏𝟎𝟎', P], ['④①⑥-⑤⑤⑤-⓪①⓪⓪', P], ['020 7946 0958', P], ['+61 2 9876 5432', P], ['text me at 416–555–0100', P],
  ['(416)555-0100 ext 5', P], ['416 555 2019', P], ['612 345 678', P], ['06 12 34 56 78', P],
  // social handles, profiles and app contact IDs (owner decision, R2-F1 revise); "@yourbusiness on the gram" moved here
  ['@yourbusiness on the gram', S], ['@riverapl', S], ['Follow @rivera_pl', S], ['IG: rivera_pl', S], ['insta: rivera', S], ['Insta @rivera', S],
  ['DM me on insta', S], ['dm me on TikTok', S], ['snap: jojo99', S], ['telegram @jojo', S], ['Telegram: @jojo', S], ['kik: jojo', S],
  ['t.me/jojo', S], ['wa.me/14165550100', S], ['instagram.com/rivera', S], ['facebook.com/rivera', S], ['fb.com/rivera', S], ['tiktok.com/@rivera', S],
  ['x.com/rivera', S], ['twitter.com/rivera', S], ['linkedin.com/in/rivera', S], ['youtube.com/@rivera', S], ['youtu.be/abc', S], ['snapchat.com/add/jo', S],
  ['threads.net/@jo', S], ['pinterest.com/jo', S], ['discord.gg/abc', S], ['WhatsApp me', S], ['add me on Snapchat: jo', S], ['Discord: jo#1234', S],
  ['jo#1234', S], ['WeChat ID: jo_88', S], ['Signal: jojo', S], ['Line ID: jojo', S], ['message us on Facebook', S], ['my snap is jojo99', S],
  ['text me on whatsapp', S], ['Insta-> rivera', S], ['IG: rivera.', S],
  // bypass attempts: full-width @, "at sign", (at), spaced and dotted letters, zero-width characters, mixed case, "dot com"
  ['＠rivera', S], ['at sign rivera', S], ['(at)rivera', S], ['i n s t a: rivera', S], ['I.G: rivera', S], ['iG : RiveraPL', S],
  ['In\u200bsta: rivera', S], ['@ri\u200bvera', S], ['DM me on i n s t a', S], ['Whats App me', S], ['W-h-a-t-s-A-p-p me', S], ['instagram dot com/rivera', S],
  ['INSTAGRAM.COM/RIVERA', S], ['ＩＧ： rivera_pl', S], ['t [.] me/jojo', S],
  ['Budget $1,500', _], ['Budget $1500000', _], ['$ 2 500 000 condo', _], ['1 500 000 views', _], ['2.500.000', _], ['12 500 000 budget', _], ['100-200-300 pieces', _], ['Around 1500000 dollars', _],
  ['Since 2019', _], ['2019-2023', _], ['2019 2020 2021', _], ['2026-10-17', _], ['17/10/2026', _], ['10.17.2026', _], ['Oct 17, 2026', _],
  ['9:00-17:00', _], ['9.00-17.00', _], ['0900-1700', _], ['9am-5pm weekdays', _], ['open 24/7', _], ['25% off', _], ['10%-20%', _],
  ['10 years experience', _], ['2-3 weeks', _], ['1500-2000 sq ft', _], ['10000 - 20000', _], ['Model 3 2019 5000 km', _],
  ['M5V 2T6', _], ['Toronto, ON M5H 2M9', _], ['90210', _], ['90210-1234', _], ['Unit 12, 45 King St E', _],
  ['Node.js, Vue.js and ASP.NET', _], ['e.g. U.S. clients, i.e. retail', _], ['a.m. to p.m.', _], ['Ph.D. in chemistry', _], ['resume.pdf attached', _],
  ['I fixed it this week.Thanks to all', _], ['Done.It works now', _], ['the dot com era', _], ['polka dot dress', _], ['co-op housing', _],
  ['Meet at noon', _], ['Find us at the market', _], ['good at Excel', _],  ['Sizes 8, 10 and 12', _],
  ['We post recipes on Instagram', _], ['Social media marketing', _], ['Facebook ads management', _], ['TikTok content strategy', _],
  ['@ 5pm', _], ['@5pm', _], ['meet @ the cafe', _], ['C# / F# developer', _], ['#1 bakery', _], ['#torontofood', _], ['Follow us on Instagram', _],
  ['Instagram: 10k followers', _], ['Facebook: ads and campaigns', _], ['LinkedIn: profile rewrites', _], ['line cook needed', _], ['Signal booster install', _],
  ['a snap to install', _], ['ig and fb ads', _], ['Telegram bot development', _], ['WhatsApp Business setup', _], ['YouTube channel editing', _],
  ['Pinterest boards for brands', _], ['LinkedIn profile writing', _], ['discord moderation tips', _], ['Text me through the club', _], ['Rivera & Sons', _],
  ['Plan B is fine', _], ['Vitamin D and B12', _],
  ['3.5 stars', _], ['v2.0 release', _], ['Room for 6-8 people', _], ['Call me after 6', _], ['1-on-1 coaching', _], ['Need 2 3D printers', _]
];
let fails = 0;
for(const [s, want] of MATRIX){
  const got = content.find(s);
  if(got !== want){ fails++; console.error(`matrix: ${JSON.stringify(s)} expected ${want} got ${got}`); }
}
assert.strictEqual(fails, 0, fails + ' probe(s) failed');
assert.ok(MATRIX.length >= 60, 'at least 60 probes');
const counts = MATRIX.reduce((c, [, k]) => (c[k || 'allowed'] = (c[k || 'allowed'] || 0) + 1, c), {});
// messages: friendly, say what to remove and where it goes
assert.match(content.message('phone', 'Details', 'X.'), /^Please remove the phone number from details\. X\./);
assert.match(content.message('email', 'Title', 'X.'), /email address from title/);
assert.match(content.message('link', 'Area', 'X.'), /web address from area.*space after the period/);
// links only (share note): emails and phones pass, links do not
assert.strictEqual(content.find('jo@example.com, 416-555-0100', ['link']), null);
assert.strictEqual(content.find('see example.com', ['link']), 'link');

// the read-only audit of records saved before the rule: finds them, changes nothing
const AUD = require('os').tmpdir() + '/t_content_audit_' + process.pid + '.json';
const kvBefore = JSON.stringify({ 'opp:o1': { title: 'Call 416-555-0100', details: 'ok', area: '' }, 'biz:u1': { name: 'Rivera', services: 'see rivera.example.com' }, 'oppreq:o2': { message: 'hi' }, 'user:u1': { name: 'jo@example.com' } });
fs.writeFileSync(AUD, kvBefore);
const audit = require('child_process').execFileSync('node', [__dirname + '/../scripts/content-audit.js', AUD], { encoding: 'utf8' });
assert.ok(audit.includes('opp:o1\ttitle\tphone') && audit.includes('biz:u1\tservices\tlink') && !audit.includes('user:u1') && /^2 field\(s\)/m.test(audit), audit);
assert.strictEqual(fs.readFileSync(AUD, 'utf8'), kvBefore, 'audit changes nothing'); fs.unlinkSync(AUD);

// ---- the rule on the server, and who can see club data ----
const DATA = require('os').tmpdir() + '/t_content_' + process.pid + '.json';
const freePort = () => new Promise(r => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let srv, BASE;
async function call(p, body, tok){
  const r = await fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body || {}) });
  return { status: r.status, body: await r.json().catch(() => ({})), headers: r.headers };
}
const ok = async (p, body, tok) => { const r = await call(p, body, tok); assert.strictEqual(r.status, 200, `${p} should succeed: ${JSON.stringify(r.body)}`); return r.body; };
const err = async (p, body, tok, code = 400) => { const r = await call(p, body, tok); assert.strictEqual(r.status, code, `${p} ${JSON.stringify(body).slice(0, 90)} should be ${code}, got ${r.status} ${JSON.stringify(r.body)}`); return r.body.error; };
const NOI = 'noindex, nofollow, noarchive';
function wsDo(tok, msgs){
  return new Promise((res, rej) => {
    const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws'); let me = null;
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: tok })));
    ws.on('message', m => { m = JSON.parse(m); if(m.t === 'club' && !me){ me = m.club.me.id; for(const x of msgs) ws.send(JSON.stringify(x)); setTimeout(() => { ws.close(); res(me); }, msgs.length ? 400 : 0); } if(m.t === 'auth' && !m.ok) rej(new Error('auth')); });
    ws.on('error', rej);
  });
}
const SAMPLES = { link: 'see example dot com', email: 'write jo (at) example.com', phone: 'call 416 555 0100', social: 'IG: rivera_pl' };
const WORD = { link: /web address/, email: /email address/, phone: /phone number/, social: /social media handle or profile/ };

(async () => {
  const PORT = await freePort(); BASE = 'http://localhost:' + PORT;
  srv = spawn('node', ['server/index.js'], { cwd: __dirname + '/..', env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '', STAGING: '', CLUBS_DEFAULT: 'on' }, stdio: 'ignore' });
  for(let i = 0; i < 40; i++){ try{ if((await fetch(BASE + '/healthz')).ok) break; }catch(e){} await sleep(150); }
  const O = (await ok('setup', { code: 'secret', name: 'Director', pin: '1234', agree: true })).token;
  const join = async name => { const { code } = await ok('invite', {}, O); return (await ok('redeem', { code, name, pin: '1111', agree: true })).token; };
  const A = await join('Alex'), B = await join('Bea');
  const idA = await wsDo(A, []);

  // ---- Opportunity listings: title, details and area, on create ----
  const listing = (over = {}) => ({ type: 'need', title: 'Need a plumber', details: 'Kitchen sink leaks.', category: 'trades', area: 'Toronto', ...over });
  const labels = { title: /from title\./, details: /from details\./, area: /from area\./ };
  for(const f of ['title', 'details', 'area']) for(const k of Object.keys(SAMPLES)){
    const m = await err('oppSave', listing({ [f]: 'Plumber ' + SAMPLES[k] }), A);
    assert.match(m, WORD[k], `${f}/${k} says which detail`); assert.match(m, labels[f]); assert.match(m, /private request/, 'and how members reach you instead');
  }
  // ordinary numbers are fine
  const a1 = (await ok('oppSave', listing({ title: 'Need a deck built by June 2027', details: 'Budget $1,500 to $2,000. 2-3 weeks of work, 10 years experience preferred.\nAvailable 9:00-17:00, 2019-2023 permits on file. 1500-2000 sq ft.', area: 'Toronto M5V 2T6' }), A)).item;
  // ---- and the same on edit; a refused edit changes nothing ----
  for(const f of ['title', 'details', 'area']) for(const k of Object.keys(SAMPLES))
    assert.match(await err('oppSave', listing({ id: a1.id, [f]: 'Deck ' + SAMPLES[k] }), A), WORD[k], `edit ${f}/${k}`);
  const still = (await ok('oppGet', { id: a1.id }, B)).item;
  assert.strictEqual(still.title, a1.title); assert.strictEqual(still.details, a1.details); assert.strictEqual(still.area, a1.area);
  // ---- the private request message: no contact details either; the share note carries a phone, never a link ----
  assert.match(await err('oppRequest', { id: a1.id, message: 'Hi! Text me on 647 555 0199' }, B), /phone number from message/);
  assert.match(await err('oppRequest', { id: a1.id, message: 'Hi! bea@example.com' }, B), /email address from message/);
  assert.match(await err('oppRequest', { id: a1.id, message: 'Hi! DM me on insta' }, B), /social media handle or profile from message/);
  const rq = (await ok('oppRequest', { id: a1.id, message: 'Hi! I built two decks last year, about 300 sq ft each.' }, B)).request;
  assert.match(await err('oppReply', { id: rq.id, action: 'share', phone: '416-555-0199', note: 'Photos at example.com' }, A), /web address from note/);
  const shared = (await ok('oppReply', { id: rq.id, action: 'share', phone: '416-555-0199', note: 'Or my office 416-555-0101 after 6.' }, A)).request;
  assert.strictEqual(shared.shared.note, 'Or my office 416-555-0101 after 6.', 'the share note is part of the consent flow');
  // reports go to the director only and may quote the listing
  await ok('oppReport', { id: a1.id, reason: 'spam', note: 'They wrote example.com and 416-555-0100 before editing' }, B);

  // ---- Business Club: every free-text field; the contact fields stay as they are ----
  const biz = (over = {}) => ({ name: 'Rivera Plumbing', category: 'trades', description: 'Leaks fixed fast since 2009.', services: 'Repairs, water heaters (24/7)', area: 'Toronto & GTA',
    fullName: 'Alex Rivera', jobTitle: 'Owner', categoryOther: '', website: 'riverapl.example.com', instagram: '@rivera_pl', email: 'alex@example.com', phone: '416-555-0100',
    address: 'Suite 200, 45 King St E, Toronto ON M5C 1G8', show: { website: true, email: true }, ...over });
  const bl = { name: 'business name', fullName: 'full name', jobTitle: 'job title', categoryOther: 'industry', description: 'description', services: 'services', area: 'service area' };
  for(const f of Object.keys(bl)) for(const k of Object.keys(SAMPLES)){
    const over = { [f]: 'Pro ' + SAMPLES[k] }; if(f === 'categoryOther') over.category = 'other';
    const m = await err('bizSave', biz(over), A);
    assert.match(m, WORD[k], `biz ${f}/${k}`); assert.ok(m.includes('from ' + bl[f] + '.'), m); assert.match(m, /Contact details/);
  }
  assert.strictEqual((await ok('bizMine', {}, A)).mine, null, 'nothing saved by a refused save');
  await ok('bizSave', biz({ description: 'Licensed since 2009. Jobs from $250; 10% off for members. Open 8:00-18:00.', services: 'Water heaters (40-60 gallon), 2-3 day renos' }), A);
  await ok('bizPublish', { on: true }, A);
  const seen = (await ok('bizGet', { uid: idA }, B)).business;
  assert.deepStrictEqual(Object.keys(seen.contacts).sort(), ['email', 'website'], 'only the contact details switched on');
  assert.ok(!JSON.stringify(seen).includes('416-555-0100') && !JSON.stringify(seen).includes('King St') && !JSON.stringify(seen).includes('rivera_pl'), 'phone, address and Instagram stay private');
  assert.strictEqual((await ok('bizMine', {}, A)).mine.instagram, 'rivera_pl', 'the dedicated Instagram field still takes a handle');
  // a refused edit leaves the saved profile alone
  await err('bizSave', biz({ services: 'Call 416 555 0100' }), A);
  assert.strictEqual((await ok('bizMine', {}, A)).mine.services, 'Water heaters (40-60 gallon), 2-3 day renos');
  // switched on, the Instagram handle reaches members, from its own field only
  await ok('bizSave', biz({ show: { website: true, email: true, instagram: true } }), A);
  assert.deepStrictEqual((await ok('bizGet', { uid: idA }, B)).business.contacts.instagram, { handle: 'rivera_pl', url: 'https://instagram.com/rivera_pl' });

  // ---- visibility: signed-in members only, every answer noindex ----
  const EPS = ['bizList', 'bizGet', 'bizFeed', 'bizMine', 'oppList', 'oppGet', 'oppMine', 'oppBadge'];
  for(const p of EPS){
    for(const tok of [null, 'not-a-token']){
      const r = await call(p, { uid: idA, id: a1.id }, tok);
      assert.strictEqual(r.status, 401, p + ' signed out'); assert.strictEqual(r.headers.get('x-robots-tag'), NOI, p + ' 401 noindex');
      assert.ok(!JSON.stringify(r.body).includes('Rivera') && !JSON.stringify(r.body).includes('deck'), p + ' leaks nothing');
    }
    const r = await call(p, { uid: idA, id: a1.id }, B);
    assert.strictEqual(r.status, 200, p + ' member'); assert.strictEqual(r.headers.get('x-robots-tag'), NOI, p + ' 200 noindex');
  }
  const logo = await fetch(BASE + '/bizlogo/' + idA); assert.strictEqual(logo.status, 401); assert.strictEqual(logo.headers.get('x-robots-tag'), NOI);
  // clubs closed by the owner: members are refused (403, noindex), the owner still sees them, and nothing is lost
  await wsDo(O, [{ t: 'clubs', on: false }]);
  for(const p of EPS){
    const r = await call(p, { uid: idA, id: a1.id }, B);
    assert.strictEqual(r.status, 403, p + ' closed'); assert.strictEqual(r.headers.get('x-robots-tag'), NOI, p + ' 403 noindex');
    assert.ok(!JSON.stringify(r.body).includes('Rivera'), p + ' closed leaks nothing');
  }
  assert.strictEqual((await fetch(BASE + '/bizlogo/' + idA, { headers: { authorization: 'Bearer ' + B } })).status, 404, 'logo closed');
  assert.strictEqual((await ok('bizGet', { uid: idA }, O)).business.name, 'Rivera Plumbing', 'the owner can still look');
  await wsDo(O, [{ t: 'clubs', on: true }]);
  assert.strictEqual((await ok('oppGet', { id: a1.id }, B)).item.id, a1.id, 'open again, data intact');

  console.log(`content rule test passed (${MATRIX.length} probes: ${counts.link} links, ${counts.email} emails, ${counts.social} social, ${counts.phone} phones, ${counts.allowed} allowed; server fields and visibility)`);
  srv.kill(); try{ fs.unlinkSync(DATA); }catch(x){} process.exit(0);
})().catch(e => { console.error(e); if(srv) srv.kill(); try{ fs.unlinkSync(DATA); }catch(x){} process.exit(1); });
