// The board's table geometry fixtures (Issue #32, Step-0 spec §3.6, landed first in B1 as Muse's condition 2), run
// with UI_BOARD=1. Two kinds of check:
//  - KEPT: the rules that stay from today's table and must hold at every phase: the rail box wholly on screen, the
//    felt never under the dock, no name plate over another plate, the board, the pot or a button, and every action
//    button at least 44 px and on screen. These count as passes and failures now.
//  - PENDING B2: the new geometry that B2 builds: the rail box's proportion per size class (§3.1: P-L h/w 1.50-1.62,
//    P-M at least 1.30, P-S at least 1.25, L w/h 1.85-2.05), its width (0.86 / 0.90 of the screen upright, at most 0.70
//    sideways) and, at P-L with 9 seated, each avatar centre within ±4%
//    of the §3.2 slot table (the rail box normalised 0-1). They run and print what they measure, labelled
//    "PENDING B2", and are not counted as passes or failures until B2 turns them on with B2=1 (or flips B2_LIVE below).
// The exit code reflects the KEPT checks only (and every check with B2=1).
// PLAYWRIGHT=/path/to/playwright-core CHROMIUM=/path/to/chromium node test/ui/t_board_layout.js
//   ONLY=390x844 one size   NS=2,6,9 table sizes   SHOTS=<dir> a screenshot per case   B2=1 the pending checks count
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || process.env.PLAYWRIGHT_CORE || 'playwright');
const ROOT = process.env.ROOT || path.join(__dirname, '..', '..');
const PORT = 5480 + Math.floor(Math.random() * 80), BASE = 'http://localhost:' + PORT;
const DATA = require('os').tmpdir() + '/t_blay_' + process.pid + '.json';
const srv = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, UI_BOARD: '1', PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '', STAGING: '1', DATABASE_URL: '' }, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SHOTS = process.env.SHOTS || '';
const B2_LIVE = process.env.B2 === '1'; // B2: set true when the board geometry lands
// the size classes of §3.1, each with the viewports that stand for it
const CLASSES = [
  { cls: 'P-L', sizes: ['390x844', '393x852', '430x932'], band: r => r.hw >= 1.50 && r.hw <= 1.62, rule: 'h/w 1.50-1.62', width: .86, seats: true },
  { cls: 'P-M', sizes: ['375x667', '390x664'], band: r => r.hw >= 1.30, rule: 'h/w >= 1.30', width: .86 },
  { cls: 'P-S', sizes: ['320x568'], band: r => r.hw >= 1.25, rule: 'h/w >= 1.25', width: .90 },
  { cls: 'L', sizes: ['844x390', '932x430'], band: r => r.wh >= 1.85 && r.wh <= 2.05, rule: 'w/h 1.85-2.05' } ];
// §3.2: the normalised avatar centres on the P-L rail box at 9 slots (the hero's slot aside), slots 1-8 clockwise
// from the hero's left
const SLOTS = [[.02, .76], [0, .47], [.08, .17], [.34, .01], [.66, .01], [.92, .17], [1, .47], [.98, .76]];
const TOL = .04;
const NS = (process.env.NS || '2,6,9').split(',').map(Number);
const api = async (p, body) => { const j = await (await fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })).json(); if(j.error) throw new Error(p + ': ' + j.error); return j; };
const fails = [], pend = { pass: 0, fail: 0 };
let oks = 0;
const check = (cond, msg) => { if(cond) oks++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if(!cond) fails.push(msg); };
const pending = (cond, msg) => { if(B2_LIVE) return check(cond, msg); cond ? pend.pass++ : pend.fail++; console.log(`PENDING B2 (${cond ? 'passes' : 'fails'} now) ${msg}`); };

