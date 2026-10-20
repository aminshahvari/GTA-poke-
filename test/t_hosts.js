// Who runs tournaments (owner decision of 2026-10-20, "Blindrise only"): a club a member opens is a team, not a host.
// Its owner can't open, edit or start a tournament and gets no sponsor list; the Blindrise club and clubs the founder
// opened still host; the founder can allow a member's club (and stop it again), and each change is in the log.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let n = 0; const check = (c, msg) => { assert.ok(c, msg); n++; console.log('ok  ', msg); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't_hosts_'));
const PORT = 6700 + Math.floor(Math.random() * 300), BASE = 'http://localhost:' + PORT;
const srv = spawn('node', ['server/index.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: path.join(tmp, 'd.json'), FAST: '1', STAGING: '', CLUBS_DEFAULT: 'on', CLUB_SWITCHING: '1', DATABASE_URL: '' }, stdio: 'ignore' });
const end = code => { try{ srv.kill(); }catch(e){} try{ fs.rmSync(tmp, { recursive: true, force: true }); }catch(e){} process.exit(code); };
const call = async (api, body, tok, club) => { const r = await fetch(BASE + '/api/' + api, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}), ...(club ? { 'x-club': club } : {}) }, body: JSON.stringify(body || {}) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const ok = async (...a) => { const r = await call(...a); assert.strictEqual(r.status, 200, a[0] + ': ' + JSON.stringify(r.body)); return r.body; };
// one socket in a club: send a message, then wait for the club view or an error
function session(tok, club){
  return new Promise((res, rej) => {
    const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws'), s = { ws, view: null, errors: [] };
    s.send = m => ws.send(JSON.stringify(m));
    s.next = (pred, ms = 3000) => new Promise((ok2, no) => { const t0 = Date.now(), tick = () => { const v = pred(s); if(v) return ok2(v); if(Date.now() - t0 > ms) return no(new Error('timeout')); setTimeout(tick, 30); }; tick(); });
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: tok, club })));
    ws.on('message', m => { m = JSON.parse(m); if(m.t === 'error') s.errors.push(m.error); if(m.t === 'club'){ s.view = m.club; if(!s.ready){ s.ready = true; res(s); } } });
    ws.on('error', rej); setTimeout(() => rej(new Error('timeout')), 5000);
  });
}
const RULES = { rulesV: 1, acceptRules: true };
const TOURNEY = { t: 'create', name: 'Club Night', stack: 30000, levelMin: 20 };
(async () => {
  for(let i = 0; i < 60; i++){ try{ if((await fetch(BASE + '/healthz')).ok) break; }catch(e){} await sleep(150); }
  const O = (await ok('setup', { code: 'secret', name: 'Founder', pin: '1234', agree: true })).token;
  const mk = async name => (await ok('redeem', { code: (await ok('invite', {}, O)).code, name, pin: '1357', agree: true })).token;
  const Bo = await mk('Bakery Bo');
  await ok('bizSave', { name: 'Bo Bakery', category: 'food', tagline: 'Fresh', about: 'A bakery.' }, Bo); await ok('bizPublish', { on: true }, Bo);
  const B = (await ok('createClub', { name: 'Bakery Club', ...RULES }, Bo)).club;
  const F = (await ok('createClub', { name: 'Founder Lounge', code: 'secret', ...RULES }, O)).club;

  // a member's club: practice only
  const s = await session(Bo, B);
  check(s.view.hosts === false && !('sponsors' in s.view), 'a club a member opened does not host: hosts false, no sponsor list');
  for(const m of [TOURNEY, { t: 'start' }, { ...TOURNEY, t: 'edit' }]){
    s.errors.length = 0; s.send(m);
    const e = await s.next(x => x.errors[0]);
    check(e === 'Tournaments are run by Blindrise. Your members play them in the Blindrise Open.', `its owner cannot ${m.t} a tournament: "${e}"`);
  }
  check(!s.view.tourney || !['registering', 'running'].includes(s.view.tourney.status), 'no tournament was opened there');
  s.ws.close();

  // the Blindrise club and a club the founder opened still host
  for(const [club, what] of [['main', 'the Blindrise club'], [F, 'a club the founder opened']]){
    const f = await session(O, club);
    check(f.view.hosts === true && 'sponsors' in f.view, `${what} hosts, with the sponsor list (${JSON.stringify([f.view.hosts, f.view.sponsors])})`);
    f.send({ ...TOURNEY, name: 'Founder Night' }); const t = await f.next(x => x.view.tourney && x.view.tourney.status === 'registering' && x.view.tourney);
    check(t.name === 'Founder Night', `${what}: the founder opens a tournament`);
    f.send({ t: 'cancel' }); await f.next(x => x.view.tourney && x.view.tourney.status === 'cancelled'); f.ws.close();
  }

  // only the founder decides, and it is logged
  check((await call('clubModerate', { club: B, action: 'host' }, Bo)).status === 403, 'a club owner cannot allow their own club to host');
  const fv = await session(O, 'main');
  const row = fv.view.platform.clubs.find(x => x.id === B), mine = fv.view.platform.clubs.find(x => x.id === F);
  check(row && row.host === false && row.mine === false && mine.mine === true, 'the founder sees which clubs are his and which may host');
  fv.ws.close();
  await ok('clubModerate', { club: B, action: 'host', reason: 'Certified host' }, O);
  const s2 = await session(Bo, B);
  check(s2.view.hosts === true && 'sponsors' in s2.view, 'once the founder allows it, the club hosts and gets its sponsor list');
  s2.send(TOURNEY); await s2.next(x => x.view.tourney && x.view.tourney.status === 'registering');
  check(true, 'its owner opens a tournament');
  await ok('clubModerate', { club: B, action: 'unhost', reason: 'Back to team' }, O);
  s2.errors.length = 0; s2.send({ t: 'start' });
  check(await s2.next(x => x.errors[0]) === 'Tournaments are run by Blindrise. Your members play them in the Blindrise Open.', 'stopped again: the waiting tournament cannot be started');
  s2.send({ t: 'cancel' }); await s2.next(x => x.view.tourney && x.view.tourney.status === 'cancelled');
  check(true, 'but it can still be cancelled'); s2.ws.close();
  const again = await call('clubModerate', { club: B, action: 'unhost' }, O);
  check(again.status === 400, 'stopping a club that does not host is refused: ' + again.body.error);
  const lv = await session(O, 'main');
  const log = lv.view.platform.log.filter(e => e.club === B).map(e => e.action);
  check(JSON.stringify(log) === JSON.stringify(['unhost', 'host']), 'both changes are in the moderation log: ' + log.join(', '));
  lv.ws.close();
  console.log(`t_hosts: ${n} ok, 0 failed`); end(0);
})().catch(e => { console.error('FAIL', e); end(1); });
