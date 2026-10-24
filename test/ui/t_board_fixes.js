// The board's fixes from the owner's live game (Issue #32 items 7-11), run with UI_BOARD=1, fake staging players only:
//  7. the name line always shows the name: after acting (Fold/Check/Call/Bet), the blinds before the flop (SB/BB), the
//     winner after the river; the action word is in the status line under the plate, the seat geometry unchanged
//  8. the details sheet fits the screen at 320, 375, 390 and 430 wide, upright, at the default text size and larger
//     (root font 20 and 24 px): the sheet does not scroll sideways, every element inside is within the screen's width,
//     and no text is cut off
//  9. the felt's name (BLINDRISE) is drawn in champagne gold, visible on the felt, and clear of the board's cards (and
//     their row), the pot, every plate, card, chip and the D button, preflop, on the flop and after the river, upright
//     and sideways
// 10. the D button is drawn by the state's button seat in every hand: the button on every seat with you on every seat of
//     a 9-handed table, 8- and 6-handed tables, 7 left at a 9-handed table (two eliminated), the button on an empty
//     seat (a dead button), the first hand after an elimination and after a move to another seat, and watching
// 11. "N watching" in the collapsed top bar, one line, whole, at 320-390 upright and the short phones sideways, the same
//     count as the details sheet, and live: a new count is shown when it changes
// 12. finished and watching (you are not at this table): every seat, its cards, plate and status line, stays inside the
//     table area and clear of the line under the table ("You finished 16th. Watching Table 2."), 9-, 7- and 6-handed,
//     upright and sideways
// 13. watching, no seat is drawn as yours: no hero slot or hero cards, no "You", every seat drawn alike
// 14. a coach tip never covers your cards, the board, the pot or the action buttons: a one-line banner in the dock's
//     band, gone by itself in a few seconds, opened by a tap; one that comes on your turn waits until your turn is over
// PLAYWRIGHT=/path/to/playwright-core CHROMIUM=/path/to/chromium node test/ui/t_board_fixes.js   SHOTS=<dir> screenshots
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || process.env.PLAYWRIGHT_CORE || 'playwright');
const ROOT = process.env.ROOT || path.join(__dirname, '..', '..');
const PORT = 5480 + Math.floor(Math.random() * 70), BASE = 'http://localhost:' + PORT;
const DATA = require('os').tmpdir() + '/t_bfix_' + process.pid + '.json';
const srv = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, UI_BOARD: '1', PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '', STAGING: '1', DATABASE_URL: '' }, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SHOTS = process.env.SHOTS || '';
const api = async (p, body) => { const j = await (await fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })).json(); if(j.error) throw new Error(p + ': ' + j.error); return j; };
const fails = []; let oks = 0;
const check = (cond, msg) => { if(cond) oks++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if(!cond) fails.push(msg); };
const FIELD = { players: 32, tables: 4, leader: { name: 'Test Player 12', stack: 245800, table: 2 }, watchers: 12, rank: 3 };
const name = s => 'Test Player ' + String(s).padStart(2, '0');
const spread = k => Array.from({ length: k }, (_, i) => Math.floor(i * 9 / k));

