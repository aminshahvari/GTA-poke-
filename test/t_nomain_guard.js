// noMain rollback guard. An account made through another club's invite (club switching) carries noMain: true and is
// not a member of the main club. When club switching is rolled back (the flag removed, or the production code line
// deployed on the same data), the main club must still treat it as a stranger: not in any roster or member view, no
// sign-in by name and PIN or by an old session token, no table, chat, Exchange, rewards or picture, and owner actions
// cannot touch it. Accounts without noMain (main-only, or main + another club) must work as before. The stored record
// must survive untouched, so turning club switching back on finds it intact.
// 1. Data: with club switching code in this tree (server/clubs.js), the real flow with CLUB_SWITCHING=1 (the probe from
//    docs/release/CLUB-SWITCHING-REMEDIATION-handoff.md section 4). Without it (the production line), the same
//    records are written into the data file exactly as the club switching code writes them.
// 2. Rollback: the server restarted on that data with club switching off. ROLLBACK_DIR=<checkout> runs this step with
//    another code line (for example the production line), to prove a cross-line rollback.
// 3. Roll forward (only with club switching code): flag back on, the B-only account is still in B and only in B.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const ROOT = path.join(__dirname, '..');
const RUN = process.env.ROLLBACK_DIR ? path.resolve(process.env.ROLLBACK_DIR) : ROOT;
const SWITCHING = fs.existsSync(path.join(ROOT, 'server', 'clubs.js'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't_nomain_guard_'));
const DATA = path.join(tmp, 'data.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let n = 0; const check = (c, msg) => { assert.ok(c, msg); n++; console.log('ok  ', msg); };

function start(dir, extra){
  const port = 4900 + Math.floor(Math.random() * 400);
  const p = spawn('node', ['server/index.js'], { cwd: dir, env: { ...process.env, PORT: port, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '1', DEBUG_CHIPS: '1', STAGING: '', CLUBS_DEFAULT: 'on', CLUB_SWITCHING: '', ...extra }, stdio: 'ignore' });
  return { p, base: 'http://localhost:' + port };
}
async function up(s){ for(let i = 0; i < 80; i++){ try{ if((await fetch(s.base + '/healthz')).ok) return; }catch(e){} await sleep(150); } throw new Error('server did not start'); }
async function stop(s){ s.p.kill('SIGTERM'); await new Promise(r => s.p.on('exit', r)); }
async function call(s, p, body, tok, club){
  const r = await fetch(s.base + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}), ...(club ? { 'x-club': club } : {}) }, body: JSON.stringify(body || {}) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
async function ok(s, p, body, tok, club){ const r = await call(s, p, body, tok, club); assert.strictEqual(r.status, 200, `${p}: ${JSON.stringify(r.body)}`); return r.body; }
// a live app connection; resolves on the first club view, or on a refused hello
function session(s, tok, club){
  return new Promise((res, rej) => {
    const ws = new WebSocket(s.base.replace('http', 'ws') + '/ws'), o = { ws, msgs: [], view: null };
    o.send = m => ws.send(JSON.stringify(m));
    o.waitFor = async (pred, ms = 3000) => { const end = Date.now() + ms; while(Date.now() < end){ const m = o.msgs.find(pred); if(m) return m; await sleep(30); } return null; };
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: tok, ...(club ? { club } : {}) })));
    ws.on('message', m => { m = JSON.parse(m); o.msgs.push(m); if(m.t === 'auth' && !m.ok){ o.denied = true; res(o); } if(m.t === 'club'){ o.view = m.club; if(!o.ready){ o.ready = true; res(o); } } });
    ws.on('close', () => { if(!o.ready) res(o); });
    ws.on('error', rej); setTimeout(() => rej(new Error('socket timeout')), 5000);
  });
}
const names = v => v.members.map(m => m.name).sort().join(',');
const JPEG = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
const readData = () => JSON.parse(fs.readFileSync(DATA, 'utf8'));
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');

