// Table layout for 2 to 9 seated players on phones (browser, phone emulation with touch). For each table size
// and each phone, with your turn showing (the action bar up, a bet in front of some seats), it asserts:
//  - no seat (its avatar, name plate, badge and cards) overlaps another seat or the board
//  - every seat is inside the screen and inside the table area
//  - your own cards and the Fold / Call / Raise buttons are on screen, and your cards are clear of the action bar
//  - the felt's shape: on a phone held upright the oval is only a little taller than wide (height / width
//    between FELT_MIN and FELT_MAX, 0.95-1.42); held sideways it is clearly wider than tall (at most 0.8)
// The table state is written into the page's own socket (routeWebSocket), as t_stability does.
// PLAYWRIGHT=/path/to/playwright-core CHROMIUM=/path/to/chromium node test/ui/t_table_layout.js
//   ROOT=<dir> another checkout ("before")   REPORT=1 print without failing   SHOTS=<dir> a screenshot per case
//   ONLY=390x844 one size   NS=2,6,9 only these table sizes   JSON=<file> every measurement
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || process.env.PLAYWRIGHT_CORE || 'playwright');
const ROOT = process.env.ROOT || path.join(__dirname, '..', '..');
const PORT = 5400 + Math.floor(Math.random() * 80), BASE = 'http://localhost:' + PORT;
const DATA = require('os').tmpdir() + '/t_tlay_' + process.pid + '.json';
const srv = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '', STAGING: '1', DATABASE_URL: '' }, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const REPORT = process.env.REPORT === '1', SHOTS = process.env.SHOTS || '';
const SIZES = [[320, 568], [375, 667], [390, 844], [393, 852], [430, 932], [844, 390]].filter(v => !process.env.ONLY || process.env.ONLY === v.join('x'));
const NS = (process.env.NS || '2,3,4,5,6,7,8,9').split(',').map(Number);
const FELT_MIN = .95, FELT_MAX = 1.42, LAND_MAX = .8;
const api = async (p, body) => { const j = await (await fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })).json(); if(j.error) throw new Error(p + ': ' + j.error); return j; };
const fails = [];
let oks = 0;
const check = (cond, msg) => { if(cond) oks++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if(!cond) fails.push(msg); };

const NAMES = ['Alexandra Whitfield', 'Ben', 'Christina Okafor', 'Dev', 'Evangeline', 'Fitzgerald', 'Gwen', 'Maximilian Hart', 'Sam'];
// n seated, my turn pre-flop; a raise and a call in front of two seats, one fold
function tableFor(me, n){
  const seats = Array.from({ length: n }, (_, s) => ({ uid: s ? 'p' + s : me.id, name: s ? NAMES[s - 1] : me.name, stack: 30000 - s * 1100, inHand: true,
    bet: s === 1 ? 200 : s === 2 % n && n > 2 ? 1200 : 0, folded: n > 3 && s === n - 1, allIn: false, act: n > 3 && s === n - 1 ? 'Fold' : s === 2 % n && n > 2 ? 'Raise' : '',
    lastAmt: 1200, won: 0, shown: null, cat: '', away: false }));
  return { tid: 'tlay' + n, n: 1, phase: 'hand', handNo: 3, street: 0, seats, size: n, allowed: seats.map((p, s) => s), cur: 1200, board: [], pot: 1500, btn: n - 1,
    blinds: [100, 200, 25], acting: 0, actUid: me.id, seq: 5, deadline: Date.now() + 60000, bank: 60000, usingBank: false, extras: 3,
    legal: { canCheck: false, toCall: 1200, canRaise: true, minTo: 2200, maxTo: 30000, isBet: false, cur: 1200, pot: 2700, bb: 200 }, result: null, note: '' };
}

