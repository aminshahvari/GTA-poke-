// The board's UI checks (Issue #32, Step-0 spec §3.6 "t_board_ui"), run with UI_BOARD=1. Phase B1 has no visible
// table change, so this holds what B1 can show, at 390x844, 320x568 and 844x390, on the welcome screen, the lobby and
// a table with your turn up:
//  - the page is the board: html[data-ui="board"], board.css applied, quiet.css not loaded
//  - the §2 tokens are live in the computed styles, and the older --lx-* / --q-* names resolve to them
//  - the page ground and type: --b-bg behind the page, the system face, tabular numbers on stacks and the pot
//  - the Blindrise mark (the app shell) gives way once a screen shows
//  - reduced motion: no press scale, no slide
//  - nothing scrolls sideways
// The spec's later items (button colours and labels "Raise to N" / "Call N", presence dots and the disconnected
// label, the initials fallback, "+" seats not focusable, the ⋯ menu, label contrast in place) are listed at the end as
// PENDING B2+: B2 and later phases fill them in here.
// PLAYWRIGHT=/path/to/playwright-core CHROMIUM=/path/to/chromium node test/ui/t_board_ui.js   SHOTS=<dir> screenshots
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || process.env.PLAYWRIGHT_CORE || 'playwright');
const ROOT = process.env.ROOT || path.join(__dirname, '..', '..');
const PORT = 5560 + Math.floor(Math.random() * 80), BASE = 'http://localhost:' + PORT;
const DATA = require('os').tmpdir() + '/t_bui_' + process.pid + '.json';
const srv = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, UI_BOARD: '1', PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '', STAGING: '1', DATABASE_URL: '' }, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SHOTS = process.env.SHOTS || '';
const SIZES = (process.env.SIZES || '390x844,320x568,844x390').split(',');
const api = async (p, body) => { const j = await (await fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })).json(); if(j.error) throw new Error(p + ': ' + j.error); return j; };
const fails = [];
let oks = 0;
const check = (cond, msg) => { if(cond) oks++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if(!cond) fails.push(msg); };
// the tokens (the board's sampled values, t_board.js), as the browser reports a custom property's computed value
const TOKENS = { '--b-bg': '#00050c', '--b-surface': '#0b1620', '--b-surface-2': '#111f2b', '--b-felt': '#074c2a', '--b-text': '#f5f6f3', '--b-gold': '#d9a651', '--b-gold-text': '#ebe1b9',
  '--b-live': '#e5484d', '--b-online': '#3fcf6e', '--b-away': '#8a93a3', '--b-warn': '#f0a24a', '--b-fold-top': '#bc2c34', '--b-call-top': '#206ab6', '--b-raise-top': '#ca9a4d', '--b-raise-label': '#1a1206',
  '--b-r-btn': '12px', '--b-r-sheet': '16px', '--b-tap': '44px', '--b-act-h': '60px', '--b-sheet-ease': 'cubic-bezier(.32,.72,0,1)' }; // (--b-press-scale: checked with reduced motion below)
const MAPPED = { '--lx-ink': '#00050c', '--lx-navy': '#0b1620', '--lx-gold': '#d9a651', '--lx-ivory': '#f5f6f3', '--q-gold': '#d9a651', '--q-surface': '#0b1620' };

function tableFor(me){
  const n = 9, seats = Array.from({ length: n }, (_, s) => ({ uid: s ? 'p' + s : me.id, name: s ? 'Player ' + s : me.name, stack: 30000 - s * 1100, inHand: true, bet: s === 1 ? 200 : 0, folded: false, allIn: false, act: '', lastAmt: 0, won: 0, shown: null, cat: '', away: false }));
  // (B2: seat 3 away, seat 5 empty: its "+")
  seats[3].away = true; seats[5] = null;
  return { tid: 'bui', n: 1, phase: 'hand', handNo: 3, street: 0, seats, size: n, allowed: seats.map((p, s) => s), cur: 200, board: [], pot: 300, btn: n - 1, blinds: [100, 200, 0], acting: 0, actUid: me.id, seq: 5,
    deadline: Date.now() + 60000, bank: 60000, usingBank: false, extras: 3, legal: { canCheck: false, toCall: 200, canRaise: true, minTo: 400, maxTo: 30000, isBet: false, cur: 200, pot: 300, bb: 200 }, result: null, note: '' };
}
const look = pg => pg.evaluate(([TOKENS, MAPPED]) => {
  const cs = getComputedStyle(document.documentElement), v = k => cs.getPropertyValue(k).trim();
  const bad = Object.entries({ ...TOKENS, ...MAPPED }).filter(([k, want]) => v(k).toLowerCase() !== want).map(([k, want]) => `${k} ${v(k) || '(none)'} not ${want}`);
  const boot = document.getElementById('br-boot');
  const nums = [...document.querySelectorAll('#game .st, #game .pot, .num')].filter(e => e.getClientRects().length);
  return { ui: document.documentElement.dataset.ui, board: [...document.styleSheets].some(s => /\/board\.css$/.test(s.href || '')), quiet: [...document.styleSheets].some(s => /quiet\.css/.test(s.href || '')),
    bad, bg: getComputedStyle(document.body).backgroundColor, font: getComputedStyle(document.body).fontFamily,
    tab: nums.length ? nums.filter(e => !/tabular-nums/.test(getComputedStyle(e).fontVariantNumeric)).length : -1, nums: nums.length,
    boot: boot ? getComputedStyle(boot).visibility : 'none', press: v('--b-press-scale'), slide: v('--b-slide'),
    scroll: Math.max(document.documentElement.scrollWidth - innerWidth, ...[...document.querySelectorAll('.screen:not([hidden])')].map(s => s.scrollWidth - s.clientWidth)) };
}, [TOKENS, MAPPED]);

