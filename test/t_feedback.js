// Feedback Hub: members send Bug / Idea / UX notes with a small fixed context and an optional screenshot; only the owner
// can list, filter, change status, delete and see screenshots. Validation, limits, stored-XSS inertness, privacy (no
// secrets or gameplay stored, nothing logged), screenshot checks (magic bytes, size, metadata stripped, owner-only fetch),
// cross-member isolation, persistence across a restart, the off switches (owner toggle and FEEDBACK=off), no broadcasts
// or timers, and a removed member's feedback.
const assert = require('assert');
const fs = require('fs');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const PORT = 4300 + Math.floor(Math.random() * 50), BASE = 'http://localhost:' + PORT;
const DATA = require('os').tmpdir() + '/t_fb_' + process.pid + '.json';
// clubs closed on purpose: feedback must work for members even while Business Club is closed
const env = { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '', STAGING: '', CLUBS_DEFAULT: '', RENDER_GIT_COMMIT: 'cafe777beef', FB_SHOT_MAX: '6' };
// everything the server prints is collected: feedback text must never show up in logs
let out = '';
const start = e => { const p = spawn('node', ['server/index.js'], { cwd: __dirname + '/..', env: e, stdio: ['ignore', 'pipe', 'pipe'] }); p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d); return p; };
let srv = start(env);
const up = async () => { for(let i = 0; i < 40; i++){ try{ if((await fetch(BASE + '/healthz')).ok) return; }catch(e){} await sleep(150); } throw new Error('server did not start'); };
async function restart(e = env){ srv.kill(); await new Promise(r => srv.once('exit', r)); srv = start(e); await up(); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function call(p, body, tok){
  const r = await fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: typeof body === 'string' ? body : JSON.stringify(body || {}) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
const ok = async (p, body, tok) => { const r = await call(p, body, tok); assert.strictEqual(r.status, 200, `${p} should succeed: ${JSON.stringify(r.body)}`); return r.body; };
const err = async (p, body, tok, code = 400) => { const r = await call(p, body, tok); assert.strictEqual(r.status, code, `${p} ${JSON.stringify(body).slice(0, 80)} should be ${code}, got ${r.status} ${JSON.stringify(r.body)}`); return r.body.error; };
const shot = (id, tok) => fetch(BASE + '/fbshot/' + id, tok ? { headers: { authorization: 'Bearer ' + tok } } : {});
function wsDo(tok, msgs){
  return new Promise((res, rej) => {
    const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws'); let me = null;
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: tok })));
    ws.on('message', m => { m = JSON.parse(m); if(m.t === 'club' && !me){ me = m.club.me.id; for(const x of msgs) ws.send(JSON.stringify(x)); setTimeout(() => { ws.close(); res(me); }, msgs.length ? 300 : 0); } if(m.t === 'auth' && !m.ok) rej(new Error('auth')); });
    ws.on('error', rej);
  });
}
// the store writes its file 150 ms after the last change
const disk = () => JSON.parse(fs.readFileSync(DATA, 'utf8'));
const settled = async () => { await sleep(400); return disk(); };
// a JPEG-shaped file: SOI, APP0 (JFIF), APP1 (EXIF with a fake GPS tag), a comment, a frame header, a scan, EOI
const seg = (mk, payload) => { const b = Buffer.from(payload); const h = Buffer.from([0xff, mk, 0, 0]); h.writeUInt16BE(b.length + 2, 2); return Buffer.concat([h, b]); };
const jpeg = (pad = 200) => Buffer.concat([Buffer.from([0xff, 0xd8]), seg(0xe0, 'JFIF\0\x01\x01\0\0\x01\0\x01\0\0'), seg(0xe1, 'Exif\0\0GPSLatitude=43.6532'),
  seg(0xfe, 'secret comment'), seg(0xc0, Buffer.from([8, 0, 1, 0, 1, 1, 1, 0x11, 0])), seg(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])), Buffer.alloc(pad, 0x55), Buffer.from([0xff, 0xd9])]);