// a table: `seated` seats of `allowed` (you on `mine`, -1 watching), the button on `btn`
function tableOf(me, { allowed = spread(9), gone = [], mine = 0, btn = 6, kind = 'none', handNo = 3 } = {}){
  const seats = Array(9).fill(null);
  for(const s of allowed) if(!gone.includes(s)) seats[s] = { uid: s === mine ? me.id : 'p' + s, name: s === mine ? me.name : name(s), stack: 30000 - s * 1100, inHand: true, bet: 0, folded: false, allIn: false, act: '', lastAmt: 0, won: 0, shown: null, cat: '', away: false };
  const t = { tid: 'bfx', n: 1, phase: 'hand', handNo, street: 0, seats, size: allowed.length, allowed, cur: 0, board: [], pot: 0, btn, blinds: [100, 200, 0], acting: -1, actUid: null, seq: handNo,
    deadline: Date.now() + 60000, bank: 60000, usingBank: false, extras: 3, legal: null, result: null, note: '' };
  const at = s => seats[s];
  if(kind === 'pre'){ Object.assign(at(7), { bet: 100, act: 'SB' }); Object.assign(at(8), { bet: 200, act: 'BB' }); Object.assign(at(1), { act: 'Fold', folded: true }); t.cur = 200; t.acting = 2; t.actUid = 'p2'; }
  if(kind === 'flop'){ t.street = 1; t.board = ['Ts', 'Jh', 'Qc']; t.pot = 1800; Object.assign(at(1), { act: 'Fold', folded: true }); Object.assign(at(3), { act: 'Check' }); Object.assign(at(4), { act: 'Bet', bet: 600, lastAmt: 600 }); Object.assign(at(5), { act: 'Call', bet: 600 }); t.acting = 6; t.actUid = 'p6'; }
  if(kind === 'river'){ t.street = 3; t.board = ['Ts', 'Jh', 'Qc', '2d', '9s']; seats.forEach((p, s) => { if(p && s !== 4 && s !== 5){ p.folded = true; p.act = 'Fold'; } });
    Object.assign(at(4), { won: 4200, shown: ['Ah', 'Kd'], cat: 'Straight' }); Object.assign(at(5), { shown: ['9h', '9d'], cat: 'Three of a kind' });
    t.result = { lines: [name(4) + ' wins 4,200 with a Straight'], winCards: ['Ah', 'Kd', 'Ts', 'Jh', 'Qc'], showdown: true }; }
  return t;
}
async function page(browser, TOK, w, h, { rootFont = 0, out = false } = {}){
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pg = await ctx.newPage();
  await pg.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => r.abort());
  if(rootFont) await pg.addInitScript(f => { const put = () => { const st = document.createElement('style'); st.textContent = `html{font-size:${f}px !important}`; document.head.appendChild(st); }; if(document.head) put(); else document.addEventListener('DOMContentLoaded', put); }, rootFont);
  let sock = null, me = null;
  await pg.routeWebSocket(/\/ws$/, ws => {
    const server = ws.connectToServer();
    ws.onMessage(m => { try{ const j = JSON.parse(m); if(j.t === 'watch' || j.t === 'act') return; }catch(e){} server.send(m); });
    server.onMessage(m => { let j; try{ j = JSON.parse(m); }catch(e){ return ws.send(m); }
      if(j.t === 'table' || j.t === 'closed') return;
      if(j.t === 'club' && sock === 'table'){ me = j.club.me; j.club.tourney = { ...j.club.tourney, status: 'running', name: 'Friday Night', stack: 30000, anteMode: 'bb', regs: [me.id], level: 2, levelEndsAt: Date.now() + 600000, paused: false, places: [], lateOpen: false, helper: true,
          id: 'tbfx', entrants: 48, remaining: 32, sponsor: { uid: 'u00000000005a', name: 'Aurora Test Roasters', categoryLabel: 'Food & drink', area: 'Toronto', logoV: null }, sponsorSec: 1, prize: 'Coffee for a month' };
        if(out) j.club.tourney.places = [{ uid: me.id, name: me.name, place: 16 }];
        j.club.myTable = out ? null : 'bfx'; j.club.tables = [{ tid: 'bfx', n: 1, players: 9 }]; sock = ws; }
      ws.send(JSON.stringify(j)); });
  });
  await pg.goto(BASE + '/'); await pg.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), TOK);
  sock = 'table'; await pg.reload();
  for(let k = 0; k < 100 && (!sock || sock === 'table'); k++) await sleep(100);
  // (finished: open the table from the lobby's list, as a member watching it)
  if(out){ await pg.waitForSelector('[data-watch="bfx"]', { timeout: 8000 }); await pg.click('[data-watch="bfx"]'); }
  const send = (t, field = FIELD, you = { hand: t.handNo, cards: ['Ah', 'Qd'] }) => sock.send(JSON.stringify({ t: 'table', table: t, you: t.seats.some(p => p && p.uid === me.id) ? you : null, field }));
  return { ctx, pg, me, send, coach: note => sock.send(JSON.stringify({ t: 'coach', hand: { no: 2, net: -4000, bb: 200, cards: ['9c', '4d'], weakFold: false, played: true, notes: [note] } })) };
}
const settle = async pg => { await pg.waitForFunction(() => document.getElementById('spn').hidden, null, { timeout: 8000 }).catch(() => {}); await sleep(700); };