// ---------- B2: the table (§3.3-§3.5), in the page ----------
// WCAG contrast of a text colour on an opaque fill, both as the browser computes them
const CONTRAST = `window.P = c => (c.match(/[\\d.]+/g) || []).map(Number); window.L = c => { const v = P(c).slice(0, 3).map(x => { x /= 255; return x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; }); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; };
  window.R = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };`;
async function b2(pg, tag, sock, me, w, h){
  const m = await pg.evaluate(src => { eval(src);
    const btn = id => { const e = document.getElementById(id); if(!e) return null; const cs = getComputedStyle(e), stops = cs.backgroundImage.match(/rgba?\([^)]+\)/g) || [], r = e.getBoundingClientRect();
      return { text: e.textContent.replace(/\s+/g, ' ').trim(), img: cs.backgroundImage, color: cs.color, top: stops[0], ratio: stops[0] ? R(cs.color, stops[0]) : 0, w: r.width, h: r.height }; };
    const seats = [...document.querySelectorAll('#seats .seat.b-seat:not(.hero)')];
    const dots = seats.map(s => (s.querySelector('.b-dot') || {}).className || '');
    const pills = [...document.querySelectorAll('#seats .badge.b-st')].map(b => ({ text: b.textContent.trim(), cls: b.className, ratio: R(getComputedStyle(b).color, getComputedStyle(b).backgroundColor) }));
    const avs = [...document.querySelectorAll('#seats .av')], plus = [...document.querySelectorAll('#seats .empty-seat, #tableArea .empty-seat')];
    const dock = [...document.querySelectorAll('#game .dock button')].filter(b => b.getClientRects().length && !b.disabled).map(b => { const r = b.getBoundingClientRect(); return { id: b.id || b.className, w: r.width, h: r.height }; });
    const xt = document.querySelector('#game .dock .xtime:not(:disabled)');
    return { fold: btn('aFold'), call: btn('aCall'), raise: btn('aRaise'), dots, pills,
      initials: avs.length && avs.every(a => !a.querySelector('img') && !/url\(/.test(getComputedStyle(a).backgroundImage) && a.textContent.trim().length > 0), avs: avs.length,
      plus: plus.map(e => ({ text: e.textContent.trim(), hidden: e.getAttribute('aria-hidden'), tab: e.tabIndex, tag: e.tagName, pe: getComputedStyle(e).pointerEvents })),
      dock, xt: xt ? R(getComputedStyle(xt).color, getComputedStyle(xt).backgroundColor) : 0,
      helper: (h => h ? { ratio: R(getComputedStyle(h).color, getComputedStyle(document.body).backgroundColor) } : null)(document.querySelector('#helper:not([hidden])')) }; }, CONTRAST);
  const rgb = hex => `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
  check(m.fold && m.fold.img.includes(rgb('#bc2c34')) && m.call && m.call.img.includes(rgb('#206ab6')) && m.raise && m.raise.img.includes(rgb('#ca9a4d')) && m.raise.color === rgb('#1a1206'),
    `${tag} B2: Fold red (--b-fold), Call blue (--b-call), Raise gold (--b-raise) with its dark label`);
  check(m.fold && m.fold.text === 'Fold' && m.call && /^Call 200$/.test(m.call.text) && m.raise && /^Raise to [\d,]+$/.test(m.raise.text), `${tag} B2: the labels "${m.fold && m.fold.text}", "${m.call && m.call.text}", "${m.raise && m.raise.text}"`);
  for(const k of ['fold', 'call', 'raise']) if(m[k]) check(m[k].ratio >= 4.5, `${tag} B2: the ${k} label in place, ${m[k].ratio.toFixed(2)}:1 on its top stop (at least 4.5)`);
  check(m.dots.length === 7 && m.dots.filter(c => / away\b/.test(c)).length === 1 && m.dots.filter(c => c === 'b-dot').length === 6, `${tag} B2: a presence dot on every other seat, online (6) and away (1) (${m.dots.join(' / ')})`);
  check(m.pills.some(p => p.text === 'Away' && / away\b/.test(p.cls)), `${tag} B2: the away seat says "Away" in words under its plate`);
  check(m.pills.every(p => p.ratio >= 4.5), `${tag} B2: status labels at least 4.5:1 in place (${m.pills.map(p => p.text + ' ' + p.ratio.toFixed(2)).join(', ')})`);
  check(m.initials, `${tag} B2: every seat shows an initials disc, no photo ("Show my photo" off: Muse amendment 2; ${m.avs} discs)`);
  check(m.plus.length === 1 && m.plus.every(p => p.text === '+' && p.hidden === 'true' && p.tab < 0 && p.tag === 'DIV' && p.pe === 'none'), `${tag} B2: the empty seat is a "+", hidden from screen readers, not focusable, not tappable`);
  const small = m.dock.filter(b => b.w < 44 - .5 || b.h < 44 - .5);
  check(m.dock.length >= 4 && !small.length, `${tag} B2: every dock button at least 44x44 (${m.dock.length})${small.length ? ' — ' + small.map(b => `${b.id} ${Math.round(b.w)}x${Math.round(b.h)}`).join(', ') : ''}`);
  check(m.xt >= 4.5, `${tag} B2: "+30s" ${m.xt.toFixed(2)}:1 in place`);
  check(m.helper && m.helper.ratio >= 4.5, `${tag} B2: the info line (the hand helper) ${m.helper ? m.helper.ratio.toFixed(2) : '?'}:1 on the ground`);
  // ⋯: the table menu
  await pg.click('[data-bmore]'); await sleep(450);
  const menu = await pg.evaluate(() => { const sh = document.getElementById('bSheet'); if(!sh || sh.hidden) return null;
    return { rows: [...sh.querySelectorAll('[data-bm]')].map(b => ({ k: b.dataset.bm, text: b.querySelector('span').textContent, h: b.getBoundingClientRect().height })), dialog: !!sh.querySelector('[role=dialog][aria-modal=true]'), focus: document.activeElement && document.activeElement.dataset.bm }; });
  check(menu && ['chat', 'time', 'helper', 'hands', 'leave', 'close'].every(k => menu.rows.some(r => r.k === k)) && menu.dialog,
    `${tag} B2: "⋯" opens the table menu: ${menu ? menu.rows.map(r => r.text).join(', ') : 'nothing'}`);
  check(menu && menu.rows.every(r => r.h >= 44) && menu.focus === 'chat', `${tag} B2: its rows at least 44 tall, focus on the first`);
  await pg.keyboard.press('Escape'); await sleep(300);
  check(await pg.evaluate(() => { const sh = document.getElementById('bSheet'); return !!sh && sh.hidden && document.activeElement && document.activeElement.hasAttribute('data-bmore'); }), `${tag} B2: Escape closes it, focus back on "⋯"`);
  // someone else to act, disconnected in protection time: their status in words
  const t = tableFor(me); sock.send(JSON.stringify({ t: 'table', table: { ...t, acting: 4, actUid: 'p4', legal: null, dcProtect: true, seq: 9 }, you: { hand: 3, cards: ['Ah', 'Qd'] } }));
  await sleep(700);
  const dc = await pg.evaluate(() => { const s = document.querySelector('#seats .seat.b-seat[data-uid="p4"]'); return s && { pill: (s.querySelector('.badge.b-st.dc') || {}).textContent, dot: (s.querySelector('.b-dot') || {}).className, acting: s.classList.contains('acting'), label: s.getAttribute('aria-label') }; });
  check(dc && dc.pill === 'Disconnected' && / dc\b/.test(dc.dot) && dc.acting && /disconnected/.test(dc.label), `${tag} B2: a disconnected player to act says "Disconnected" in words, with the orange dot (Muse amendment 1)`);
  const idle = await pg.evaluate(() => { const r = document.querySelector('#game .dock .b-acts'), more = document.querySelector('[data-bmore]'); return { row: !!r, more: !!more && more.getBoundingClientRect().width >= 44 }; });
  check(idle.row && idle.more, `${tag} B2: not my turn, the row keeps "⋯"`);
}

(async () => {
  for(let i = 0; i < 60; i++){ try{ await fetch(BASE + '/health'); break; }catch(e){ await sleep(150); } }
  await sleep(400);
  const TOK = (await api('login', { name: 'Test Player 07', pin: '135777' })).token;
  if(SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  for(const size of SIZES){
    const [w, h] = size.split('x').map(Number);
    for(const motion of ['no-preference', 'reduce']){
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: motion });
      const pg = await ctx.newPage();
      await pg.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => r.abort());
      let sock = null, me = null;
      await pg.routeWebSocket(/\/ws$/, ws => {
        const server = ws.connectToServer();
        ws.onMessage(m => { try{ const j = JSON.parse(m); if(j.t === 'watch' || j.t === 'act') return; }catch(e){} server.send(m); });
        server.onMessage(m => { let j; try{ j = JSON.parse(m); }catch(e){ return ws.send(m); }
          if(j.t === 'table' || j.t === 'closed') return;
          if(j.t === 'club' && sock === 'table'){ me = j.club.me; j.club.tourney = { ...j.club.tourney, status: 'running', name: 'Friday Night', stack: 30000, anteMode: 'bb', regs: [me.id], entrants: 9, remaining: 9, level: 2, levelEndsAt: Date.now() + 600000, paused: false, places: [], lateOpen: false, helper: true };
            j.club.myTable = 'bui'; j.club.tables = [{ tid: 'bui', n: 1, players: 9 }]; sock = ws; }
          ws.send(JSON.stringify(j)); });
      });
      const tag = `${size}${motion === 'reduce' ? ' reduced motion' : ''}`;
      // signed out: the welcome screen
      await pg.goto(BASE + '/'); await pg.waitForSelector('.screen:not([hidden])', { timeout: 10000 }).catch(() => {}); await sleep(600);
      let L = await look(pg);
      check(L.ui === 'board' && L.board && !L.quiet, `${tag} welcome: html[data-ui="board"], board.css applied, no quiet.css`);
      check(!L.bad.length, `${tag} welcome: the §2 tokens and the mapped --lx-* / --q-* names are live in the computed styles${L.bad.length ? ' — ' + L.bad.join('; ') : ''}`);
      check(L.bg === 'rgb(0, 5, 12)' && /^-apple-system/.test(L.font), `${tag} welcome: --b-bg behind the page and the system face (${L.bg}; ${L.font.slice(0, 40)})`);
      check(L.boot === 'hidden', `${tag} welcome: the Blindrise mark has given way to the screen`);
      check(motion === 'reduce' ? L.press === '1' && L.slide === '0' : L.press === '.97' && L.slide === '1', `${tag}: press scale ${L.press}, slide ${L.slide}${motion === 'reduce' ? ' (no scale, no slide)' : ''}`);
      check(L.scroll <= 0, `${tag} welcome: nothing scrolls sideways (${L.scroll})`);
      if(SHOTS && motion !== 'reduce') await pg.screenshot({ path: path.join(SHOTS, `welcome-${size}.png`) });
      // signed in: the lobby
      await pg.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), TOK);
      await pg.reload(); await pg.waitForSelector('#lobby:not([hidden])', { timeout: 10000 }).catch(() => {}); await sleep(800);
      L = await look(pg);
      check(L.ui === 'board' && !L.bad.length && L.boot === 'hidden', `${tag} lobby: the board, tokens live, the mark gone${L.bad.length ? ' — ' + L.bad.join('; ') : ''}`);
      check(L.scroll <= 0, `${tag} lobby: nothing scrolls sideways (${L.scroll})`);
      if(SHOTS && motion !== 'reduce') await pg.screenshot({ path: path.join(SHOTS, `lobby-${size}.png`) });
      // a table, your turn
      sock = 'table'; await pg.reload();
      for(let k = 0; k < 100 && (!sock || sock === 'table'); k++) await sleep(100);
      if(sock && sock !== 'table'){ sock.send(JSON.stringify({ t: 'table', table: tableFor(me), you: { hand: 3, cards: ['Ah', 'Qd'] } }));
        await pg.waitForSelector('#aRaise', { timeout: 8000 }).catch(() => {}); await sleep(700); }
      L = await look(pg);
      check(await pg.evaluate(() => !!document.querySelector('#game:not([hidden]) #aRaise')), `${tag} table: the table is up with your turn`);
      check(L.nums > 0 && L.tab === 0, `${tag} table: tabular numbers on every stack and the pot (${L.nums} checked)`);
      check(L.scroll <= 0, `${tag} table: nothing scrolls sideways (${L.scroll})`);
      if(SHOTS && motion !== 'reduce') await pg.screenshot({ path: path.join(SHOTS, `table-${size}.png`) });
      if(motion !== 'reduce' && sock && sock !== 'table') await b2(pg, tag, sock, me, w, h);
      await ctx.close();
    }
  }
  await browser.close();
  for(const p of ['B8 reduced motion on the sheets and seats'])
    console.log(`PENDING B8 (not run) ${p}`);
  console.log(`\n${oks} ok, ${fails.length} failed`);
  srv.kill(); fs.rmSync(DATA, { force: true });
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e.stack || e); srv.kill(); fs.rmSync(DATA, { force: true }); process.exit(1); });
