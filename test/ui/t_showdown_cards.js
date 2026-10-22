// Shown cards at a showdown on phones (browser, phone emulation with touch): every other seat at a 6 to 9 seat table
// shows both cards with its hand's name (PAIR, TWO PAIR, ...) or WINNER. For each seat it asserts:
//  - no seat's badge (its own or a neighbour's) touches the top-left index (rank and small suit) of either shown card
//  - each card's index is what you see at its middle (no seat's cards, plate, avatar or badge drawn over it)
//  - its shown cards don't overlap another seat's shown cards
// Owner's report: on the 9-seat oval at 430x932 a right-side seat's PAIR sat on her second card's rank, and the QQ
// shown by the seat above covered her cards. Seated (your seat at the foot) and watching.
// The table state is written into the page's own socket (routeWebSocket), as t_table_layout does.
// PLAYWRIGHT=/path/to/playwright-core CHROMIUM=/path/to/chromium node test/ui/t_showdown_cards.js
//   ROOT=<dir> another checkout ("before")   SIZES=390x844,430x932   NS=9   SHOTS=<dir> a screenshot per case
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || process.env.PLAYWRIGHT_CORE || 'playwright');
const ROOT = process.env.ROOT || path.join(__dirname, '..', '..');
const PORT = 5600 + Math.floor(Math.random() * 80), BASE = 'http://localhost:' + PORT;
const DATA = require('os').tmpdir() + '/t_sdc_' + process.pid + '.json';
const srv = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '', STAGING: '1', DATABASE_URL: '' }, stdio: 'ignore' });
process.on('exit', () => { try{ srv.kill('SIGKILL'); }catch(e){} fs.rmSync(DATA, { force: true }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SIZES = (process.env.SIZES || '320x568,375x667,390x844,393x852,430x932,393x659,430x739').split(',').map(v => v.split('x').map(Number));
const NS = (process.env.NS || '6,7,8,9').split(',').map(Number), SHOTS = process.env.SHOTS || '';
const api = async (p, body) => { const j = await (await fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })).json(); if(j.error) throw new Error(p + ': ' + j.error); return j; };
const fails = [];
let oks = 0;
const check = (cond, msg) => { if(cond) oks++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if(!cond) fails.push(msg); };

const NAMES = ['Alexandra Whitfield', 'Ben', 'Christina Okafor', 'Dev', 'Elham', 'Fitzgerald', 'Gwen', 'Maximilian Hart', 'Sam'];
const HOLES = [['Ah', 'Qd'], ['Qs', 'Qc'], ['5d', 'Kh'], ['Tc', 'Th'], ['5c', '9s'], ['Js', 'Jd'], ['8h', '8d'], ['Ac', 'Kc'], ['2s', '3s'], ['Kd', '7h']];
const CATS = ['Pair', 'Three of a Kind', 'Pair', 'Two Pair', 'High Card', 'Pair', 'Full House', 'Straight Flush', 'Flush'];
// n seated (seated: you at seat 0), the river dealt, a showdown: every seat shows both cards; one winner
function tableFor(me, n, seated){
  const seats = Array.from({ length: n }, (_, s) => ({ uid: s || !seated ? 'p' + s : me.id, name: s || !seated ? NAMES[s] : me.name, stack: 30000 - s * 1100, inHand: true,
    bet: 0, folded: false, allIn: false, act: '', lastAmt: 0, won: s === 2 ? 9000 : 0, shown: HOLES[s], cat: CATS[s], away: false }));
  return { tid: 'sdc', n: 1, phase: 'hand', handNo: 10 + n + (seated ? 0 : 20), street: 4, seats, size: n, allowed: seats.map((p, s) => s), cur: 0,
    board: ['5h', '2d', '9c', 'Jh', '4s'], pot: 0, btn: n - 1, blinds: [100, 200, 25], acting: -1, actUid: null, seq: 9, deadline: 0, bank: 60000,
    usingBank: false, extras: 3, legal: null, result: { lines: [NAMES[2] + ' wins 9,000 with Three of a Kind'], winCards: ['5d', '5h'], showdown: true }, note: '' };
}

// per seat: its badge, each shown card and that card's index (rank + small suit), and what is drawn at the index
const measure = pg => pg.evaluate(() => {
  const r = el => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
  const u = rs => ({ l: Math.min(...rs.map(x => x.l)), t: Math.min(...rs.map(x => x.t)), r: Math.max(...rs.map(x => x.r)), b: Math.max(...rs.map(x => x.b)) });
  return [...document.querySelectorAll('#seats .seat')].map(s => {
    const cards = [...s.querySelectorAll('.hole .card')].filter(c => !c.classList.contains('back'));
    const b = s.querySelector('.badge');
    return { name: (s.querySelector('.nm') || {}).textContent || '?', hero: s.classList.contains('hero'), side: s.dataset.side || '', badge: b ? r(b) : null,
      cards: cards.map(c => {
        const ix = u([r(c.querySelector('.r')), r(c.querySelector('.s1'))]);
        // the index's middle and its rank's middle: the top element there must be this card or its own spans
        const seen = [[(ix.l + ix.r) / 2, (ix.t + ix.b) / 2], (q => [(q.l + q.r) / 2, (q.t + q.b) / 2])(r(c.querySelector('.r')))].map(([x, y]) => {
          const e = document.elementFromPoint(x, y); return !!e && (e === c || c.contains(e)) ? '' : e ? (e.closest('.seat') ? (e.closest('.seat').querySelector('.nm') || {}).textContent + ' ' : '') + e.tagName.toLowerCase() + '.' + String(e.className).trim().split(/\s+/).join('.') : 'nothing'; });
        return { box: r(c), ix, cover: seen.filter(Boolean)[0] || '' };
      }) };
  });
});
const hit = (a, b, pad = 0) => a.l < b.r - pad && b.l < a.r - pad && a.t < b.b - pad && b.t < a.b - pad;

async function verify(pg, tag, n){
  const m = await measure(pg), others = m.filter(s => !s.hero);
  const badOnIx = [], covered = [], overlap = [];
  for(const s of others){
    s.cards.forEach((c, j) => { for(const o of m) if(o.badge && hit(o.badge, c.ix)) badOnIx.push(`${o.name}'s badge on ${s.name}[${s.side}] card ${j + 1}`); if(c.cover) covered.push(`${s.name}[${s.side}] card ${j + 1} under ${c.cover}`); });
    for(const o of m) if(o !== s && s.cards.some(c => o.cards.some(d => hit(c.box, d.box, .5)))) overlap.push(`${s.name} x ${o.name}`);
  }
  check(m.length === n && others.every(s => s.cards.length === 2 && s.badge), `${tag}: ${n} seats, each other seat shows two cards and a badge`);
  check(!badOnIx.length, `${tag}: no badge (its own or a neighbour's) on a shown card's index${badOnIx.length ? ' — ' + badOnIx.join('; ') : ''}`);
  check(!covered.length, `${tag}: every shown card's index is in view${covered.length ? ' — ' + covered.join('; ') : ''}`);
  check(!overlap.length, `${tag}: no seat's shown cards overlap another seat's${overlap.length ? ' — ' + [...new Set(overlap)].join('; ') : ''}`);
  // the winner's chips (drawn over the seats, but not seen by elementFromPoint) stay off every index
  const piles = await pg.$$eval('#fx .winpile:not(.gone)', ps => ps.map(e => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; }));
  const onPile = others.filter(s => s.cards.some(c => piles.some(p => hit(p, c.ix)))).map(s => s.name);
  check(!onPile.length, `${tag}: the winner's chips cover no shown card's index${onPile.length ? ' — ' + onPile.join(', ') : ''}`);
}