// ---------- 7: the name line keeps the name ----------
async function names(browser, TOK){
  for(const [w, h] of [[390, 844], [844, 390], [320, 568]]){
    const { ctx, pg, me, send } = await page(browser, TOK, w, h), tag = `${w}x${h}`;
    const look = () => pg.evaluate(() => [...document.querySelectorAll('#seats .seat.b-seat')].map(s => ({ uid: s.dataset.uid, nm: s.querySelector('.nm').textContent, title: s.querySelector('.nm').getAttribute('title'),
      st: (s.querySelector('.badge.b-st') || {}).textContent || '', plate: (r => [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)])(s.querySelector('.plate').getBoundingClientRect()) })));
    send(tableOf(me, { kind: 'none' })); await settle(pg);
    const before = await look();
    for(const kind of ['pre', 'flop', 'river']){
      const t = tableOf(me, { kind }); send(t); await sleep(700);
      const L = await look();
      const named = L.filter(q => q.uid !== me.id).every(q => q.title && q.title.startsWith('Test Player') && /^Test/.test(q.nm));
      check(named && L.find(q => q.uid === me.id).nm === 'You', `${tag} ${kind}: every name line shows the player's name, yours "You" (${L.map(q => q.nm).join(', ')})`);
      check(!L.some(q => /^(Fold|Check|Call|Bet|Raise|SB|BB|Winner|All-in)$/i.test(q.nm)), `${tag} ${kind}: no name line reads an action word`);
      const by = s => L.find(q => q.uid === 'p' + s);
      if(kind === 'pre') check(/^SB$/i.test(by(7).st) && /^BB$/i.test(by(8).st) && /^Test/.test(by(7).nm) && /^Test/.test(by(8).nm) && /^Fold$/i.test(by(1).st),
        `${tag} preflop: the blinds keep their names ("${by(7).nm}", "${by(8).nm}"), "SB" and "BB" in their status lines, the folded seat "Fold"`);
      if(kind === 'flop') check(/^Check$/i.test(by(3).st) && /^Bet$/i.test(by(4).st) && /^Call$/i.test(by(5).st) && !by(6).st, `${tag} flop: Check, Bet, Call in the status lines after acting, the seat to act none (${[3, 4, 5, 6].map(s => by(s).st || '-').join(', ')})`);
      if(kind === 'river') check(/^Winner$/i.test(by(4).st) && /^Three of a kind$/.test(by(5).st) && /^Test/.test(by(4).nm), `${tag} river: "Winner" and the hand in the status lines, the winner's name kept ("${by(4).nm}")`);
      // (the winner's chips, once they have come to the seat: clear of its "Winner" line, the result line, the board's
      // row and every seat)
      if(kind === 'river'){ await sleep(2600);
        const pile = await pg.evaluate(() => { const R = e => e.getBoundingClientRect(), p = document.querySelector('.winpile'); if(!p) return null; const P = R(p);
          const hit = b => P.left < b.right - 1 && b.left < P.right - 1 && P.top < b.bottom - 1 && b.top < P.bottom - 1;
          const msg = document.getElementById('msg'), words = [...msg.querySelectorAll('*')].filter(e => !e.children.length && e.textContent.trim());
          return [...(words.length ? words : [msg]).map(e => ['the result line', e]), ...document.querySelectorAll('#board .card')].map(x => Array.isArray(x) ? x : ['the board', x])
            .concat([...document.querySelectorAll('#seats .seat .plate, #seats .seat .badge.b-st, #seats .seat .av, #seats .seat .hole .card')].map(e => [(e.closest('.seat').querySelector('.nm') || {}).textContent + ' ' + e.className.split(' ')[0], e]))
            .filter(([k, e]) => R(e).width && hit(R(e))).map(([k]) => k); });
        check(pile && !pile.length, `${tag} river: the winner's chips clear of its "Winner" line, the result line, the board and every seat${pile && pile.length ? ': over ' + [...new Set(pile)].join(', ') : ''}`); }
      // the geometry: every plate where it was before anyone acted
      check(L.every(q => { const b = before.find(x => x.uid === q.uid); return b && q.plate.every((v, i) => Math.abs(v - b.plate[i]) <= 1); }), `${tag} ${kind}: every plate in the same place and size as before anyone acted`);
      if(SHOTS) await pg.screenshot({ path: path.join(SHOTS, `fix7-${kind}-${tag}.png`) });
    }
    await ctx.close();
  }
}

