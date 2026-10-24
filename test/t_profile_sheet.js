// The board's player profile sheet on the server (UI_BOARD, Step-0 spec §8, phase B7): server/connect.js and its wiring.
// Fixture accounts only, on a local server with its own data file.
//  - consent: every choice off by default; with them off a member's About, Business, "Open to Connect" and photo never
//    leave the server (the sheet, the members list, the full profile, the photo address); each one turned on shows
//    exactly that, the Business card with its own show{} contact rules, and nothing when the Exchange is closed
//  - connection requests: only to a member who is Open to Connect; sent, then accepted (the receiver's chosen contact,
//    to the sender only then) or declined; one per pair; withdraw; the hourly limit
//  - the photo address: board on, no token is refused, a member's token is served when the owner shows their photo
//  - board off: every new call is a 404, the photo address and the club view are as before
const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const WebSocket = require('ws');
const ROOT = path.join(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const JPEG = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
let oks = 0;
const check = (cond, msg) => { assert.ok(cond, msg); oks++; console.log('ok  ' + msg); };

async function serve(env){
  const PORT = 4700 + Math.floor(Math.random() * 200), DATA = path.join(os.tmpdir(), 't_psheet_' + process.pid + '_' + PORT + '.json');
  const srv = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '', STAGING: '', DATABASE_URL: '', UI_QUIET: '', UI_BOARD: '', CLUBS_DEFAULT: 'on', CONN_HOUR_MAX: '3', ...env }, stdio: 'ignore' });
  const base = 'http://localhost:' + PORT;
  for(let i = 0; i < 60; i++){ try{ if((await fetch(base + '/healthz')).ok) break; }catch(e){} await sleep(150); }
  const call = async (p, body, tok) => { const r = await fetch(base + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body || {}) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
  const ok = async (p, body, tok) => { const r = await call(p, body, tok); assert.strictEqual(r.status, 200, `${p} should succeed: ${JSON.stringify(r.body)}`); return r.body; };
  const err = async (p, body, tok, code = 400) => { const r = await call(p, body, tok); assert.strictEqual(r.status, code, `${p} ${JSON.stringify(body).slice(0, 80)} should be ${code}, got ${r.status} ${JSON.stringify(r.body)}`); return r.body.error; };
  // the club view a member's app gets (delta app: the whole view first), after `msgs`
  const view = (tok, msgs = []) => new Promise((res, rej) => {
    const ws = new WebSocket(base.replace('http', 'ws') + '/ws'); let v = null; const got = [];
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: tok, delta: 1 })));
    ws.on('message', m => { m = JSON.parse(m); got.push(m); if(m.t === 'club' && !v){ v = m.club; for(const x of msgs) ws.send(JSON.stringify(x)); setTimeout(() => { ws.close(); res({ v, got }); }, msgs.length ? 400 : 50); } if(m.t === 'auth' && !m.ok) rej(new Error('auth')); });
    ws.on('error', rej);
  });
  const img = (uid, tok) => fetch(base + '/avatar/' + uid, tok ? { headers: { authorization: 'Bearer ' + tok } } : {});
  return { base, call, ok, err, view, img, stop: () => { srv.kill(); fs.rmSync(DATA, { force: true }); } };
}

