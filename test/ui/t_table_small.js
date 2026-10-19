// R2 table crowding (browser, layout only): a full table where every seat has a bet in front of it, on small
// phones and on a desktop. Nothing on the felt may overlap (bet chips, seats with their badges, the dealer
// button, the board, the pot, the message line), and the action bar (FOLD/CALL/RAISE, the timer, and the
// raise slider) must sit fully inside the screen. The table state is written into the page's own socket
// (routeWebSocket), so the page's real code lays it out; no server game logic is involved.
// PLAYWRIGHT=/path/to/playwright CHROMIUM=/path/to/chromium node test/ui/t_table_small.js
// SHOTS=<dir> also saves a screenshot of every case there.
const assert = require('assert');
const { spawn } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const PORT = 4900 + Math.floor(Math.random() * 80), BASE = 'http://localhost:' + PORT;
const DATA = require('os').tmpdir() + '/t_tsmall_' + process.pid + '.json';
const srv = spawn('node', ['server/index.js'], { cwd: __dirname + '/../..', env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '1', STAGING: '', DATABASE_URL: '' }, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const post = async (p, body, tok) => (await fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body) })).json();
const SHOTS = process.env.SHOTS || '';
const VIEWPORTS = [[320, 568], [375, 667], [360, 780], [390, 844], [1280, 800]];
const NAMES = ['Alexandra', 'Bartholomew', 'Christina', 'Dominique', 'Evangeline', 'Fitzgerald', 'Gwendolyn', 'Maximilian'];
const BETS = [12500, 25000, 6000, 125000, 18750, 9400, 31000, 2400, 52000];

// a hand on the flop where every seat has put chips in and it's your turn to act
function tableFor(me, n){
  const seats = Array.from({ length: n }, (_, s) => ({ uid: s ? 'p' + s : me.id, name: s ? NAMES[s - 1] : me.name, stack: 1234500 - s * 98765, inHand: true,
    bet: BETS[s], folded: false, allIn: false, act: s ? (s % 3 ? 'Raise' : 'Call') : 'Call', lastAmt: BETS[s], won: 0, shown: null, cat: '', away: false }));
  return { tid: 'tsmall', n: 3, phase: 'hand', handNo: 7, street: 1, seats, size: n, allowed: seats.map((p, s) => s), cur: 125000,
    board: ['Ah', 'Kd', '7c'], pot: 248000, btn: 3, blinds: [2000, 4000, 0], acting: 0, actUid: me.id, seq: 41,
    deadline: Date.now() + 60000, bank: 60000, usingBank: false, extras: 3,
    legal: { canCheck: false, toCall: 112500, canRaise: true, minTo: 237500, maxTo: 1234500, isBet: false, cur: 125000, pot: 248000 + BETS.slice(0, n).reduce((a, b) => a + b, 0), bb: 4000 },
    result: null, note: 'Level 9 next hand: blinds 2,500/5,000 · ante 500' };
}

async function load(browser, tok, [w, h], n){
  const pg = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: w < 600 ? 2 : 1 });
  await pg.routeWebSocket(/\/ws$/, ws => {
    const server = ws.connectToServer();
    // the page asking to watch our made-up table must not reach the server (it would answer "closed")
    ws.onMessage(m => { try{ if(JSON.parse(m).t === 'watch') return; }catch(e){} server.send(m); });
    server.onMessage(m => {
      let j; try{ j = JSON.parse(m); }catch(e){ return ws.send(m); }
      if(j.t === 'table' || j.t === 'closed') return;
      if(j.t !== 'club') return ws.send(m);
      j.club.tourney = { ...j.club.tourney, status: 'running', name: 'Friday Night', stack: 30000, anteMode: 'bb', regs: [j.club.me.id], entrants: 27, remaining: 18, level: 8, levelEndsAt: Date.now() + 600000, paused: false, places: [], lateOpen: false, helper: true };
      j.club.myTable = 'tsmall'; j.club.tables = [{ tid: 'tsmall', n: 3, players: n }];
      ws.send(JSON.stringify(j));
      ws.send(JSON.stringify({ t: 'table', table: tableFor(j.club.me, n), you: { hand: 7, cards: ['Qs', 'Qh'] } }));
    });
  });
  await pg.goto(BASE + '/'); await pg.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), tok);
  await pg.reload(); await pg.waitForSelector('#aRaise'); await pg.waitForSelector('#seats .bet');
  await pg.evaluate(() => document.fonts.ready);
  await sleep(700); // deal / chip-in animations settle
  return pg;
}