// ---------- 8: the details sheet fits ----------
async function sheet(browser, TOK){
  for(const [w, h] of [[320, 568], [375, 667], [390, 844], [430, 932]]) for(const rootFont of [0, 20, 24]){
    const { ctx, pg, me, send } = await page(browser, TOK, w, h, { rootFont }), tag = `${w}x${h}${rootFont ? ' root ' + rootFont + 'px' : ''}`;
    // (a long sponsor name and a long chip leader name: the cases that ran off the screen)
    send(tableOf(me, { kind: 'flop' }), { ...FIELD, leader: { name: 'Test Player 12 Longname-Example', stack: 1245800, table: 12 } }); await settle(pg);
    await pg.click('#bHud'); await sleep(700);
    const m = await pg.evaluate(() => {
      const sh = document.getElementById('bHudSheet'), inn = sh && sh.querySelector('.b-sheet-in'); if(!inn || sh.hidden) return null;
      const W = document.documentElement.clientWidth, out = [], cut = [];
      for(const e of inn.querySelectorAll('*')){ if(!e.getClientRects().length) continue; const r = e.getBoundingClientRect();
        if(r.width && (r.left < -.5 || r.right > W + .5)) out.push((e.className || e.tagName) + ` ${Math.round(r.left)}-${Math.round(r.right)}`);
        const cs = getComputedStyle(e); if(e.children.length === 0 && e.textContent.trim() && (e.scrollWidth > e.clientWidth + 1 && cs.overflow !== 'visible' || cs.textOverflow === 'ellipsis' && cs.overflow !== 'visible' && e.scrollWidth > e.clientWidth)) cut.push(e.textContent.trim()); }
      const r = inn.getBoundingClientRect();
      return { sw: inn.scrollWidth, cw: inn.clientWidth, shSw: sh.scrollWidth, shCw: sh.clientWidth, l: r.left, r: r.right, W, out, cut, docW: document.documentElement.scrollWidth,
        canScroll: inn.scrollHeight <= inn.clientHeight + 1 || /auto|scroll/.test(getComputedStyle(inn).overflowY), texts: inn.innerText.replace(/\s+/g, ' ') };
    });
    check(m && m.sw <= m.cw && m.shSw <= m.shCw, `${tag}: the sheet does not scroll sideways (scrollWidth ${m && m.sw} <= clientWidth ${m && m.cw})`);
    check(m && m.l >= -.5 && m.r <= m.W + .5 && m.docW <= m.W, `${tag}: the sheet is within the screen (${m && Math.round(m.l)}-${m && Math.round(m.r)} of ${m && m.W})`);
    check(m && !m.out.length, `${tag}: every element in the sheet within the screen's width${m && m.out.length ? ': ' + m.out.slice(0, 4).join('; ') : ''}`);
    check(m && !m.cut.length, `${tag}: no text in the sheet cut off${m && m.cut.length ? ': ' + m.cut.slice(0, 4).join('; ') : ''}`);
    check(m && /Test Player 12 Longname-Example/.test(m.texts) && /Aurora Test Roasters/.test(m.texts) && /Your place/.test(m.texts) && /12 watching/.test(m.texts) && m.canScroll,
      `${tag}: the chip leader, Your place, the sponsor and "12 watching" all there in full, the sheet scrolling up and down if it is taller than the screen`);
    if(SHOTS) await pg.screenshot({ path: path.join(SHOTS, `fix8-sheet-${w}x${h}${rootFont ? '-root' + rootFont : ''}.png`) });
    await ctx.close();
  }
}

// ---------- 9: the felt's name ----------
const WM = pg => pg.evaluate(() => {
  const m = document.querySelector('#tableArea .felt .b-wm'); if(!m) return null;
  const r = m.getBoundingClientRect(), cs = getComputedStyle(m), on = !m.hidden && cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0;
  const hit = e => { const b = e.getBoundingClientRect(); return b.width && r.left < b.right && b.left < r.right && r.top < b.bottom && b.top < r.bottom; };
  const name = e => e.id || e.className.toString().split(' ').slice(0, 2).join('.');
  const over = [...document.querySelectorAll('#board, #board .card, #board .slot, #pot, #seats .card, #seats .plate, #seats .av, #seats .dealer, #seats .badge')].filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && hit(e)).map(name);
  const bd = document.getElementById('board').getBoundingClientRect(), felt = document.querySelector('#tableArea .felt').getBoundingClientRect();
  const x = document.createElement('canvas').getContext('2d'), px = c => { x.clearRect(0, 0, 1, 1); x.fillStyle = c; x.fillRect(0, 0, 1, 1); return [...x.getImageData(0, 0, 1, 1).data]; };
  const bets = [...document.querySelectorAll('#seats .bet')].filter(e => e.getClientRects().length && hit(e)).length;
  return { on, over, bets, text: m.textContent, color: px(cs.color), size: parseFloat(cs.fontSize), rowClear: r.bottom <= bd.top - 2 || r.top >= bd.bottom + 2, inFelt: r.left >= felt.left && r.right <= felt.right && r.top >= felt.top && r.bottom <= felt.bottom, onMsg: m.classList.contains('on-msg'), w: r.width };
});
async function wordmark(browser, TOK){
  for(const [w, h] of [[390, 844], [844, 390], [320, 568], [375, 667], [430, 932], [667, 375], [932, 430]]){
    const { ctx, pg, me, send } = await page(browser, TOK, w, h), tag = `${w}x${h}`;
    for(const kind of ['pre', 'flop', 'river']){
      send(tableOf(me, { kind, handNo: 40 })); await settle(pg);
      const m = await WM(pg);
      const visible = kind !== 'river' || !m.onMsg;
      check(m && m.text === 'BLINDRISE' && m.inFelt && m.rowClear, `${tag} ${kind}: BLINDRISE on the felt, clear of the board's row (above or below it, never in it)`);
      check(m && (!visible || m.on) && !m.over.length, `${tag} ${kind}: ${visible ? 'shown, and' : 'giving way to the result line,'} no card, plate, avatar, D, pot or status over it${m && m.over.length ? ' — ' + m.over.join(', ') : ''}`);
      // (on the most crowded tables no spot is clear of every seat's chip spot: it then lies under one seat's chips at most)
      check(m && m.bets <= 1, `${tag} ${kind}: at most one seat's chips over it (${m && m.bets})`);
      // champagne gold: warm (red > green > blue), light enough to read on the felt, quieter than the cards
      const [r, g, b, a] = m ? m.color : [0, 0, 0, 0];
      check(m && r > g && g > b && r >= 180 && a >= 120 && a < 255 && m.size >= 10, `${tag} ${kind}: in champagne gold, readable (rgba ${r},${g},${b},${(a / 255).toFixed(2)}; ${m && m.size}px), quieter than a card`);
      if(SHOTS) await pg.screenshot({ path: path.join(SHOTS, `fix9-${kind}-${tag}.png`) });
    }
    await ctx.close();
  }
}

