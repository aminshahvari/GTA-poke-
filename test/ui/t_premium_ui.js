// Premium internal redesign, UI-only port onto production (Shape A): mobile acceptance (browser). Every signed-in screen at four phone sizes:
//  - nothing scrolls sideways (page, app column, lobby body)
//  - every visible control is a tap target of at least 44x44 px (a few documented exemptions, see EXEMPT)
//  - every visible text is at least 11 px (the felt's own seat/chip labels are exempt, see FELT)
//  - the screen's key controls are visible and work: tabs, Home sections, leaderboard rows, Director controls,
//    the Lounge doors (Poker works; Business, Opportunity and Scanner are 'Opening soon' and inert), the profile sheet
//    and the table's action buttons
// The table state is written into the page's own socket (routeWebSocket), as t_mobile_ux does.
// PLAYWRIGHT=/path/to/playwright-core CHROMIUM=/path/to/chromium node test/ui/t_premium_ui.js
//   SHOTS=<dir>     save a screenshot of every screen (<screen>-<w>x<h>.png)
//   ROOT=<dir>      run against another checkout (for "before" screenshots); REPORT=1 prints findings without failing
//   FONTS_DIR=<dir> serve real Google Fonts files (fonts.css + woff2 named like fonts.gstatic.com paths with / -> _)
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || process.env.PLAYWRIGHT_CORE || 'playwright');
const ROOT = process.env.ROOT || path.join(__dirname, '..', '..');
const PORT = 5200 + Math.floor(Math.random() * 80), BASE = 'http://localhost:' + PORT;
const DATA = require('os').tmpdir() + '/t_premium_' + process.pid + '.json';
const srv = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '', STAGING: '1', DATABASE_URL: '' }, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SHOTS = process.env.SHOTS || '', REPORT = process.env.REPORT === '1';
const PHONES = [[320, 568], [375, 667], [390, 844], [430, 932]].filter(v => !process.env.ONLY || process.env.ONLY === v.join('x'));
const api = async (p, body, tok) => { const j = await (await fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body || {}) })).json(); if(j.error) throw new Error(p + ': ' + j.error); return j; };
const fails = [];
let oks = 0;
const check = (cond, msg) => { if(cond) oks++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if(!cond) fails.push(msg); };

// controls that may be smaller than 44 px, and why
//  - .linkbtn inside running text (a word-sized link in a sentence; the sentence is the target)
//  - the seats on the felt (their size is the table layout's, tested by t_table_small / t_mobile_ux)
//  - native checkbox/radio inside a <label> (the label is the target and is measured instead)
const EXEMPT = '#seats *, #seats, .felt *, p .linkbtn, .agree .linkbtn, label input[type=checkbox], label input[type=radio], .bz-switch input, input[type=file], input[type=range], #fx *';
// text that may be under 11 px: labels drawn on the felt (seat badges, chips), sized by the table solver
const FELT = '#seats, #fx, .center, .felt';