(async () => {
  // ================= board on =================
  const S = await serve({ UI_BOARD: '1' });
  const { ok, err, view, img } = S;
  const O = (await ok('setup', { code: 'secret', name: 'Director', pin: '1234', agree: true })).token;
  const join = async name => { const { code } = await ok('invite', {}, O); return (await ok('redeem', { code, name, pin: '1111', agree: true })).token; };
  const A = await join('Alex'), B = await join('Bea'), C = await join('Cam'), D = await join('Dee');
  const ids = {}; for(const [k, t] of Object.entries({ A, B, C, D, O })) ids[k] = (await view(t)).v.me.id;

  // ---- defaults: everything off ----
  await ok('avatar', { kind: 'photo', data: JPEG }, A);
  await ok('bizSave', { name: 'Alex Plumbing', category: 'trades', area: 'Midtown', email: 'alex@example.com', phone: '416-555-0100', fullName: 'Alex Fixture', jobTitle: 'Owner', show: { email: true, fullName: true } }, A);
  await ok('bizPublish', { on: true }, A);
  let card = await ok('memberCard', { uid: ids.A }, B);
  check(JSON.stringify(Object.keys(card).sort()) === JSON.stringify(['av', 'name', 'self', 'uid']) && card.av === null && card.name === 'Alex' && card.self === false,
    'defaults (all off): the sheet carries the name only, no photo, no About, Business, Open to Connect or request (' + Object.keys(card).join(',') + ')');
  const raw = JSON.stringify(card);
  check(!/Midtown|Plumbing|example\.com|555|Owner/.test(raw), 'defaults: nothing of the member\'s business, area or contact is in the answer');
  let bv = await view(B, [{ t: 'profile', uid: ids.A }]);
  const prof = bv.got.find(m => m.t === 'profile');
  check(bv.v.members.find(m => m.id === ids.A).av === null && prof && prof.profile.av === null, 'defaults: the members list and the full profile carry no photo address for Alex ("Show my photo" off)');
  const av = (await view(A)).v;
  check(/^p:/.test(av.me.av) && av.me.pro && av.me.pro.photo === false && av.me.pro.table === false && av.me.pro.connect === false, 'defaults: Alex gets his own photo in me.av and his choices, all off, in me.pro');
  check(av.members.find(m => m.id === ids.A).av === null, 'the shared members list is the same for Alex (his own comes in me.av)');

  // ---- the photo address ----
  check((await img(ids.A)).status === 401, 'board on: /avatar/<uid> with no token is refused (401)');
  check((await img(ids.A, 'not-a-token')).status === 401, 'board on: a bad token is refused (401)');
  check((await img(ids.A, B)).status === 404, 'board on: another member\'s token, photo not shown: 404');
  { const r = await img(ids.A, A); check(r.status === 200 && r.headers.get('content-type') === 'image/jpeg' && /private/.test(r.headers.get('cache-control')), 'board on: the member\'s own token gets their photo (200, image/jpeg, private)'); }
  await ok('profilePrefs', { photo: true }, A);
  { const r = await img(ids.A, B); check(r.status === 200 && (await r.arrayBuffer()).byteLength === 4, 'board on: "Show my photo" on: a member\'s token gets the photo'); }
  check((await img(ids.A)).status === 401, 'board on: still nothing without a token');
  bv = await view(B);
  card = await ok('memberCard', { uid: ids.A }, B);
  check(/^p:/.test(bv.v.members.find(m => m.id === ids.A).av) && /^p:/.test(card.av), '"Show my photo" on: the members list and the sheet carry the photo');
  check(!('about' in card) && !('business' in card) && !('connect' in card), 'photo on, the rest off: still no About, Business or Open to Connect');
  await ok('avatar', { kind: 'gallery', id: 'lion' }, D);
  check((await ok('memberCard', { uid: ids.D }, B)).av === 'g:lion', 'a gallery avatar (not a photo) shows without the photo choice');

  // ---- About and Business ----
  await err('profilePrefs', { table: true, area: 'Call me 416 555 0100' }, A);
  await err('profilePrefs', { job: 'x'.repeat(61) }, A);
  check(!(await ok('memberCard', { uid: ids.A }, B)).about, 'a rejected save changes nothing');
  await ok('profilePrefs', { table: true, area: 'Toronto', job: 'Plumber' }, A);
  card = await ok('memberCard', { uid: ids.A }, B);
  check(card.about && card.about.area === 'Toronto' && card.about.job === 'Plumber' && !('connect' in card), 'table on: About carries area and job title; not Open to Connect');
  const bz = card.business;
  check(bz && bz.name === 'Alex Plumbing' && bz.contacts.email === 'alex@example.com' && !bz.contacts.phone && !('phone' in bz) && !('email' in bz) && bz.fullName === 'Alex Fixture',
    'table on: Business is the Exchange card with its show{} rules (email shown, phone not)');
  await ok('bizPublish', { on: false }, A);
  check((await ok('memberCard', { uid: ids.A }, B)).business === null, 'a business not published: no Business card');
  await ok('bizPublish', { on: true }, A);
  await view(O, [{ t: 'clubs', on: false }]);
  card = await ok('memberCard', { uid: ids.A }, B);
  check(card.business === null && card.about.area === 'Toronto', 'the Exchange closed to members: no Business card on the sheet (About stays)');
  await view(O, [{ t: 'clubs', on: true }]);

  // ---- connection requests ----
  await err('connSend', { uid: ids.A }, B, 403);
  check(!(await view(A)).v.conn.list.length, 'Alex not Open to Connect: no request was made');
  await ok('profilePrefs', { connect: true }, A);
  card = await ok('memberCard', { uid: ids.A }, B);
  check(card.connect === true && !card.request, 'Open to Connect on: the sheet says so');
  await err('connSend', { uid: ids.B }, B);
  await err('connSend', { uid: 'u000000000000' }, B, 404);
  await err('connSend', { uid: ids.A }, undefined, 401);
  const sent = (await ok('connSend', { uid: ids.A }, B)).request;
  check(sent.dir === 'out' && sent.status === 'sent' && !sent.shared, 'Bea sends a request: sent, nothing shared');
  await err('connSend', { uid: ids.A }, B);
  await err('connSend', { uid: ids.B }, A); // (Bea is not Open to Connect)
  let av2 = (await view(A)).v;
  const inc = av2.conn.list.find(r => r.id === sent.id);
  check(inc && inc.dir === 'in' && inc.name === 'Bea' && inc.status === 'sent' && av2.conn.suggest && av2.conn.suggest.email === 'alex@example.com', 'Alex\'s club view: the request waiting, with his own Exchange email suggested for the answer');
  bv = await view(B);
  card = await ok('memberCard', { uid: ids.A }, B);
  check(!/alex@example\.com|416-555/.test(JSON.stringify(bv.v)) && card.request.status === 'sent' && !('shared' in card.request), 'before an answer, nothing is shared with Bea (her view and the request carry no contact; the Exchange card shows only what Alex shows every member)');
  check(!('suggest' in bv.v.conn), 'Bea has nothing waiting for her: no suggestion in her view');
  await err('connReply', { id: sent.id, action: 'accept' }, A);
  await err('connReply', { id: sent.id, action: 'accept', email: 'alex@example.com' }, B, 404);
  await err('connReply', { id: sent.id, action: 'maybe' }, A);
  await err('connReply', { id: sent.id, action: 'accept', email: 'alex@example.com', note: 'see www.example.com' }, A);
  await ok('connReply', { id: sent.id, action: 'accept', email: 'alex@example.com', note: 'Happy to help.' }, A);
  card = await ok('memberCard', { uid: ids.A }, B);
  check(card.request && card.request.status === 'accepted' && card.request.shared.email === 'alex@example.com' && !card.request.shared.phone && card.request.shared.note === 'Happy to help.', 'accepted: Bea gets exactly the contact Alex chose to share');
  check((await view(B)).v.conn.list[0].shared.email === 'alex@example.com', 'and in her club view');
  check(!(await view(C)).v.conn.list.length, 'Cam sees nobody else\'s requests');
  await err('connReply', { id: sent.id, action: 'decline' }, A);
  await err('connSend', { uid: ids.A }, B);
  // declined
  const s2 = (await ok('connSend', { uid: ids.A }, C)).request;
  await ok('connReply', { id: s2.id, action: 'decline' }, A);
  card = await ok('memberCard', { uid: ids.A }, C);
  check(card.request.status === 'declined' && !card.request.shared, 'declined: Cam is told, and gets no contact');
  await err('connSend', { uid: ids.A }, C);
  // withdraw
  await ok('profilePrefs', { connect: true }, D);
  const s3 = (await ok('connSend', { uid: ids.D }, C)).request;
  await err('connWithdraw', { id: s3.id }, D, 404);
  await ok('connWithdraw', { id: s3.id }, C);
  check(!(await view(D)).v.conn.list.length, 'a withdrawn request is gone for the receiver');
  // the hourly limit (CONN_HOUR_MAX=3 here): Cam has sent 2 (one withdrawn still counts)
  const E = await join('Eve'), F = await join('Fay'), G = await join('Gus');
  for(const t of [E, F, G]) await ok('profilePrefs', { connect: true }, t);
  const idE = (await view(E)).v.me.id, idF = (await view(F)).v.me.id;
  await ok('connSend', { uid: idE }, C);
  const lim = await err('connSend', { uid: idF }, C, 429);
  check(/3 connection requests an hour/.test(lim), 'the hourly limit: the 4th request in an hour is refused (429)');
  // removed from the club: their requests go
  await view(O, [{ t: 'remove', uid: ids.C }]);
  check(!(await view(A)).v.conn.list.some(r => r.uid === ids.C), 'a removed member\'s requests are gone');

  // ---- privacy of the full JSON: nothing hidden goes out ----
  await ok('profilePrefs', { photo: false, table: false, connect: false }, A);
  card = await ok('memberCard', { uid: ids.A }, B);
  check(card.av === null && !card.about && !card.business && !card.connect, 'all turned off again: name only (and the request Bea already has)');
  check((await img(ids.A, B)).status === 404, 'photo off again: no photo for other members');
  check((await S.call('memberCard', { uid: ids.A })).status === 401, 'memberCard needs a signed-in member');
  S.stop();

  // ================= board off =================
  const X = await serve({});
  const Ox = (await X.ok('setup', { code: 'secret', name: 'Director', pin: '1234', agree: true })).token;
  const { code } = await X.ok('invite', {}, Ox), Ax = (await X.ok('redeem', { code, name: 'Alex', pin: '1111', agree: true })).token;
  await X.ok('avatar', { kind: 'photo', data: JPEG }, Ax);
  const vx = (await X.view(Ox)).v, idAx = vx.members.find(m => m.name === 'Alex').id;
  for(const p of ['profilePrefs', 'memberCard', 'connSend', 'connReply', 'connWithdraw']) check((await X.call(p, { uid: idAx }, Ax)).status === 404, `board off: ${p} is not there (404)`);
  { const r = await X.img(idAx); check(r.status === 200 && r.headers.get('content-type') === 'image/jpeg' && r.headers.get('cache-control') === 'private, max-age=604800, immutable', 'board off: /avatar/<uid> is served as before, without a token'); }
  check(/^p:/.test(vx.members.find(m => m.id === idAx).av), 'board off: the members list carries the photo as before');
  check(!('conn' in vx) && JSON.stringify(Object.keys(vx.me)) === JSON.stringify(['id', 'name', 'owner']), 'board off: no conn key, me is { id, name, owner } as before');
  X.stop();
  console.log(`\nprofile sheet (server): ${oks} checks passed`);
  process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
