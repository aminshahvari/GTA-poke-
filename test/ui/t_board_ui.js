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
// the tokens as the spec gives them, as the browser reports a custom property's computed value
const TOKENS = { '--b-bg': '#03070d', '--b-surface': '#0a1420', '--b-surface-2': '#101c2b', '--b-felt': '#05472a', '--b-text': '#f4f0e7', '--b-gold': '#d4b26c', '--b-gold-text': '#f1d48c',
  '--b-live': '#e5484d', '--b-online': '#3fcf6e', '--b-away': '#8a93a3', '--b-warn': '#f0a24a', '--b-fold-top': '#bc2c34', '--b-call-top': '#226eba', '--b-raise-top': '#d8ad5f', '--b-raise-label': '#1a1206',
  '--b-r-btn': '12px', '--b-r-sheet': '16px', '--b-tap': '44px', '--b-act-h': '60px', '--b-sheet-ease': 'cubic-bezier(.32,.72,0,1)' }; // (--b-press-scale: checked with reduced motion below)
const MAPPED = { '--lx-ink': '#03070d', '--lx-navy': '#0a1420', '--lx-gold': '#d4b26c', '--lx-ivory': '#f4f0e7', '--q-gold': '#d4b26c', '--q-surface': '#0a1420' };

function tableFor(me){
  const n = 9, seats = Array.from({ length: n }, (_, s) => ({ uid: s ? 'p' + s : me.id, name: s ? 'Player ' + s : me.name, stack: 30000 - s * 1100, inHand: true, bet: s === 1 ? 200 : 0, folded: false, allIn: false, act: '', lastAmt: 0, won: 0, shown: null, cat: '', away: false }));
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
      check(L.bg === 'rgb(3, 7, 13)' && /^-apple-system/.test(L.font), `${tag} welcome: --b-bg behind the page and the system face (${L.bg}; ${L.font.slice(0, 40)})`);
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
      await ctx.close();
    }
  }
  await browser.close();
  for(const p of ['B2 button colours: Fold --b-fold, Call --b-call, Raise --b-raise with the dark label', 'B2 labels "Call N" and "Raise to N" ("All-in N")', 'B2 presence dots (online, away, disconnected with its text label: Muse amendment 1)',
    'B2 the initials disc fallback ("Show my photo" off by default: Muse amendment 2, B7)', 'B2 "+" seats not focusable (aria-hidden)', 'B2 the ⋯ menu contents', 'B2 the contrast of every label in place', 'B8 reduced motion on the sheets and seats'])
    console.log(`PENDING B2+ (not run) ${p}`);
  console.log(`\n${oks} ok, ${fails.length} failed`);
  srv.kill(); fs.rmSync(DATA, { force: true });
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e.stack || e); srv.kill(); fs.rmSync(DATA, { force: true }); process.exit(1); });
