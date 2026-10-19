// Table stability during a live hand (browser, phone emulation with touch). Players saw the table jump on
// iPhone: the felt and every seat moved whenever the action bar, the hand helper or the result text came and
// went. This drives one hand through the states a phone sees, by writing table states into the page's own
// socket (routeWebSocket, as t_premium_ui does), and at every step records where the felt, the board, each
// seat's avatar and the action area are. It asserts:
//  - the felt, the board and the seats move at most 1 px from the first state, as a player and as a spectator
//  - the action area's top edge stays put (the bottom dock keeps its height)
//  - layout shift (PerformanceObserver 'layout-shift', the CLS score) stays near zero
// Sizes: 320x568, 375x667, 390x844, 393x852, 430x932 and landscape 956x440, 844x390, 956x370 (an in-app
// browser's bars), 667x375 and 568x320.
// And, for a seated player at each portrait size, during one hand:
//  - the browser's bars: the screen gets 90 px shorter (Safari's toolbar sliding in) and then back: the felt and
//    the seats stay put and keep their size, and the action bar stays on screen
//  - turning the phone: portrait -> landscape -> portrait: the landscape table fits, and back in portrait every
//    seat is exactly where it was
//  - the keyboard: the chat box focused and the screen 300 px shorter (a keyboard that resizes the page): nothing
//    on the felt moves; with the chat closed the action buttons are on the shortened screen; back to full height,
//    everything is where it was and the page isn't left scrolled
// PLAYWRIGHT=/path/to/playwright-core CHROMIUM=/path/to/chromium node test/ui/t_stability.js
//   ROOT=<dir>  run against another checkout ("before" numbers)   REPORT=1 print the numbers without failing
//   ONLY=390x844 one size   JSON=<file> write every measurement   SHOTS=<dir> a screenshot per state
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || process.env.PLAYWRIGHT_CORE || 'playwright');
const ROOT = process.env.ROOT || path.join(__dirname, '..', '..');
const PORT = 5300 + Math.floor(Math.random() * 80), BASE = 'http://localhost:' + PORT;
const DATA = require('os').tmpdir() + '/t_stab_' + process.pid + '.json';
const srv = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '', STAGING: '1', DATABASE_URL: '' }, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const REPORT = process.env.REPORT === '1', SHOTS = process.env.SHOTS || '';
const SIZES = [[320, 568], [375, 667], [390, 844], [393, 852], [430, 932], [956, 440], [844, 390], [956, 370], [667, 375], [568, 320]].filter(v => !process.env.ONLY || process.env.ONLY === v.join('x'));
const TOL = 1, CLS_MAX = 0.01;
const api = async (p, body) => { const j = await (await fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })).json(); if(j.error) throw new Error(p + ': ' + j.error); return j; };
const fails = [];
let oks = 0;
const check = (cond, msg) => { if(cond) oks++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if(!cond) fails.push(msg); };