async function measure(pg){
  return pg.evaluate(() => {
    const r = el => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
    const u = rs => ({ l: Math.min(...rs.map(x => x.l)), t: Math.min(...rs.map(x => x.t)), r: Math.max(...rs.map(x => x.r)), b: Math.max(...rs.map(x => x.b)) });
    const seats = [...document.querySelectorAll('#seats .seat')].map(s => ({ name: (s.querySelector('.nm') || {}).textContent || '?', hero: s.classList.contains('hero'),
      box: u([s.querySelector('.av'), s.querySelector('.plate'), ...s.querySelectorAll('.badge, .hole .card')].filter(Boolean).map(r)) }));
    const slots = [...document.querySelectorAll('#board .slot, #board .card')].map(r);
    const btn = id => { const e = document.getElementById(id); return e ? r(e) : null; };
    return { felt: r(document.querySelector('#tableArea .felt')), area: r(document.getElementById('tableArea')), dock: document.getElementById('dock') ? r(document.getElementById('dock')) : r(document.getElementById('controls')),
      board: slots.length ? u(slots) : null, seats, hero: (() => { const cs = [...document.querySelectorAll('#seats .seat.hero .hole .card')].map(r); return cs.length ? u(cs) : null; })(),
      btns: ['aFold', 'aCall', 'aRaise'].map(btn), look: ['mini', 'compact'].find(c => document.getElementById('tableArea').classList.contains(c)) || '' };
  });
}
const hit = (a, b, pad = 0) => a.l < b.r - pad && b.l < a.r - pad && a.t < b.b - pad && b.t < a.b - pad;