const NAMES = ['Alexandra Whitfield', 'Ben', 'Christina Okafor', 'Dev', 'Evangeline', 'Fitzgerald', 'Gwen', 'Maximilian Hart', 'Sam'];
// n seated, my turn pre-flop; a raise and a call in front of two seats, one fold (as t_table_layout)
function tableFor(me, n){
  const seats = Array.from({ length: n }, (_, s) => ({ uid: s ? 'p' + s : me.id, name: s ? NAMES[s - 1] : me.name, stack: 30000 - s * 1100, inHand: true,
    bet: s === 1 ? 200 : s === 2 % n && n > 2 ? 1200 : 0, folded: n > 3 && s === n - 1, allIn: false, act: n > 3 && s === n - 1 ? 'Fold' : s === 2 % n && n > 2 ? 'Raise' : '',
    lastAmt: 1200, won: 0, shown: null, cat: '', away: false }));
  return { tid: 'blay' + n, n: 1, phase: 'hand', handNo: 3, street: 0, seats, size: n, allowed: seats.map((p, s) => s), cur: 1200, board: ['As', 'Kd', '7c'], pot: 1500, btn: n - 1,
    blinds: [100, 200, 25], acting: 0, actUid: me.id, seq: 5, deadline: Date.now() + 60000, bank: 60000, usingBank: false, extras: 3,
    legal: { canCheck: false, toCall: 1200, canRaise: true, minTo: 2200, maxTo: 30000, isBet: false, cur: 1200, pot: 2700, bb: 200 }, result: null, note: '' };
}
const hit = (a, b, pad = 0) => a.l < b.r - pad && b.l < a.r - pad && a.t < b.b - pad && b.t < a.b - pad;