// measured in the page: sideways scroll, small targets, small text
function audit([EXEMPT, FELT]){
  const vis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity !== 0 && r.bottom > 0 && r.top < innerHeight * 4; };
  const W = document.documentElement.clientWidth, out = { side: [], small: [], tiny: [] };
  for(const el of [document.documentElement, document.body, document.querySelector('.app'), ...document.querySelectorAll('.screen:not([hidden]) .scroll, .modal .glass')]){
    if(el && el.scrollWidth > el.clientWidth + 1){
      const edge = el.getBoundingClientRect().right, wide = [...el.querySelectorAll('*')].filter(c => c.getBoundingClientRect().right > edge + 1 && !c.closest('.bz-rail, .bz-chips, .op-catchips')).slice(0, 2).map(c => c.tagName.toLowerCase() + '.' + String(c.className).split(' ')[0]);
      out.side.push(`${el.id || el.className || el.tagName} ${el.scrollWidth}>${el.clientWidth}${wide.length ? ' (' + wide.join(', ') + ')' : ''}`);
    }
  }
  const root = document.querySelector('.modal') || document.querySelector('.screen:not([hidden])');
  const name = el => (el.id ? '#' + el.id : '') + '.' + String(el.className || el.tagName).split(' ')[0] + ' "' + (el.textContent || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 24) + '"';
  root.querySelectorAll('button, a[href], [role=tab], input, select, textarea, summary, label.btn, [data-prof], [data-gotab]').forEach(el => {
    if(el.matches(EXEMPT) || !vis(el) || el.closest('[hidden]')) return;
    if(el.disabled && el.closest('.turnrow')) {}
    const r = el.getBoundingClientRect();
    if(r.right > W + 1 && !el.closest('.bz-rail, .bz-chips, .op-catchips, .home-nav')) out.side.push(name(el) + ` right edge ${Math.round(r.right)}>${W}`);
    // a control smaller than 44 px still passes when taps 22 px above, below, left and right of its centre land on it
    // (an invisible hit margin, as the table's compact buttons use); a neighbour in the way fails it
    if(r.height < 43.5 || r.width < 43.5){
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const pts = [[cx, cy - 21.5], [cx, cy + 21.5], [cx - 21.5, cy], [cx + 21.5, cy]].filter(([x, y]) => x >= 0 && y >= 0 && x < W && y < innerHeight);
      const onIt = pts.length === 4 && pts.every(([x, y]) => { const hit = document.elementFromPoint(x, y); return hit && (hit === el || el.contains(hit)); });
      if(!onIt) out.small.push(name(el) + ` ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
  });
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for(let n; (n = walker.nextNode());){
    const el = n.parentElement; if(!n.textContent.trim() || seen.has(el)) continue; seen.add(el);
    if(el.closest(FELT) || el.closest('svg, [hidden], [aria-hidden=true]') || !vis(el)) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if(fs < 10.95) out.tiny.push(name(el) + ` ${fs}px`);
  }
  return out;
}
async function look(pg, screen, tag){
  await sleep(SHOTS ? 700 : 250);
  const a = await pg.evaluate(audit, [EXEMPT, FELT]);
  check(!a.side.length, `${tag} ${screen}: no sideways scroll${a.side.length ? ' — ' + a.side.slice(0, 4).join('; ') : ''}`);
  check(!a.small.length, `${tag} ${screen}: tap targets >= 44px${a.small.length ? ' — ' + a.small.length + ': ' + a.small.slice(0, 6).join('; ') : ''}`);
  check(!a.tiny.length, `${tag} ${screen}: text >= 11px${a.tiny.length ? ' — ' + a.tiny.length + ': ' + a.tiny.slice(0, 6).join('; ') : ''}`);
  if(SHOTS) await pg.screenshot({ path: path.join(SHOTS, `${screen}-${tag}.png`) });
}
const visible = (pg, sel) => pg.locator(sel).first().isVisible().catch(() => false);
async function signedIn(browser, tok, [w, h], ws){
  const pg = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  if(ws) await ws(pg);
  await pg.goto(BASE + '/'); await pg.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), tok);
  await pg.reload(); await pg.evaluate(() => document.fonts.ready);
  return pg;
}
async function tab(pg, t){ await pg.click(`#tabs [data-tab=${t}]`); await sleep(300); return pg.locator(`#tabs [data-tab=${t}]`).getAttribute('aria-selected').then(v => v === 'true'); }

// a running 6-handed hand where it is my turn
function tableFor(me){
  const seats = Array.from({ length: 6 }, (_, s) => ({ uid: s ? 'p' + s : me.id, name: s ? 'Test Player 0' + s : me.name, stack: 28000 - s * 900, inHand: true, bet: s === 2 ? 600 : s === 1 ? 100 : 0, folded: s === 5, allIn: false, act: s === 2 ? 'Raise' : '', lastAmt: 0, won: 0, shown: null, cat: '', away: false }));
  return { tid: 'tpu', n: 1, phase: 'hand', handNo: 7, street: 0, seats, size: 6, allowed: seats.map((p, s) => s), cur: 600, board: [], pot: 900, btn: 4, blinds: [100, 200, 25], acting: 0, actUid: me.id, seq: 9,
    deadline: Date.now() + 60000, bank: 60000, usingBank: false, extras: 3, legal: { canCheck: false, toCall: 600, canRaise: true, minTo: 1000, maxTo: 28000, isBet: false, cur: 600, pot: 1500, bb: 200 }, result: null, note: '' };
}
// two finished tournaments (fake, client-side only), so the leaderboard and "Last tournament" have rows
function fakeHistory(club){
  const ms = club.members.slice(0, 9), now = Date.now();
  const res = off => ms.map((m, i) => ({ uid: m.id, name: m.name, place: ((i + off) % ms.length) + 1, pts: 0 })).sort((a, b) => a.place - b.place).map((r, i) => ({ ...r, pts: [45, 27, 18][i] || 1 }));
  return [{ id: 'h2', name: 'Friday Night Deepstack', entrants: ms.length, endedAt: now - 864e5, payouts: [50, 30, 20], results: res(2) },
    { id: 'h1', name: 'Thursday Turbo', entrants: ms.length, endedAt: now - 3 * 864e5, payouts: [50, 30, 20], results: res(5) }];
}
const historyWS = pg => pg.routeWebSocket(/\/ws$/, ws => {
  const server = ws.connectToServer();
  ws.onMessage(m => server.send(m));
  server.onMessage(m => { let j; try{ j = JSON.parse(m); }catch(e){ return ws.send(m); } if(j.t === 'club' && j.club.members) j.club.history = fakeHistory(j.club); ws.send(JSON.stringify(j)); });
});
const tableWS = pg => pg.routeWebSocket(/\/ws$/, ws => {
  const server = ws.connectToServer();
  ws.onMessage(m => { try{ const j = JSON.parse(m); if(j.t === 'watch' || j.t === 'act') return; }catch(e){} server.send(m); });
  server.onMessage(m => {
    let j; try{ j = JSON.parse(m); }catch(e){ return ws.send(m); }
    if(j.t === 'table' || j.t === 'closed') return;
    if(j.t !== 'club') return ws.send(m);
    const me = j.club.me;
    j.club.tourney = { ...j.club.tourney, status: 'running', name: 'Friday Night', stack: 30000, anteMode: 'bb', regs: [me.id], entrants: 6, remaining: 6, level: 2, levelEndsAt: Date.now() + 600000, paused: false, places: [], lateOpen: false, helper: true };
    j.club.myTable = 'tpu'; j.club.tables = [{ tid: 'tpu', n: 1, players: 6 }];
    ws.send(JSON.stringify(j));
    ws.send(JSON.stringify({ t: 'table', table: tableFor(me), you: { hand: 7, cards: ['Ah', 'Qd'] } }));
  });
});

(async () => {
  for(let i = 0; i < 60; i++){ try{ await fetch(BASE + '/health'); break; }catch(e){ await sleep(150); } }
  await sleep(400);
  // production has no staging seed: create the director and twelve fake members through the normal API
  const OWN = (await api('setup', { code: 'secret', name: 'Test Director', pin: '246810', agree: true })).token;
  let MEM;
  for(let i = 1; i <= 12; i++){
    const r = await api('redeem', { code: (await api('invite', {}, OWN)).code, name: 'Test Player ' + String(i).padStart(2, '0'), pin: '1357' + String(i % 10).repeat(2), agree: true });
    if(i === 7) MEM = r.token;
  }
  if(SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  if(process.env.FONTS_DIR){
    const dir = process.env.FONTS_DIR, open = browser.newPage.bind(browser);
    browser.newPage = async o => { const pg = await open(o);
      await pg.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => { const u = r.request().url();
        if(u.includes('fonts.googleapis.com/css2')) return r.fulfill({ status: 200, contentType: 'text/css', body: fs.readFileSync(path.join(dir, 'fonts.css')) });
        const f = path.join(dir, u.slice('https://fonts.gstatic.com/'.length).replace(/\//g, '_'));
        return fs.existsSync(f) ? r.fulfill({ status: 200, contentType: 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) }) : r.abort(); });
      return pg; };
  }
  for(const vp of PHONES){
    const tag = vp.join('x');
    // ---- a member: Lounge, Leaderboard, Learn, profile ----
    let pg = await signedIn(browser, MEM, vp, historyWS);
    await pg.waitForSelector('#lobby:not([hidden]) .card-box', { timeout: 15000 });
    check(await visible(pg, '#tabs [data-tab=event]') && await visible(pg, '#tabs [data-tab=board]') && await visible(pg, '#tabs [data-tab=learn]'), `${tag} member sees Lounge, Leaderboard and Salon tabs`);
    check(await pg.locator('#tabs [data-tab=biz]').count() === 0, `${tag} no Business tab (not in this build)`);
    check(!await visible(pg, '#dirTab'), `${tag} member does not see the Director tab`);
    check(await visible(pg, '.lx-hello .lx-id h2') && await pg.locator('.lx-hello .lx-id h2').innerText() === 'Test', `${tag} the Lounge greets the member by first name`);
    check(await pg.locator('.lx-doors button.lx-door').count() === 1 && await pg.locator('.lx-doors button.lx-door[data-lx=poker]').count() === 1, `${tag} only the Poker door is a working button`);
    check(await pg.locator('.lx-doors .lx-door.soon[aria-disabled=true]').count() === 3 && (await pg.locator('.lx-doors .lx-door.soon em').allInnerTexts()).every(t => /opening soon/i.test(t)), `${tag} Business, Opportunity and Scanner doors say "Opening soon" and are disabled`);
    await look(pg, 'home', tag);
    for(const k of ['biz', 'opp', 'scan']){ await pg.click(`.lx-door.lx-${k}`); await sleep(200); }
    check(await pg.locator('#tabs [data-tab=event]').getAttribute('aria-selected') === 'true' && !await visible(pg, '.modal'), `${tag} tapping an "Opening soon" door does nothing`);
    await pg.click('[data-lx=poker]'); await sleep(700);
    check(await pg.evaluate(() => document.getElementById('lobbyBody').scrollTop) > 0, `${tag} the Poker door scrolls to the tournament`);
    await pg.evaluate(() => document.getElementById('lobbyBody').scrollTo(0, 0));
    check(await tab(pg, 'board'), `${tag} Leaderboard tab opens`);
    check(await pg.locator('#lobbyBody .tbl tbody tr').count() >= 9, `${tag} leaderboard shows a row per player`);
    await look(pg, 'leaderboard', tag);
    await pg.locator('#lobbyBody .lb-name').first().click(); await pg.waitForSelector('.modal .glass', { timeout: 5000 });
    check(await visible(pg, '.modal .prof, .modal .glass'), `${tag} a leaderboard row opens that player's profile`);
    await pg.locator('.modal [data-i]', { hasText: 'Close' }).click(); await sleep(200);
    check(!await visible(pg, '.modal'), `${tag} the profile closes`);
    check(await tab(pg, 'learn'), `${tag} Learn tab opens`);
    await pg.waitForSelector('#lobbyBody .card-box', { timeout: 5000 });
    await look(pg, 'learn', tag);
    await pg.locator('#lobbyBody .seg2 button', { hasText: 'Lessons' }).click(); await sleep(300);
    await look(pg, 'learn-lessons', tag);
    const lesson = pg.locator('#lobbyBody details.lesson summary').first();
    if(await lesson.count()){ await lesson.click(); await sleep(200); check(await pg.locator('#lobbyBody details.lesson[open]').count() === 1, `${tag} a Learn lesson opens`); }
    await pg.click('#meBtn'); await pg.waitForSelector('.modal .prof, .modal .glass', { timeout: 5000 });
    check(await visible(pg, '.modal .glass'), `${tag} profile sheet opens`);
    await look(pg, 'profile', tag);
    await pg.close();

    // ---- the owner: Home and Director ----
    pg = await signedIn(browser, OWN, vp);
    await pg.waitForSelector('#lobby:not([hidden]) .card-box', { timeout: 15000 });
    await look(pg, 'home-owner', tag);
    check(await visible(pg, '#dirTab'), `${tag} owner sees the Director tab`);
    check(await tab(pg, 'director'), `${tag} Director tab opens`);
    check(await pg.locator('#lobbyBody button').count() > 3, `${tag} Director shows its controls`);
    await look(pg, 'director', tag);
    await pg.close();

    // ---- the table, my turn ----
    pg = await signedIn(browser, MEM, vp, tableWS);
    await pg.waitForSelector('#aRaise', { timeout: 15000 }); await sleep(600);
    for(const id of ['aFold', 'aCall', 'aRaise']) check(await visible(pg, '#' + id), `${tag} table: ${id} visible`);
    const rb = await pg.locator('#aRaise').boundingBox();
    check(rb && rb.y + rb.height <= vp[1] + 0.5, `${tag} table: action buttons inside the screen`);
    await look(pg, 'table', tag);
    await pg.click('#aRaise'); await sleep(300);
    check(await visible(pg, '.sizing'), `${tag} table: Raise opens the sizing panel`);
    await look(pg, 'table-sizing', tag);
    await pg.click('#szBack'); await sleep(300);
    check(await visible(pg, '#aRaise') && !await visible(pg, '.sizing'), `${tag} table: Back closes the sizing panel`);
    // on short phones the stats row (with the Lobby button) folds away while it is your turn, by design
    if(await visible(pg, '#lobbyBtn')){ await pg.click('#lobbyBtn'); await sleep(300); check(await visible(pg, '#lobby'), `${tag} table: Lobby button returns to the lobby`); }
    else console.log(`note ${tag} table: Lobby button folded away during your turn (short screen, existing design)`);
    await pg.close();
  }
  await browser.close();
  console.log(`\n${oks} ok, ${fails.length} failed`);
  srv.kill(); fs.rmSync(DATA, { force: true });
  process.exit(fails.length && !REPORT ? 1 : 0);
})().catch(e => { console.error(e.stack || e); srv.kill(); fs.rmSync(DATA, { force: true }); process.exit(1); });