(async () => {
  for(let i = 0; i < 60; i++){ try{ await fetch(BASE + '/healthz'); break; }catch(e){ await sleep(150); } }
  await sleep(400);
  const TOK = (await api('login', { name: 'Test Player 07', pin: '135777' })).token;
  if(SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  for(const [w, h] of SIZES){
    const pg = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
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
        j.club.myTable = 'sdc'; j.club.tables = [{ tid: 'sdc', n: 1, players: 9 }];
        ws.send(JSON.stringify(j)); sock = ws;
      });
    });
    await pg.goto(BASE + '/'); await pg.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), TOK);
    await pg.reload(); await pg.evaluate(() => document.fonts.ready);
    for(let k = 0; k < 100 && !sock; k++) await sleep(100);
    for(const seated of [true, false]) for(const n of NS){
      const tag = `${w}x${h} ${n} players ${seated ? 'seated' : 'watching'}`;
      sock.send(JSON.stringify({ t: 'table', table: tableFor(me, n, seated), ...(seated ? { you: { hand: 10 + n, cards: HOLES[0] } } : {}) }));
      try{ await pg.waitForFunction(k => document.querySelectorAll('#seats .seat').length === k && document.querySelectorAll('#seats .card:not(.back)').length >= 2 * k, n, { timeout: 8000 }); }catch(e){}
      await sleep(2200); // the deal and win animations settle (Winner grows in after the chips)
      if(SHOTS) await pg.screenshot({ path: path.join(SHOTS, `cards-${w}x${h}-${n}p-${seated ? 'seated' : 'watching'}.png`) });
      await verify(pg, tag, n);
      // the same table again (its seats reused): still clear, and the cards don't drift a little further each time
      for(let k = 0; k < 3; k++){ sock.send(JSON.stringify({ t: 'table', table: { ...tableFor(me, n, seated), seq: 10 + k }, ...(seated ? { you: { hand: 10 + n, cards: HOLES[0] } } : {}) })); await sleep(150); }
      await sleep(300);
      await verify(pg, tag + ' (drawn again)', n);
      const far = await pg.$$eval('#seats .hole.shown', hs => hs.map(h => (h.style.translate || '0px 0px').split(' ').map(parseFloat)).filter(([x, y = 0]) => Math.abs(x) > 48 || Math.abs(y) > 14).length);
      check(!far, `${tag}: drawn again, no seat's cards moved further than one placement allows`);
    }
    await pg.close();
  }
  await browser.close();
  console.log(`t_showdown_cards: ${oks} ok, ${fails.length} failed`);
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