// ---------- 10: the D button ----------
// every seat drawn (avatars, your seat by the middle of your cards and plate, the empty seats' "+"): the D belongs to the
// nearest one, and clearly (the next nearest at least 8% further)
const DLOOK = pg => pg.evaluate(() => {
  const c = e => { const b = e.getBoundingClientRect(); return [(b.left + b.right) / 2, (b.top + b.bottom) / 2]; };
  const seats = [...document.querySelectorAll('#seats .seat')].map(s => { if(s.classList.contains('hero')){ const bs = [s.querySelector('.plate'), ...s.querySelectorAll('.hole .card')].filter(Boolean).map(e => e.getBoundingClientRect());
      return { uid: s.dataset.uid, at: [(Math.min(...bs.map(b => b.left)) + Math.max(...bs.map(b => b.right))) / 2, (Math.min(...bs.map(b => b.top)) + Math.max(...bs.map(b => b.bottom))) / 2] }; }
    return { uid: s.dataset.uid, at: c(s.querySelector('.av')) }; });
  const plus = [...document.querySelectorAll('#seats .empty-seat')].map(e => ({ uid: 'empty@' + e.style.left + ',' + e.style.top, at: c(e) }));
  const d = document.querySelector('#seats .dealer'); return { all: seats.concat(plus), d: d ? c(d) : null };
});
async function dealer(browser, TOK){
  for(const [w, h] of (process.env.D_SIZES || '390x844,844x390,667x375,320x568').split(',').map(s => s.split('x').map(Number))){
    const { ctx, pg, me, send } = await page(browser, TOK, w, h), tag = `${w}x${h}`;
    await pg.addStyleTag({ content: '#seats *, #seats{transition:none !important;animation:none !important}' });
    let hand = 100, bad = [];
    const one = async (label, o) => {
      const t = tableOf(me, { ...o, handNo: ++hand }); send(t, FIELD, null);
      await pg.waitForFunction(n => { const d = document.querySelector('#seats .dealer'); return d && document.querySelectorAll('#seats .seat').length === n; }, t.seats.filter(Boolean).length, { timeout: 4000 }).catch(() => {});
      await sleep(40);
      const m = await DLOOK(pg);
      const want = t.seats[o.btn] ? t.seats[o.btn].uid : null, plusOf = m.all.filter(q => q.uid.startsWith('empty'));
      const ds = m.d ? m.all.map(q => ({ uid: q.uid, d: Math.hypot(q.at[0] - m.d[0], q.at[1] - m.d[1]) })).sort((a, b) => a.d - b.d) : [];
      const got = ds[0] && ds[0].uid, clear = ds.length < 2 || ds[1].d >= ds[0].d * 1.08;
      // (a dead button stands on an empty seat: then nearest that seat's "+")
      const ok = want ? got === want && clear : !!got && got.startsWith('empty') && plusOf.length > 0;
      if(!ok) bad.push(`${label} (D nearest ${got}${clear ? '' : ', a tie with ' + (ds[1] && ds[1].uid)})`);
      return ok;
    };
    // a full 9-handed table: you on every seat, the button on every seat; and watching
    for(const mine of [...spread(9), -1]) for(const btn of spread(9)) await one(`9-handed, you on ${mine}, button on ${btn}`, { mine, btn });
    const b9 = bad.length; check(!b9, `${tag}: 9-handed, the D by the button's seat for every rotation (you on each of the 9 seats, and watching) x the button on each seat (90 hands)${b9 ? ': ' + bad.slice(0, 6).join('; ') : ''}`);
    // 8-, 7- (two eliminated at a 9-handed table) and 6-handed
    for(const [label, allowed, gone] of [['8-handed', spread(8), []], ['7 left at 9', spread(9), [2, 5]], ['6-handed', spread(6), []], ['5 left at 6', spread(6), [3]]]){
      bad = [];
      for(const mine of [...allowed.filter(s => !gone.includes(s)), -1]) for(const btn of allowed) await one(`${label}, you on ${mine}, button on ${btn}${gone.includes(btn) ? ' (dead button)' : ''}`, { allowed, gone, mine, btn });
      check(!bad.length, `${tag}: ${label}, the D by the button's seat for every rotation x every button seat${gone.length ? ', the dead button by its empty seat' : ''}${bad.length ? ': ' + bad.slice(0, 6).join('; ') : ''}`);
    }
    // the first hand after an elimination: seat 3 busts, the button moves on to seat 4 (and to the empty seat 3 itself)
    bad = [];
    await one('before the elimination', { mine: 0, btn: 2 }); await one('first hand after seat 3 is eliminated', { mine: 0, btn: 4, gone: [3] }); await one('dead button on the eliminated seat', { mine: 0, btn: 3, gone: [3] });
    // ...and after a move: you are moved to seat 6 of another table, the button on the seat beside you
    await one('first hand after a move to seat 6', { mine: 6, btn: 5, gone: [1] }); await one('next hand', { mine: 6, btn: 7, gone: [1] });
    check(!bad.length, `${tag}: the first hand after an elimination (and a dead button on that seat) and after a move to another seat: the D by the button's seat${bad.length ? ': ' + bad.join('; ') : ''}`);
    await ctx.close();
  }
}