// ---- one hand, step by step. `me` is null for a spectator (I am not seated) ----
const NAMES = ['Test Player 01', 'Test Player 02', 'Test Player 03', 'Test Player 04', 'Test Player 05', 'Test Player 06'];
function seatsFor(me, f){
  return Array.from({ length: 6 }, (_, s) => {
    const own = me && s === 0;
    return { uid: own ? me.id : 'p' + s, name: own ? me.name : NAMES[s], stack: 28000 - s * 900, inHand: true, bet: 0, folded: false, allIn: false,
      act: '', lastAmt: 0, won: 0, shown: null, cat: '', away: false, ...(f[s] || {}) };
  });
}
function base(me, o){
  return { tid: 'tst', n: 1, phase: 'hand', handNo: 7, street: 0, size: 6, allowed: [0, 1, 2, 3, 4, 5], cur: 0, board: [], pot: 0, btn: 4, blinds: [100, 200, 25],
    acting: -1, actUid: null, seq: 1, deadline: Date.now() + 60000, bank: 60000, usingBank: false, extras: 3, legal: null, result: null, note: '', ...o };
}
const STEPS = [
  // pre-flop, my turn: the action bar (clock row, Fold / Call / Raise) and the hand helper with advice
  ['my turn', me => base(me, { seq: 9, pot: 900, cur: 600, acting: 0, actUid: me ? me.id : 'p0',
    seats: seatsFor(me, { 1: { bet: 100 }, 2: { bet: 600, act: 'Raise', lastAmt: 600 }, 5: { folded: true, act: 'Fold' } }),
    legal: { canCheck: false, toCall: 600, canRaise: true, minTo: 1000, maxTo: 28000, isBet: false, cur: 600, pot: 1500, bb: 200 } })],
  // I called; someone else is to act: the waiting line and the pre-action buttons
  ['turn off', me => base(me, { seq: 10, pot: 1500, cur: 600, acting: 1, actUid: 'p1',
    seats: seatsFor(me, { 0: { bet: 600, act: 'Call' }, 1: { bet: 100 }, 2: { bet: 600, act: 'Raise', lastAmt: 600 }, 5: { folded: true, act: 'Fold' } }) })],
  // the flop with a bet in front of a seat: "You have …", a bet chip and its badge
  ['bet badge', me => base(me, { seq: 14, street: 1, board: ['Kh', '7c', '2d'], pot: 2400, cur: 1200, acting: 3, actUid: 'p3',
    seats: seatsFor(me, { 1: { folded: true, act: 'Fold' }, 2: { bet: 1200, act: 'Bet', lastAmt: 1200 }, 4: { folded: true, act: 'Fold' }, 5: { folded: true, act: 'Fold' } }) })],
  // my turn again on the flop, facing the bet
  ['my turn flop', me => base(me, { seq: 15, street: 1, board: ['Kh', '7c', '2d'], pot: 3600, cur: 1200, acting: 0, actUid: me ? me.id : 'p0',
    seats: seatsFor(me, { 1: { folded: true, act: 'Fold' }, 2: { bet: 1200, act: 'Bet', lastAmt: 1200 }, 3: { bet: 1200, act: 'Call' }, 4: { folded: true, act: 'Fold' }, 5: { folded: true, act: 'Fold' } }),
    legal: { canCheck: false, toCall: 1200, canRaise: true, minTo: 2400, maxTo: 27400, isBet: false, cur: 1200, pot: 3600, bb: 200 } })],
  // I folded (spectator: seat 0 folded)
  ['fold', me => base(me, { seq: 16, street: 1, board: ['Kh', '7c', '2d'], pot: 3600, cur: 1200, acting: -1,
    seats: seatsFor(me, { 0: { folded: true, act: 'Fold' }, 1: { folded: true, act: 'Fold' }, 2: { bet: 1200, act: 'Bet', lastAmt: 1200 }, 3: { bet: 1200, act: 'Call' }, 4: { folded: true, act: 'Fold' }, 5: { folded: true, act: 'Fold' } }) })],
  // showdown: the result lines under the board, the winner's badge, the hand names, shown cards
  ['showdown', me => base(me, { seq: 22, street: 3, board: ['Kh', '7c', '2d', '9s', 'Jd'], pot: 0, cur: 0, acting: -1,
    seats: seatsFor(me, { 0: { folded: true }, 1: { folded: true }, 2: { won: 6000, shown: ['Kd', 'Ks'], cat: 'Three of a kind', stack: 32200 }, 3: { shown: ['Ad', 'Jc'], cat: 'One pair' }, 4: { folded: true }, 5: { folded: true } }),
    result: { showdown: true, winCards: ['Kd', 'Ks', 'Kh'], lines: ['Test Player 02 wins 6,000 with three kings', 'Test Player 03 shows a pair of jacks'] } })],
  // the next hand is dealt; someone else acts first
  ['next hand', me => base(me, { handNo: 8, seq: 1, btn: 5, pot: 300, cur: 200, acting: 3, actUid: 'p3',
    seats: seatsFor(me, { 0: { bet: 100 }, 1: { bet: 200 } }) })],
];
const YOU = { 7: ['Ah', 'Qd'], 8: ['9c', '9h'] };