// every box on the felt, and which pairs of them overlap
function measure(){
  const R = el => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
  const boxes = [];
  // a seat is its cards, avatar, name plate and action badge, each checked on its own (they may overlap each other;
  // the smallest look leaves another player's card backs undrawn)
  document.querySelectorAll('#seats .seat').forEach((s, i) => s.querySelectorAll('.hole .card, .av, .plate, .badge').forEach(e => e.getClientRects().length && boxes.push({ kind: 'seat', seat: i, name: s.querySelector('.nm').textContent + ' ' + e.classList[0], ...R(e) })));
  document.querySelectorAll('#seats .bet').forEach(b => boxes.push({ kind: 'bet', name: b.textContent, ...R(b) }));
  document.querySelectorAll('#seats .dealer').forEach(b => boxes.push({ kind: 'dealer', name: 'D', ...R(b) }));
  boxes.push({ kind: 'board', name: 'board', ...R(document.getElementById('board')) });
  for(const id of ['pot', 'msg']){ const el = document.getElementById(id); if(el.textContent.trim()) boxes.push({ kind: id, name: id, ...R(el) }); }
  const over = [], E = 0.5;
  for(let i = 0; i < boxes.length; i++) for(let j = i + 1; j < boxes.length; j++){
    const a = boxes[i], b = boxes[j];
    if(a.kind === 'board' && (b.kind === 'pot' || b.kind === 'msg')) continue; // the centre column lays these out itself
    if(a.seat != null && a.seat === b.seat) continue;
    const w = Math.min(a.r, b.r) - Math.max(a.l, b.l), h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
    if(w > E && h > E) over.push(`${a.kind} "${a.name}" x ${b.kind} "${b.name}" (${w.toFixed(1)}x${h.toFixed(1)})`);
  }
  // the felt stays inside the table area, and the action bar inside the screen
  const area = R(document.getElementById('tableArea')), out = [];
  for(const b of boxes) if(b.l < area.l - 1 || b.r > area.r + 1 || b.t < area.t - 1 || b.b > area.b + 1) out.push(`${b.kind} "${b.name}" outside the table area`);
  const vw = innerWidth, vh = innerHeight;
  const controls = [...document.querySelectorAll('#controls button, #controls input, #controls .turnbar, #controls .sizing, #controls .act-main')];
  // (on the oval the raise panel takes the timer's row: the timer is a thin line along its top, without +30s)
  const ovalSizing = document.getElementById('game').classList.contains('ovl') && !!document.querySelector('#controls .sizing');
  for(const el of controls){ if(ovalSizing && el.classList.contains('xtime')) continue; const r = R(el); if(r.t < 0 || r.l < -0.5 || r.b > vh + 0.5 || r.r > vw + 0.5 || r.b - r.t < 1) out.push(`control ${el.id || el.className || el.tagName} not fully on screen (${r.l.toFixed(0)},${r.t.toFixed(0)})-(${r.r.toFixed(0)},${r.b.toFixed(0)}) in ${vw}x${vh}`); }
  const helper = document.getElementById('helper'); if(!helper.hidden){ const r = R(helper); if(r.b > R(document.getElementById('controls')).t + 0.5) out.push('helper overlaps the action bar'); }
  const doc = document.scrollingElement; if(doc.scrollHeight > vh + 1 || doc.scrollWidth > vw + 1) out.push(`page scrolls (${doc.scrollWidth}x${doc.scrollHeight})`);
  return { area: `${Math.round(area.r - area.l)}x${Math.round(area.b - area.t)}`, over, out, bets: document.querySelectorAll('#seats .bet').length, seats: document.querySelectorAll('#seats .seat').length };
}

(async () => {
  for(let i = 0; i < 60; i++){ try{ if((await fetch(BASE + '/healthz')).ok) break; }catch(e){} await sleep(150); }
  const O = (await post('setup', { code: 'secret', name: 'Director', pin: '1234', agree: true })).token;
  const { code } = await post('invite', {}, O);
  const A = (await post('redeem', { code, name: 'Jonathan', pin: '1111', agree: true })).token;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const fails = [];
  for(const vp of VIEWPORTS) for(const n of [9, 7]){
    const pg = await load(browser, A, vp, n);
    for(const panel of ['actions', 'sizing']){
      if(panel === 'sizing'){ await pg.click('#aRaise'); await pg.waitForSelector('#raiseRange'); await sleep(200); }
      // the table lays itself out again for the room it has; wait for chips and the button to stop moving
      await pg.waitForFunction(() => !document.getElementById('seats').getAnimations({ subtree: true }).some(a => a.playState === 'running'));
      const m = await pg.evaluate(measure), tag = `${vp[0]}x${vp[1]} ${n}-handed ${panel}`;
      assert.strictEqual(m.seats, n, tag + ': seats'); assert.strictEqual(m.bets, n, tag + ': every seat bets');
      if(SHOTS) await pg.screenshot({ path: `${SHOTS}/${vp[0]}x${vp[1]}-${n}p-${panel}.png` });
      const bad = m.over.concat(m.out);
      console.log(`${bad.length ? 'FAIL' : 'ok  '} ${tag} (table area ${m.area}${bad.length ? ', ' + bad.length + ' problems' : ''})${bad.length && process.env.VERBOSE ? '\n      ' + bad.join('\n      ') : bad.length ? '\n      ' + bad.slice(0, 6).join('\n      ') : ''}`);
      if(bad.length) fails.push(tag);
    }
    await pg.close();
  }
  await browser.close();
  if(fails.length) throw new Error(`${fails.length} crowded layouts: ${fails.join(', ')}`);
  console.log('small table ui test passed');
  srv.kill(); require('fs').rmSync(DATA, { force: true }); process.exit(0);
})().catch(e => { console.error(e.message || e); srv.kill(); require('fs').rmSync(DATA, { force: true }); process.exit(1); });