// ---------- 11: "N watching" in the collapsed bar ----------
async function watching(browser, TOK){
  for(const [w, h] of [[320, 568], [375, 667], [390, 844], [390, 650], [568, 320], [667, 375], [844, 390]]){
    const { ctx, pg, me, send } = await page(browser, TOK, w, h), tag = `${w}x${h}`, land = w > h;
    send(tableOf(me, { kind: 'flop' })); await settle(pg);
    const look = () => pg.evaluate(land => {
      const el = land ? document.getElementById('bhWt') : document.getElementById('bWatch'); if(!el || !el.getClientRects().length) return null;
      const r = el.getBoundingClientRect(), W = document.documentElement.clientWidth, card = document.getElementById('bHud'), top = document.getElementById('bTop').getBoundingClientRect();
      const lh = parseFloat(getComputedStyle(el.querySelector('small') || el).lineHeight) || 16, small = parseFloat(getComputedStyle(el.querySelector('small') || el).fontSize);
      return { text: el.innerText.replace(/\s+/g, ' ').trim(), oneLine: r.height <= Math.max(lh, 22) * 1.3, whole: el.scrollWidth <= el.clientWidth + 1 && r.left >= 0 && r.right <= W, inTop: r.top >= top.top - 1 && r.bottom <= top.bottom + 1,
        cardOver: card.scrollWidth - card.clientWidth, small, label: card.getAttribute('aria-label'), topH: Math.round(top.height), docW: document.documentElement.scrollWidth - W,
        lobbyBoth: (l => l && l.getBoundingClientRect().height)(document.getElementById('lobbyBtn')) };
    }, land);
    const m = await look();
    check(m && /^12 watching$/.test(m.text) && m.oneLine && m.whole && m.inTop, `${tag}: "${m && m.text}" in the collapsed top bar${land ? ', in the pill' : ', under Lobby'}, on one line, whole (one line ${m && m.oneLine}, whole ${m && m.whole})`);
    check(m && m.cardOver <= 1 && m.docW <= 0 && m.small >= 11, `${tag}: nothing in the bar cut off or past the screen, the words at least 11 px (${m && m.small}px; card overflow ${m && m.cardOver})`);
    check(m && /12 watching\./.test(m.label), `${tag}: the card reads it out: "${m && m.label}"`);
    // the same count as the details sheet, and live
    send({ ...tableOf(me, { kind: 'flop' }), seq: 99 }, { ...FIELD, watchers: 3 }); await sleep(1300);
    const m2 = await look();
    await pg.click('#bHud'); await sleep(600);
    const tile = await pg.evaluate(() => (document.querySelector('#bHudSheet .bt-watch') || {}).textContent || '');
    check(m2 && /^3 watching$/.test(m2.text) && /3\s*watching/.test(tile), `${tag}: the count follows live ("${m2 && m2.text}"), the same as the sheet's ("${tile.replace(/\s+/g, ' ').trim()}")`);
    if(SHOTS) await pg.screenshot({ path: path.join(SHOTS, `fix11-sheet-${tag}.png`) });
    await pg.keyboard.press('Escape'); await sleep(300);
    if(SHOTS) await pg.screenshot({ path: path.join(SHOTS, `fix11-bar-${tag}.png`) });
    await ctx.close();
  }
}