(async () => {
  // ---------- 1. data with a B-only account ----------
  let s = start(ROOT, SWITCHING ? { CLUB_SWITCHING: '1' } : {}); await up(s);
  const O = (await ok(s, 'setup', { code: 'secret', name: 'Director', pin: '1234', agree: true })).token;
  const M = (await ok(s, 'redeem', { code: (await ok(s, 'invite', {}, O)).code, name: 'Mina', pin: '1111', agree: true })).token;
  const W = (await ok(s, 'redeem', { code: (await ok(s, 'invite', {}, O)).code, name: 'Omid', pin: '2222', agree: true })).token;
  await ok(s, 'avatar', { kind: 'photo', data: JPEG }, M);
  let B, BT;
  if(SWITCHING){
    B = (await ok(s, 'createClub', { name: 'Lounge Two', code: 'secret' }, O)).club;
    const r = await ok(s, 'redeem', { code: (await ok(s, 'invite', {}, O, B)).code, name: 'Bonly', pin: '3333', agree: true });
    BT = r.token;
    check(r.club === B, 'flag on: Bonly joined club B only, with B\'s invite');
    await ok(s, 'joinInvite', { code: (await ok(s, 'invite', {}, O, B)).code }, W);
    await ok(s, 'avatar', { kind: 'photo', data: JPEG }, BT);
    const oMain = await session(s, O, 'main'), bB = await session(s, BT, 'main');
    check(names(oMain.view) === 'Director,Mina,Omid', 'flag on: main roster is Director,Mina,Omid (Bonly hidden)');
    check(bB.view.club.id === B && bB.view.clubs.length === 1, 'flag on: Bonly asking for main lands in B, the only club listed');
    oMain.ws.close(); bB.ws.close();
    await stop(s);
  } else {
    await stop(s);
    // exactly what the club switching code writes: server/index.js redeem (noMain account), clubs.create, clubs.addMember
    const d = readData(), now = Date.now(), dirId = d.owner, omidId = d['name:omid'];
    B = 'c' + crypto.randomBytes(5).toString('hex');
    const id = 'u' + crypto.randomBytes(6).toString('hex'), salt = crypto.randomBytes(12).toString('hex');
    BT = crypto.randomBytes(24).toString('base64url');
    d['user:' + id] = { id, name: 'Bonly', salt, pin: crypto.scryptSync('3333', salt, 32).toString('hex'), role: 'member', createdAt: now, agreedAt: now,
      noMain: true, clubs: { [B]: { role: 'member', joinedAt: now, invitedBy: dirId } } };
    d['name:bonly'] = id;
    d['session:' + sha(BT)] = { uid: id, at: now };
    d['avatar:' + id] = { v: now.toString(36), data: JPEG.split(',')[1] };
    d['user:' + id].av = 'p:' + now.toString(36);
    d['clubdef:' + B] = { id: B, name: 'Lounge Two', createdAt: now, createdBy: dirId };
    d['user:' + dirId] = { ...d['user:' + dirId], clubs: { [B]: { role: 'owner', joinedAt: now } } };
    d['user:' + omidId] = { ...d['user:' + omidId], clubs: { [B]: { role: 'member', joinedAt: now, removed: false, invitedBy: dirId } } };
    d[`club:${B}:owner`] = dirId;
    fs.writeFileSync(DATA, JSON.stringify(d));
  }
  const before = readData();
  const bid = before['name:bonly'], bRec = JSON.stringify(before['user:' + bid]);
  check(before['user:' + bid].noMain === true && before['user:' + bid].clubs[B].role === 'member', 'data holds a B-only account marked noMain');
  check(!!before['avatar:' + bid] && Object.keys(before).some(k => k.startsWith('session:') && before[k].uid === bid), 'Bonly has a picture and a live session token');

  // ---------- 2. rollback: club switching off ----------
  const line = RUN === ROOT ? 'flag off' : 'rollback line';
  s = start(RUN); await up(s);
  check(!(await ok(s, 'status')).clubSwitching, `${line}: club switching is off`);
  // sign-in
  const bl = await call(s, 'login', { name: 'Bonly', pin: '3333' });
  check(bl.status === 400 && bl.body.error === 'Name or PIN is not right.' && !bl.body.token, `${line}: Bonly cannot sign in with name and PIN (same answer as a wrong PIN)`);
  check((await call(s, 'login', { name: 'bonly', pin: '3333' })).status === 400, `${line}: nor with the name in another case`);
  const bh = await session(s, BT);
  check(bh.denied && !bh.view, `${line}: Bonly's old session token is refused on the socket (no club view)`);
  check((await call(s, 'bizList', {}, BT)).status === 401, `${line}: Bonly's old token cannot read the Exchange`);
  check((await call(s, 'oppList', {}, BT)).status === 401, `${line}: Bonly's old token cannot read Opportunity listings`);
  const ba = await call(s, 'avatar', { kind: 'none' }, BT);
  check(ba.status === 400 && ba.body.error === 'Sign in first.', `${line}: Bonly's old token cannot change the shared account`);
  const bi = await call(s, 'invite', {}, BT);
  check(bi.status !== 200 && !bi.body.code, `${line}: Bonly's old token cannot make a main invite`);
  // the name stays taken: nobody (Bonly included) can take over or recreate the account through a main invite
  const takeover = await call(s, 'redeem', { code: (await ok(s, 'invite', {}, O)).code, name: 'Bonly', pin: '3333', agree: true });
  check(takeover.status === 400 && /name is taken/.test(takeover.body.error), `${line}: a main invite cannot reuse or take over the name Bonly`);
  // rosters and member views
  const ol = await ok(s, 'login', { name: 'Director', pin: '1234' }), ml = await ok(s, 'login', { name: 'Mina', pin: '1111' }), wl = await ok(s, 'login', { name: 'Omid', pin: '2222' });
  check(!!ol.token && !!ml.token && !!wl.token, `${line}: Director, Mina and Omid (also in B) sign in as before`);
  const so = await session(s, ol.token), sm = await session(s, ml.token), sw = await session(s, wl.token);
  check(!so.denied && !sm.denied && !sw.denied, `${line}: their sockets are accepted`);
  check(names(so.view) === 'Director,Mina,Omid' && so.view.me.owner === true, `${line}: owner's roster is Director,Mina,Omid`);
  check(names(sm.view) === 'Director,Mina,Omid' && names(sw.view) === 'Director,Mina,Omid', `${line}: members' rosters are Director,Mina,Omid`);
  check(![so, sm, sw].some(x => JSON.stringify(x.view).includes(bid)), `${line}: Bonly's id appears nowhere in any main view`);
  check(!JSON.stringify(so.view).includes('Bonly') && !JSON.stringify(so.view).includes('Lounge Two'), `${line}: nor Bonly's name or club B's name`);
  check(so.view.invitedCount === 2, `${line}: the organizer's invited count is Mina and Omid, not Bonly`);
  sm.send({ t: 'profile', uid: bid });
  check(!(await sm.waitFor(m => m.t === 'profile', 600)), `${line}: a member asking for Bonly's profile gets nothing`);
  sm.send({ t: 'profile', uid: sw.view.me.id });
  check(!!(await sm.waitFor(m => m.t === 'profile' && m.profile.name === 'Omid')), `${line}: a member's profile still opens`);
  // picture
  check((await fetch(s.base + '/avatar/' + bid)).status === 404, `${line}: Bonly's picture is not served`);
  check((await fetch(s.base + '/avatar/' + sm.view.me.id)).status === 200, `${line}: Mina's picture is served as before`);
  // owner actions aimed at Bonly change nothing
  for(const m of [{ t: 'mute', uid: bid, muted: true }, { t: 'household', uid: bid, with: sm.view.me.id }, { t: 'household', uid: sm.view.me.id, with: bid }, { t: 'remove', uid: bid }, { t: 'avatarClear', uid: bid }]) so.send(m);
  await sleep(400);
  // tables and chat
  so.send({ t: 'create', name: 'Guard Night', stack: 3000, levelMin: 20, repeat: 'none', tableSize: 9 });
  await sleep(300); sm.send({ t: 'join' }); sw.send({ t: 'join' }); await sleep(400);
  so.send({ t: 'start' });
  const tm = await sm.waitFor(m => m.t === 'table');
  check(!!tm, `${line}: Mina and Omid's tournament starts and Mina gets her table`);
  const dbg = await (await fetch(s.base + '/debug/chips')).json();
  const seated = dbg.detail.flatMap(t => t.seats.map(x => x[1])).sort();
  check(JSON.stringify(seated) === JSON.stringify([sm.view.me.id, sw.view.me.id].sort()), `${line}: only Mina and Omid are seated; Bonly is at no main table`);
  const lastT = [...so.msgs].reverse().find(m => m.t === 'club');
  check(!lastT.club.tourney.regs.includes(bid), `${line}: Bonly is not registered`);
  sm.send({ t: 'chat', text: 'hi table' });
  check(!!(await sw.waitFor(m => m.t === 'chat' && m.msg.text === 'hi table')), `${line}: table chat works for main members`);
  check((await call(s, 'bizList', {}, ml.token)).status === 200, `${line}: Mina still reads the Exchange`);
  const mv = await session(s, ml.token);
  check(!!mv.view.shop && Array.isArray(mv.view.shop.mine), `${line}: Mina still gets her rewards view`);
  mv.ws.close();
  for(const x of [so, sm, sw, bh]) x.ws.close();
  await stop(s);
  const after = readData();
  check(JSON.stringify(after['user:' + bid]) === bRec, `${line}: Bonly's stored record is byte-identical (noMain and club B kept)`);
  check(after['name:bonly'] === bid && !!after['avatar:' + bid], `${line}: Bonly's name and picture are kept for club B`);

  // ---------- 3. roll forward: flag back on, Bonly is still in B and only in B ----------
  if(SWITCHING){
    s = start(ROOT, { CLUB_SWITCHING: '1' }); await up(s);
    const bt = await ok(s, 'login', { name: 'Bonly', pin: '3333' });
    const sb = await session(s, bt.token, 'main');
    check(sb.view.club.id === B && sb.view.clubs.length === 1 && sb.view.clubs[0].id === B, 'flag on again: Bonly signs in to B, still only in B');
    const ob = await session(s, (await ok(s, 'login', { name: 'Director', pin: '1234' })).token, 'main');
    check(names(ob.view) === 'Director,Mina,Omid', 'flag on again: main roster still Director,Mina,Omid');
    sb.ws.close(); ob.ws.close();
    await stop(s);
  }

  // ---------- 4. the store itself (every server module reads accounts through it) ----------
  process.env.DATA_FILE = path.join(tmp, 'unit.json'); process.env.CLUB_SWITCHING = ''; process.env.STAGING = '';
  const store = require(path.join(RUN, 'server', 'store'));
  await store.init();
  const hid = { id: 'u00000000000b', name: 'Bonly', role: 'member', noMain: true, clubs: { cb: { role: 'member' } } }, vis = { id: 'u00000000000a', name: 'Mina', role: 'member' };
  // pictures first: once the noMain account is stored, its picture can no longer be written either
  store.set('avatar:' + hid.id, { v: 'x', data: 'AA' }); store.set('avatar:' + vis.id, { v: 'y', data: 'BB' }); store.set('user:' + hid.id, hid); store.set('user:' + vis.id, vis);
  check(store.get('user:' + hid.id) === undefined && store.get('avatar:' + hid.id) === undefined, 'store: a noMain account and its picture read as missing');
  check(store.get('user:' + vis.id) === vis && store.get('avatar:' + vis.id).data === 'BB', 'store: a normal account and its picture read as stored');
  check(JSON.stringify(store.keys('user:')) === JSON.stringify(['user:' + vis.id]) && JSON.stringify(store.values('user:')) === JSON.stringify([vis]), 'store: keys and values list only the normal account');
  check(store.keys('').length === 2 && store.keys('avatar:').length === 1, 'store: a full key listing skips the noMain account and its picture');
  store.set('user:' + hid.id, { id: hid.id, name: 'Bonly', role: 'member' }); store.del('user:' + hid.id); store.del('avatar:' + hid.id); store.set('avatar:' + hid.id, { v: 'z', data: 'CC' });
  store.set('user:' + vis.id, { ...vis, muted: true });
  await store.flush();
  const raw = JSON.parse(fs.readFileSync(process.env.DATA_FILE, 'utf8'));
  check(JSON.stringify(raw['user:' + hid.id]) === JSON.stringify(hid) && raw['avatar:' + hid.id].data === 'AA', 'store: writes and deletes cannot touch the noMain account or its picture');
  check(raw['user:' + vis.id].muted === true, 'store: writes to a normal account work as before');
  if(SWITCHING && RUN === ROOT){
    process.env.CLUB_SWITCHING = '1';
    check(store.get('user:' + hid.id).noMain === true && store.keys('user:').length === 2, 'store: with club switching on, the plain store is unchanged (clubs filter through scoped())');
    check(store.scoped('main').get('user:' + hid.id) === undefined && store.scoped('cb').get('user:' + hid.id).name === 'Bonly', "store: with it on, main's scoped view still hides the account and club cb sees it");
    process.env.CLUB_SWITCHING = '';
  }

  console.log(`\n${n} ok, 0 failed`);
  fs.rmSync(tmp, { recursive: true, force: true }); process.exit(0);
})().catch(e => { console.error('FAIL', e.message); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(1); });