(async () => {
  for(let i = 0; i < 60; i++){ try{ await fetch(BASE + '/health'); break; }catch(e){ await sleep(150); } }
  await sleep(400);
  const TOK = (await api('login', { name: 'Test Player 07', pin: '135777' })).token;
  if(SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const all = {};
  for(const vp of SIZES){
    const [w, h] = vp, tagv = vp.join('x'), upright = h > w;
    const pg = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    if(process.env.FONTS_DIR){
      const dir = process.env.FONTS_DIR;
      await pg.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => { const u = r.request().url();
        if(u.includes('fonts.googleapis.com/css2')) return r.fulfill({ status: 200, contentType: 'text/css', body: fs.readFileSync(path.join(dir, 'fonts.css')) });
        const f = path.join(dir, u.slice('https://fonts.gstatic.com/'.length).replace(/\//g, '_'));
        return fs.existsSync(f) ? r.fulfill({ status: 200, contentType: 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) }) : r.abort(); });
    }
    let sock = null, me = null;
    await pg.routeWebSocket(/\/ws$/, ws => {
      const server = ws.connectToServer();
      ws.onMessage(m => { try{ const j = JSON.parse(m); if(j.t === 'watch' || j.t === 'act') return; }catch(e){} server.send(m); });
      server.onMessage(m => {
        let j; try{ j = JSON.parse(m); }catch(e){ return ws.send(m); }
        if(j.t === 'table' || j.t === 'closed') return;
        if(j.t !== 'club') return ws.send(m);
        me = j.club.me;
        j.club.tourney = { ...j.club.tourney, status: 'running', name: 'Friday Night', stack: 30000, anteMode: 'bb', regs: [me.id], entrants: 9, remaining: 9, level: 2,
          levelEndsAt: Date.now() + 600000, paused: false, places: [], lateOpen: false, helper: true };
        j.club.myTable = 'tlay' + NS[0]; j.club.tables = NS.map(n => ({ tid: 'tlay' + n, n: 1, players: n }));
        ws.send(JSON.stringify(j)); sock = ws;
      });
    });
    await pg.goto(BASE + '/'); await pg.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), TOK);
    await pg.reload(); await pg.evaluate(() => document.fonts.ready);
    for(let k = 0; k < 100 && !sock; k++) await sleep(100);
    for(const n of NS){
      const tag = `${tagv} ${n} players`;
      const t = tableFor(me, n);
      // the same table (the club's myTable), a new hand with n seated each time
      sock.send(JSON.stringify({ t: 'table', table: { ...t, tid: 'tlay' + NS[0], handNo: 3 + n }, you: { hand: 3 + n, cards: ['Ah', 'Qd'] } }));
      try{ await pg.waitForSelector('#aRaise', { timeout: 8000 }); }catch(e){}
      await sleep(700);
      const m = await measure(pg); all[tag] = m;
      if(SHOTS) await pg.screenshot({ path: path.join(SHOTS, `${tagv}-${n}p.png`) });
      const ratio = (m.felt.b - m.felt.t) / (m.felt.r - m.felt.l);
      const over = [];
      m.seats.forEach((a, i) => { m.seats.slice(i + 1).forEach(b => { if(hit(a.box, b.box, .5)) over.push(`${a.name} x ${b.name}`); }); if(m.board && hit(a.box, m.board, .5)) over.push(`${a.name} x board`); });
      const out = m.seats.filter(s => s.box.l < -.5 || s.box.t < -.5 || s.box.r > w + .5 || s.box.b > h + .5 || s.box.t < m.area.t - .5 || s.box.l < m.area.l - .5 || s.box.r > m.area.r + .5).map(s => s.name);
      check(m.seats.length === n, `${tag}: ${n} seats drawn (${m.seats.length})`);
      check(!over.length, `${tag}: no seat overlaps another seat or the board${over.length ? ' — ' + over.join('; ') : ''}`);
      check(!out.length, `${tag}: every seat inside the screen and the table area${out.length ? ' — ' + out.join(', ') : ''}`);
      check(m.hero && m.hero.t >= -.5 && m.hero.b <= h + .5 && !hit(m.hero, m.dock, .5), `${tag}: your cards are on screen, clear of the action bar`);
      check(m.btns.every(b => b && b.t >= -.5 && b.b <= h + .5), `${tag}: Fold / Call / Raise on screen`);
      // the hand helper: its advice is never cut off, and the chance to win shows once (not again inside the advice
      // where the figure sits right above or beside it on a short screen or sideways)
      const hl = await pg.evaluate(() => { const el = document.querySelector('#helper:not([hidden])'); if(!el) return null;
        const line = el.querySelector('.h-line'), have = el.querySelector('.h-have'), eq = el.querySelector('.h-eq');
        const shown = x => !!x && x.getClientRects().length > 0 && getComputedStyle(x).display !== 'none';
        return { clipped: el.scrollHeight > el.clientHeight + 1 || (!!line && (line.scrollHeight > line.clientHeight + 1 || line.scrollWidth > line.clientWidth + 1)),
          line: !!line, twice: shown(have) && shown(eq) && document.getElementById('game').classList.contains('h700'), text: line ? line.textContent : '' }; });
      check(hl && hl.line, `${tag}: the helper shows its advice`);
      if(hl && hl.line){ check(!hl.clipped, `${tag}: the helper's advice is not cut off ("${hl.text.trim()}")`); check(!hl.twice, `${tag}: the chance to win shows once`); }
      if(upright) check(ratio >= FELT_MIN && ratio <= FELT_MAX, `${tag}: felt height/width ${ratio.toFixed(2)} within ${FELT_MIN}-${FELT_MAX}`);
      else check(ratio <= LAND_MAX, `${tag}: felt height/width ${ratio.toFixed(2)} <= ${LAND_MAX} (sideways: wider than tall)`);
      console.log(`     ${tag}: felt ${Math.round(m.felt.r - m.felt.l)}x${Math.round(m.felt.b - m.felt.t)} (h/w ${ratio.toFixed(2)}), seats ${m.look || 'normal'}, table area ${Math.round(m.area.r - m.area.l)}x${Math.round(m.area.b - m.area.t)}`);
    }
    await pg.close();
  }
  if(process.env.JSON) fs.writeFileSync(process.env.JSON, JSON.stringify(all, null, 1));
  await browser.close();
  console.log(`\n${oks} ok, ${fails.length} failed`);
  srv.kill(); fs.rmSync(DATA, { force: true });
  process.exit(fails.length && !REPORT ? 1 : 0);
})().catch(e => { console.error(e.stack || e); srv.kill(); fs.rmSync(DATA, { force: true }); process.exit(1); });
