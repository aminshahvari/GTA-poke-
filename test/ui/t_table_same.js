// The table keeps production's size with the tournament HUD on (owner's ruling, 2026-10-22): "the table returns 100% to
// its previous size and geometry, the pre-#34 production layout (990c14d). No reduction at any player count (2-9). The
// added elements stay at the top; the space comes from compacting the additions and surrounding chrome, never from the
// felt." Two servers, this tree and production (PROD_ROOT, default ../wt-prod), each with a real running tournament
// (9 test players seated, bots playing it). Each page then gets the same table written into its own socket (so both
// trees lay out exactly the same hand: 2, 6 or 9 seats, you seated or watching) and the same tournament field, at
// 320x568, 375x667, 390x844, 393x659 and 430x932. It asserts:
//  - the felt (with its rail) and every seat (the seat, its avatar, plate and cards) are where production draws them,
//    within 1 px (getBoundingClientRect)
//  - in this tree the HUD (#fieldBar) shows, on one row, and covers neither the felt nor any seat
// Usage: PLAYWRIGHT=/path/to/playwright-core CHROMIUM=/path/to/chromium [PROD_ROOT=dir] [SHOTS=dir] node test/ui/t_table_same.js
const path = require('path'), net = require('net'), fs = require('fs'), os = require('os');
const { spawn } = require('child_process');
const WebSocket = require(require.resolve('ws', { paths: [path.join(__dirname, '..', '..')] }));
const { chromium } = require(process.env.PLAYWRIGHT || process.env.PLAYWRIGHT_CORE || 'playwright-core');
const ROOT = path.join(__dirname, '..', '..'), PROD = process.env.PROD_ROOT || path.join(ROOT, '..', 'wt-prod');
const SHOTS = process.env.SHOTS || '';
const SIZES = (process.env.SIZES || '320x568,375x667,390x844,393x659,430x932').split(',').map(s => s.split('x').map(Number));
const NS = (process.env.NS || '2,6,9').split(',').map(Number);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, oks = 0;
const check = (ok, msg) => { ok ? oks++ : fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
const until = async (f, ms) => { const t0 = Date.now(); let v; while(!(v = await f()) && Date.now() - t0 < ms) await sleep(150); return v; };
const used = new Set();
const freePort = async () => { for(let k = 0; k < 200; k++){ const p = 4200 + Math.floor(Math.random() * 50); if(used.has(p)) continue;
  if(await new Promise(res => { const s = net.createServer(); s.unref(); s.on('error', () => res(false)); s.listen(p, '127.0.0.1', () => s.close(() => res(true))); })){ used.add(p); return p; } }
  throw new Error('no free port in 4200-4249'); };
const srvs = [], datas = [];
process.on('exit', () => { srvs.forEach(s => { try{ s.kill('SIGKILL'); }catch(e){} }); datas.forEach(d => { try{ fs.unlinkSync(d); }catch(e){} }); });

// a player that checks or calls whenever it is their turn (so the real tournament keeps playing)
function bot(port, tok){
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`), c = { ws, send: o => ws.send(JSON.stringify(o)) };
  ws.on('open', () => c.send({ t: 'hello', token: tok, device: 'bot' + Math.random() }));
  ws.on('error', () => {});
  ws.on('message', raw => {
    const m = JSON.parse(raw);
    if(m.t === 'club'){ c.club = m.club; c.id = m.club.me.id; }
    if(m.t !== 'table') return;
    const tb = m.table;
    if(tb.actUid === c.id && tb.legal && c.last !== tb.tid + tb.seq){ c.last = tb.tid + tb.seq; const L = tb.legal; setTimeout(() => { try{ c.send({ t: 'act', tid: tb.tid, hand: tb.handNo, seq: tb.seq, a: L.canCheck ? { t: 'check' } : { t: 'call' } }); }catch(e){} }, 30); }
  });
  return new Promise(r => { const t = setInterval(() => { if(c.club){ clearInterval(t); r(c); } }, 30); });
}
async function server(root, name){
  const port = await freePort(), DATA = path.join(os.tmpdir(), `t_table_same_${name}_${port}_${process.pid}.json`); datas.push(DATA);
  try{ fs.unlinkSync(DATA); }catch(e){}
  const env = { ...process.env, PORT: String(port), NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, DATABASE_URL: '', STAGING: '1', FAST: '1', LEVEL_MS: '600000', TIME_BANK_MS: '4000', BREAKS: '0' };
  delete env.GAMEPLAY_OPTIONS; delete env.CLUB_SWITCHING;
  srvs.push(spawn('node', ['server/index.js'], { cwd: root, env, stdio: ['ignore', 'ignore', 'inherit'] }));
  const base = 'http://127.0.0.1:' + port;
  for(let i = 0; i < 150; i++){ try{ if((await fetch(base + '/healthz')).ok) break; }catch(x){} await sleep(100); }
  const post = (p, body) => fetch(base + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) }).then(r => r.json());
  const dir = await post('login', { name: 'Test Director', pin: '246810' });
  const P = n => post('login', { name: 'Test Player ' + String(n).padStart(2, '0'), pin: '1357' + String(n % 10).repeat(2) });
  const ps = []; for(let n = 1; n <= 9; n++) ps.push(await P(n));
  const d = await bot(port, dir.token);
  d.send({ t: 'create', name: 'Thursday Night', stack: 30000, levelMin: 60, tableSize: 9, lateLevels: 0 });
  await until(() => d.club.tourney && d.club.tourney.status === 'registering', 5000);
  const bots = []; for(const p of ps) bots.push(await bot(port, p.token));
  bots.forEach(b => b.send({ t: 'join' })); await sleep(800);
  d.send({ t: 'start' });
  check(!!await until(() => d.club.tourney && d.club.tourney.status === 'running', 8000), `${name}: a real tournament is running (9 seated)`);
  return { base, tok: ps[0].token, name };
}

const NAMES = ['Alexandra Whitfield', 'Ben', 'Christina Okafor', 'Dev', 'Evangeline', 'Fitzgerald', 'Gwen', 'Maximilian Hart', 'Sam'];
// n seated, pre-flop; with you in seat 0 (your turn) or watching (you not at the table)
function tableFor(me, tid, n, seated, hand){
  const seats = Array.from({ length: n }, (_, s) => ({ uid: s || !seated ? 'p' + s : me.id, name: s || !seated ? NAMES[(s + 8) % 9] : me.name, stack: 30000 - s * 1100, inHand: true,
    bet: s === 1 ? 200 : s === 2 % n && n > 2 ? 1200 : 0, folded: n > 3 && s === n - 1, allIn: false, act: n > 3 && s === n - 1 ? 'Fold' : s === 2 % n && n > 2 ? 'Raise' : '',
    lastAmt: 1200, won: 0, shown: null, cat: '', away: false }));
  return { tid, n: 1, phase: 'hand', handNo: hand, street: 0, seats, size: n, allowed: seats.map((p, s) => s), cur: 1200, board: [], pot: 1500, btn: n - 1,
    blinds: [100, 200, 25], acting: 0, actUid: seats[0].uid, seq: 5, deadline: Date.now() + 600000, bank: 600000, usingBank: false, extras: 3,
    legal: seated ? { canCheck: false, toCall: 1200, canRaise: true, minTo: 2200, maxTo: 30000, isBet: false, cur: 1200, pot: 2700, bb: 200 } : null, result: null, note: '' };
}
const FIELD = seated => ({ players: 9, tables: 1, watchers: 12, leader: { name: 'Maximilian Hartington-Smythe', stack: 1234567, table: 1 }, rank: seated ? 4 : null });

async function open(browser, S, [w, h]){
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: w < 800, hasTouch: w < 800 });
  await ctx.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => { const u = r.request().url(), fd = process.env.FONTS_DIR;
    if(!fd) return r.abort();
    if(u.includes('fonts.googleapis.com/css2')) return r.fulfill({ status: 200, contentType: 'text/css', body: fs.readFileSync(path.join(fd, 'fonts.css')) });
    const f = path.join(fd, u.slice('https://fonts.gstatic.com/'.length).replace(/\//g, '_'));
    return fs.existsSync(f) ? r.fulfill({ status: 200, contentType: 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) }) : r.abort(); });
  const pg = await ctx.newPage(), st = { sock: null, me: null, tid: null };
  // the real club and tournament from the server; the table itself is written in by the test (the same in both trees)
  await pg.routeWebSocket(/\/ws$/, ws => {
    const server = ws.connectToServer();
    ws.onMessage(m => { try{ const j = JSON.parse(m); if(j.t === 'watch' || j.t === 'act') return; }catch(e){} server.send(m); });
    server.onMessage(m => {
      let j; try{ j = JSON.parse(m); }catch(e){ return ws.send(m); }
      if(j.t === 'table' || j.t === 'closed') return;
      if(j.t === 'club'){ st.me = j.club.me; if(j.club.myTable) st.tid = j.club.myTable; st.sock = ws; }
      ws.send(m);
    });
  });
  await pg.goto(S.base + '/'); await pg.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), S.tok);
  await pg.reload(); await pg.evaluate(() => document.fonts.ready);
  await until(() => st.sock && st.tid, 10000);
  pg.st = st;
  return pg;
}
async function show(pg, n, seated, hand){
  const { sock, me, tid } = pg.st;
  sock.send(JSON.stringify({ t: 'table', table: tableFor(me, tid, n, seated, hand), you: seated ? { hand, cards: ['Ah', '3d'] } : null, field: FIELD(seated) }));
  await until(() => pg.evaluate(k => { const s = document.querySelectorAll('#seats .seat').length; return !document.getElementById('game').hidden && s === k; }, n), 8000);
  // (until the deal and the chips have landed: every animation on the table that ends has ended)
  await sleep(300);
  await until(() => pg.evaluate(() => !document.getElementById('tableArea').getAnimations({ subtree: true }).some(a => a.playState === 'running' && a.effect && a.effect.getComputedTiming().iterations !== Infinity)), 6000);
  // (and the seats have stopped moving: two looks 250 ms apart find every box in the same place)
  let was = '';
  await until(async () => { await sleep(250); const now = JSON.stringify((await measure(pg)).seats); const same = now === was; was = now; return same; }, 6000);
}
const measure = pg => pg.evaluate(() => {
  const r = e => { if(!e || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
  const seats = [...document.querySelectorAll('#seats .seat')].map(s => ({ uid: s.dataset.uid, seat: r(s), av: r(s.querySelector('.av')), plate: r(s.querySelector('.plate')),
    cards: [...s.querySelectorAll('.hole .card')].map(r) }));
  const vis = id => { const e = document.getElementById(id); return !!e && !e.hidden && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' && e.getClientRects().length > 0; };
  return { felt: r(document.querySelector('#tableArea .felt')), area: r(document.getElementById('tableArea')), seats,
    hud: vis('fieldBar') ? r(document.getElementById('fieldBar')) : null, row1: document.getElementById('game').classList.contains('row1'),
    // (one row: every module's middle on the same line, within 3 px)
    hudRows: vis('fieldBar') ? (ms => Math.max(...ms) - Math.min(...ms) <= 3 ? 1 : 2)([...document.querySelectorAll('#fieldBar > *')].filter(e => e.getClientRects().length).map(e => { const b = e.getBoundingClientRect(); return (b.top + b.bottom) / 2; })) : 0,
    hudTxt: ((document.getElementById('fieldBar') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
    note: vis('playNote') ? r(document.getElementById('playNote')) : null, helper: vis('helper') ? r(document.getElementById('helper')) : null,
    helperTxt: vis('helper') ? document.getElementById('helper').textContent.replace(/\s+/g, ' ').trim() : '',
    btns: [...document.querySelectorAll('#controls button')].filter(b => b.getClientRects().length).map(r),
    side: document.documentElement.scrollWidth > innerWidth };
});
const hit = (a, b, pad = 1) => !!a && !!b && a.l < b.r - pad && b.l < a.r - pad && a.t < b.b - pad && b.t < a.b - pad;
const near = (a, b) => (!a && !b) || (!!a && !!b && ['l', 't', 'r', 'b'].every(k => Math.abs(a[k] - b[k]) <= 1));
const fmtR = a => a ? `${Math.round(a.l)},${Math.round(a.t)} ${Math.round(a.r - a.l)}x${Math.round(a.b - a.t)}` : 'none';

(async () => {
  if(SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const [P, F] = await Promise.all([server(PROD, 'production'), server(ROOT, 'this tree')]);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  let worst = 0;
  for(const sz of SIZES){
    const tag = sz.join('x');
    const pp = await open(browser, P, sz), fp = await open(browser, F, sz);
    let hand = 10;
    for(const seated of [true, false]) for(const n of NS){
      hand++;
      const t = `${tag} ${n} players ${seated ? 'seated' : 'watching'}`;
      await Promise.all([show(pp, n, seated, hand), show(fp, n, seated, hand)]);
      const [a, b] = await Promise.all([measure(pp), measure(fp)]);
      const diff = [];
      const d = (x, y) => (!x && !y) ? 0 : (!x || !y) ? 1e9 : Math.max(...['l', 't', 'r', 'b'].map(k => Math.abs(x[k] - y[k])));
      let m = d(a.felt, b.felt); if(m > 1) diff.push(`felt ${fmtR(a.felt)} vs ${fmtR(b.felt)}`);
      if(a.seats.length !== b.seats.length) diff.push(`seats ${a.seats.length} vs ${b.seats.length}`);
      a.seats.forEach((s, i) => { const q = b.seats[i]; if(!q) return;
        for(const k of ['seat', 'av', 'plate']){ const x = d(s[k], q[k]); m = Math.max(m, x); if(x > 1) diff.push(`seat ${i} ${k} ${fmtR(s[k])} vs ${fmtR(q[k])}`); }
        s.cards.forEach((c, j) => { const x = d(c, q.cards[j]); m = Math.max(m, x); if(x > 1) diff.push(`seat ${i} card ${j}`); }); });
      worst = Math.max(worst, m);
      check(!diff.length && a.seats.length === n, `${t}: felt ${fmtR(b.felt)} and ${n} seats as production (max ${m.toFixed(2)} px)${diff.length ? ' — ' + diff.slice(0, 4).join('; ') : ''}`);
      check(!!b.hud && b.hudRows === 1, `${t}: the HUD shows on one row (${fmtR(b.hud)}${b.row1 ? ', one-row header' : ''}): ${b.hudTxt}`);
      const cov = b.hud && (hit(b.hud, b.felt) ? ['felt'] : []).concat(b.seats.filter(s => [s.seat, s.av, s.plate, ...s.cards].some(x => hit(b.hud, x))).map(s => s.uid));
      check(b.hud && !cov.length, `${t}: the HUD covers neither the felt nor a seat${cov && cov.length ? ' — ' + cov.join(', ') : ''}`);
      check(!b.side, `${t}: no sideways scroll`);
      if(SHOTS && seated && (n === 2 || n === 9)){ await pp.screenshot({ path: path.join(SHOTS, `prod-${tag}-${n}p.png`) }); await fp.screenshot({ path: path.join(SHOTS, `fixed-${tag}-${n}p.png`) }); }
    }
    await pp.context().close(); await fp.context().close();
  }
  console.log(`\nworst seat/felt difference ${worst.toFixed(2)} px`);
  await browser.close();
  console.log(`t_table_same: ${oks} ok, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FAIL', e.stack || e.message); process.exit(1); });
