// Blindrise platform layer with club switching (owner decisions 2026-10-20, Issue #10; server/platform.js):
// - who may open a club: the founder (setup code), or a business member (published, not hidden, main Exchange
//   business), one club each, ever; the Club Rules must be accepted in their current version (fail closed)
// - a business member's club is isolated like any other club
// - suspend / restore / cancel by the founder only, acting on a live club (tournament paused, members switched to the
//   notice, no table data, QR join and invites stopped), with an append-only log
// - Blindrise posts shown in every club, badged, carrying only what the founder typed
// - the founder's overview: counts only, no names or emails
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't_platform_'));
const DATA = path.join(tmp, 'data.json');
const PORT = 5300 + Math.floor(Math.random() * 300), BASE = 'http://localhost:' + PORT;
const srv = spawn('node', ['server/index.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '1', STAGING: '', CLUBS_DEFAULT: 'on', CLUB_SWITCHING: '1' }, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let n = 0; const check = (c, msg) => { assert.ok(c, msg); n++; console.log('ok  ', msg); };
async function call(p, body, tok, club){
  const r = await fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}), ...(club ? { 'x-club': club } : {}) }, body: JSON.stringify(body || {}) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
async function ok(...a){ const r = await call(...a); assert.strictEqual(r.status, 200, `${a[0]}: ${JSON.stringify(r.body)}`); return r.body; }
function session(tok, club){
  return new Promise((res, rej) => {
    const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws'), s = { ws, msgs: [], view: null, closed: null };
    s.send = m => ws.send(JSON.stringify(m));
    s.waitFor = async (pred, ms = 4000) => { const end = Date.now() + ms; while(Date.now() < end){ const m = s.msgs.find(pred); if(m) return m; await sleep(30); } return null; };
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: tok, club })));
    ws.on('message', m => { m = JSON.parse(m); s.msgs.push(m); if(m.t === 'auth' && !m.ok){ s.denied = m; res(s); } if(m.t === 'club'){ s.view = m.club; if(!s.ready){ s.ready = true; res(s); } } });
    ws.on('close', code => { s.closed = code; if(!s.ready) res(s); });
    ws.on('error', rej); setTimeout(() => rej(new Error('timeout')), 5000);
  });
}
const view = async (tok, club) => { const s = await session(tok, club); s.ws.close(); return s.view; };
const RULES = { rulesV: 1, acceptRules: true };
const biz = name => ({ name, category: 'food', tagline: 'Fresh daily', about: 'A test business for this run.' });
const end = code => { srv.kill(); try{ fs.rmSync(tmp, { recursive: true, force: true }); }catch(e){} process.exit(code); };
(async () => {
  for(let i = 0; i < 60; i++){ try{ if((await fetch(BASE + '/healthz')).ok) break; }catch(e){} await sleep(150); }
  const O = (await ok('setup', { code: 'secret', name: 'Founder', pin: '1234', agree: true })).token;
  const join = async name => (await ok('redeem', { code: (await ok('invite', {}, O)).code, name, pin: '1357', agree: true })).token;
  const Bo = await join('Bakery Bo'), M = await join('Mina'), Ub = await join('Draft Dee'), Hb = await join('Hidden Hal');
  await ok('bizSave', biz('Bo Bakery'), Bo); await ok('bizPublish', { on: true }, Bo);
  await ok('bizSave', biz('Dee Drafts'), Ub); // saved, never published
  await ok('bizSave', biz('Hal Hidden'), Hb); await ok('bizPublish', { on: true }, Hb);
  const halId = (await view(Hb)).me.id;
  await ok('bizModerate', { uid: halId, hidden: true }, O);

  // ---------- who may open a club ----------
  check((await view(Bo)).openClub && (await view(Bo)).openClub.rules.v === 1, 'a business member is offered "Create your club", with the Club Rules');
  check(!(await view(M)).openClub && !(await view(Ub)).openClub && !(await view(Hb)).openClub, 'members without a published, visible business are not offered it');
  const rules = (await view(O)).platform.rules;
  check(rules.v === 1 && rules.items.length === 8 && rules.items[6].startsWith('7. Enforcement: if a club breaks these rules or the law'), 'the founder\'s view carries the Club Rules, version 1, verbatim');
  for(const [d, why] of [[{}, 'no acceptance'], [{ acceptRules: true }, 'no version'], [{ rulesV: 1, acceptRules: 'true' }, 'acceptance not exactly true'], [{ rulesV: 0, acceptRules: true }, 'an old version'], [{ rulesV: 2, acceptRules: true }, 'an unknown version']]){
    const r = await call('createClub', { name: 'Bo Club', ...d }, Bo);
    check(r.status === 400 && /Club Rules/.test(r.body.error), `refused with ${why}`);
  }
  check((await call('createClub', { name: 'Founder Two', code: 'secret' }, O)).status === 400, 'the founder is refused too without acceptance');
  check((await view(O)).platform.clubs.length === 0, 'no club was made by any refused attempt');
  check((await call('createClub', { name: 'Mina Club', ...RULES }, M)).status === 403, 'a member without a business is refused (403)');
  check((await call('createClub', { name: 'Dee Club', ...RULES }, Ub)).status === 403, 'a member with an unpublished business is refused (403)');
  check((await call('createClub', { name: 'Hal Club', ...RULES }, Hb)).status === 403, 'a member whose business the director hid is refused (403)');
  check((await call('createClub', { name: 'Anon Club', ...RULES })).status === 400, 'nobody signed out can open a club');
  const C = (await ok('createClub', { name: 'Bakery Club', ...RULES }, Bo)).club;
  check(/^c[0-9a-f]{10}$/.test(C), 'the business member opens their club with no setup code, after accepting the rules');
  const again = await call('createClub', { name: 'Bakery Two', ...RULES }, Bo);
  check(again.status === 403 && /already opened a club/.test(again.body.error), 'a second club for the same member is refused (403)');
  check(!(await view(Bo)).openClub, 'and the offer is gone');
  const B = (await ok('createClub', { name: 'Founder Lounge', code: 'secret', ...RULES }, O)).club;
  const B2 = (await ok('createClub', { name: 'Founder Annex', code: 'secret', ...RULES }, O)).club;
  check(B && B2, 'the founder still opens clubs with the setup code, and is not limited to one');

  // ---------- the business member's club is isolated ----------
  const boC = await view(Bo, C), boMain = await view(Bo, 'main');
  check(boC.club.id === C && boC.me.owner === true && boC.members.map(m => m.name).join() === 'Bakery Bo', 'Bo owns the new club, which lists only Bo');
  check(boC.joinQr && boC.joinQr.length === 1 && boC.joinQr[0].id === C && !boMain.joinQr && boMain.me.owner === false, 'Bo gets the QR card for that club only, and no owner rights in main');
  const cInv = (await ok('invite', {}, Bo, C)).code;
  const N = (await ok('redeem', { code: cInv, name: 'Nika', pin: '3333', agree: true })).token;
  check((await call('bizList', {}, N, 'main')).status === 403 && (await call('invite', {}, N, 'main')).status === 403, 'a member of Bo\'s club cannot reach main');
  const cList = await ok('bizList', {}, N, C);
  check(!JSON.stringify(cList).includes('Bo Bakery'), 'Bo\'s Exchange business stays in main; nothing is copied into the new club');
  check((await call('invite', {}, O, C)).status === 403 && (await call('bizList', {}, M, C)).status === 403, 'the founder and main members cannot reach Bo\'s club');
  const cInfo = await ok('joinInfo', { slug: 'bakery-club' });
  await ok('joinClub', { slug: 'bakery-club', email: 'lead@example.com', agree: true, token: cInfo.token });
  check((await view(Bo, C)).joinQr[0].leads.length === 1 && (await view(O)).joinQr.every(q => q.leads.length === 0), 'a QR sign-up for Bo\'s club reaches only Bo');

  // ---------- the founder's overview: counts only ----------
  const pv = (await view(O)).platform, row = pv.clubs.find(x => x.id === C);
  check(JSON.stringify(Object.keys(row).sort()) === JSON.stringify(['createdAt', 'id', 'members', 'name', 'signups', 'status']), 'each club row has id, name, status, date and counts only');
  check(row.members === 2 && row.signups === 1 && row.status === 'active', 'counts are right (2 members, 1 sign-up)');
  const pvs = JSON.stringify(pv);
  check(!/Nika|Mina|Bakery Bo|lead@example\.com|@/.test(pvs), 'no member names and no emails in the founder\'s overview');

  // ---------- only the founder moderates or posts ----------
  for(const [tok, who] of [[Bo, 'a club owner'], [M, 'a member'], [N, 'a member of another club']]){
    check((await call('clubModerate', { club: C, action: 'suspend' }, tok)).status === 403, `${who} cannot suspend (403)`);
    check((await call('clubModerate', { club: B, action: 'cancel' }, tok)).status === 403, `${who} cannot cancel (403)`);
    check((await call('platformPost', { title: 'Hi all', body: 'Hello there' }, tok)).status === 403, `${who} cannot post as Blindrise (403)`);
  }
  check((await call('clubModerate', { club: C, action: 'suspend' })).status === 403, 'nobody signed out can suspend');
  check((await call('clubModerate', { club: 'main', action: 'suspend' }, O)).status === 400, 'the main club cannot be suspended');
  check((await view(O)).platform.log.length === 0, 'refused attempts leave no log entry');

  // ---------- Blindrise posts reach every club, badged, with no member data ----------
  const when = Date.now() + 7 * 864e5;
  const post = await ok('platformPost', { kind: 'event', title: 'Blindrise Open Night', body: 'A night for every club.', when }, O);
  const seen = [await view(M), await view(N, C), await view(Bo, C), await view(O)];
  check(seen.every(v => v.blindrise && v.blindrise[0] && v.blindrise[0].id === post.id && v.blindrise[0].title === 'Blindrise Open Night' && v.blindrise[0].when === when), 'the post shows in main, in Bo\'s club and to the founder');
  const p0 = seen[1].blindrise[0];
  check(JSON.stringify(Object.keys(p0).sort()) === JSON.stringify(['at', 'body', 'id', 'kind', 'title', 'when']) && !JSON.stringify(seen[1].blindrise).includes(seen[3].me.id), 'a post carries only what the founder typed (no author id or member data)');
  check(!JSON.stringify(seen[1]).includes('Mina') && !JSON.stringify(seen[0]).includes('Nika'), 'clubs still never see each other\'s members');
  check((await call('platformPost', { kind: 'event', title: 'No date', body: 'Missing date' }, O)).status === 400, 'an event needs a date');

  // ---------- suspend a live club: a tournament running, members connected ----------
  const bInv = (await ok('invite', {}, O, B)).code;
  const P1 = (await ok('redeem', { code: bInv, name: 'Parsa', pin: '4444', agree: true })).token;
  const P2 = (await ok('redeem', { code: (await ok('invite', {}, O, B)).code, name: 'Rumi', pin: '5555', agree: true })).token;
  const oB = await session(O, B), p1 = await session(P1, B), p2 = await session(P2, B);
  oB.send({ t: 'create', name: 'B Night', stack: 3000, levelMin: 20, repeat: 'none', tableSize: 9 }); await sleep(300);
  p1.send({ t: 'join' }); p2.send({ t: 'join' }); await sleep(300);
  oB.send({ t: 'start' });
  check(!!(await p1.waitFor(m => m.t === 'table' && m.table.phase === 'hand')), 'B\'s tournament is running and dealing to its players');
  await sleep(400);
  const tablesBefore = p1.msgs.filter(m => m.t === 'table').length;
  const r = await ok('clubModerate', { club: B, action: 'suspend', reason: 'Test: rules check' }, O);
  check(r.status === 'suspended', 'the founder suspends B while its tournament is running');
  await sleep(300);
  const lastTable = s => { const t = s.msgs.filter(m => m.t === 'table'); return t[t.length - 1]; };
  const before = lastTable(p1), msgsAt = p1.msgs.length;
  check(p1.view.suspended === true && p2.view.suspended === true && oB.view.suspended === true, 'every connected member of B (owner too) is switched to the notice at once');
  check(!p1.view.members.length && !p1.view.tourney && !p1.view.tables.length && /suspended by Blindrise/.test(p1.view.notice), 'the notice view carries no members, tournament or tables');
  await sleep(3500); // longer than a FAST action deadline: a live club would have acted or dealt by now
  check(!p1.msgs.slice(msgsAt).some(m => m.t === 'table' || m.t === 'coach' || m.t === 'chat') && !p2.msgs.slice(msgsAt).some(m => m.t === 'table'), 'no table data, coach notes or chat reach B\'s members while suspended');
  check(p1.msgs.filter(m => m.t === 'table').length >= tablesBefore, 'control: table data did flow before');
  p1.send({ t: 'act', action: 'fold' }); oB.send({ t: 'resume' }); oB.send({ t: 'create', name: 'x' }); await sleep(300);
  check((await call('invite', {}, P1, B)).status === 403 && (await call('bizList', {}, P1, B)).status === 403, 'B\'s calls are refused while suspended (403)');
  const bSlug = 'founder-lounge';
  check((await ok('joinInfo', { slug: bSlug })).club === false, 'B\'s QR join page says "not active"');
  const bTok = (await ok('joinInfo', { slug: 'founder-annex' })).token;
  check((await call('joinClub', { slug: bSlug, email: 'x@example.com', agree: true, token: bTok })).status === 404, 'and joinClub refuses');
  check((await call('redeem', { code: bInv, name: 'Zed', pin: '7777', agree: true })).status === 400, 'B\'s invite links do not work while suspended');
  check((await view(O)).platform.clubs.find(x => x.id === B).status === 'suspended', 'the founder sees B as suspended');
  check((await call('clubModerate', { club: B, action: 'suspend' }, O)).status === 400, 'suspending twice is refused');

  // ---------- restore ----------
  await ok('clubModerate', { club: B, action: 'unsuspend', reason: 'Resolved' }, O);
  await sleep(300);
  check(p1.view.suspended !== true && p1.view.club.id === B && p1.view.members.length === 3, 'restoring gives B\'s members their club back, with its members kept');
  check(p1.view.tourney && p1.view.tourney.status === 'running' && p1.view.tourney.paused === true, 'the tournament is still there, paused for the owner to resume');
  p1.send({ t: 'watch', tid: before.table.tid });
  const after = await p1.waitFor(m => m.t === 'table' && p1.msgs.indexOf(m) >= msgsAt);
  const stacks = t => t.table.seats.filter(Boolean).map(s => s.uid + ':' + s.stack + ':' + s.bet).sort().join();
  check(after && after.table.handNo === before.table.handNo && stacks(after) === stacks(before), 'no hand was dealt and every stack and bet is unchanged');
  check((await ok('joinInfo', { slug: bSlug })).club === true, 'B\'s join page works again');
  oB.send({ t: 'resume' }); await sleep(300);
  check(oB.view.tourney.paused === false, 'the owner resumes the tournament');

  // ---------- cancel ----------
  const boS = await session(Bo, C), nS = await session(N, C);
  await ok('clubModerate', { club: C, action: 'cancel', reason: 'Test: cancel' }, O);
  await sleep(300);
  check(boS.closed === 4004 && nS.closed === 4004, 'cancelling closes the club\'s open screens');
  const boAfter = await view(Bo);
  check(boAfter.club.id === 'main' && boAfter.clubs.every(x => x.id !== C), 'Bo keeps main; the cancelled club is gone from the switcher');
  const nAfter = await session(N, C);
  check(nAfter.denied && nAfter.denied.reason === 'noclub', 'a member of only that club is told they have no club');
  check((await ok('joinInfo', { slug: 'bakery-club' })).club === false, 'its join page is not active');
  check((await call('createClub', { name: 'Bakery Again', ...RULES }, Bo)).status === 403, 'the same member cannot open another club after a cancel');
  check((await call('clubModerate', { club: C, action: 'unsuspend' }, O)).status === 400 && (await call('clubModerate', { club: C, action: 'cancel' }, O)).status === 400, 'a cancelled club stays closed for good');
  const row2 = (await view(O)).platform.clubs.find(x => x.id === C);
  check(row2.status === 'cancelled' && row2.members === 2, 'the founder sees it as cancelled, its data kept (2 members on record)');

  // ---------- the log ----------
  const log = (await view(O)).platform.log;
  check(log.length === 3 && log.map(e => e.action).join() === 'cancel,unsuspend,suspend', 'three uses, three log entries (newest first)');
  check(log.every(e => e.by === seen[3].me.id && e.byName === 'Founder' && typeof e.at === 'number') && log[2].club === B && log[2].reason === 'Test: rules check' && log[0].club === C, 'each entry has who, when, club, action and reason');
  check((await call('platformLogDelete', {}, O)).status === 404 && (await call('clubModerate', { club: B, action: 'editLog' }, O)).status === 400, 'there is no API to change the log');
  await ok('platformUnpost', { id: post.id }, O);
  check(!(await view(M)).blindrise.length, 'the founder can take a post down');

  for(const s of [oB, p1, p2, nAfter]) try{ s.ws.close(); }catch(e){}
  srv.kill('SIGTERM'); await new Promise(r => srv.on('exit', r));
  const raw = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const dC = raw['clubdef:' + C];
  check(dC.rules && dC.rules.uid === boC.me.id && dC.rules.v === 1 && typeof dC.rules.at === 'number' && dC.createdBy === boC.me.id, 'the rules acceptance is stored on the club: account, time, version');
  check(dC.removed === true && dC.cancelled.reason === 'Test: cancel' && Object.keys(raw).some(k => k.startsWith(`club:${C}:invite:`)), 'the cancelled club keeps its data');
  check(Object.keys(raw).filter(k => k.startsWith('platform:modlog:')).length === 3, 'the log is stored one key per entry');
  console.log(`t_platform: ${n} ok, 0 failed`);
  end(0);
})().catch(e => { console.error('FAIL', e.message); end(1); });
