// Club switching (CLUB_SWITCHING=1): one account, several clubs, and nothing of one club reaches another.
// Covers: creating a club (organizer + setup code only), joining a second club by its invite (new account or existing
// name + PIN, or signed in), membership checks on every entry point (socket hello, x-club header, Exchange, logos),
// member lists, invites, tournaments, tables, chat, fairness reports, profiles, removal, and where the data is stored.
const assert = require('assert');
const fs = require('fs');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const PORT = 4350 + Math.floor(Math.random() * 50), BASE = 'http://localhost:' + PORT;
const DATA = require('os').tmpdir() + '/t_club_switching_' + process.pid + '.json';
const srv = spawn('node', ['server/index.js'], { cwd: __dirname + '/..', env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '1', STAGING: '', CLUBS_DEFAULT: '', CLUB_SWITCHING: '1' }, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function call(p, body, tok, club){
  const r = await fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}), ...(club ? { 'x-club': club } : {}) }, body: JSON.stringify(body || {}) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
async function ok(p, body, tok, club){ const r = await call(p, body, tok, club); assert.strictEqual(r.status, 200, `${p}: ${JSON.stringify(r.body)}`); return r.body; }
// a live app connection: keeps every message it receives
function session(tok, club){
  return new Promise((res, rej) => {
    const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws'), s = { ws, msgs: [], view: null, closed: null };
    s.send = m => ws.send(JSON.stringify(m));
    s.waitFor = async (pred, ms = 4000) => { const end = Date.now() + ms; while(Date.now() < end){ const m = s.msgs.find(pred); if(m) return m; await sleep(30); } return null; };
    s.fresh = async () => { const n = s.msgs.length; await sleep(150); return s.view; };
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: tok, club })));
    ws.on('message', m => { m = JSON.parse(m); s.msgs.push(m); if(m.t === 'auth' && !m.ok){ s.denied = true; res(s); } if(m.t === 'club'){ s.view = m.club; if(!s.ready){ s.ready = true; res(s); } } });
    ws.on('close', code => { s.closed = code; if(!s.ready) res(s); });
    ws.on('error', rej); setTimeout(() => rej(new Error('timeout')), 5000);
  });
}
let n = 0; const check = (c, msg) => { assert.ok(c, msg); n++; console.log('ok  ', msg); };
const ids = v => v.members.map(m => m.id).sort();
(async () => {
  for(let i = 0; i < 40; i++){ try{ if((await fetch(BASE + '/healthz')).ok) break; }catch(e){} await sleep(150); }
  check((await ok('status')).clubSwitching === true, 'status says club switching is on');
  // main club: owner + two members
  const O = (await ok('setup', { code: 'secret', name: 'Director', pin: '1234', agree: true })).token;
  const M1 = (await ok('redeem', { code: (await ok('invite', {}, O)).code, name: 'Mina', pin: '1111', agree: true })).token;
  const M2 = (await ok('redeem', { code: (await ok('invite', {}, O)).code, name: 'Omid', pin: '2222', agree: true })).token;
  const mainV = (await session(O)).view;
  check(mainV.club.id === 'main' && mainV.clubs.length === 1 && mainV.canCreateClub === true, 'organizer starts with one club and may open another');

  // opening a club: organizer + setup code only
  check((await call('createClub', { name: 'Lounge Two', code: 'nope' }, O)).status === 400, 'a wrong setup code cannot open a club');
  check((await call('createClub', { name: 'Lounge Two', code: 'secret' }, M1)).status === 400, 'a member cannot open a club, even with the code');
  check((await call('createClub', { name: 'Lounge Two', code: 'secret' })).status === 400, 'nobody signed out can open a club');
  const B = (await ok('createClub', { name: 'Lounge Two', code: 'secret' }, O)).club;
  check(/^c[0-9a-f]{10}$/.test(B), 'organizer opened club B');

  // joining B: a new account, an existing account by name + PIN, and a signed-in member
  const bInvite = (await ok('invite', { }, O, B)).code;
  const N1r = await ok('redeem', { code: bInvite, name: 'Nika', pin: '3333', agree: true });
  const N1 = N1r.token;
  check(N1r.club === B, 'a new person joins B with B\'s link');
  const bGroup = await session(O, B); bGroup.send({ t: 'invite', group: true }); const gi = await bGroup.waitFor(m => m.t === 'invite');
  check(gi && gi.group, 'B organizer made a B group link');
  check((await call('redeem', { code: gi.code, name: 'Omid', pin: '9999', agree: true })).status === 400, 'an existing name with the wrong PIN cannot join B');
  const M2b = await ok('redeem', { code: gi.code, name: 'Omid', pin: '2222', agree: true });
  check(M2b.club === B, 'an existing member joins B with their own name and PIN');
  check((await ok('joinClub', { code: gi.code }, M1)).club === B, 'a signed-in member joins B with B\'s link');
  bGroup.ws.close();

  // who is where
  const oB = await session(O, B), n1 = await session(N1, 'main'), m1B = await session(M1, B), m1A = await session(M1, 'main');
  const m3 = (await ok('redeem', { code: (await ok('invite', {}, O)).code, name: 'Parsa', pin: '4444', agree: true })).token;
  const p3 = await session(m3, B);
  check(n1.view.club.id === B && !n1.denied, 'a B-only member asking for main lands in B instead');
  check(p3.view.club.id === 'main', 'a main-only member asking for B lands in main instead');
  const nameSet = v => v.members.map(m => m.name).sort().join(',');
  check(nameSet(oB.view) === 'Director,Mina,Nika,Omid', 'B lists only B members');
  const oA = await session(O);
  check(nameSet(oA.view) === 'Director,Mina,Omid,Parsa', 'main lists only main members (Nika never joined main)');
  check(oB.view.me.owner === true && m1B.view.me.owner === false, 'roles are per club');
  check(JSON.stringify(m1B.view.clubs.map(c => c.id).sort()) === JSON.stringify([B, 'main'].sort()), 'a two-club member is told both clubs');
  check(n1.view.clubs.length === 1 && n1.view.clubs[0].id === B, 'a B-only member is told only B');

  // the header and the socket both check membership
  check((await call('invite', {}, N1, 'main')).status === 403, 'a B-only member cannot act in main with x-club');
  check((await call('bizList', {}, N1, 'main')).status === 403, 'a B-only member cannot read main\'s Exchange');
  check((await call('invite', {}, m3, B)).status === 403, 'a main-only member cannot act in B with x-club');
  check((await call('invite', {}, N1, 'cdeadbeef00')).status === 403, 'an unknown club id is refused');
  check((await call('bizList', {}, m3, B)).status === 403, 'a main-only member cannot read B\'s Exchange');
  const blog = await fetch(BASE + '/bizlogo/' + oA.view.me.id, { headers: { authorization: 'Bearer ' + m3, 'x-club': B } });
  check(blog.status === 404, 'a main-only member cannot fetch B logos');

  // invites are per club: B's codes only ever open B
  check(!oA.view.invites.some(i => i.code === bInvite || i.code === gi.code), 'main\'s invite list has none of B\'s links');
  check(oB.view.invites.every(i => i.code !== bInvite) && oB.view.invites.some(i => i.code === gi.code), 'B\'s open links are listed only in B');
  check((await ok('joinClub', { code: gi.code }, N1)).club === B && (await call('invite', {}, N1, 'main')).status === 403, 'using B\'s link again gives no access to main');

  // Exchange data stays in its club
  oB.send({ t: 'clubs', on: true }); oA.send({ t: 'clubs', on: true }); await sleep(200);
  const biz = { name: 'Nika Studio', category: (require('../server/business').CATEGORIES[0] || {}).id || 'other', tagline: 'B only', about: 'In club B only.' };
  const save = await call('bizSave', biz, N1, B);
  check(save.status === 200, 'a B member saves a business in B');
  await call('bizPublish', { on: true }, N1, B);
  const listB = await call('bizList', {}, M1, B), listA = await call('bizList', {}, M1, 'main');
  const has = r => JSON.stringify(r.body).includes('Nika Studio');
  check(listA.status === 200 && !has(listA), 'main\'s Exchange does not show B\'s business');
  check(listB.status === 200 && has(listB), 'B\'s Exchange shows it to B members (control)');

  // tournaments, tables, chat and fairness reports per club
  oA.send({ t: 'create', name: 'Main Night', stack: 3000, levelMin: 20, repeat: 'none', tableSize: 9 });
  oB.send({ t: 'create', name: 'B Night', stack: 3000, levelMin: 20, repeat: 'none', tableSize: 9 });
  await sleep(300);
  const p3A = p3, m2 = await session(M2, 'main');
  p3A.send({ t: 'join' }); m2.send({ t: 'join' }); n1.send({ t: 'join' }); m1B.send({ t: 'join' }); await sleep(300);
  check(oA.view.tourney.name === 'Main Night' && oB.view.tourney.name === 'B Night', 'each club has its own tournament');
  check(n1.view.tourney.name === 'B Night' && !n1.msgs.some(m => m.t === 'club' && m.club.tourney && m.club.tourney.name === 'Main Night'), 'B members never get main\'s tournament');
  oA.send({ t: 'start' }); oB.send({ t: 'start' });
  await sleep(1500);
  const aIds = new Set(ids(oA.view)), bIds = new Set(ids(oB.view));
  const seatsOf = s => s.msgs.filter(m => m.t === 'table').flatMap(m => m.table.seats.filter(Boolean).map(x => x.uid));
  check(seatsOf(n1).length && seatsOf(n1).every(u => bIds.has(u)), 'a B player only ever receives B tables');
  check(seatsOf(p3A).length && seatsOf(p3A).every(u => aIds.has(u)), 'a main player only ever receives main tables');
  // watching a table id from the other club shows only your own club's table of that id, if any
  const mainTid = oA.view.tables[0] && oA.view.tables[0].tid;
  n1.send({ t: 'watch', tid: mainTid }); await sleep(300);
  check(seatsOf(n1).every(u => bIds.has(u)), 'watching main\'s table id from B shows nothing of main');
  n1.send({ t: 'chat', text: 'hello from B' }); await sleep(300);
  check(m1B.msgs.some(m => m.t === 'chat' && m.msg.text === 'hello from B'), 'B table chat reaches the B table (control)');
  check(!p3A.msgs.some(m => m.t === 'chat') && !m2.msgs.some(m => m.t === 'chat') && !oA.msgs.some(m => m.t === 'chat'), 'B table chat never reaches main sockets');
  n1.send({ t: 'fair', id: oA.view.tourney.id }); const fr = await n1.waitFor(m => m.t === 'fair');
  // tournament ids are time-based and can match across clubs; a lookup only ever searches the asker's own club
  check(fr && (fr.report === null || (fr.report.name === 'B Night' && fr.report.seal === oB.view.tourney.seal && fr.report.seal !== oA.view.tourney.seal)), 'a B member cannot open main\'s fairness report');
  const nikaId = oB.view.members.find(m => m.name === 'Nika').id, parsaId = oA.view.members.find(m => m.name === 'Parsa').id;
  p3A.send({ t: 'profile', uid: nikaId }); n1.send({ t: 'profile', uid: parsaId }); await sleep(300);
  check(!p3A.msgs.some(m => m.t === 'profile') && !n1.msgs.some(m => m.t === 'profile'), 'profiles of the other club\'s members are not served');
  n1.send({ t: 'create', name: 'x' }); const er = await n1.waitFor(m => m.t === 'error');
  check(er && /owner/.test(er.error), 'a B member has no organizer rights in B');
  m1B.send({ t: 'remove', uid: parsaId }); await sleep(200);
  check(oA.view.members.some(m => m.id === parsaId), 'a B member cannot remove main members');

  // removing someone from B ends only that membership
  const minaId = oB.view.members.find(m => m.name === 'Mina').id;
  oB.send({ t: 'remove', uid: minaId }); await sleep(400);
  check(m1B.closed === 4004, 'Mina\'s B screen is closed');
  const mAgain = await session(M1, B);
  check(mAgain.view && mAgain.view.club.id === 'main' && mAgain.view.clubs.length === 1, 'Mina keeps her account and main club');
  check((await call('login', { name: 'Mina', pin: '1111' })).status === 200, 'Mina can still sign in');
  check((await call('redeem', { code: (await ok('invite', {}, O)).code, name: 'Mina', pin: '5555', agree: true })).status === 400, 'Mina\'s name stays hers');
  check(!oB.view.members.some(m => m.id === minaId) && oA.view.members.some(m => m.id === minaId), 'B no longer lists Mina; main still does');

  // where the data lives: main keeps today's keys, B's data is under its own prefix, accounts are shared
  for(const s of [oB, n1, m1A, oA, p3, m2, mAgain]) s.ws.close();
  await sleep(400);
  const raw = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const keys = Object.keys(raw);
  check(keys.includes('tourney') && keys.includes(`club:${B}:tourney`) && raw.tourney.name === 'Main Night' && raw[`club:${B}:tourney`].name === 'B Night', 'tournaments are stored per club (main unprefixed)');
  check(keys.filter(k => k.startsWith('invite:')).every(k => !raw[k].code || ![bInvite, gi.code].includes(raw[k].code)), 'B invites are not stored with main\'s');
  check(raw['clubdef:' + B].name === 'Lounge Two' && raw[`club:${B}:owner`] === oA.view.me.id, 'club list and B owner stored');
  const nika = raw['user:' + nikaId];
  check(nika.noMain === true && nika.clubs[B].role === 'member' && !nika.role.includes('owner'), 'a B-only account is marked as not in main');
  console.log(`${n} ok, 0 failed`);
  srv.kill(); try{ fs.unlinkSync(DATA); }catch(e){} process.exit(0);
})().catch(e => { console.error('FAIL', e.message); srv.kill(); try{ fs.unlinkSync(DATA); }catch(_){} process.exit(1); });
