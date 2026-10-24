// The club view on the wire (performance, 2026-10-24). Every hand that ended at any table used to send the whole club
// view (every member, up to 200 past tournaments) to every socket of the club. An app that says delta: 1 in its hello
// now gets the whole view once, then only the keys that changed; a hand that ended sends only what play changes, at most
// every few seconds. A socket that does not ask (an older app, a script) still gets the whole view each time.
//  (1) hands end at the other table: the seated player's socket gets no members and no history, only changes, few
//  (2) what the app builds from those changes is exactly the view a fresh connection gets
//  (3) the members list arrives when it changes (a picture), the history when the tournament ends
//  (4) a socket that does not ask gets the whole view every time, as before
// Fake players only.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't_club_delta_'));
const PORT = 6900 + Math.floor(Math.random() * 300), BASE = 'http://localhost:' + PORT;
const srv = spawn('node', ['server/index.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: path.join(tmp, 'data.json'), FAST: '1', STAGING: '', CLUB_SWITCHING: '', TIME_BANK_MS: '2000', LEVEL_MS: '600000', BREAKS: '0', CONN_LOG: '0' }, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let n = 0; const check = (c, msg) => { assert.ok(c, msg); n++; console.log('ok  ', msg); };
async function ok(p, body, tok){
  const r = await fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body || {}) });
  const j = await r.json(); assert.strictEqual(r.status, 200, p + ': ' + JSON.stringify(j)); return j;
}
// a socket; delta: ask for changes only. view: the club as the app builds it (whole views replace it, changes merge in).
function session(tok, delta){
  return new Promise((res, rej) => {
    const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws'), s = { ws, msgs: [], clubs: [], view: null, mode: 'call' };
    s.send = m => ws.send(JSON.stringify(m));
    s.waitFor = async (pred, ms = 8000) => { const end = Date.now() + ms; while(Date.now() < end){ if(pred()) return true; await sleep(30); } return false; };
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: tok, ...(delta ? { delta: 1 } : {}) })));
    ws.on('message', raw => {
      const m = JSON.parse(raw); s.msgs.push(m);
      if(m.t === 'club'){
        s.clubs.push({ at: Date.now(), m, bytes: raw.length });
        if(m.d){ s.view = { ...s.view, ...m.club }; (m.gone || []).forEach(k => delete s.view[k]); } else s.view = m.club;
        s.me = s.view.me.id; if(!s.ready){ s.ready = true; res(s); }
      }
      // a quick player: checks or calls, or (mode 'shove') puts all the chips in
      if(m.t === 'table' && s.me && m.table.actUid === s.me && m.table.legal && s.acted !== m.table.seq){
        const d = m.table, L = d.legal; s.acted = d.seq;
        const a = s.mode === 'shove' && L.canRaise ? { t: 'raise', to: L.maxTo } : L.canCheck ? { t: 'check' } : { t: 'call' };
        setTimeout(() => s.send({ t: 'act', tid: d.tid, hand: d.handNo, seq: d.seq, a }), 15);
      }
    });
    ws.on('error', rej); setTimeout(() => rej(new Error('timeout')), 5000);
  });
}
const strip = v => { const { now, ...rest } = v; return JSON.parse(JSON.stringify(rest)); };
const end = code => { srv.kill('SIGKILL'); try{ fs.rmSync(tmp, { recursive: true, force: true }); }catch(e){} process.exit(code); };
(async () => {
  for(let i = 0; i < 60; i++){ try{ if((await fetch(BASE + '/healthz')).ok) break; }catch(e){} await sleep(150); }
  const O = (await ok('setup', { code: 'secret', name: 'Test Director', pin: '246810', agree: true })).token;
  const toks = []; for(let i = 1; i <= 12; i++) toks.push((await ok('redeem', { code: (await ok('invite', {}, O)).code, name: 'Test Player ' + String(i).padStart(2, '0'), pin: '1357', agree: true })).token);
  const so = await session(O, true);
  so.send({ t: 'create', name: 'Delta Night', stack: 10000, levelMin: 60, tableSize: 6, lateLevels: 0 });
  check(await so.waitFor(() => so.view.tourney && so.view.tourney.status === 'registering'), 'a tournament is open');
  const ss = []; for(const t of toks){ const s = await session(t, true); s.send({ t: 'join' }); ss.push(s); }
  check(await so.waitFor(() => so.view.tourney.regs.length === 12), '12 fake players registered');
  so.send({ t: 'start' });
  check(await so.waitFor(() => so.view.tables && so.view.tables.length === 2 && ss.every(s => s.view.myTable)), 'two tables of six, everyone seated');
  const [tA, tB] = so.view.tables.map(t => t.tid);
  const atA = ss.filter(s => s.view.myTable === tA), atB = ss.filter(s => s.view.myTable === tB);
  const P = atA[0];
  // the same player on a second socket that does not ask for changes (an older app)
  const legacy = await session(toks[ss.indexOf(P)], false); legacy.mode = 'none';
  check(!!P && atB.length === 6, 'a player seated at table A; six at table B');
  // ---- (1) hands end at table B ----
  // the director watches table B and counts its hands; one of its players shoves (now and then someone drops out and
  // the places change)
  const handsB = new Set(); so.ws.on('message', raw => { const m = JSON.parse(raw); if(m.t === 'table' && m.table.tid === tB && m.table.result) handsB.add(m.table.handNo); });
  so.send({ t: 'watch', tid: tB });
  atB[0].mode = 'shove';
  await sleep(400);
  const p0 = P.clubs.length, l0 = legacy.clubs.length, t0 = Date.now();
  await sleep(10000);
  const mine = P.clubs.slice(p0), leg = legacy.clubs.slice(l0), secs = (Date.now() - t0) / 1000;
  console.log(`  ${handsB.size} hands ended at table B in ${secs.toFixed(1)} s; the seated player got ${mine.length} club changes (${mine.reduce((a, x) => a + x.bytes, 0)} bytes), the older app ${leg.length} whole views (${leg.reduce((a, x) => a + x.bytes, 0)} bytes)`);
  check(handsB.size >= 3, `hands ended at the other table meanwhile (${handsB.size})`);
  check(mine.every(x => x.m.d === 1), 'everything after the first view is a change, never the whole view');
  check(mine.every(x => !('members' in x.m.club) && !('history' in x.m.club)), 'no members and no history went to the seated player for hands at another table');
  check(mine.every(x => Object.keys(x.m.club).some(k => k !== 'now') || (x.m.gone || []).length), 'and nothing was sent that did not change');
  check(mine.length <= Math.ceil(secs / 0.25) + 1, `at most one change per throttle window (${mine.length} in ${secs.toFixed(1)} s)`);
  check(mine.every(x => Object.keys(x.m.club).every(k => ['tourney', 'tables', 'myTable', 'now', 'conflicts'].includes(k))), 'only what play changes: the tournament, the tables, my table');
  // ---- (4) the older app ----
  check(leg.length >= 1 && leg.every(x => !x.m.d && Array.isArray(x.m.club.members) && Array.isArray(x.m.club.history) && x.m.club.me), 'a socket that did not ask still gets the whole view every time');
  // ---- (2) the app's view is the whole view ----
  so.send({ t: 'pause' });
  check(await P.waitFor(() => P.view.tourney && P.view.tourney.paused), 'paused (a whole update)');
  await sleep(600);
  const fresh = await session(toks[ss.indexOf(P)], true); fresh.mode = 'none';
  check(JSON.stringify(strip(P.view)) === JSON.stringify(strip(fresh.view)), 'what the app built from the changes is exactly the view a fresh connection gets');
  check(JSON.stringify(strip(P.view)) === JSON.stringify(strip(legacy.view)), 'and the view the older app got whole');
  const oFresh = await session(O, true); oFresh.mode = 'none';
  check(JSON.stringify(strip(so.view)) === JSON.stringify(strip(oFresh.view)), "the same for the director's view (invites, households, conflicts)");
  // ---- (3) members and history still arrive ----
  const p1 = P.clubs.length, bTok = toks[ss.indexOf(atB[0])], bId = atB[0].me;
  await ok('avatar', { kind: 'gallery', id: 'lion' }, bTok);
  check(await P.waitFor(() => P.clubs.slice(p1).some(x => x.m.club.members && x.m.club.members.some(m => m.id === bId && m.av === 'g:lion'))), 'a member picks a picture: the members list arrives with it');
  check(P.clubs.slice(p1).every(x => !('history' in x.m.club)), '(without the history, which did not change)');
  so.send({ t: 'resume' });
  ss.forEach(s => { s.mode = 'shove'; });
  check(await P.waitFor(() => P.view.tourney && P.view.tourney.status === 'finished', 90000), 'everyone shoves: the tournament ends');
  check(await P.waitFor(() => (P.view.history || []).some(h => h.name === 'Delta Night')), 'the history arrives with its result');
  await sleep(600);
  const fresh2 = await session(toks[ss.indexOf(P)], true);
  check(JSON.stringify(strip(P.view)) === JSON.stringify(strip(fresh2.view)), 'and the view built from changes is still the whole view');
  console.log(`club delta test passed (${n} checks)`);
  end(0);
})().catch(e => { console.error('FAIL', e.message); end(1); });