// what is measured at each step (page coordinates, rounded to 0.1 px)
async function measure(pg){
  return pg.evaluate(() => {
    const r = el => { if(!el) return null; const b = el.getBoundingClientRect(); return b.width || b.height ? [b.left, b.top, b.width, b.height].map(v => Math.round(v * 10) / 10) : null; };
    const seats = {};
    document.querySelectorAll('#seats .seat').forEach(s => { seats[s.dataset.uid] = r(s.querySelector('.av')); });
    return { area: r(document.getElementById('tableArea')), felt: r(document.querySelector('#tableArea .felt')), board: r(document.getElementById('board')),
      controls: r(document.getElementById('controls')), dock: r(document.getElementById('dock')), seats,
      hero: (() => { const cs = [...document.querySelectorAll('#seats .seat.hero .hole .card')].map(r).filter(Boolean); if(!cs.length) return null; const l = Math.min(...cs.map(c => c[0])), t = Math.min(...cs.map(c => c[1]));
        return [l, t, Math.max(...cs.map(c => c[0] + c[2])) - l, Math.max(...cs.map(c => c[1] + c[3])) - t]; })(), cls: window.__cls || 0, shifts: (window.__shifts || []).slice() };
  });
}
// the felt and every seat compared with a reference measurement
const drift = (a, b) => Math.max(moved(a.felt, b.felt), moved(a.board.slice(0, 2), b.board.slice(0, 2)), ...Object.keys(a.seats).map(u => moved(a.seats[u], b.seats[u])));
async function viewportMatrix(pg, [w, h], tag, push){
  const set = async (W, H, k) => { await pg.setViewportSize({ width: W, height: H }); await sleep(250); if(k != null){ push(k); } await sleep(450); return measure(pg); };
  const onScreen = async (sel, H) => { const b = await pg.locator(sel).boundingBox().catch(() => null); return !!b && b.y >= -.5 && b.y + b.height <= H + .5; };
  push(1); await sleep(500);
  const ref = await measure(pg);
  // the browser's bars come in, then go again
  const shortH = h - 90;
  let m = await set(w, shortH, 2);
  check(drift(ref, m) <= TOL, `${tag}: toolbar in (${w}x${shortH}) mid-hand: the table doesn't move or rescale (${drift(ref, m).toFixed(1)} px)`);
  push(3); await sleep(500);
  check(await onScreen('#aCall', shortH) && await onScreen('#aRaise', shortH), `${tag}: toolbar in: the action buttons stay on screen`);
  m = await set(w, h, 1);
  check(drift(ref, m) <= TOL, `${tag}: toolbar out again: the table is where it was (${drift(ref, m).toFixed(1)} px)`);
  m = await set(w, h + 80, 2);
  check(drift(ref, m) <= TOL, `${tag}: toolbar hidden (${w}x${h + 80}) mid-hand: the table doesn't move or rescale (${drift(ref, m).toFixed(1)} px)`);
  m = await set(w, h, 1);
  // turning the phone
  m = await set(h, w, 3);
  const inside = Object.values(m.seats).every(b => b && b[0] >= -.5 && b[1] >= -.5 && b[0] + b[2] <= h + .5 && b[1] + b[3] <= w + .5);
  check(inside && await onScreen('#aCall', w), `${tag}: turned to landscape (${h}x${w}): every seat and the action buttons are on screen`);
  m = await set(w, h, 1);
  check(drift(ref, m) <= TOL, `${tag}: turned back to portrait: every seat is where it was (${drift(ref, m).toFixed(1)} px)`);
  // the same turns the way iPhone Safari reports them: the new width arrives at once, the new height only later
  // (no event of its own), mid-hand. The table must end up laid out exactly as for a normal turn.
  const lateTurn = async (W, H, oldH) => {
    await pg.evaluate(oh => { const d = Object.getOwnPropertyDescriptor(window, 'innerHeight') || Object.getOwnPropertyDescriptor(Window.prototype, 'innerHeight');
      window.__ih = d; Object.defineProperty(window, 'innerHeight', { get: () => oh, configurable: true }); }, oldH);
    await pg.setViewportSize({ width: W, height: H }); await pg.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
    await sleep(120);
    await pg.evaluate(() => Object.defineProperty(window, 'innerHeight', window.__ih));
    if(process.env.DBG) console.log('innerHeight now', await pg.evaluate(() => window.innerHeight), 'want', H);
    await sleep(2800); return measure(pg);
  };
  const cls = () => pg.evaluate(() => ['land', 'h700', 'h600'].map(c => document.getElementById('game').classList.contains(c)).join());
  m = await set(h, w); const landRef = m, landCls = await cls();
  m = await set(w, h);
  m = await lateTurn(h, w, h);
  check(drift(landRef, m) <= TOL && await cls() === landCls, `${tag}: turned to landscape, size reported late (iPhone): laid out as a normal turn (${drift(landRef, m).toFixed(1)} px, ${await cls()} vs ${landCls})`);
  m = await lateTurn(w, h, w);
  check(drift(ref, m) <= TOL, `${tag}: turned back to portrait, size reported late (iPhone): every seat is where it was (${drift(ref, m).toFixed(1)} px)`);
  // the keyboard, from the chat box
  await pg.click('#chatBtn'); await sleep(250); await pg.focus('#chatInput');
  const kbH = h - 300;
  m = await set(w, kbH, 2);
  check(drift(ref, m) <= TOL, `${tag}: chat keyboard open (${w}x${kbH}): the table doesn't move or rescale (${drift(ref, m).toFixed(1)} px)`);
  check(await onScreen('#chatInput', kbH), `${tag}: chat keyboard open: the chat box is on screen`);
  await pg.evaluate(() => document.activeElement && document.activeElement.blur()); await pg.click('#chatClose'); await sleep(200);
  push(3); await sleep(500);
  check(await onScreen('#aCall', kbH) && await onScreen('#aFold', kbH), `${tag}: chat closed on the short screen: the action buttons are reachable`);
  m = await set(w, h, 1);
  const sy = await pg.evaluate(() => window.scrollY + document.documentElement.scrollTop);
  check(drift(ref, m) <= TOL && !sy, `${tag}: keyboard closed: the table is where it was (${drift(ref, m).toFixed(1)} px), page not scrolled (${sy})`);
}
const moved = (a, b) => !a || !b ? Infinity : Math.max(...a.map((v, i) => Math.abs(v - b[i])));

