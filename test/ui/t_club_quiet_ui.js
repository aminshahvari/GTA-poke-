// Hands at another table leave my table alone (performance, 2026-10-24). A phone seated at table A used to get the whole
// club view (every member, past tournaments) each time a hand ended at any table, and drew its whole table again for it.
// Now the app asks for changes only (hello delta: 1) and draws the table once a frame, and only when something it shows
// changed. A browser at 390x844 is seated at table A of a two-table tournament of fake players; table B shoves, so its
// hands end and players drop out (the places and players left change).
//  (Q1) while hands end at table B: the page gets no history and no members list that did not change, and no club message (but a changed
//       members list) makes it draw its table again (the field and the clock still follow: the players left on the header card)
//  (Q2) a member at my table picks a picture: the members list arrives and the seat shows it
//  (Q3) the screens built from changes read exactly as on a freshly opened page: Home, Poker, Club (members), Profile,
//       and at the table the details sheet
// Run with UI_BOARD=1 (the board) or without. Fake players only.
// PLAYWRIGHT=/path/to/playwright-core CHROMIUM=/path/to/chromium node test/ui/t_club_quiet_ui.js
const fs = require('fs'), path = require('path'), os = require('os'), net = require('net');
const { spawn } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT || process.env.PLAYWRIGHT_CORE || 'playwright-core');
const ROOT = path.join(__dirname, '..', '..');
const WebSocket = require(require.resolve('ws', { paths: [ROOT] }));
const BOARD = process.env.UI_BOARD === '1';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, oks = 0;
const check = (ok, msg) => { ok ? oks++ : fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
let srv, browser, DATA;
const cleanup = () => { try{ srv && srv.kill('SIGKILL'); }catch(e){} try{ DATA && fs.rmSync(DATA, { force: true }); }catch(e){} };
process.on('exit', cleanup);

// in the page: every message the app gets (type, keys), the club as the app builds it, and each drawing of the table
// (the board's cards are written on every render) with the messages that came since the last frame
const INIT = () => {
  const R = window.__q = { msgs: [], renders: [], since: [], frame: [], me: null, acted: -1 };
  const NWS = window.WebSocket, NSET = Object.getOwnPropertyDescriptor(NWS.prototype, 'onmessage').set;
  window.WebSocket = class extends NWS {
    constructor(...a){
      super(...a); const ws = this; let user = null;
      Object.defineProperty(this, 'onmessage', { configurable: true, get(){ return user; }, set(fn){
        user = fn;
        NSET.call(ws, ev => {
          const s = ev.data, m = JSON.parse(s), rec = { t: m.t, at: performance.now(), d: !!m.d, keys: m.t === 'club' ? Object.keys(m.club) : null, club: m.t === 'club' ? m.club : null, gone: m.gone || null, n: R.msgs.length };
          R.msgs.push(rec); R.since.push(rec);
          if(m.t === 'club' && !R.me) R.me = m.club.me.id;
          fn.call(ws, ev);
          // this seat plays by itself: a check or a call, a moment after its turn comes
          if(m.t === 'table' && R.me && m.table.actUid === R.me && m.table.legal && R.acted !== m.table.seq){ const d = m.table, L = d.legal; R.acted = d.seq;
            // (it lets a big bet go: this test is not about its chips)
            const a = L.canCheck ? { t: 'check' } : L.toCall > 4 * L.bb ? { t: 'fold' } : { t: 'call' };
            setTimeout(() => ws.send(JSON.stringify({ t: 'act', tid: d.tid, hand: d.handNo, seq: d.seq, a })), 200); }
        });
      } });
    }
  };
  // (the first callback of each frame: what came since the last frame is this frame's)
  const tick = () => { R.frame = R.since; R.since = []; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  document.addEventListener('DOMContentLoaded', () => {
    new MutationObserver(() => { R.renders.push({ at: performance.now(), msgs: R.frame.map(x => x.n) }); R.frame = []; }).observe(document.getElementById('board'), { childList: true });
  });
};
async function openPage(ctxOpts, tok, base){
  const c = await browser.newContext(ctxOpts);
  await c.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => r.abort());
  await c.addInitScript(INIT);
  const pg = await c.newPage();
  await pg.goto(base + '/');
  await pg.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), tok);
  await pg.reload(); await sleep(1200);
  if(await pg.$('#bOnb')){ await pg.click('#bOnb [data-onb=skip]'); await sleep(300); }
  return pg;
}
(async () => {
  const port = await freePort(), base = 'http://127.0.0.1:' + port; DATA = path.join(os.tmpdir(), `t_club_quiet_${port}_${process.pid}.json`);
  fs.writeFileSync(DATA, '{}');
  const env = { ...process.env, PORT: String(port), NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, DATABASE_URL: '', STAGING: '', FAST: '1', TIME_BANK_MS: '4000', LEVEL_MS: '600000', BREAKS: '0', CONN_LOG: '0' };
  delete env.UI_QUIET; delete env.CLUB_SWITCHING; delete env.GAMEPLAY_OPTIONS;
  srv = spawn('node', ['server/index.js'], { cwd: ROOT, env, stdio: 'ignore' });
  for(let i = 0; i < 100; i++){ try{ if((await fetch(base + '/healthz')).ok) break; }catch(e){} await sleep(100); }
  const api = (p, body, tok) => fetch(base + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body || {}) }).then(r => r.json());
  const O = (await api('setup', { code: 'secret', name: 'Test Director', pin: '246810', agree: true })).token;
  const toks = []; for(let i = 1; i <= 12; i++) toks.push((await api('redeem', { code: (await api('invite', {}, O)).code, name: 'Test Player ' + String(i).padStart(2, '0'), pin: '1357', agree: true })).token);
  // the fake players' sockets: they check or call and let a big bet go (tight), call everything (call), or (shove) put all
  // their chips in; so a player drops out now and then, and the tournament keeps going
  const sock = (tok, bot) => new Promise(res => { const ws = new WebSocket(base.replace('http', 'ws') + '/ws'); ws.mode = 'tight';
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: tok, delta: 1 })));
    ws.on('message', raw => { const m = JSON.parse(raw);
      if(m.t === 'club'){ ws.view = m.d ? { ...ws.view, ...m.club } : m.club; if(!ws.ready){ ws.ready = true; ws.me = m.club.me.id; res(ws); } }
      if(bot && m.t === 'table' && m.table.actUid === ws.me && m.table.legal && ws.acted !== m.table.seq){ const d = m.table, L = d.legal; ws.acted = d.seq;
        const a = ws.mode === 'shove' && L.canRaise ? { t: 'raise', to: L.maxTo } : L.canCheck ? { t: 'check' } : ws.mode === 'tight' && L.toCall > 4 * L.bb ? { t: 'fold' } : { t: 'call' };
        setTimeout(() => ws.send(JSON.stringify({ t: 'act', tid: d.tid, hand: d.handNo, seq: d.seq, a })), 20); } }); });
  const so = await sock(O, false);
  so.send(JSON.stringify({ t: 'create', name: 'Quiet Night', stack: 10000, levelMin: 60, tableSize: 6, lateLevels: 0 })); await sleep(400);
  const bots = []; for(const t of toks.slice(1)){ const s = await sock(t, true); s.send(JSON.stringify({ t: 'join' })); bots.push(s); }
  const me0 = await sock(toks[0], false); me0.send(JSON.stringify({ t: 'join' })); await sleep(300); me0.close();
  await sleep(300); so.send(JSON.stringify({ t: 'start' })); await sleep(800);
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
  const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
  const pg = await openPage(phone, toks[0], base);
  await pg.waitForFunction(() => !document.getElementById('game').hidden && document.querySelectorAll('#seats .seat').length >= 2, null, { timeout: 15000 });
  check(true, `the page is at its table (${BOARD ? 'board' : 'board off'})`);
  const myTid = await pg.evaluate(() => { const m = window.__q.msgs.filter(x => x.t === 'club' && x.club && x.club.myTable).pop(); return m && m.club.myTable; });
  const other = bots.filter(b => b.view.myTable && b.view.myTable !== myTid), mates = bots.filter(b => b.view.myTable === myTid);
  check(!!myTid && other.length >= 4 && mates.length >= 3, `two tables: ${mates.length + 1} at mine, ${other.length} at the other`);
  // ---- (Q1) ----
  const otherTid = other[0].view.myTable, handsB = new Set();
  so.on('message', raw => { const m = JSON.parse(raw); if(m.t === 'table' && m.table.tid === otherTid && m.table.result) handsB.add(m.table.handNo); });
  so.send(JSON.stringify({ t: 'watch', tid: otherTid }));
  other[0].mode = 'shove'; other[1].mode = 'call';   // (now and then a player there drops out: the places and players left change)
  await sleep(1500);
  const n0 = await pg.evaluate(() => ({ m: window.__q.msgs.length, r: window.__q.renders.length }));
  await sleep(10000);
  const Q = await pg.evaluate(n0 => { const R = window.__q; return { msgs: R.msgs.slice(n0.m).map(x => ({ t: x.t, d: x.d, keys: x.keys, n: x.n, tourney: x.club && x.club.tourney ? { remaining: x.club.tourney.remaining, places: (x.club.tourney.places || []).length } : null, myTable: x.club && 'myTable' in x.club ? x.club.myTable : undefined })), renders: R.renders.slice(n0.r), all: R.msgs.length,
    // (a members list that comes is a changed one: a player's level or colour moved with their hands)
    sameMembers: R.msgs.slice(n0.m).filter(x => x.t === 'club' && x.club.members).filter(x => { const was = R.msgs.slice(0, x.n).filter(y => y.t === 'club' && y.club.members).pop(); return was && JSON.stringify(was.club.members) === JSON.stringify(x.club.members); }).length }; }, n0);
  const clubs = Q.msgs.filter(x => x.t === 'club'), byN = new Map(Q.msgs.map(x => [x.n, x]));
  console.log(`  ${handsB.size} hands ended at the other table; the page got ${Q.msgs.filter(x => x.t === 'table').length} table and ${clubs.length} club messages (${clubs.map(x => x.keys.join('+')).join(', ')}), and drew its table ${Q.renders.length} times`);
  check(handsB.size >= 5, `hands ended at the other table meanwhile (${handsB.size})`);
  // (no club message at all is right too: a hand that changes nothing the club view shows sends nothing)
  console.log(`  club changes the page heard of: ${clubs.length}${clubs.some(x => x.tourney) ? ' (players dropped out there)' : ''}`);
  check(clubs.every(x => x.d && !x.keys.includes('history')) && !Q.sameMembers, `no history and no unchanged members list came with them, only changes (${clubs.filter(x => x.keys.includes('members')).length} changed members lists)`);
  const moved = clubs.some(x => x.myTable !== undefined && x.myTable !== myTid);
  // (a changed members list may: the seats show the players' pictures and levels)
  const byClub = Q.renders.filter(r => r.msgs.length && r.msgs.every(n => (byN.get(n) || {}).t === 'club' && !byN.get(n).keys.includes('members')));
  check(moved || byClub.length === 0, `no club message without a changed members list drew the table again (${byClub.length} of ${Q.renders.length} drawings came from such club messages only)`);
  check(Q.renders.length >= 10, `the table itself was drawn as it played (${Q.renders.length})`);
  // the clock and the field follow the players left at once, without a table drawing
  const left = await pg.evaluate(() => document.getElementById(document.documentElement.dataset.ui === 'board' ? 'bhPl' : 'sAvg').textContent);
  check(/\d/.test(left), `the header still follows the field: "${left}"`);
  // ---- (Q2) ----
  const seatedNow = await pg.evaluate(() => [...document.querySelectorAll('#seats .seat[data-uid]')].map(e => e.dataset.uid));
  const mate = bots.find(b => seatedNow.includes(b.me)), r0 = await pg.evaluate(() => window.__q.msgs.length);
  if(!mate) throw new Error('no player seated with me: ' + seatedNow.join(', '));
  await api('avatar', { kind: 'gallery', id: 'lion' }, toks[1 + bots.indexOf(mate)]);
  const got = await pg.waitForFunction(([r0, uid]) => window.__q.msgs.slice(r0).some(x => x.t === 'club' && x.keys.includes('members')) && [...document.querySelectorAll(`#seats .seat[data-uid="${uid}"]`)].some(e => e.textContent.includes('\u{1F981}')), [r0, mate.me], { timeout: 8000 }).then(() => true, () => false);
  check(got, 'a player at my table picks a picture: the members list arrives and their seat shows it');
  // ---- (Q3) the screens read the same as on a fresh page ----
  so.send(JSON.stringify({ t: 'pause' })); await sleep(1500);
  const fresh = await openPage(phone, toks[0], base);
  await fresh.waitForFunction(() => !document.getElementById('game').hidden && document.querySelectorAll('#seats .seat').length >= 2, null, { timeout: 15000 }).catch(() => {});
  const norm = s => s.replace(/\s+/g, ' ').trim();
  if(BOARD){
    const sheet = async p => { await p.click('#bHud'); await sleep(500); const t = norm(await p.locator('#bHudSheet').innerText()); await p.keyboard.press('Escape'); await p.evaluate(() => { const s = document.getElementById('bHudSheet'); if(s) s.hidden = true; document.getElementById('game').classList.remove('b-menu'); }); return t; };
    const [a, b] = [await sheet(pg), await sheet(fresh)];
    check(a === b && /Avg stack/.test(a), `the details sheet reads the same: ${a.slice(0, 120)}`);
    const card = async p => norm(await p.locator('#bHud').innerText());
    const [ca, cb] = [await card(pg), await card(fresh)];
    check(ca === cb, `the header card reads the same: ${ca}`);
  }
  for(const p of [pg, fresh]) await p.click('#lobbyBtn');
  await sleep(600);
  const screens = BOARD ? ['home', 'poker', 'club', 'profile'] : ['event', 'club', 'learn'];
  for(const t of screens){
    const read = async p => { const b = await p.$(`#tabs [data-tab="${t}"]`); if(!b) return null; await b.click(); await sleep(700); return norm(await p.locator('#lobbyBody').innerText()); };
    const [a, b] = [await read(pg), await read(fresh)];
    if(a == null && b == null) continue;
    check(a === b && a.length > 20, `the ${t} screen reads the same as on a fresh page (${(a || '').length} characters)`);
    if(a !== b){ const i = [...(a || '')].findIndex((ch, k) => ch !== (b || '')[k]); console.log('  page : ' + (a || '').slice(Math.max(0, i - 60), i + 80)); console.log('  fresh: ' + (b || '').slice(Math.max(0, i - 60), i + 80)); }
  }
  await browser.close();
  bots.forEach(b => b.close()); so.close();
  console.log(`\n${oks} passed, ${fails} failed`);
  cleanup(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FAIL', e.stack || e); cleanup(); process.exit(1); });
