// The whole tournament at every table (players' feedback, 2026-10-21): every table update carries how many are still
// playing and at how many tables, the chip leader of all tables, how many are watching (a count, never who), and, for a
// seated player only, their place among everyone still playing.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 't_field_'));
const PORT = 6700 + Math.floor(Math.random() * 200), BASE = 'http://localhost:' + PORT;
const srv = spawn('node', ['server/index.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: path.join(tmp, 'data.json'), FAST: '1', STAGING: '', CLUBS_DEFAULT: 'on', CLUB_SWITCHING: '1', TIME_BANK_MS: '300', LEVEL_MS: '600000', BREAKS: '0' }, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let n = 0; const check = (c, msg) => { assert.ok(c, msg); n++; console.log('ok  ', msg); };
async function ok(p, body, tok, club){
  const r = await fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}), ...(club ? { 'x-club': club } : {}) }, body: JSON.stringify(body || {}) });
  const j = await r.json(); assert.strictEqual(r.status, 200, p + ': ' + JSON.stringify(j)); return j;
}
function session(tok, club, spectate){
  return new Promise((res, rej) => {
    const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws'), s = { ws, msgs: [], view: null };
    s.send = m => ws.send(JSON.stringify(m));
    s.waitFor = async (pred, ms = 8000) => { const end = Date.now() + ms; while(Date.now() < end){ const m = [...s.msgs].reverse().find(pred); if(m) return m; await sleep(30); } return null; };
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: tok, club, spectate })));
    ws.on('message', m => { m = JSON.parse(m); s.msgs.push(m); if(m.t === 'club'){ s.view = m.club; if(!s.ready){ s.ready = true; res(s); } } });
    ws.on('error', rej); setTimeout(() => rej(new Error('timeout')), 5000);
  });
}
const end = code => { srv.kill(); try{ fs.rmSync(tmp, { recursive: true, force: true }); }catch(e){} process.exit(code); };
(async () => {
  for(let i = 0; i < 60; i++){ try{ if((await fetch(BASE + '/healthz')).ok) break; }catch(e){} await sleep(150); }
  const O = (await ok('setup', { code: 'secret', name: 'Founder', pin: '1234', agree: true })).token;
  const join = async (name, club) => (await ok('redeem', { code: (await ok('invite', {}, O, club)).code, name, pin: '1357', agree: true })).token;
  const toks = []; for(let i = 1; i <= 8; i++) toks.push(await join('Player ' + i));
  const X = (await ok('createClub', { name: 'Harbour Club', code: 'secret', rulesV: 1, acceptRules: true }, O)).club;
  const P = await join('Pia', X);
  const so = await session(O);
  so.send({ t: 'create', name: 'Field Night', stack: 10000, levelMin: 60, tableSize: 6, lateLevels: 0 });
  await so.waitFor(m => m.t === 'club' && m.club.tourney && m.club.tourney.status === 'registering');
  const ss = []; for(const t of toks){ const s = await session(t); s.send({ t: 'join' }); ss.push(s); }
  await so.waitFor(m => m.t === 'club' && m.club.tourney && m.club.tourney.regs.length === 8);
  so.send({ t: 'start' });
  const f1 = await ss[0].waitFor(m => m.t === 'table' && m.field);
  check(f1 && f1.field.players === 8 && f1.field.tables === 2, 'every table update says 8 are playing at 2 tables');
  check(f1.field.leader && typeof f1.field.leader.name === 'string' && f1.field.leader.stack > 0 && f1.field.leader.table >= 1, 'and who the chip leader of all tables is, with their chips and table');
  check(f1.field.rank >= 1 && f1.field.rank <= 8, 'a seated player gets their place among all 8: ' + f1.field.rank);
  check(JSON.stringify(Object.keys(f1.field).sort()) === JSON.stringify(['leader', 'players', 'rank', 'tables', 'watchers']), 'nothing else is in it');
  // the founder (not playing) watches a table, and Pia watches the same table from Harbour Club: 2 watchers of that table
  // (Issue #32 item 11: each table's update counts the watchers of that table)
  const tids = so.view.tables.length ? so.view.tables.map(t => t.tid) : (await so.waitFor(m => m.t === 'club' && m.club.tables.length === 2)).club.tables.map(t => t.tid);
  so.send({ t: 'watch', tid: tids[0] });
  const sp = await session(P, X, 'main'); sp.send({ t: 'watch', tid: tids[0] });
  const fw = await sp.waitFor(m => m.t === 'table' && m.table.tid === tids[0] && m.field && m.field.watchers === 2, 10000);
  check(!!fw, 'watchers are counted: the founder at a table and a member of another club, at the same table: 2');
  check(fw.field.rank === null, 'a watcher gets no place');
  check(!JSON.stringify(fw.field).includes('Founder') && !JSON.stringify(fw.field).includes('Pia'), 'watchers are a count, never names');
  // the other table: nobody watches it yet
  const seatedAt = s => { const m = [...s.msgs].reverse().find(x => x.t === 'club' && x.club.myTable); return m && m.club.myTable; };
  const atB = ss.find(s => seatedAt(s) === tids[1]), atA = ss.find(s => seatedAt(s) === tids[0]);
  check(!!atA && !!atB, 'players are seated at both tables');
  const fB0 = await atB.waitFor(m => m.t === 'table' && m.table.tid === tids[1] && m.field && m.field.watchers === 0, 10000);
  check(!!fB0, "table B's own update says 0 watching (its seated players are not watchers)");
  // a player seated at table A who looks at table B counts as watching B (before: anyone seated anywhere was left out,
  // so the owner watching a table while seated at another read "0 watching")
  atA.send({ t: 'watch', tid: tids[1] });
  check(!!await atB.waitFor(m => m.t === 'table' && m.table.tid === tids[1] && m.field && m.field.watchers === 1, 10000), 'a player seated at table A watching table B: B reads 1 watching, live');
  // ...and goes back to their own table: B drops to 0 straight away, without waiting for B's next hand to be sent
  atB.msgs.length = 0; atA.send({ t: 'watch', tid: tids[0] });
  check(!!await atB.waitFor(m => m.t === 'table' && m.table.tid === tids[1] && m.field && m.field.watchers === 0, 4000), 'they go back to their own table: B reads 0 watching again, live');
  // a watcher who closes the app is no longer counted: table A back to 1 (the founder), at once
  const owner = ss.find(s => seatedAt(s) === tids[0]);
  owner.msgs.length = 0; sp.ws.close();
  check(!!await owner.waitFor(m => m.t === 'table' && m.table.tid === tids[0] && m.field && m.field.watchers === 1, 4000), 'a watcher leaves (socket closed): table A reads 1 watching, live');
  // the founder goes to the lobby: A reads 0
  owner.msgs.length = 0; so.send({ t: 'watch', tid: null });
  check(!!await owner.waitFor(m => m.t === 'table' && m.table.tid === tids[0] && m.field && m.field.watchers === 0, 4000), 'the founder goes back to the lobby: table A reads 0 watching, live');
  // the leader's chips are the most anyone at any table has
  const last = await ss[0].waitFor(m => m.t === 'table' && m.field);
  const lead = last.field.leader.stack, me = last.field.rank;
  check(lead > 0 && me >= 1 && me <= 8, 'the leader has chips and every place is between 1 and 8');
  for(const s of [so, ...ss]) s.ws.close();
  console.log(`\n${n} checks passed`);
  end(0);
})().catch(e => { console.error('FAIL', e.message); end(1); });