const url = b => 'data:image/jpeg;base64,' + b.toString('base64');
const note = (over = {}) => ({ cat: 'bug', text: 'The Send button did nothing on my phone.', ctx: { section: 'poker', ua: 'Mozilla/5.0 (iPhone) Safari', vw: 390, vh: 844 }, ...over });

(async () => {
  await up();
  const O = (await ok('setup', { code: 'secret', name: 'Director', pin: '1234', agree: true })).token;
  const join = async name => { const { code } = await ok('invite', {}, O); return (await ok('redeem', { code, name, pin: '1111', agree: true })).token; };
  const A = await join('Alex'), B = await join('Bea'), C = await join('Cam'), D = await join('Dee');
  const idA = await wsDo(A, []), idB = await wsDo(B, []);

  // ---- auth: sending needs a member; reading and changing need the owner ----
  for(const p of ['fbSend', 'fbList', 'fbSet', 'fbDelete']){ await err(p, note(), undefined, 401); await err(p, note(), 'not-a-token', 401); }
  for(const p of ['fbList', 'fbSet', 'fbDelete']) for(const t of [A, B]){ const r = await call(p, { id: 'f0000000000000000', status: 'resolved' }, t); assert.strictEqual(r.status, 403, p); assert.deepStrictEqual(Object.keys(r.body), ['error'], 'a refusal carries no data'); }
  const keysBefore = Object.keys(await settled());

  // ---- submit: works while Business Club is closed; one confirmation, nothing about other feedback comes back ----
  assert.deepStrictEqual(await ok('fbSend', note(), A), { ok: true }, 'the reply is only a confirmation');
  await ok('fbSend', note({ cat: 'idea', text: 'A dark mode toggle for the lobby would be lovely.', ctx: { section: 'business' } }), B);
  await ok('fbSend', note({ cat: 'ux', text: 'The filter buttons are hard to tap at 320 px.', ctx: { section: 'opportunity', vw: 320, vh: 640 } }), C);
  await ok('fbSend', note({ cat: 'idea', text: 'Owner can send feedback too.' }), O);

  // ---- validation ----
  await err('fbSend', note({ cat: 'praise' }), D); await err('fbSend', note({ cat: undefined }), D); await err('fbSend', note({ cat: ['bug'] }), D);
  await err('fbSend', note({ text: '' }), D); await err('fbSend', note({ text: '  hi​ ' }), D); await err('fbSend', note({ text: 42 }), D); await err('fbSend', note({ text: { a: 1 } }), D);
  await err('fbSend', note({ text: 'x'.repeat(2001) }), D);
  await err('fbSend', '{"cat":', D);
  await err('fbSend', note({ text: 'y'.repeat(100000) }), D);   // a 100 KB body is refused
  await err('fbSend', note({ text: 'line\n'.repeat(1500) }), D);   // newline flooding is bounded by the same cap
  await ok('fbSend', note({ text: 'x'.repeat(2000) }), D);
  // the store grew by exactly the new feedback keys
  const keysAfter = Object.keys(await settled()), added = keysAfter.filter(k => !keysBefore.includes(k));
  assert.ok(added.length && added.every(k => /^(fb|fblimit):/.test(k)), 'only feedback keys added: ' + added.join(','));
  assert.ok(keysBefore.every(k => keysAfter.includes(k)), 'no existing key removed');

  // ---- owner: list, filter, counts, status workflow ----
  let L = await ok('fbList', {}, O);
  assert.strictEqual(L.total, 5); assert.strictEqual(L.items.length, 5);
  assert.ok(L.items.every((x, i, a) => !i || a[i - 1].createdAt >= x.createdAt), 'newest first');
  assert.deepStrictEqual(L.counts, { new: 5, reviewing: 0, progress: 0, resolved: 0 });
  const aItem = L.items.find(x => x.author === 'Alex');
  assert.strictEqual(aItem.cat, 'bug'); assert.strictEqual(aItem.status, 'new'); assert.strictEqual(aItem.hasShot, false);
  assert.ok(/^f[0-9a-f]{16}$/.test(aItem.id));
  assert.deepStrictEqual(aItem.ctx, { version: 'cafe777', section: 'poker', device: 'iPhone · Safari', vw: 390, vh: 844 }, 'version comes from the server; only a device class is kept');
  assert.deepStrictEqual((await ok('fbList', { cat: 'idea' }, O)).items.map(x => x.author).sort(), ['Bea', 'Director']);
  assert.deepStrictEqual((await ok('fbList', { cat: 'ux' }, O)).items.map(x => x.author), ['Cam']);
  await ok('fbSet', { id: aItem.id, status: 'reviewing' }, O);
  const set = await ok('fbSet', { id: aItem.id, status: 'progress' }, O);
  assert.strictEqual(set.item.status, 'progress');
  assert.deepStrictEqual((await ok('fbList', { status: 'progress' }, O)).items.map(x => x.id), [aItem.id]);
  assert.deepStrictEqual((await ok('fbList', { status: 'progress', cat: 'idea' }, O)).items, [], 'filters combine');
  assert.strictEqual((await ok('fbList', { cat: 'nope', status: { $ne: 1 } }, O)).items.length, 5, 'unknown filters are ignored');
  await ok('fbSet', { id: aItem.id, status: 'resolved' }, O);
  assert.deepStrictEqual((await ok('fbList', {}, O)).counts, { new: 4, reviewing: 0, progress: 0, resolved: 1 });
  await err('fbSet', { id: aItem.id, status: 'done' }, O);
  await err('fbSet', { id: aItem.id, status: '__proto__' }, O);
  await err('fbSet', { id: 'f0000000000000000', status: 'new' }, O, 404);
  await err('fbSet', { id: '../user:x', status: 'new' }, O, 404);
  // members cannot read or update even with a valid id
  await err('fbSet', { id: aItem.id, status: 'new' }, A, 403);
  await err('fbList', { mine: true }, A, 403);
  assert.strictEqual((await ok('fbList', {}, O)).items.find(x => x.id === aItem.id).status, 'resolved', 'member update did nothing');

  // ---- privacy: no secrets or gameplay are stored, even when a client tries to send them ----
  await ok('fbSend', note({ text: 'Trying to sneak extra fields in.', pin: '1111', token: A, uid: idB, status: 'resolved', id: 'f1111111111111111',
    ctx: { section: 'evil<script>', ua: 'UA‮\u0000 with junk', vw: -5, vh: 1e9, pin: '1234', token: A, chat: 'private chat', hand: ['As', 'Kd'], chips: 5000, version: 'spoofed' },
    chat: 'private', hand: ['As'], cards: 'AsKd' }), D);
  const raw = await settled(), fbs = Object.entries(raw).filter(([k]) => k.startsWith('fb:')).map(([, v]) => v);
  const sneaky = fbs.find(f => f.text.startsWith('Trying'));
  assert.deepStrictEqual(Object.keys(sneaky).sort(), ['cat', 'createdAt', 'ctx', 'id', 'shot', 'status', 'text', 'uid', 'updatedAt']);
  assert.deepStrictEqual(sneaky.ctx, { version: 'cafe777', section: 'other', device: 'Other · Other', vw: null, vh: null }, 'only the fixed context is kept');
  assert.strictEqual(sneaky.status, 'new'); assert.notStrictEqual(sneaky.id, 'f1111111111111111'); assert.notStrictEqual(sneaky.uid, idB, 'a forged uid is ignored');
  const stored = JSON.stringify(fbs);
  for(const s of ['1111', '1234', A, 'private', 'As', 'Kd', 'chips', 'pin', 'token', 'salt', 'spoofed']) assert.ok(!stored.includes(s), 'not stored: ' + s.slice(0, 8));
  const listed = JSON.stringify(await ok('fbList', {}, O));
  for(const k of ['uid', 'pin', 'salt', 'token', 'role', 'chips', 'hand']) assert.ok(!new RegExp('"' + k + '"').test(listed), 'no field in the list: ' + k);
  assert.ok(!/u[0-9a-f]{12}/.test(listed), 'member ids are never sent');
  assert.ok(!stored.includes('<script>'));

  // ---- rate limits: 5 an hour per member (kept on disk), others unaffected ----
  for(let i = 0; i < 3; i++) await ok('fbSend', note({ text: 'Rate limit test note ' + i }), D);
  assert.match(await err('fbSend', note(), D, 429), /Wait a few minutes/);
  await ok('fbSend', note({ text: 'Bea is not limited by Dee.' }), B);
  await sleep(400); assert.strictEqual(disk()['fblimit:' + (await wsDo(D, []))].sent.length, 5, 'send times are kept in storage');

  // ---- screenshots: JPEG only, checked bytes, size cap, metadata stripped, owner-only fetch ----
  const E = await join('Eve'), F = await join('Fay'), G = await join('Gus');
  await err('fbSend', note({ shot: url(Buffer.from('<svg onload=alert(1)></svg>' + 'x'.repeat(200))) }), E);
  await err('fbSend', note({ shot: 'data:image/png;base64,' + jpeg().toString('base64') }), E);
  await err('fbSend', note({ shot: url(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), jpeg().subarray(4)])) }), E, 400);
  await err('fbSend', note({ shot: url(jpeg().subarray(0, jpeg().length - 2)) }), E);   // no end marker
  const noFrame = Buffer.concat([Buffer.from([0xff, 0xd8]), seg(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])), Buffer.alloc(200, 1), Buffer.from([0xff, 0xd9])]);
  await err('fbSend', note({ shot: url(noFrame) }), E);
  await err('fbSend', note({ shot: url(jpeg(110000)) }), E);   // over the size cap (rejected by the API)
  // over the HTTP body limit: the server drops the connection
  const huge = await call('fbSend', note({ shot: url(jpeg(200000)) }), E).catch(() => ({ status: 'dropped' }));
  assert.ok(huge.status === 'dropped' || huge.status >= 400, 'over the body limit');
  await err('fbSend', note({ shot: { kind: 'photo' } }), E);
  await err('fbSend', note({ shot: 'javascript:alert(1)' }), E);
  assert.strictEqual(Object.keys(await settled()).filter(k => k.startsWith('fbshot:')).length, 0, 'nothing stored from rejected screenshots');
  const good = jpeg(3000);
  await ok('fbSend', note({ cat: 'bug', text: 'Screenshot attached of the broken layout.', shot: url(good) }), E);
  const withShot = (await ok('fbList', {}, O)).items.find(x => x.hasShot);
  assert.ok(withShot && withShot.author === 'Eve');
  const key = Object.keys(await settled()).find(k => k.startsWith('fbshot:'));
  assert.strictEqual(key, 'fbshot:' + withShot.id);
  // the owner gets the image, without the EXIF/GPS block and comment
  const r = await shot(withShot.id, O);
  assert.strictEqual(r.status, 200); assert.strictEqual(r.headers.get('content-type'), 'image/jpeg');
  assert.strictEqual(r.headers.get('cache-control'), 'private, no-store'); assert.match(r.headers.get('content-disposition'), /^attachment/); assert.strictEqual(r.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(/default-src 'self'/.test(r.headers.get('content-security-policy'))); assert.strictEqual(r.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
  const img = Buffer.from(await r.arrayBuffer());
  assert.strictEqual(img[0], 0xff); assert.strictEqual(img[1], 0xd8); assert.strictEqual(img[img.length - 1], 0xd9);
  assert.ok(!img.includes('GPSLatitude') && !img.includes('Exif') && !img.includes('secret comment'), 'metadata stripped');
  assert.ok(img.includes('JFIF'), 'the picture itself is kept');
  assert.strictEqual(img.length, good.length - seg(0xe1, 'Exif\0\0GPSLatitude=43.6532').length - seg(0xfe, 'secret comment').length);
  // anyone else: 404 (members, the sender, no token, bad tokens, bad ids)
  for(const t of [E, A, undefined, 'not-a-token']) assert.strictEqual((await shot(withShot.id, t)).status, 404, 'not for non-owners');
  for(const bad of ['f0000000000000000', '..%2Fuser', 'F' + withShot.id.slice(1)]) assert.strictEqual((await shot(bad, O)).status, 404);
  // per-member screenshot limit for the day and the club-wide cap (FB_SHOT_MAX=6 here)
  for(let i = 0; i < 4; i++) await ok('fbSend', note({ text: 'Shot ' + i, shot: url(jpeg(500 + i)) }), i < 2 ? F : G);
  await ok('fbSend', note({ text: 'Shot 4', shot: url(jpeg(600)) }), G);
  assert.strictEqual(Object.keys(await settled()).filter(k => k.startsWith('fbshot:')).length, 6);
  assert.match(await err('fbSend', note({ text: 'One too many', shot: url(jpeg(700)) }), F, 429), /storage is full/);
  await ok('fbSend', note({ text: 'Still fine without a picture.' }), F);

  // ---- stored XSS: kept as plain text, never turned into markup (the dashboard renders with textContent; see the UI test) ----
  const XSS = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
  await ok('fbSend', note({ cat: 'ux', text: XSS }), F);
  const xs = (await ok('fbList', {}, O)).items.find(x => x.text.includes('onerror'));
  assert.strictEqual(xs.text, XSS, 'stored inert, exactly as typed');

  // ---- cross-member isolation: no member endpoint returns feedback; ids are random and every by-id call is owner-only ----
  const bId = (await ok('fbList', {}, O)).items.find(x => x.author === 'Bea').id;
  for(const t of [A, C, E]){
    for(const [p, b] of [['fbSet', { id: bId, status: 'resolved' }], ['fbDelete', { id: bId }], ['fbList', { id: bId }], ['fbList', { uid: idB }]]){
      const r = await call(p, b, t); assert.strictEqual(r.status, 403, p); assert.ok(!JSON.stringify(r.body).includes(bId) && !JSON.stringify(r.body).includes('dark mode'), 'no data in the refusal');
    }
  }
  const allIds = (await ok('fbList', {}, O)).items.map(x => x.id);
  assert.strictEqual(new Set(allIds).size, allIds.length);
  assert.ok(allIds.every(i => /^f[0-9a-f]{16}$/.test(i)), '64-bit random ids');
  assert.strictEqual((await ok('fbList', {}, O)).items.find(x => x.id === bId).status, 'new', 'untouched by members');

  // ---- delete: owner only; the note and its screenshot are gone, also after a restart ----
  const shotId = withShot.id;
  await ok('fbDelete', { id: shotId }, O);
  await err('fbDelete', { id: shotId }, O, 404);
  assert.ok(!(await ok('fbList', {}, O)).items.some(x => x.id === shotId));
  assert.strictEqual((await shot(shotId, O)).status, 404);
  let dk = await settled(); assert.ok(!dk['fb:' + shotId] && !dk['fbshot:' + shotId], 'deleted from the store');

  // ---- persistence: everything survives a restart, deletions included ----
  const beforeRestart = await ok('fbList', {}, O);
  await sleep(300); await restart();
  const afterRestart = await ok('fbList', {}, O);
  assert.deepStrictEqual(afterRestart, beforeRestart, 'identical after a restart');
  assert.ok(!afterRestart.items.some(x => x.id === shotId), 'still deleted');
  assert.match(await err('fbSend', note({ text: 'Limits survive a restart too.' }), D, 429), /Wait a few minutes/);

  // ---- no broadcasts: a member watching the club gets no message when feedback is sent ----
  {
    const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws'); const got = [];
    await new Promise((res, rej) => { ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: B }))); ws.on('message', m => { m = JSON.parse(m); got.push(m.t); if(m.t === 'club') res(); }); ws.on('error', rej); });
    await sleep(300); const n = got.length;
    const H = await join('Hal'); await sleep(400); const afterJoin = got.length;   // joining is an existing club broadcast (control)
    assert.ok(afterJoin > n, 'the watcher does receive club broadcasts');
    await ok('fbSend', note({ text: 'Sent while someone is watching.' }), H);
    await sleep(500);
    assert.strictEqual(got.length, afterJoin, 'sending feedback broadcasts nothing: ' + got.slice(afterJoin).join(','));
    ws.close();
  }
  // no timers, intervals or broadcasts in the module, and it never touches the tables or the engine
  const src = fs.readFileSync(__dirname + '/../server/feedback.js', 'utf8').replace(/\/\/.*$/gm, '');   // code only, not comments
  for(const bad of ['setTimeout', 'setInterval', 'setImmediate', 'broadcast', "require('./club')", "require('./engine')", 'console.']) assert.ok(!src.includes(bad), 'feedback.js has no ' + bad);

  // ---- owner off switch: buttons go (features.feedback false), sending refused, the owner keeps the inbox ----
  const clubOf = tok => new Promise((res, rej) => { const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws'); ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: tok }))); ws.on('message', m => { m = JSON.parse(m); if(m.t === 'club'){ ws.close(); res(m.club); } }); ws.on('error', rej); });
  assert.deepStrictEqual([(await clubOf(B)).features.feedback, (await clubOf(B)).features.feedbackLocked], [true, false]);
  await wsDo(B, [{ t: 'feedbackOn', on: false }]);   // a member cannot switch it
  assert.strictEqual((await clubOf(B)).features.feedback, true);
  await wsDo(O, [{ t: 'feedbackOn', on: false }]);
  assert.strictEqual((await clubOf(B)).features.feedback, false, 'members are told it is closed');
  assert.match(await err('fbSend', note({ text: 'Closed now, so this is refused.' }), B, 403), /closed/);
  await err('fbSend', note({ text: 'The owner cannot send while closed either.' }), O, 403);
  assert.ok((await ok('fbList', {}, O)).total > 0, 'the owner keeps the inbox');
  await sleep(300); await restart();
  assert.strictEqual((await clubOf(B)).features.feedback, false, 'closed survives a restart');
  await wsDo(O, [{ t: 'feedbackOn', on: true }]);
  await ok('fbSend', note({ text: 'Open again, this goes through.' }), B);

  // ---- FEEDBACK=off: every endpoint and screenshot answers 404, and the club says it is off and locked ----
  const anyShot = (await ok('fbList', {}, O)).items.find(x => x.hasShot);
  await sleep(300); await restart({ ...env, FEEDBACK: 'off' });
  for(const p of ['fbSend', 'fbList', 'fbSet', 'fbDelete']) for(const t of [O, B]) await err(p, note({ id: anyShot.id, status: 'new' }), t, 404);
  assert.strictEqual((await shot(anyShot.id, O)).status, 404);
  assert.deepStrictEqual([(await clubOf(O)).features.feedback, (await clubOf(O)).features.feedbackLocked], [false, true]);
  await sleep(300); await restart();
  assert.strictEqual((await shot(anyShot.id, O)).status, 200, 'data kept while off; back when switched on');

  // ---- nothing members typed reaches the logs ----
  for(const t of ['dark mode', 'raise slider', 'Send button did nothing', 'onerror', 'sneak', 'Sent while someone']) assert.ok(!out.includes(t), 'not logged: ' + t);
  assert.ok(out.includes('on :' + PORT), 'logs were captured');

  // ---- a removed member: signed out, cannot send; the owner keeps their feedback, shown as from a removed member ----
  await wsDo(O, [{ t: 'remove', uid: idA }]);
  await err('fbSend', note(), A, 401);
  L = await ok('fbList', {}, O);
  const gone = L.items.find(x => x.id === aItem.id);
  assert.ok(gone, 'kept for the owner'); assert.strictEqual(gone.author, 'Removed member'); assert.strictEqual(gone.authorRemoved, true);
  assert.ok(!L.items.some(x => x.author === 'Alex'), 'the removed name is not shown');
  assert.ok(!(await settled())['fblimit:' + idA], 'their limit record is gone');
  await ok('fbSet', { id: aItem.id, status: 'reviewing' }, O);
  assert.strictEqual(L.items.find(x => x.author === 'Bea').authorRemoved, false);
  assert.ok(idB);

  console.log('feedback hub test passed'); srv.kill(); try{ fs.unlinkSync(DATA); }catch(x){} process.exit(0);
})().catch(e => { console.error(e); srv.kill(); try{ fs.unlinkSync(DATA); }catch(x){} process.exit(1); });