(async () => {
  for(let i = 0; i < 60; i++){ try{ await fetch(BASE + '/health'); break; }catch(e){ await sleep(150); } }
  await sleep(400);
  const TOK = (await api('login', { name: 'Test Player 07', pin: '135777' })).token;
  if(SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  for(const C of CLASSES) for(const size of C.sizes){
    if(process.env.ONLY && process.env.ONLY !== size) continue;
    const [w, h] = size.split('x').map(Number);
    const pg = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await pg.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => r.abort());
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
        j.club.myTable = 'blay' + NS[0]; j.club.tables = NS.map(n => ({ tid: 'blay' + n, n: 1, players: n }));
        ws.send(JSON.stringify(j)); sock = ws;
      });
    });
    await pg.goto(BASE + '/'); await pg.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), TOK);
    await pg.reload();
    for(let k = 0; k < 100 && !sock; k++) await sleep(100);
    check(await pg.evaluate(() => document.documentElement.dataset.ui === 'board'), `${C.cls} ${size}: the page is the board (html[data-ui="board"])`);
    for(const n of NS){
      const tag = `${C.cls} ${size} ${n} players`;
      sock.send(JSON.stringify({ t: 'table', table: { ...tableFor(me, n), tid: 'blay' + NS[0], handNo: 3 + n }, you: { hand: 3 + n, cards: ['Ah', 'Qd'] } }));
      try{ await pg.waitForSelector('#aRaise', { timeout: 8000 }); }catch(e){}
      await sleep(700);
      const m = await pg.evaluate(() => {
        const r = el => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
        const drawn = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
        const u = rs => ({ l: Math.min(...rs.map(x => x.l)), t: Math.min(...rs.map(x => x.t)), r: Math.max(...rs.map(x => x.r)), b: Math.max(...rs.map(x => x.b)) });
        const seats = [...document.querySelectorAll('#seats .seat')].map(s => ({ name: (s.querySelector('.nm') || {}).textContent || '?', hero: s.classList.contains('hero'),
          av: drawn(s.querySelector('.av')) ? r(s.querySelector('.av')) : null,
          plate: (ps => ps.length ? u(ps) : null)([s.querySelector('.plate'), ...s.querySelectorAll('.badge')].filter(drawn).map(r)) }));
        const slots = [...document.querySelectorAll('#board .slot, #board .card')].filter(drawn).map(r);
        const pot = document.querySelector('#tableArea .pot');
        const btns = [...document.querySelectorAll('#game .dock .controls button')].filter(drawn).map(b => ({ id: b.id || b.className, ...r(b) }));
        return { felt: r(document.querySelector('#tableArea .felt')), dock: r(document.getElementById('dock')), seats, board: slots.length ? u(slots) : null,
          pot: drawn(pot) ? r(pot) : null, btns, vw: innerWidth, vh: innerHeight };
      });
      if(SHOTS) await pg.screenshot({ path: path.join(SHOTS, `${C.cls}-${size}-${n}p.png`) });
      const F = m.felt;
      // ---- KEPT ----
      check(F.l >= -.5 && F.t >= -.5 && F.r <= w + .5 && F.b <= h + .5, `${tag}: KEPT the rail box wholly on screen (${Math.round(F.l)},${Math.round(F.t)} to ${Math.round(F.r)},${Math.round(F.b)})`);
      // (upright the dock is under the table; sideways it is a column beside it: either way the two never overlap)
      check(!hit(F, m.dock, .5) && (w > h || F.b <= m.dock.t + .5), `${tag}: KEPT the felt never under the dock (felt ${Math.round(F.l)},${Math.round(F.t)} to ${Math.round(F.r)},${Math.round(F.b)}; dock ${Math.round(m.dock.l)},${Math.round(m.dock.t)} to ${Math.round(m.dock.r)},${Math.round(m.dock.b)})`);
      const over = [], plates = m.seats.filter(s => s.plate);
      plates.forEach((a, i) => { plates.slice(i + 1).forEach(b => { if(hit(a.plate, b.plate, .5)) over.push(`${a.name} x ${b.name}`); });
        if(m.board && hit(a.plate, m.board, .5)) over.push(`${a.name} x board`); if(m.pot && hit(a.plate, m.pot, .5)) over.push(`${a.name} x pot`);
        m.btns.forEach(b => { if(hit(a.plate, b, .5)) over.push(`${a.name} x ${b.id}`); }); });
      check(!over.length, `${tag}: KEPT no plate over another plate, the board, the pot or a button${over.length ? ' — ' + over.join('; ') : ''}`);
      // the action buttons (Fold, Check, Call, Raise, All-in) at least 44x44; every dock button on screen. (Today's
      // time-bank button is shorter than 44: printed below, for the B2 dock, not counted)
      const acts = m.btns.filter(b => /^a[A-Z]/.test(b.id)), offs = m.btns.filter(b => b.l < -.5 || b.t < -.5 || b.r > w + .5 || b.b > h + .5).map(b => b.id);
      const small = acts.filter(b => b.w < 44 - .5 || b.h < 44 - .5).map(b => `${b.id} ${Math.round(b.w)}x${Math.round(b.h)}`);
      check(acts.length >= 3 && !small.length && !offs.length, `${tag}: KEPT the action buttons at least 44x44 (${acts.map(b => b.id).join(', ')}) and every dock button on screen${small.length ? ' — ' + small.join(', ') : ''}${offs.length ? ' — off screen: ' + offs.join(', ') : ''}`);
      const under = m.btns.filter(b => !/^a[A-Z]/.test(b.id) && (b.w < 44 - .5 || b.h < 44 - .5)).map(b => `${b.id} ${Math.round(b.w)}x${Math.round(b.h)}`);
      if(under.length) console.log(`     note ${tag}: other dock buttons under 44 px (for B2): ${under.join(', ')}`);
      // ---- PENDING B2 ----
      const fw = F.r - F.l, fh = F.b - F.t, rr = { hw: fh / fw, wh: fw / fh };
      pending(C.band(rr), `${tag}: §3.1 ${C.cls} rail box ${Math.round(fw)}x${Math.round(fh)}, h/w ${rr.hw.toFixed(2)}, w/h ${rr.wh.toFixed(2)} (${C.rule})`);
      // §3.1 footprint: the rail box's width, 0.86 of the screen (P-L, P-M) or 0.90 (P-S), within ±3%; sideways at most
      // 0.70 of the width
      if(C.width) pending(Math.abs(fw / w - C.width) <= .03, `${tag}: §3.1 ${C.cls} rail box width ${(fw / w).toFixed(2)} of the screen (${C.width} ±0.03)`);
      else pending(fw / w <= .70 + .005, `${tag}: §3.1 ${C.cls} rail box width ${(fw / w).toFixed(2)} of the screen (at most 0.70)`);
      if(C.seats && n === 9){
        const cs = m.seats.filter(s => !s.hero && s.av).map(s => ({ name: s.name, x: ((s.av.l + s.av.r) / 2 - F.l) / fw, y: ((s.av.t + s.av.b) / 2 - F.t) / fh }));
        const off = SLOTS.map(([x, y], i) => { const best = cs.slice().sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
          return best && Math.abs(best.x - x) <= TOL && Math.abs(best.y - y) <= TOL ? null : `slot ${i + 1} (${x},${y}) nearest ${best ? best.x.toFixed(2) + ',' + best.y.toFixed(2) : 'none'}`; }).filter(Boolean);
        pending(cs.length === 8 && !off.length, `${tag}: §3.2 the 8 other avatar centres each within ±${TOL * 100}% of the 9-max slot table${off.length ? ' — ' + off.join('; ') : ''}`);
      }
    }
    await pg.close();
  }
  await browser.close();
  console.log(`\n${oks} ok, ${fails.length} failed` + (B2_LIVE ? '' : `; PENDING B2 (not counted): ${pend.pass} pass now, ${pend.fail} fail now`));
  srv.kill(); fs.rmSync(DATA, { force: true });
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e.stack || e); srv.kill(); fs.rmSync(DATA, { force: true }); process.exit(1); });