// ---------- 12 and 13: finished, watching another table ----------
async function finished(browser, TOK){
  for(const [w, h] of [[390, 844], [320, 568], [430, 932], [844, 390], [667, 375], [568, 320]]) for(const k of [9, 7, 6]){
    const { ctx, pg, me, send } = await page(browser, TOK, w, h, { out: true }), tag = `${w}x${h} ${k}-handed`;
    const allowed = spread(k), t = tableOf(me, { mine: -1, btn: allowed[1], kind: 'flop' });
    // (the flop's actions, on the seats this table has)
    t.seats = t.seats.map((p, s) => allowed.includes(s) ? p : null); t.allowed = allowed; t.size = k;
    t.n = 2; t.acting = allowed[2]; t.actUid = 'p' + allowed[2];
    send(t); await settle(pg);
    const m = await pg.evaluate(() => {
      const R = e => e.getBoundingClientRect(), A = R(document.getElementById('tableArea')), il = document.querySelector('#controls .info-line'), I = il && R(il);
      const hit = (a, b) => a.left < b.right - .5 && b.left < a.right - .5 && a.top < b.bottom - .5 && b.top < a.bottom - .5;
      const out = [], over = [];
      for(const s of document.querySelectorAll('#seats .seat')){
        for(const e of s.querySelectorAll('.av, .plate, .badge, .hole .card, .b-dot')){ const r = R(e); if(!r.width) continue;
          const nm = (s.querySelector('.nm') || {}).textContent + ' ' + e.className.split(' ')[0];
          if(r.left < A.left - .5 || r.right > A.right + .5 || r.top < A.top - .5 || r.bottom > A.bottom + .5) out.push(`${nm} ${Math.round(r.top)}-${Math.round(r.bottom)} (area ${Math.round(A.top)}-${Math.round(A.bottom)})`);
          if(I && hit(r, I)) over.push(nm); }
      }
      const seats = [...document.querySelectorAll('#seats .seat')];
      return { line: il ? il.textContent : '', lineSeen: !!I && (e => e && il.contains(e))(document.elementFromPoint((I.left + I.right) / 2, (I.top + I.bottom) / 2)), out, over,
        hero: document.querySelectorAll('#seats .hero, #seats .card.hero, #seats .hside').length, you: seats.filter(s => /^(You|Me)$/.test((s.querySelector('.nm') || {}).textContent)).length,
        alike: seats.every(s => s.querySelector(':scope > .av.b-av') && s.querySelector(':scope > .plate') && !s.querySelector('.plate .av')),
        avs: [...new Set(seats.map(s => Math.round(R(s.querySelector('.av')).width)))], cards: [...new Set([...document.querySelectorAll('#seats .hole .card')].map(c => Math.round(R(c).width)))], n: seats.length };
    });
    check(/You finished 16th\. Watching Table 2\./.test(m.line) && m.lineSeen, `${tag}: the line under the table reads "${m.line}" and nothing is over it`);
    check(m.n === k && !m.out.length && !m.over.length, `${tag}: all ${m.n} seats, their cards, plates and status lines inside the table area and clear of that line${m.out.length ? ': out ' + m.out.join('; ') : ''}${m.over.length ? ': over the line ' + m.over.join('; ') : ''}`);
    check(!m.hero && !m.you && m.alike && m.avs.length === 1 && m.cards.length <= 1, `${tag}: no seat drawn as yours (hero marks ${m.hero}, "You" ${m.you}, every seat alike ${m.alike}, avatar sizes ${m.avs}, card sizes ${m.cards})`);
    if(SHOTS && (w === 390 || w === 844)) await pg.screenshot({ path: path.join(SHOTS, `fix12-watch-${k}max-${w}x${h}.png`) });
    await ctx.close();
  }
}