(async () => {
  for(let i = 0; i < 60; i++){ try{ await fetch(BASE + '/health'); break; }catch(e){ await sleep(150); } }
  await sleep(400);
  const TOK = (await api('login', { name: 'Test Player 07', pin: '135777' })).token;
  if(SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const all = {};
  for(const vp of SIZES) for(const role of ['player', 'spectator']){
    const tag = `${vp.join('x')} ${role}`;
    const pg = await browser.newPage({ viewport: { width: vp[0], height: vp[1] }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    if(process.env.FONTS_DIR){
      const dir = process.env.FONTS_DIR;
      await pg.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => { const u = r.request().url();
        if(u.includes('fonts.googleapis.com/css2')) return r.fulfill({ status: 200, contentType: 'text/css', body: fs.readFileSync(path.join(dir, 'fonts.css')) });
        const f = path.join(dir, u.slice('https://fonts.gstatic.com/'.length).replace(/\//g, '_'));
        return fs.existsSync(f) ? r.fulfill({ status: 200, contentType: 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) }) : r.abort(); });
    }
    // layout-shift entries from the first paint on
    await pg.addInitScript(() => { window.__cls = 0; window.__shifts = [];
      try{ new PerformanceObserver(l => { for(const e of l.getEntries()){ if(e.hadRecentInput) continue; window.__cls += e.value;
        window.__shifts.push({ v: Math.round(e.value * 1e4) / 1e4, at: window.__step || '', who: (e.sources || []).map(s => s.node ? (s.node.id || s.node.className || s.node.nodeName) : '?').join(',') }); } }).observe({ type: 'layout-shift', buffered: true }); }catch(e){} });
    let page = null, me = null;
    await pg.routeWebSocket(/\/ws$/, ws => {
      const server = ws.connectToServer();
      ws.onMessage(m => { try{ const j = JSON.parse(m); if(j.t === 'watch' || j.t === 'act' || j.t === 'extend') return; }catch(e){} server.send(m); });
      server.onMessage(m => {
        let j; try{ j = JSON.parse(m); }catch(e){ return ws.send(m); }
        if(j.t === 'table' || j.t === 'closed') return;
        if(j.t !== 'club') return ws.send(m);
        me = j.club.me;
        j.club.tourney = { ...j.club.tourney, status: 'running', name: 'Friday Night', stack: 30000, anteMode: 'bb', regs: [me.id], entrants: 6, remaining: 6, level: 2,
          levelEndsAt: Date.now() + 600000, paused: false, places: [], lateOpen: false, helper: true };
        j.club.myTable = 'tst'; j.club.tables = [{ tid: 'tst', n: 1, players: 6 }];
        ws.send(JSON.stringify(j));
        if(!page){ page = ws; push(0); }
      });
    });
    const push = k => { const [, f] = STEPS[k], who = role === 'player' ? me : null, t = f(who);
      page.send(JSON.stringify({ t: 'table', table: t, ...(role === 'player' ? { you: { hand: t.handNo, cards: YOU[t.handNo] } } : {}) })); };
    await pg.goto(BASE + '/'); await pg.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), TOK);
    await pg.reload(); await pg.evaluate(() => document.fonts.ready);
    await pg.waitForSelector('#seats .seat', { timeout: 15000 });
    await sleep(900);
    const rows = [];
    for(let k = 0; k < STEPS.length; k++){
      await pg.evaluate(n => { window.__step = n; }, STEPS[k][0]);
      if(k) push(k);
      await sleep(k === 5 ? 1200 : 700); // the showdown has its chips glide; let the frame settle either way
      const m = await measure(pg); m.step = STEPS[k][0]; rows.push(m);
      if(SHOTS) await pg.screenshot({ path: path.join(SHOTS, `${vp.join('x')}-${role}-${k}-${STEPS[k][0].replace(/ /g, '-')}.png`) });
    }
    // the raise panel opens over the bottom of the table: nothing on the felt moves, and its buttons are on screen
    if(role === 'player'){
      await pg.evaluate(() => { window.__step = 'sizing'; });
      push(0); await sleep(500);
      const b0 = await measure(pg);
      await pg.click('#aRaise'); await sleep(400);
      const b1 = await measure(pg), go = await pg.locator('#szGo').boundingBox();
      if(SHOTS) await pg.screenshot({ path: path.join(SHOTS, `${vp.join('x')}-${role}-7-raise-panel.png`) });
      const mv = Math.max(moved(b0.felt, b1.felt), ...Object.keys(b0.seats).map(u => moved(b0.seats[u], b1.seats[u])));
      check(mv <= TOL, `${tag}: opening the raise panel moves nothing on the felt (${mv.toFixed(1)} px)`);
      check(go && go.y + go.height <= vp[1] + .5 && go.y >= 0, `${tag}: the raise panel's confirm button is on screen`);
      await pg.click('#szBack'); await sleep(300);
      const b2 = await measure(pg);
      check(moved(b0.felt, b2.felt) <= TOL && await pg.locator('#aRaise').isVisible(), `${tag}: Back closes the raise panel and the table is where it was`);
      // the hero's cards are above the dock, not under it, in every step of the hand
      const cover = (a, b) => a[0] < b[0] + b[2] - .5 && b[0] < a[0] + a[2] - .5 && a[1] < b[1] + b[3] - .5 && b[1] < a[1] + a[3] - .5;
      const hid = rows.filter(m => m.hero && m.dock && cover(m.hero, m.dock)).map(m => m.step);
      check(!hid.length, `${tag}: your cards stay clear of the action bar${hid.length ? ' (covered at ' + hid.join(', ') + ')' : ''}`);
    }
    all[tag] = rows;
    // ---- compare every step with the first one ----
    const f0 = rows[0];
    let felt = 0, board = 0, seat = 0, worst = '';
    for(const m of rows.slice(1)){
      felt = Math.max(felt, moved(f0.felt, m.felt)); board = Math.max(board, moved(f0.board.slice(0, 2), m.board.slice(0, 2)));
      for(const uid of Object.keys(f0.seats)){ const d = moved(f0.seats[uid].slice(0, 2), m.seats[uid] && m.seats[uid].slice(0, 2)); if(d > seat){ seat = d; worst = `${uid} at "${m.step}"`; } }
    }
    const areaH = Math.max(...rows.map(m => m.area[3])) - Math.min(...rows.map(m => m.area[3]));
    const dockTop = Math.max(...rows.map(m => m.area[1] + m.area[3])) - Math.min(...rows.map(m => m.area[1] + m.area[3]));
    const cls = rows[rows.length - 1].cls - rows[0].cls;
    console.log(`     ${tag}: felt ${felt.toFixed(1)}px  board ${board.toFixed(1)}px  seats ${seat.toFixed(1)}px${worst ? ' (' + worst + ')' : ''}  table area height range ${areaH.toFixed(1)}px  CLS ${cls.toFixed(4)}`);
    check(felt <= TOL, `${tag}: the felt stays put through the hand (moved ${felt.toFixed(1)} px)`);
    check(seat <= TOL, `${tag}: every seat stays put (moved ${seat.toFixed(1)} px${seat > TOL ? ', worst ' + worst : ''})`);
    check(board <= TOL, `${tag}: the board stays put (moved ${board.toFixed(1)} px)`);
    check(areaH <= TOL && dockTop <= TOL, `${tag}: the table area keeps its size (height range ${areaH.toFixed(1)} px)`);
    check(cls <= CLS_MAX, `${tag}: layout shift during the hand ${cls.toFixed(4)} <= ${CLS_MAX}`);
    // the action buttons are on screen on my turn, the hero's cards are visible throughout
    if(role === 'player'){
      for(const k of [0, 3]){ const c = rows[k].controls; check(c && c[1] + c[3] <= vp[1] + .5, `${tag}: the action bar is inside the screen at "${STEPS[k][0]}"`); }
    }
    // (after the hand's own checks: resizing the page is a layout change of its own, not counted as layout shift)
    if(role === 'player' && vp[0] < vp[1]) await viewportMatrix(pg, vp, tag, push);
    await pg.close();
  }
  if(process.env.JSON) fs.writeFileSync(process.env.JSON, JSON.stringify(all, null, 1));
  await browser.close();
  console.log(`\n${oks} ok, ${fails.length} failed`);
  srv.kill(); fs.rmSync(DATA, { force: true });
  process.exit(fails.length && !REPORT ? 1 : 0);
})().catch(e => { console.error(e.stack || e); srv.kill(); fs.rmSync(DATA, { force: true }); process.exit(1); });
