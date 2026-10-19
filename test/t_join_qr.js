// Club join page and QR (/join/<club-slug>): every club gets one, the page shows that club's name, consent fails closed,
// an email is kept for that one club only, the same email twice is one record with the same answer, and an owner sees
// only their own club's sign-ups. A second club is seeded the way club switching stores it (clubdef:<id>).
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const PORT = 4300 + Math.floor(Math.random() * 50), BASE = 'http://localhost:' + PORT;
const DATA = require('os').tmpdir() + '/t_join_qr_' + process.pid + '.json';
const CEL = 'u0000000000c2', salt = 'aa11bb22cc33dd44ee55ff66';
fs.writeFileSync(DATA, JSON.stringify({
  ['user:' + CEL]: { id: CEL, name: 'Celine', salt, pin: crypto.scryptSync('2222', salt, 32).toString('hex'), role: 'member', createdAt: 1, agreedAt: 1, noMain: true, clubs: { cel001: { role: 'owner', joinedAt: 1 } } },
  'name:celine': CEL,
  'clubdef:cel001': { id: 'cel001', name: 'Celestia', createdAt: 1, createdBy: CEL },
  'clubdef:twv001': { id: 'twv001', name: 'Twelve Chars', createdAt: 2, createdBy: 'u0000000000ff' }
}));
const srv = spawn('node', ['server/index.js'], { cwd: __dirname + '/..', env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '', STAGING: '', JOIN_IP_HOUR: '4' }, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let n = 0; const pass = m => { n++; console.log('ok', n, m); };
async function call(p, body, tok, ip){
  const r = await fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}), ...(ip ? { 'cf-connecting-ip': ip } : {}) }, body: JSON.stringify(body || {}) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