// ---------- 14: the coach's tip ----------
async function coachTip(browser, TOK){
  const TILT = { kind: 'mind', title: 'Tilt check', text: "Last hand you lost a big pot, and right after that: you called a big bet with a weak hand. That's how tilt starts: a loss pushes you into a play you'd normally skip. Pros let the last hand go." };
  const LIMP = { kind: 'mistake', title: 'Limped in', text: 'You just called the big blind before the flop. Never just call the big blind. Raise or fold.' };
  for(const [w, h] of [[320, 568], [375, 667], [390, 844], [430, 932], [844, 390], [667, 375], [568, 320]]){
    const { ctx, pg, me, send, coach } = await page(browser, TOK, w, h), tag = `${w}x${h}`;
    const turn = { ...tableOf(me, { kind: 'flop' }), acting: 0, actUid: me.id, legal: { canCheck: false, toCall: 600, canRaise: true, minTo: 1200, maxTo: 30000, isBet: false, cur: 600, pot: 3000, bb: 200 }, seq: 40 };
    const look = () => pg.evaluate(() => {
      const R = e => e.getBoundingClientRect(), tip = document.getElementById('coachTip'), vis = tip && !tip.hidden && R(tip).height > 0;
      const hit = (a, b) => a.left < b.right - .5 && b.left < a.right - .5 && a.top < b.bottom - .5 && b.top < a.bottom - .5;
      const parts = { 'your cards': [...document.querySelectorAll('#seats .seat.hero .hole .card')], board: [...document.querySelectorAll('#board .card, #board > *')], pot: [...document.querySelectorAll('#pot, .pot')].filter(e => R(e).width),
        'action buttons': [...document.querySelectorAll('#controls button')].filter(e => R(e).width) };
      const T = vis && R(tip), W = document.documentElement.clientWidth, dock = R(document.getElementById('dock'));
      const covered = !T ? [] : Object.entries(parts).filter(([k, es]) => es.some(e => hit(R(e), T))).map(([k]) => k);
      // (each still seen: the point at its middle is itself)
      const hidden = Object.entries(parts).filter(([k, es]) => es.some(e => { const r = R(e); const x = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2); return x && !e.contains(x) && !x.contains(e) && tip.contains(x); })).map(([k]) => k);
      const tx = tip && tip.querySelector('.ct-tx'), lh = tx && parseFloat(getComputedStyle(tx).lineHeight);
      return { vis, covered, hidden, n: Object.fromEntries(Object.entries(parts).map(([k, es]) => [k, es.length])), inDock: !T || (T.top >= dock.top - .5 && T.bottom <= dock.bottom + .5), inW: !T || (T.left >= 0 && T.right <= W),
        oneLine: !tx || R(tx).height <= (lh || 18) * 1.4, h: T ? Math.round(T.height) : 0, text: tip ? tip.textContent : '', open: tip && tip.classList.contains('open'), x: !!(tip && tip.querySelector('button')) };
    });
    // a tip between turns (the "Limped in" note after a hand): one line in the dock, over none of the table
    send({ ...tableOf(me, { kind: 'flop' }), seq: 30 }); await settle(pg);
    await coach(LIMP); await sleep(500);
    const a = await look();
    check(a.vis && !a.covered.length && !a.hidden.length && a.inDock && a.inW && a.oneLine && !a.x, `${tag}: "Limped in" shows as one line in the dock (${a.h}px), over none of your cards, the board, the pot or the buttons${a.covered.length ? ': covers ' + a.covered : ''}, no ✕ to find`);
    if(SHOTS) await pg.screenshot({ path: path.join(SHOTS, `fix14-limped-${tag}.png`) });
    // a tap opens it, in the band; it goes by itself
    await pg.click('#coachTip'); await sleep(300);
    const b = await look();
    check(b.vis && b.open && !b.covered.length && b.inDock, `${tag}: a tap opens the whole tip, still in the dock`);
    if(SHOTS && w === 390) await pg.screenshot({ path: path.join(SHOTS, `fix14-limped-open-${tag}.png`) });
    await pg.click('#coachTip'); await sleep(200);
    check(!(await look()).vis, `${tag}: a second tap puts it away`);
    // "Tilt check" coming on your turn: nothing appears while you decide; it shows once your turn is over
    send(turn); await sleep(700);
    await coach(TILT); await sleep(500);
    const c = await look();
    check(!c.vis && c.n['your cards'] === 2 && c.n['action buttons'] >= 2 && !c.hidden.length, `${tag}: "Tilt check" on your turn waits: your cards, the board, the pot and the ${c.n['action buttons']} buttons all in view`);
    if(SHOTS) await pg.screenshot({ path: path.join(SHOTS, `fix14-tilt-on-turn-${tag}.png`) });
    send({ ...tableOf(me, { kind: 'flop' }), acting: 2, actUid: 'p2', seq: 41 }); await sleep(700);
    const d = await look();
    check(d.vis && /Tilt check/.test(d.text) && !d.covered.length && d.inDock && d.oneLine, `${tag}: after your turn the waiting tip shows, one line in the dock`);
    if(SHOTS) await pg.screenshot({ path: path.join(SHOTS, `fix14-tilt-after-${tag}.png`) });
    // your turn comes while it shows: it goes at once
    send({ ...turn, seq: 42 }); await sleep(500);
    check(!(await look()).vis, `${tag}: your turn puts a showing tip away`);
    // it goes by itself (a mistake tip after 6 s)
    send({ ...tableOf(me, { kind: 'flop' }), seq: 43 }); await sleep(300); await coach(LIMP); await sleep(6500);
    check(!(await look()).vis, `${tag}: a tip goes by itself within 6.5 s`);
    await ctx.close();
  }
}

(async () => {
  for(let i = 0; i < 60; i++){ try{ await fetch(BASE + '/health'); break; }catch(e){ await sleep(150); } }
  await sleep(400);
  const TOK = (await api('login', { name: 'Test Player 07', pin: '135777' })).token;
  if(SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null, run = k => !only || only.includes(k);
  if(run('7')) await names(browser, TOK);
  if(run('8')) await sheet(browser, TOK);
  if(run('9')) await wordmark(browser, TOK);
  if(run('10')) await dealer(browser, TOK);
  if(run('11')) await watching(browser, TOK);
  if(run('12') || run('13')) await finished(browser, TOK);
  if(run('14')) await coachTip(browser, TOK);
  await browser.close();
  console.log(`\n${oks} ok, ${fails.length} failed`);
  srv.kill(); fs.rmSync(DATA, { force: true });
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e.stack || e); srv.kill(); fs.rmSync(DATA, { force: true }); process.exit(1); });