const ok = async (p, body, tok, ip) => { const r = await call(p, body, tok, ip); assert.strictEqual(r.status, 200, `${p}: ${JSON.stringify(r.body)}`); return r.body; };
function view(tok){
  return new Promise((res, rej) => {
    const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws');
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: tok })));
    ws.on('message', m => { m = JSON.parse(m); if(m.t === 'auth' && !m.ok) rej(new Error('auth')); if(m.t === 'club'){ ws.close(); res(m.club); } });
    ws.on('error', rej); setTimeout(() => rej(new Error('timeout')), 5000);
  });
}
(async () => {
  for(let i = 0; i < 40; i++){ try{ if((await fetch(BASE + '/healthz')).ok) break; }catch(e){} await sleep(150); }
  const O = (await ok('setup', { code: 'secret', name: 'Director', pin: '1234', agree: true })).token;
  const { code } = await ok('invite', {}, O);
  const A = (await ok('redeem', { code, name: 'Alex', pin: '1111', agree: true })).token;
  const C = (await ok('login', { name: 'Celine', pin: '2222' })).token;

  // every club has a join page, with its own name; an unknown slug is answered neutrally
  const bi = await ok('joinInfo', { slug: 'blindrise' }), ci = await ok('joinInfo', { slug: 'celestia' });
  assert.deepStrictEqual([bi.club, bi.name, bi.initials, bi.slug], [true, 'Blindrise', 'B', 'blindrise']);
  assert.deepStrictEqual([ci.club, ci.name, ci.initials, ci.slug], [true, 'Celestia', 'C', 'celestia']);
  assert.match(bi.consent.text, /^Blindrise may email me/); assert.match(ci.consent.text, /^Celestia may email me/);
  assert.notStrictEqual(bi.token, ci.token);
  assert.deepStrictEqual(await ok('joinInfo', { slug: 'nope-club' }), { club: false });
  assert.deepStrictEqual(await ok('joinInfo', { slug: '../x' }), { club: false });
  pass('each club resolves to its own name, initials and consent text; unknown slugs say nothing');

  // a slug is never 12 characters, so it can never be mistaken for an invite code on /join/
  const tw = await ok('joinInfo', { slug: 'twelve-chars-2' });
  assert.strictEqual(tw.name, 'Twelve Chars');
  assert.deepStrictEqual(await ok('joinInfo', { slug: 'twelve-chars' }), { club: false });
  pass('a 12-character name gets a slug that is not 12 characters (twelve-chars-2)');

  // the page itself is served for /join/<slug>, and invite links on /join/<code> still work
  const page = await fetch(BASE + '/join/blindrise');
  assert.strictEqual(page.status, 200); assert.match(await page.text(), /id="clubJoin"/);
  assert.strictEqual(code.length, 12);
  pass('/join/blindrise serves the app; invite codes stay 12 characters');

  // consent fails closed: no tick, no token, a token from another club, or a bad email: refused, nothing kept
  const E = 'Guest.One@Example.com';
  for(const [why, body] of [['no tick', { slug: 'blindrise', email: E, token: bi.token }], ['agree not true', { slug: 'blindrise', email: E, agree: 'yes', token: bi.token }],
    ['no token', { slug: 'blindrise', email: E, agree: true }], ['other club token', { slug: 'blindrise', email: E, agree: true, token: ci.token }],
    ['forged token', { slug: 'blindrise', email: E, agree: true, token: 'j1.' + 'A'.repeat(43) }], ['bad email', { slug: 'blindrise', email: 'not-an-email', agree: true, token: bi.token }]]){
    const r = await call('joinClub', body, null, '10.0.0.1');
    assert.strictEqual(r.status, 400, why + ': ' + JSON.stringify(r.body));
  }
  assert.strictEqual((await call('joinClub', { slug: 'nope-club', email: E, agree: true, token: bi.token })).status, 404);
  assert.strictEqual((await view(O)).joinQr[0].leads.length, 0);
  pass('unticked box, missing/forged/other-club token and bad email are all refused; nothing is stored');

  // a real join, then the same email again (any case): one record, the same answer, no error
  const first = await ok('joinClub', { slug: 'blindrise', email: E, agree: true, token: bi.token }, null, '10.0.0.2');
  const again = await ok('joinClub', { slug: 'blindrise', email: '  guest.one@EXAMPLE.com ', agree: true, token: bi.token }, null, '10.0.0.3');
  assert.deepStrictEqual(first, { ok: true, name: 'Blindrise' }); assert.deepStrictEqual(again, first);
  const ov = await view(O);
  assert.strictEqual(ov.joinQr.length, 1);
  const mq = ov.joinQr[0];
  assert.deepStrictEqual([mq.id, mq.name, mq.slug, mq.path, mq.live], ['main', 'Blindrise', 'blindrise', '/join/blindrise', true]);
  assert.strictEqual(mq.members, 2);
  assert.deepStrictEqual(mq.leads.map(l => l.email), ['guest.one@example.com']);
  pass('duplicate email (different case and spaces) keeps one sign-up and returns the identical answer');

  // the stored record carries the consent that was shown
  await sleep(400);
  const disk = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const keys = Object.keys(disk).filter(k => k.startsWith('joinlead:'));
  assert.strictEqual(keys.length, 1); assert.match(keys[0], /^joinlead:main:[0-9a-f]{64}$/);
  const rec = disk[keys[0]];
  assert.strictEqual(rec.consent.v, 1); assert.strictEqual(rec.consent.text, bi.consent.text); assert.ok(rec.consent.at > 0);
  pass('the sign-up is stored under the main club only, with the consent version, text and time');

  // two-club isolation: the same email joins Celestia too; each owner sees only their own club and its sign-ups
  await ok('joinClub', { slug: 'celestia', email: E, agree: true, token: ci.token }, null, '10.0.0.4');
  await ok('joinClub', { slug: 'celestia', email: 'only.celestia@example.com', agree: true, token: ci.token }, null, '10.0.0.4');
  const o2 = await view(O), c2 = await view(C), a2 = await view(A);
  assert.deepStrictEqual(o2.joinQr.map(c => c.id), ['main']);
  assert.deepStrictEqual(o2.joinQr[0].leads.map(l => l.email), ['guest.one@example.com']);
  assert.deepStrictEqual(c2.joinQr.map(c => c.id), ['cel001']);
  assert.strictEqual(c2.joinQr[0].path, '/join/celestia');
  assert.deepStrictEqual(c2.joinQr[0].leads.map(l => l.email).sort(), ['guest.one@example.com', 'only.celestia@example.com']);
  assert.ok(!JSON.stringify(o2).includes('only.celestia@example.com'), 'main owner never sees a Celestia-only email');
  assert.strictEqual(a2.joinQr, undefined); assert.ok(!JSON.stringify(a2).includes('@example.com'), 'a member sees no sign-ups');
  pass('two clubs: each owner sees only their own club and its emails; members see none');

  // per-connection cap on new sign-ups (JOIN_IP_HOUR=4 here); a repeat of an email already kept still answers ok
  for(let i = 0; i < 4; i++) await ok('joinClub', { slug: 'blindrise', email: `cap${i}@example.com`, agree: true, token: bi.token }, null, '10.9.9.9');
  assert.strictEqual((await call('joinClub', { slug: 'blindrise', email: 'cap9@example.com', agree: true, token: bi.token }, null, '10.9.9.9')).status, 429);
  await ok('joinClub', { slug: 'blindrise', email: 'cap0@example.com', agree: true, token: bi.token }, null, '10.9.9.9');
  pass('a connection can add at most JOIN_IP_HOUR new sign-ups an hour');

  console.log(`t_join_qr: ${n} ok, 0 failed`);
  srv.kill(); try{ fs.unlinkSync(DATA); }catch(e){} process.exit(0);
})().catch(e => { console.error(e); srv.kill(); try{ fs.unlinkSync(DATA); }catch(x){} process.exit(1); });
