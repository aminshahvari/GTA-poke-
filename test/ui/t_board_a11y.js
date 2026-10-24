// The board's motion and accessibility pass (Issue #32, Step-0 spec §2.3 and §10 B8), run with UI_BOARD=1. Fixture
// table, tournament and sponsor (fake data, patched into the messages in the page as t_board_ui does); staging seed
// accounts only (Test Player NN), never real data.
//  1. Measured contrast, in Chromium, on every board screen: the table with its HUD, the details (tournament) sheet, the
//     table menu, the profile sheet, the break, Home, Poker, Exchange, Club and Profile. Every visible text is found in
//     the page; the page is then drawn again with every text transparent, and the pixels under each line of text are
//     read from that picture (so the felt, its gradients, scrims, pseudo-elements and photos all count, as drawn). The
//     text's computed colour (its alpha and its ancestors' opacity applied) is composited over each of those pixels.
//     Pass: 90% of the pixels under the text give at least 4.5:1 (normal text) or 3:1 (large: 24 px, or 18.66 px bold).
//     Text a screen reader never reads (aria-hidden: the felt's name, the "+" of an empty seat) and disabled controls are
//     listed, not counted (WCAG 1.4.3's decoration and inactive-component exceptions).
//     Non-text (WCAG 1.4.11), 3:1: the action buttons' fills (Fold, Call, Raise at their lightest stop) against the dock,
//     the gold ring of the player to act and its time sweep against the felt, the selected tab and segment against the
//     unselected, the focus ring against the ground.
//     The board has one scheme (dark): the page is measured with the system set to dark and to light, and must read the
//     same.
//  2. Reduced motion (prefers-reduced-motion: reduce): through a deal, chips to the pot, the sheets, the winner beat and
//     the break, no animation or transition that moves, scales or rotates anything runs, and any fade is 150 ms or less
//     (every running animation is read from document.getAnimations(), keyframes included). Game timing stays: the
//     winner beat is held by the server (not touched here).
//  3. Basics: every interactive element has an accessible name; the sheets (details, table menu, profile) trap focus
//     and close on Escape, giving focus back; the tab order follows the screen; every button at least 44x44; root font
//     20 and 24 px (the reader's larger text) at 320, 375, 390 and 430 wide: nothing scrolls sideways on Home, Poker,
//     Profile, the table with its HUD and the details sheet.
//  4. The D class (§3.1, W >= 900): at 1280x800 and 1440x900, the table wide (w/h about 1.98, width min(760, 0.62 W)),
//     centred, avatars 44, names 15, stacks 14, the dock and header in the table's column, nothing off screen; the tabs
//     stay in their one column.
// PLAYWRIGHT=/path/to/playwright-core CHROMIUM=/path/to/chromium node test/ui/t_board_a11y.js
//   SHOTS=<dir> screenshots   ONLY=contrast|motion|basics|desktop one part   VERBOSE=1 every measured text
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const { chromium } = require(process.env.PLAYWRIGHT || process.env.PLAYWRIGHT_CORE || 'playwright');
const ROOT = process.env.ROOT || path.join(__dirname, '..', '..');
const PORT = 6260 + Math.floor(Math.random() * 80), BASE = 'http://localhost:' + PORT;
const DATA = path.join(os.tmpdir(), 't_ba11y_' + process.pid + '.json');
const srv = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, UI_BOARD: '1', PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '', STAGING: '1', DATABASE_URL: '' }, stdio: 'ignore' });
const cleanup = () => { try{ srv.kill(); }catch(e){} fs.rmSync(DATA, { force: true }); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SHOTS = process.env.SHOTS || '', ONLY = process.env.ONLY || '', VERBOSE = !!process.env.VERBOSE;
const part = k => !ONLY || ONLY.split(',').includes(k);
const api = async (p, body, tok) => { const j = await (await fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body || {}) })).json(); if(j.error) throw new Error(p + ': ' + j.error); return j; };
const fails = [];
let oks = 0;
const check = (cond, msg) => { if(cond) oks++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if(!cond) fails.push(msg); };
const pin = n => '1357' + String(n % 10).repeat(2);
const login = async n => (await api('login', { name: 'Test Player ' + String(n).padStart(2, '0'), pin: pin(n) })).token;

// ---------- fixtures (fake) ----------
const SPONSOR = { uid: 'u00000000005a', name: 'Aurora Test Roasters', categoryLabel: 'Food & drink', area: 'Toronto', logoV: null };
const NAMES = ['Alexandra Whitfield', 'Ben', 'Christina Okafor', 'Dev', 'Evangeline', 'Fitzgerald', 'Gwen', 'Maximilian Hart'];
const tourney = (ids, o = {}) => ({ id: 'ta11y', status: 'running', name: 'Friday Night', stack: 30000, anteMode: 'bb', regs: [ids[1], ids[2], ids[3]], entrants: 48, remaining: 32, level: 2,
  levelEndsAt: Date.now() + 600000, paused: false, places: [], lateOpen: false, helper: true, levelMin: 20, tableSize: 9, actSec: 20, sponsor: SPONSOR, sponsorSec: 8, prize: 'Coffee for a month', ...o });
// you (Test Player 01) at seat 0, Test Player 02 and 03 beside you, made-up players elsewhere; one raise, one call, one
// fold, one away; your turn, or another's; a hand's result (the winner beat), or no hand (the break)
function tableFor(ids, o = {}){
  const seats = Array.from({ length: 9 }, (_, s) => ({ uid: s === 0 ? ids[1] : s === 1 ? ids[2] : s === 2 ? ids[3] : 'px' + s, name: s === 0 ? 'Test Player 01' : s < 3 ? 'Test Player 0' + (s + 1) : NAMES[s - 1],
    stack: 30000 - s * 1100, inHand: true, bet: s === 1 ? 200 : s === 3 ? 1200 : 0, folded: s === 8, allIn: false, act: s === 8 ? 'Fold' : s === 3 ? 'Raise' : s === 4 ? 'Call' : '', lastAmt: 1200, won: (o.won || {})[s] || 0, shown: null, cat: '', away: s === 6 }));
  const turn = o.turn !== false;
  return { tid: 'ta', n: 1, phase: 'hand', handNo: o.hand || 3, street: 1, seats, size: 9, allowed: seats.map((p, s) => s), cur: 1200, board: ['As', 'Kd', '7c'], pot: 2900, btn: 8,
    blinds: [100, 200, 25], acting: turn ? 0 : 5, actUid: turn ? ids[1] : 'px5', seq: o.seq || 5, deadline: Date.now() + 60000, bank: 60000, usingBank: false, extras: 3,
    legal: turn ? { canCheck: false, toCall: 1200, canRaise: true, minTo: 2200, maxTo: 30000, isBet: false, cur: 1200, pot: 2900, bb: 200 } : null, result: null, note: '', ...(o.table || {}) };
}
const FIELD = { players: 32, tables: 4, leader: { name: 'Christina Okafor', stack: 61200, table: 2 }, watchers: 3, rank: 7, avg: 45000 };

async function page(browser, ids, tok, w, h, opt = {}){
  const ctx = opt.ctx || await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: opt.dsf || 1, isMobile: !opt.desktop, hasTouch: !opt.desktop, reducedMotion: opt.motion || 'no-preference', colorScheme: opt.scheme || 'dark' });
  const pg = await ctx.newPage();
  await pg.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => r.abort());
  if(opt.rootFont) await pg.addInitScript(f => { const put = () => { const st = document.createElement('style'); st.textContent = `html{font-size:${f}px !important}`; document.head.appendChild(st); }; if(document.head) put(); else document.addEventListener('DOMContentLoaded', put); }, opt.rootFont);
  const S = { sock: null, T: tourney(ids) };
  await pg.routeWebSocket(/\/ws$/, ws => {
    const server = ws.connectToServer(); S.sock = ws;
    ws.onMessage(m => { try{ const j = JSON.parse(m); if(['watch', 'act', 'join', 'leave', 'report'].includes(j.t)) return; }catch(e){} server.send(m); });
    server.onMessage(m => { let j; try{ j = JSON.parse(m); }catch(e){ return ws.send(m); }
      if(j.t === 'table' || j.t === 'closed') return;
      if(j.t === 'club' && (!j.d || 'tourney' in j.club || 'myTable' in j.club || 'tables' in j.club)){ if(j.club.me) S.me = j.club.me.id; Object.assign(j.club, { tourney: S.T, myTable: S.lobby ? null : 'ta', tables: [{ tid: 'ta', n: 1, players: 9 }] }); }
      ws.send(JSON.stringify(j)); });
  });
  await pg.goto(BASE + '/'); await pg.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), tok);
  await pg.reload();
  for(let k = 0; k < 100 && !S.sock; k++) await sleep(100);
  await pg.waitForSelector('#game:not([hidden]), #lobby:not([hidden])', { timeout: 10000 }).catch(() => {});
  S.table = (o = {}) => S.sock.send(JSON.stringify({ t: 'table', table: tableFor(ids, o), you: { hand: o.hand || 3, cards: o.noCards ? [] : ['Ah', 'Qd'] }, field: FIELD }));
  S.club = patch => { Object.assign(S, patch.tourney ? { T: patch.tourney } : {}); S.sock.send(JSON.stringify({ t: 'club', d: 1, club: { ...patch, now: Date.now() }, gone: [] })); };
  S.table(); await pg.waitForSelector('#aRaise', { timeout: 8000 }).catch(() => {}); await sleep(900);
  return { ctx, pg, S };
}
const shot = async (pg, name) => { if(SHOTS){ fs.mkdirSync(SHOTS, { recursive: true }); await pg.screenshot({ path: path.join(SHOTS, name + '.png') }); } };
const toLobby = async (pg, k = 'home') => { await pg.evaluate(k => { const b = document.getElementById('lobbyBtn'); if(b && document.getElementById('game').offsetParent !== null) b.click(); }, k); await sleep(500);
  await pg.evaluate(k => { const b = document.querySelector(`#tabs [data-tab="${k}"]`); if(b) b.click(); }, k); await sleep(600); };

// ---------- 1. measured contrast ----------
// WCAG 2.x relative luminance and contrast
const lum = c => { const v = c.slice(0, 3).map(x => { x /= 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; }); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
const over = (fg, a, bg) => fg.slice(0, 3).map((x, i) => x * a + bg[i] * (1 - a));
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
// every visible line of text inside `scope`, with its colour, the opacity it is drawn at, its size and boxes
const TEXTS = scope => {
  const root = document.querySelector(scope); if(!root) return { out: [], covered: [] };
  const W = innerWidth, H = innerHeight, out = [];
  // (any CSS colour as the browser computes it, color-mix() and oklab included, to sRGB 0-255 and alpha: painted on one pixel)
  const cx = (window.__a11yCx = window.__a11yCx || new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true }));
  const col = c => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = 'rgba(0,0,0,0)'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const seen = new Set(), covered = [];
  const visit = (el, text, color, rects) => {
    let op = 1, hidden = false, dec = false, dis = false, logo = false, grad = null;
    for(let e = el; e && e.nodeType === 1; e = e.parentElement){ const cs = getComputedStyle(e); op *= +cs.opacity; if(cs.display === 'none') hidden = true; if(e === el && cs.visibility !== 'visible') hidden = true;
      if(e.getAttribute('aria-hidden') === 'true') dec = true; if(e.matches(':disabled,[aria-disabled="true"]')) dis = true; if(e.matches('.mini-logo,.b-wm,.lx-brand')) logo = true;
      // (text drawn in a gradient: background-clip text. Its colours are the gradient's stops, and it is hidden by dropping the gradient)
      if(!grad && (cs.backgroundClip === 'text' || cs.webkitBackgroundClip === 'text')){ grad = (cs.backgroundImage.match(/(rgba?|color|oklab|oklch)\([^)]*\)/g) || []).map(col); e.setAttribute('data-a11y-grad', ''); } }
    if(hidden || op < .02) return;
    const cs = getComputedStyle(el), size = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700;
    const rs = rects.map(r => ({ l: Math.max(0, r.left), t: Math.max(0, r.top), r: Math.min(W, r.right), b: Math.min(H, r.bottom) })).filter(r => r.r - r.l >= 2 && r.b - r.t >= 2);
    if(!rs.length) return;
    // (clipped away by an ancestor's overflow: off its box)
    let clip = null; for(let e = el.parentElement; e && e !== document.body; e = e.parentElement){ const c = getComputedStyle(e); if(c.overflow !== 'visible' || c.overflowX !== 'visible'){ const b = e.getBoundingClientRect(); clip = clip ? { l: Math.max(clip.l, b.left), t: Math.max(clip.t, b.top), r: Math.min(clip.r, b.right), b: Math.min(clip.b, b.bottom) } : { l: b.left, t: b.top, r: b.right, b: b.bottom }; } }
    const vis = clip ? rs.map(r => ({ l: Math.max(r.l, clip.l), t: Math.max(r.t, clip.t), r: Math.min(r.r, clip.r), b: Math.min(r.b, clip.b) })).filter(r => r.r - r.l >= 2 && r.b - r.t >= 2) : rs;
    if(!vis.length) return;
    // (covered by something else drawn over it, a sticky bar for one: not on screen to read)
    // (only a fixed or sticky bar counts as covering: the lobby's top bar and tab bar over a scrolled page)
    const bar = h => { for(let e = h; e && e !== document.body; e = e.parentElement){ const p = getComputedStyle(e).position; if(p === 'fixed' || p === 'sticky') return e; } return null; };
    const under = r => { const h = document.elementFromPoint((r.l + r.r) / 2, (r.t + r.b) / 2); if(!h || h === el || el.contains(h) || h.contains(el)) return false; const b = bar(h); return !!b && !b.contains(el); };
    if(vis.every(under)){ covered.push(text.slice(0, 30)); return; }
    const id = el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '');
    const key = id + '|' + text + '|' + Math.round(vis[0].l) + ',' + Math.round(vis[0].t);
    if(seen.has(key)) return; seen.add(key);
    const path = []; for(let e = el, k = 0; e && k < 5; e = e.parentElement, k++) path.push(e.id ? '#' + e.id : (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/)[0] : e.tagName.toLowerCase()));
    out.push({ path: path.reverse().join('>'), box: vis[0], id, text: text.slice(0, 40), color: col(color), grad, logo, op, size, bold, large: size >= 24 || (size >= 18.66 && bold), dec, dis, rects: vis });
  };
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while(tw.nextNode()){ const n = tw.currentNode, t = n.nodeValue.replace(/\s+/g, ' ').trim(); if(!t || !n.parentElement || n.parentElement.closest('svg,script,style,template')) continue;
    const rg = document.createRange(); rg.selectNodeContents(n); visit(n.parentElement, t, getComputedStyle(n.parentElement).color, [...rg.getClientRects()]); }
  for(const el of root.querySelectorAll('input:not([type=hidden]):not([type=range]):not([type=checkbox]):not([type=radio]),textarea')){
    const v = el.value || el.placeholder; if(!v) continue;
    visit(el, v.slice(0, 40), el.value ? getComputedStyle(el).color : getComputedStyle(el, '::placeholder').color, [el.getBoundingClientRect()]); }
  return { out, covered };
};
const HIDE_TEXT = '[data-a11y-grad]{background-image:none!important}*,*::before,*::after{transition:none!important;color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;caret-color:transparent!important}*::placeholder{color:transparent!important}';
// the pixels under a list of boxes in a PNG (decoded in a blank page): for each box a grid of up to ~120 samples, over
// the middle 60% of each line box (where the letters are: not the leading above and below them)
async function pixels(dec, png, boxes, dsf){
  return dec.evaluate(async ({ b64, boxes, dsf }) => {
    const bin = atob(b64), u = new Uint8Array(bin.length); for(let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const bmp = await createImageBitmap(new Blob([u], { type: 'image/png' })), c = new OffscreenCanvas(bmp.width, bmp.height), x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
    const D = x.getImageData(0, 0, bmp.width, bmp.height).data, Wp = bmp.width;
    return boxes.map(rs => { const px = []; for(const r0 of rs){ const r = { l: r0.l, r: r0.r, t: r0.t + (r0.b - r0.t) * .2, b: r0.b - (r0.b - r0.t) * .2 }, w = (r.r - r.l) * dsf, h = (r.b - r.t) * dsf, nx = Math.max(2, Math.min(16, Math.round(w / 3))), ny = Math.max(2, Math.min(8, Math.round(h / 3)));
      for(let i = 0; i < nx; i++) for(let j = 0; j < ny; j++){ const X = Math.min(bmp.width - 1, Math.floor(r.l * dsf + (i + .5) * w / nx)), Y = Math.min(bmp.height - 1, Math.floor(r.t * dsf + (j + .5) * h / ny)), k = (Y * Wp + X) * 4; px.push([D[k], D[k + 1], D[k + 2]]); } }
      return px; });
  }, { b64: png.toString('base64'), boxes, dsf });
}
// one screen: its texts measured against what is drawn under them
async function measure(pg, dec, scope, name, dsf = 1){
  const { out: texts, covered } = await pg.evaluate(TEXTS, scope);
  if(VERBOSE && covered.length) console.log(`     ${name}: covered, not measured: ${covered.join(' | ')}`);
  const st = await pg.addStyleTag({ content: HIDE_TEXT }); await sleep(60);
  const png = await pg.screenshot({ animations: 'disabled' });
  if(process.env.DEBUGHIDE && SHOTS) fs.writeFileSync(path.join(SHOTS, 'hidden-' + name.replace(/\W+/g, '-') + '-' + Date.now() % 100000 + '.png'), png);
  // (the text comes back at once: no transition from transparent, which would leave the next reading mid-fade)
  await st.evaluate(e => { e.textContent = '*,*::before,*::after{transition:none!important}'; for(const x of document.querySelectorAll('*')) getComputedStyle(x).color; e.remove(); });
  const px = await pixels(dec, png, texts.map(t => t.rects), dsf);
  return texts.map((t, i) => { const fills = t.grad && t.grad.length ? t.grad : [t.color], rs = px[i].map(bg => Math.min(...fills.map(c => ratio(over(c, c[3] * t.op, bg), bg))));
    const need = t.large ? 3 : 4.5, p10 = pct(rs, .1), med = pct(rs, .5);
    return { ...t, screen: name, ratio: p10, median: med, need, pass: p10 >= need - .005 }; });
}
const CONTRAST = {}; // screen -> results (for the summary)
function report(tag, res){
  const counted = res.filter(t => !t.dec && !t.dis && !t.logo), fail = counted.filter(t => !t.pass);
  const low = counted.reduce((m, t) => !m || t.ratio < m.ratio ? t : m, null);
  if(VERBOSE) for(const t of res) console.log(`     ${t.ratio.toFixed(2).padStart(6)}:1 (median ${t.median.toFixed(2)}) need ${t.need}${t.dec ? ' [aria-hidden]' : ''}${t.dis ? ' [disabled]' : ''} ${t.id} "${t.text}" ${t.size}px`);
  for(const t of res.filter(t => (t.dec || t.dis || t.logo) && !t.pass)) console.log(`     for the record (not counted: ${t.logo ? 'the logotype' : t.dec ? 'aria-hidden decoration' : 'disabled'}): ${t.ratio.toFixed(2)}:1 ${t.id} "${t.text}"`);
  check(counted.length > 0 && !fail.length, `${tag}: ${counted.length} texts measured, each at least 4.5:1 (3:1 large)${low ? `, lowest ${low.ratio.toFixed(2)}:1 ${low.id} "${low.text}"` : ''}${fail.length ? ' — under: ' + fail.map(t => `${t.ratio.toFixed(2)}:1 (need ${t.need}) ${VERBOSE ? t.path + ' ' + JSON.stringify(t.box) : t.id} "${t.text}"`).join('; ') : ''}`);
  return res;
}
// a non-text part (WCAG 1.4.11) against what is beside it, from computed colours (opaque fills, measured as drawn)
const NONTEXT = () => {
  // (any CSS colour as the browser computes it, color-mix() and oklab included, to sRGB 0-255 and alpha: painted on one pixel)
  const cx = (window.__a11yCx = window.__a11yCx || new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true }));
  const col = c => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = 'rgba(0,0,0,0)'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const q = s => document.querySelector(s), out = {};
  const stops = img => (img.match(/(rgba?|color|oklab|oklch)\([^)]*\)/g) || []).map(col);
  for(const [k, id] of [['fold', '#aFold'], ['call', '#aCall'], ['raise', '#aRaise']]){ const b = q(id); if(b && b.getClientRects().length){ const s = stops(getComputedStyle(b).backgroundImage); if(s.length) out[k] = s; } }
  const act = q('#seats .seat.acting .av.b-av'); if(act) out.ring = col(getComputedStyle(act).borderTopColor);
  return out;
};

async function contrastSuite(browser, ids, tok){
  const dec = await (await browser.newContext()).newPage();
  for(const scheme of (process.env.SCHEMES || 'dark,light').split(',')) for(const [w, h] of (process.env.SIZES || '390x844,844x390,1280x800').split(',').map(s => s.split('x').map(Number))){
    const tag = `${w}x${h}${scheme === 'light' ? ' (system light)' : ''}`;
    const { ctx, pg, S } = await page(browser, ids, tok, w, h, { scheme, desktop: w >= 900 });
    const all = [];
    const run = async (scope, name) => { const r = report(`${tag} contrast: ${name}`, await measure(pg, dec, scope, name)); all.push(...r); await shot(pg, `contrast-${name.replace(/\W+/g, '-')}-${w}x${h}-${scheme}`); return r; };
    // the table with the HUD, your turn
    await run('#game', 'the table with its HUD, your turn');
    // another's turn (the quick actions), the acting ring
    S.table({ turn: false, seq: 6 }); await sleep(700);
    await run('#game', 'the table, another player to act');
    if(scheme === 'dark' && w === 390){
      // non-text: the action buttons (at their lightest stop) on the dock's ground, the acting ring on the felt and ground
      S.table({ seq: 7 }); await sleep(600);
      const nt = await pg.evaluate(NONTEXT); const ground = [0, 5, 12];
      const felt = await pg.evaluate(() => { const v = getComputedStyle(document.documentElement).getPropertyValue('--b-felt').trim(); return v; });
      for(const k of ['fold', 'call', 'raise']) if(nt[k]){ const top = nt[k][0]; const r = ratio(top, ground);
        check(r >= 3, `${tag} non-text: the ${k} button's fill at its lightest stop ${r.toFixed(2)}:1 on the ground (at least 3)`); }
      S.table({ turn: false, seq: 8 }); await sleep(600);
      const nt2 = await pg.evaluate(NONTEXT), fx = felt.match(/[0-9a-f]{2}/gi).map(x => parseInt(x, 16));
      check(nt2.ring && ratio(nt2.ring, fx) >= 3 && ratio(nt2.ring, ground) >= 3, `${tag} non-text: the gold ring of the player to act ${nt2.ring ? ratio(nt2.ring, fx).toFixed(2) : '?'}:1 on the felt, ${nt2.ring ? ratio(nt2.ring, ground).toFixed(2) : '?'}:1 on the ground (at least 3)`);
      S.table({ seq: 9 }); await sleep(600);
    }
    // the details sheet
    await pg.evaluate(() => document.getElementById('bHud').click()); await sleep(700);
    await run('#bHudSheet .b-sheet-in', 'the details sheet');
    await pg.keyboard.press('Escape'); await sleep(300);
    // the table menu
    await pg.evaluate(() => document.querySelector('[data-bmore]').click()); await sleep(600);
    await run('#bSheet .b-sheet-in', 'the table menu');
    await pg.keyboard.press('Escape'); await sleep(300);
    // the profile sheet, a member with About and Business on (Test Player 03)
    await pg.evaluate(uid => { const e = document.querySelector(`#seats .seat[data-uid="${uid}"] .av`) || document.querySelector(`#seats .seat[data-uid="${uid}"]`); e.click(); }, ids[3]); await sleep(1200);
    await run('#bProf .bp-in', 'the profile sheet');
    await pg.keyboard.press('Escape'); await sleep(300);
    // the winner beat (a hand's result on the felt)
    S.table({ turn: false, seq: 10, won: { 1: 2900 }, table: { street: 3, board: ['As', 'Kd', '7c', '2d', '9s'], acting: -1, actUid: null, legal: null, result: { lines: ['Test Player 02 wins 2,900 with a Pair of Aces'], winCards: ['As', 'Ah', 'Kd', '9s', '7c'], showdown: false } } }); await sleep(1500);
    // let the beat's finite fades settle (up to 1 s more), so the light and dark runs measure the same frame
    await pg.waitForFunction(() => !document.getAnimations().some(a => a.playState === 'running' && isFinite(a.effect.getComputedTiming().endTime)), null, { timeout: 1000 }).catch(() => {});
    await run('#game', 'the winner beat');
    // the break (no hand at this table, the tournament on its break with the sponsor)
    S.club({ tourney: tourney(ids, { breakUntil: Date.now() + 5 * 60000 }) });
    S.table({ turn: false, seq: 11, hand: 4, noCards: true, table: { phase: 'wait', board: [], pot: 0, legal: null, actUid: null, acting: -1, seats: tableFor(ids).seats.map(p => ({ ...p, inHand: false, bet: 0, act: '', folded: false })) } }); await sleep(1200);
    const brk = await pg.evaluate(() => { const b = document.getElementById('brk'); return !!b && !b.hidden && b.textContent.trim().length > 0; });
    check(brk, `${tag}: the break card is up`);
    await run('#game', 'the break');
    S.club({ tourney: tourney(ids) });
    // the tabs
    for(const [k, name] of [['home', 'Home'], ['poker', 'Poker'], ['biz', 'Exchange'], ['club', 'Club'], ['profile', 'Profile']]){
      await toLobby(pg, k);
      // (the lobby scrolls as one page: each screenful measured)
      const H = await pg.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
      const res = [];
      for(let y = 0, i = 0; y < H && i < 8; y += Math.round(h * .7), i++){ await pg.evaluate(y => scrollTo(0, y), y); await sleep(250);
        res.push(...await measure(pg, dec, '#lobby', name)); await shot(pg, `contrast-${k}-${i}-${w}x${h}-${scheme}`); }
      // (a text seen in two screenfuls counted once, at its lowest)
      const by = new Map(); for(const t of res){ const key = t.id + '|' + t.text; if(!by.has(key) || by.get(key).ratio > t.ratio) by.set(key, t); }
      all.push(...report(`${tag} contrast: ${name}`, [...by.values()]));
      if(k === 'poker' && scheme === 'dark' && w === 390){
        // non-text: the selected tab and the selected segment against what they sit on, the focus ring on the ground
        const nt = await pg.evaluate(() => {
          const cx = new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true });
          const col = (c, under) => { cx.clearRect(0, 0, 1, 1); if(under){ cx.fillStyle = under; cx.fillRect(0, 0, 1, 1); } cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; };
          const root = getComputedStyle(document.documentElement), bg = root.getPropertyValue('--b-bg').trim();
          const tab = document.querySelector('#tabs button[aria-selected="true"]'), tabs = document.getElementById('tabs');
          const tabBg = col(getComputedStyle(tabs).backgroundColor, bg);
          const seg = document.querySelector('#lobbyBody .b-seg button[aria-selected="true"]'), segOff = document.querySelector('#lobbyBody .b-seg button[aria-selected="false"]'), track = seg && seg.parentElement;
          const trackBg = track ? col(getComputedStyle(track).backgroundColor, bg) : null;
          return { tab: tab && col(getComputedStyle(tab).color, bg), tabBg, seg: seg && col(getComputedStyle(seg).backgroundColor, bg), segOff: segOff && col(getComputedStyle(segOff).backgroundColor, bg), trackBg,
            ring: col(root.getPropertyValue('--b-gold').trim()), ground: col(bg) }; });
        if(VERBOSE) console.log('     non-text values', JSON.stringify(nt));
        check(nt.tab && ratio(nt.tab, nt.tabBg) >= 3, `${tag} non-text: the selected tab's mark ${nt.tab ? ratio(nt.tab, nt.tabBg).toFixed(2) : '?'}:1 on the tab bar (at least 3)`);
        check(nt.seg && ratio(nt.seg, nt.trackBg) >= 3, `${tag} non-text: the selected segment's fill ${nt.seg ? ratio(nt.seg, nt.trackBg).toFixed(2) : '?'}:1 on its track (at least 3)`);
        check(ratio(nt.ring, nt.ground) >= 3, `${tag} non-text: the focus ring (--b-gold) ${ratio(nt.ring, nt.ground).toFixed(2)}:1 on the ground (at least 3)`);
      }
      await pg.evaluate(() => scrollTo(0, 0));
    }
    CONTRAST[tag] = all;
    await ctx.close();
  }
  await dec.context().close();
  // the light system setting changes nothing on the board (one scheme)
  for(const s of ['390x844', '844x390', '1280x800']){ const a = CONTRAST[s], b = CONTRAST[s + ' (system light)']; if(!a || !b) continue;
    const key = t => t.screen + '|' + t.id + '|' + t.text + '|' + Math.round(t.box.l / 4) + ',' + Math.round(t.box.t / 4), m = new Map(a.map(t => [key(t), t]));
    // (the same text in the same place: within 10%, and passing or failing alike)
    const diff = b.filter(t => m.has(key(t)) && (Math.abs(m.get(key(t)).ratio - t.ratio) > .1 * t.ratio || m.get(key(t)).pass !== t.pass)).map(t => `${t.screen} "${t.text}" ${m.get(key(t)).ratio.toFixed(2)} vs ${t.ratio.toFixed(2)}`);
    check(!diff.length, `${s}: the system set to light reads the same as dark (the board has one scheme)${diff.length ? ' — ' + diff.slice(0, 5).join('; ') : ''}`); }
}

// ---------- 2. reduced motion ----------
// every animation that runs, read each frame from document.getAnimations() (CSS animations, CSS transitions and the
// app's own element.animate()), with what it changes and for how long
const REC = () => {
  const seen = new WeakSet(); window.__anims = [];
  const who = e => { if(!e || e.nodeType !== 1) return '?'; const p = []; for(let x = e, k = 0; x && k < 3; x = x.parentElement, k++) p.push(x.id ? '#' + x.id : x.tagName.toLowerCase() + (typeof x.className === 'string' && x.className.trim() ? '.' + x.className.trim().split(/\s+/).slice(0, 2).join('.') : '')); return p.reverse().join('>'); };
  const tick = () => { try{ for(const a of document.getAnimations()){ if(seen.has(a)) continue; seen.add(a);
      const ef = a.effect, t = ef && ef.getComputedTiming ? ef.getComputedTiming() : {}, kf = ef && ef.getKeyframes ? ef.getKeyframes() : [];
      const props = [...new Set(kf.flatMap(k => Object.keys(k).filter(x => !['offset', 'computedOffset', 'easing', 'composite'].includes(x))))];
      const kind = a.constructor.name, name = a.animationName || a.transitionProperty || a.id || '';
      // (a property that changes between keyframes: one that stays the same moves nothing)
      const moving = props.filter(p => new Set(kf.map(k => String(k[p]))).size > 1 || (kind === 'CSSTransition'));
      window.__anims.push({ kind, name, target: who(ef && ef.target) + (ef && ef.pseudoElement ? ef.pseudoElement : ''), dur: +t.duration || 0, iter: t.iterations, props: moving, kf: JSON.stringify(kf).slice(0, 300) }); } }catch(e){}
    requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
};
const MOVES = /^(transform|translate|scale|rotate|left|top|right|bottom|inset|margin|width|height|offset|backgroundPosition|background-position|all)/;
const bad = a => (a.iter === Infinity && a.props.length) || (a.dur > 150 && a.props.length) || a.props.some(p => MOVES.test(p) && a.dur > 0);

async function motionSuite(browser, ids, tok){
  for(const motion of ['no-preference', 'reduce']){
    const tag = motion === 'reduce' ? 'reduced motion' : 'full motion';
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: motion });
    await ctx.addInitScript(REC);
    const { pg, S } = await page(browser, ids, tok, 390, 844, { motion, ctx });
    const seenAt = {};
    const step = async (name, f, wait = 1500) => { const n0 = await pg.evaluate(() => window.__anims.length); await f(); await sleep(wait);
      const all = await pg.evaluate(() => window.__anims); seenAt[name] = all.slice(n0); };
    // a new hand dealt, the blinds' chips going in, the flop turned
    await step('a new hand dealt', () => S.table({ hand: 5, seq: 20, table: { street: 0, board: [], pot: 300 } }), 2200);
    await step('chips to the pot and the flop', () => S.table({ hand: 5, seq: 21, table: { street: 1, board: ['As', 'Kd', '7c'], pot: 2900, seats: tableFor(ids).seats.map((p, s) => ({ ...p, bet: s === 2 ? 600 : 0 })) } }));
    await step('the turn passing (the ring and the quick actions)', () => S.table({ hand: 5, seq: 22, turn: false }));
    await step('a chat bubble', () => S.sock.send(JSON.stringify({ t: 'chat', msg: { id: 'c' + Date.now(), tid: 'ta', from: 'px5', name: 'Evangeline', ts: Date.now(), kind: 'text', text: 'nice hand' } })));
    await step('the details sheet opening and closing', async () => { await pg.evaluate(() => document.getElementById('bHud').click()); await sleep(700); await pg.keyboard.press('Escape'); });
    await step('the table menu opening and closing', async () => { await pg.evaluate(() => document.querySelector('[data-bmore]').click()); await sleep(700); await pg.keyboard.press('Escape'); });
    await step('the profile sheet opening', async () => { await pg.evaluate(uid => (document.querySelector(`#seats .seat[data-uid="${uid}"] .av`) || document.querySelector(`#seats .seat[data-uid="${uid}"]`)).click(), ids[3]); await sleep(900); await pg.keyboard.press('Escape'); });
    await step('the winner beat (the pot to the winner)', () => S.table({ hand: 5, seq: 23, turn: false, won: { 1: 2900 }, table: { street: 3, board: ['As', 'Kd', '7c', '2d', '9s'], acting: -1, actUid: null, legal: null, result: { lines: ['Test Player 02 wins 2,900 with a Pair of Aces'], winCards: ['As', 'Ah', 'Kd', '9s', '7c'], showdown: false } } }), 3000);
    await step('the break', async () => { S.club({ tourney: tourney(ids, { breakUntil: Date.now() + 5 * 60000 }) });
      S.table({ turn: false, seq: 24, hand: 6, noCards: true, table: { phase: 'wait', board: [], pot: 0, legal: null, actUid: null, acting: -1, seats: tableFor(ids).seats.map(p => ({ ...p, inHand: false, bet: 0, act: '', folded: false })) } }); }, 2500);
    S.club({ tourney: tourney(ids) });
    await step('the tabs (Home with its live dot, Poker, Profile)', async () => { await toLobby(pg, 'home'); await sleep(800); await toLobby(pg, 'poker'); await sleep(500); await toLobby(pg, 'profile'); }, 1500);
    const all = Object.entries(seenAt).flatMap(([k, v]) => v.map(a => ({ ...a, step: k })));
    if(motion === 'no-preference'){
      // (the scenes do move something with full motion: otherwise the reduced run below would prove nothing)
      const moved = all.filter(bad);
      const kinds = [...new Set(moved.map(a => a.name || a.kind))];
      check(moved.length > 0, `${tag}: the scenes play their motion (${kinds.slice(0, 12).join(', ')})`);
      for(const k of ['a new hand dealt', 'the winner beat (the pot to the winner)', 'the details sheet opening and closing']) check(seenAt[k].some(bad), `${tag}: ${k}: something moves`);
    } else {
      for(const [k, v] of Object.entries(seenAt)){
        const b = v.filter(bad);
        check(!b.length, `${tag}: ${k}: nothing moves, scales or pulses; fades 150 ms or less (${v.length} animations, ${v.filter(a => a.dur > 0).map(a => `${a.name || a.kind} ${Math.round(a.dur)}ms`).slice(0, 6).join(', ') || 'none with a duration'})${b.length ? ' — moving: ' + b.map(a => `${a.kind} ${a.name} on ${a.target} ${Math.round(a.dur)}ms [${a.props.join(',')}]${a.iter === Infinity ? ' infinite' : ''}`).join('; ') : ''}`);
      }
      // declared but not yet run: no transition that would move something, anywhere on the board's screens
      const decl = await pg.evaluate(() => { const out = [];
        for(const e of document.querySelectorAll('#game *, #lobby *, .b-psheet *, body > *')){ const cs = getComputedStyle(e); if(cs.display === 'none') continue;
          const ps = cs.transitionProperty.split(','), ds = cs.transitionDuration.split(',').map(x => parseFloat(x) * (/ms/.test(x) ? 1 : 1000));
          ps.forEach((p, i) => { const d = ds[i % ds.length]; p = p.trim(); if(d > 0 && /^(transform|translate|scale|rotate|left|top|right|bottom|inset|all|width|height|margin)/.test(p)) out.push(`${e.id ? '#' + e.id : e.tagName.toLowerCase() + '.' + String(e.className).trim().split(/\s+/)[0]} ${p} ${d}ms`); });
          const an = cs.animationName; if(an && an !== 'none' && cs.animationIterationCount === 'infinite' && cs.animationPlayState === 'running') out.push(`${e.id || e.className} animation ${an} infinite`); }
        return [...new Set(out)]; });
      check(!decl.length, `${tag}: no transition left that would move something on the lobby's last tab (Profile) or the table${decl.length ? ' — ' + decl.slice(0, 10).join('; ') : ''}`);
    }
    // the winner beat keeps its time: the server holds the result (not changed here); the felt shows it for as long as the result is there
    await ctx.close();
  }
}

// ---------- 3. the basics: names, sheets, tab order, tap sizes, larger text ----------
const ROLES = new Set(['button', 'link', 'textbox', 'searchbox', 'combobox', 'checkbox', 'switch', 'tab', 'menuitem', 'slider', 'radio', 'spinbutton', 'listbox', 'option']);
// every control the accessibility tree has on screen, with the name a screen reader reads
async function unnamed(pg){
  const cdp = await pg.context().newCDPSession(pg);
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  const out = [];
  for(const n of nodes){ if(n.ignored || !n.role || !ROLES.has(n.role.value)) continue;
    const name = (n.name && n.name.value || '').trim(); if(name) continue;
    let desc = n.role.value;
    if(n.backendDOMNodeId){ try{ const { object } = await cdp.send('DOM.resolveNode', { backendNodeId: n.backendDOMNodeId });
      const r = await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId, returnByValue: true, functionDeclaration: 'function(){ const r = this.getBoundingClientRect(); return { vis: !!this.getClientRects().length && getComputedStyle(this).visibility === "visible", d: this.outerHTML.slice(0, 90) }; }' });
      if(!r.result.value.vis) continue; desc += ' ' + r.result.value.d; }catch(e){} }
    out.push(desc); }
  await cdp.detach();
  return out;
}
// every visible control whose tap target is under 44x44 (the spec's tap size, §2.3). The target is what a finger hits:
// the element's box, or (a seat) its avatar and plate together, grown by any invisible strip it has (a ::after hit
// area), probed with elementFromPoint 22 px either side of its middle. A link inside a line of text is WCAG's inline
// exception.
const SMALL = scope => {
  const W = innerWidth, H = innerHeight, clamp = (v, m) => Math.max(.5, Math.min(m - .5, v));
  const hits = (e, x, y) => { const h = document.elementFromPoint(clamp(x, W), clamp(y, H)); return !!h && (h === e || e.contains(h)); };
  return [...document.querySelectorAll(`${scope} :is(button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=switch], [tabindex]:not([tabindex="-1"]))`)]
    .filter(e => e.getClientRects().length && getComputedStyle(e).visibility === 'visible' && !e.closest('[hidden],[aria-hidden="true"]') && !(e.matches('a') && e.closest('p')))
    .map(e => { let r = e.getBoundingClientRect();
      if(e.matches('.seat')){ const rs = [...e.querySelectorAll(':scope > .av, :scope > .plate')].map(x => x.getBoundingClientRect()); if(rs.length) r = { left: Math.min(...rs.map(x => x.left)), right: Math.max(...rs.map(x => x.right)), top: Math.min(...rs.map(x => x.top)), bottom: Math.max(...rs.map(x => x.bottom)) }; }
      const w = r.right - r.left, h = r.bottom - r.top, cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
      const tall = h >= 44 - .5 || (hits(e, cx, cy - 21.5) && hits(e, cx, cy + 21.5)), wide = w >= 44 - .5 || (hits(e, cx - 21.5, cy) && hits(e, cx + 21.5, cy));
      return { r, ok: tall && wide, w, h, d: (e.id ? '#' + e.id : e.tagName.toLowerCase() + '.' + String(e.className).trim().split(/\s+/)[0]) + ' "' + (e.getAttribute('aria-label') || e.textContent).replace(/\s+/g, ' ').trim().slice(0, 24) + '"' }; })
    .filter(x => !x.ok && x.r.bottom > 0 && x.r.top < H).map(x => `${x.d} ${Math.round(x.w)}x${Math.round(x.h)}`);
};
// (Tab from the top of the page: a stand-in first stop, removed after)
const fromTop = () => { const b = document.createElement('button'); b.id = 'a11yStart'; b.textContent = 'start'; b.style.cssText = 'position:fixed;left:0;top:0;opacity:0'; document.body.prepend(b); b.focus(); setTimeout(() => b.remove(), 100); };
// Tab through a sheet both ways: where the focus goes
async function trap(pg, sel, n){
  const inside = () => pg.evaluate(s => { const d = document.querySelector(s); return !!d && d.contains(document.activeElement); }, sel);
  let ok = await inside(), seen = new Set();
  for(let i = 0; i < n; i++){ await pg.keyboard.press('Tab'); ok = ok && await inside(); seen.add(await pg.evaluate(() => document.activeElement.outerHTML.slice(0, 60))); }
  for(let i = 0; i < n; i++){ await pg.keyboard.press('Shift+Tab'); ok = ok && await inside(); }
  return { ok, stops: seen.size };
}
const focusDesc = () => { const a = document.activeElement; return a ? (a.id ? '#' + a.id : a.tagName.toLowerCase() + '.' + String(a.className).trim().split(/\s+/)[0]) : ''; };

async function basicsSuite(browser, ids, tok){
  // ---- names, sheets, order and sizes at 390x844, and sideways at 844x390 ----
  for(const [w, h] of [[390, 844], [844, 390]]){
    const tag = `${w}x${h}`;
    const { ctx, pg, S } = await page(browser, ids, tok, w, h);
    // (the sponsor's 8-second introduction over the header goes first: while it shows, a tap there is the sponsor's)
    await pg.waitForFunction(() => { const e = document.getElementById('spn'); return !e || e.hidden; }, null, { timeout: 15000 }).catch(() => {});
    let u = await unnamed(pg);
    check(!u.length, `${tag} the table, your turn: every control has an accessible name${u.length ? ' — unnamed: ' + u.join(' | ') : ''}`);
    let sm = await pg.evaluate(SMALL, '#game');
    check(!sm.length, `${tag} the table, your turn: every control at least 44x44${sm.length ? ' — ' + sm.join(', ') : ''}`);
    S.table({ turn: false, seq: 30 }); await sleep(700);
    u = await unnamed(pg); sm = await pg.evaluate(SMALL, '#game');
    check(!u.length && !sm.length, `${tag} the table, another's turn (quick actions, seats as buttons): names and 44x44${u.length ? ' — unnamed: ' + u.join(' | ') : ''}${sm.length ? ' — small: ' + sm.join(', ') : ''}`);
    // the order Tab takes on the table: the header, then the seats, then the dock (never back up the screen)
    await pg.evaluate(fromTop);
    const order = [];
    for(let i = 0; i < 40; i++){ await pg.keyboard.press('Tab'); const z = await pg.evaluate(() => { const a = document.activeElement; if(!a || a === document.body) return null;
        const g = a.closest('#bTop,.b-top,.clock') ? 0 : a.closest('#tableArea,.side,#fieldBar') ? 1 : a.closest('#dock,.dock') ? 2 : 3; return [g, a.id || a.className || a.tagName]; });
      if(!z) continue; if(order.length && order[0][1] === z[1] && i > 3) break; order.push(z); }
    const groups = order.map(o => o[0]), mono = groups.every((g, i) => !i || g >= groups[i - 1] || (g === 0 && i === groups.length - 1));
    check(order.length > 5 && mono && groups.includes(1) && groups.includes(2), `${tag} the table: Tab goes header, table (the seats), dock, in that order (${groups.join('')}; ${order.length} stops)`);
    check(!(await pg.evaluate(() => [...document.querySelectorAll('[tabindex]')].some(e => +e.getAttribute('tabindex') > 0))), `${tag}: no positive tabindex (the order is the page's)`);
    // a seat opens the profile sheet from the keyboard; the sheet keeps the focus and Escape gives it back
    await pg.evaluate(uid => document.querySelector(`#seats .seat[data-uid="${uid}"]`).focus(), ids[3]);
    await pg.keyboard.press('Enter'); await sleep(1200);
    let t = await trap(pg, '#bProf [role="dialog"]', 12);
    check(t.ok && t.stops >= 3, `${tag} the profile sheet: opened with Enter on a seat; Tab and Shift+Tab stay inside (${t.stops} stops)`);
    u = await unnamed(pg); sm = await pg.evaluate(SMALL, '#bProf');
    check(!u.length && !sm.length, `${tag} the profile sheet: names and 44x44${u.length ? ' — unnamed: ' + u.join(' | ') : ''}${sm.length ? ' — small: ' + sm.join(', ') : ''}`);
    await pg.keyboard.press('Escape'); await sleep(300);
    let back = await pg.evaluate(() => ({ open: !document.getElementById('bProf').hidden, f: document.activeElement && document.activeElement.dataset.uid }));
    check(!back.open && back.f === ids[3], `${tag} the profile sheet: Escape closes it, the focus back on the seat (${JSON.stringify(back)})`);
    // the details sheet
    await pg.focus('#bHud'); await pg.keyboard.press('Enter'); await sleep(700);
    t = await trap(pg, '#bHudSheet [role="dialog"]', 8);
    check(t.ok, `${tag} the details sheet: opened with Enter on the header; Tab and Shift+Tab stay inside (${t.stops} stops)`);
    u = await unnamed(pg); sm = await pg.evaluate(SMALL, '#bHudSheet');
    check(!u.length && !sm.length, `${tag} the details sheet: names and 44x44${u.length ? ' — unnamed: ' + u.join(' | ') : ''}${sm.length ? ' — small: ' + sm.join(', ') : ''}`);
    await pg.keyboard.press('Escape'); await sleep(300);
    back = await pg.evaluate(() => ({ open: !document.getElementById('bHudSheet').hidden, f: document.activeElement && document.activeElement.id }));
    check(!back.open && back.f === 'bHud', `${tag} the details sheet: Escape closes it, the focus back on the header (${JSON.stringify(back)})`);
    // the table menu
    await pg.focus('[data-bmore]'); await pg.keyboard.press('Enter'); await sleep(700);
    t = await trap(pg, '#bSheet [role="dialog"]', 10);
    check(t.ok && t.stops >= 4, `${tag} the table menu: opened with Enter on ⋯; Tab and Shift+Tab stay inside (${t.stops} stops)`);
    u = await unnamed(pg); sm = await pg.evaluate(SMALL, '#bSheet');
    check(!u.length && !sm.length, `${tag} the table menu: names and 44x44${u.length ? ' — unnamed: ' + u.join(' | ') : ''}${sm.length ? ' — small: ' + sm.join(', ') : ''}`);
    await pg.keyboard.press('Escape'); await sleep(300);
    back = await pg.evaluate(() => ({ open: !document.getElementById('bSheet').hidden, f: document.activeElement && document.activeElement.hasAttribute('data-bmore') }));
    check(!back.open && back.f, `${tag} the table menu: Escape closes it, the focus back on ⋯ (${JSON.stringify(back)})`);
    // the tabs
    for(const [k, name] of [['home', 'Home'], ['poker', 'Poker'], ['biz', 'Exchange'], ['club', 'Club'], ['profile', 'Profile']]){
      await toLobby(pg, k);
      u = await unnamed(pg);
      const H = await pg.evaluate(() => document.documentElement.scrollHeight); let small = [];
      for(let y = 0, i = 0; y < H && i < 8; y += Math.round(h * .7), i++){ await pg.evaluate(y => scrollTo(0, y), y); await sleep(150); small.push(...await pg.evaluate(SMALL, '#lobby')); }
      small = [...new Set(small.map(x => x.replace(/ \d+x\d+$/, m => m)))];
      check(!u.length, `${tag} ${name}: every control has an accessible name${u.length ? ' — unnamed: ' + u.join(' | ') : ''}`);
      check(!small.length, `${tag} ${name}: every control at least 44x44${small.length ? ' — ' + small.slice(0, 8).join(', ') : ''}`);
      // the order Tab takes: the top bar, the page, the tab bar
      await pg.evaluate(() => scrollTo(0, 0)); await pg.evaluate(fromTop);
      const gs = [];
      for(let i = 0; i < 60; i++){ await pg.keyboard.press('Tab'); const g = await pg.evaluate(() => { const a = document.activeElement; if(!a || a === document.body) return null; return a.closest('#tabs') ? 2 : a.closest('#lobbyBody') ? 1 : 0; }); if(g == null) continue; gs.push(g); if(g === 2 && gs.filter(x => x === 2).length >= 5) break; }
      const firstBody = gs.indexOf(1), firstTabs = gs.indexOf(2);
      check(firstTabs > 0 && gs.slice(0, firstTabs).every((g, i, a) => !i || g >= a[i - 1]), `${tag} ${name}: Tab goes top bar, page, tab bar (${gs.slice(0, 24).join('')})`);
    }
    await shot(pg, `basics-${tag}`);
    await ctx.close();
  }
  // ---- larger text: root font 20 and 24 px at 320, 375, 390 and 430 wide ----
  for(const rootFont of [20, 24]) for(const [w, h] of [[320, 568], [375, 667], [390, 844], [430, 932]]){
    const tag = `${w}x${h} root ${rootFont}px`;
    const { ctx, pg } = await page(browser, ids, tok, w, h, { rootFont });
    const over = scope => pg.evaluate(scope => { const W = innerWidth, out = [];
      const RAILS = '.b-win-rail,.b-ltables,.bz-rail,.b-fchips,.bz-chips';
      for(const e of document.querySelectorAll(scope + ' *')){ if(!e.getClientRects().length || e.closest('svg') || (e.parentElement && e.parentElement.closest(RAILS)) || getComputedStyle(e).position === 'fixed' && e.closest('#seats')) continue;
        const r = e.getBoundingClientRect(); if(r.right > W + .5 || r.left < -.5) out.push((e.id || String(e.className).split(' ')[0] || e.tagName) + ' ' + Math.round(r.left) + '-' + Math.round(r.right)); }
      return { scroll: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - W, out: [...new Set(out)].slice(0, 6) }; }, scope);
    let m = await over('#game .b-top'); const m2 = await over('#game #dock');
    check(m.scroll <= 0 && !m.out.length && !m2.out.length, `${tag} the table's HUD and dock: nothing past the screen's edge${m.out.concat(m2.out).length ? ' — ' + m.out.concat(m2.out).join(', ') : ''} (scroll ${m.scroll})`);
    await pg.evaluate(() => document.getElementById('bHud').click()); await sleep(700);
    m = await over('#bHudSheet');
    const inner = await pg.evaluate(() => { const i = document.querySelector('#bHudSheet .b-sheet-in'); return i ? i.scrollWidth - i.clientWidth : 99; });
    check(m.scroll <= 0 && !m.out.length && inner <= 0, `${tag} the details sheet: no sideways scroll, nothing past the edge${m.out.length ? ' — ' + m.out.join(', ') : ''} (inner ${inner})`);
    await shot(pg, `type-${rootFont}-sheet-${w}x${h}`);
    await pg.keyboard.press('Escape'); await sleep(200);
    for(const [k, name] of [['home', 'Home'], ['poker', 'Poker'], ['profile', 'Profile']]){
      await toLobby(pg, k); m = await over('#lobby');
      check(m.scroll <= 0 && !m.out.length, `${tag} ${name}: no sideways scroll, nothing past the edge${m.out.length ? ' — ' + m.out.join(', ') : ''} (scroll ${m.scroll})`);
      if(w === 320) await shot(pg, `type-${rootFont}-${k}-${w}x${h}`);
    }
    await ctx.close();
  }
}

// ---------- 4. the D class (§3.1): a tablet or a computer ----------
// (the dock's own box is held 2 px past the foot of the screen on every size class, its empty bottom padding, clipped:
// lockArea's 2 px under the table. What is in it, its buttons, is checked to be on screen)
const hitB = (a, b, pad = 0) => a.l < b.r - pad && b.l < a.r - pad && a.t < b.b - pad && b.t < a.b - pad;
async function desktopSuite(browser, ids, tok){
  for(const [w, h] of [[1280, 800], [1440, 900], [1024, 768], [1366, 1024]]){
    const tag = `${w}x${h}`;
    const { ctx, pg, S } = await page(browser, ids, tok, w, h, { desktop: true });
    for(const n of [9, 6, 2]){
      const seats = tableFor(ids).seats.map((p, s) => s < n ? p : null);
      S.table({ seq: 40 + n, hand: 10 + n, table: { seats, size: n, allowed: seats.map((p, s) => s).slice(0, n), btn: n - 1 } }); await sleep(900);
      const m = await pg.evaluate(() => {
        const r = el => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
        const drawn = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
        const u = rs => ({ l: Math.min(...rs.map(x => x.l)), t: Math.min(...rs.map(x => x.t)), r: Math.max(...rs.map(x => x.r)), b: Math.max(...rs.map(x => x.b)) });
        const seats = [...document.querySelectorAll('#seats .seat')].filter(s => s.dataset.uid).map(s => { const nm = s.querySelector('.nm'), st = s.querySelector('.st'), av = s.querySelector('.av');
          return { name: nm ? nm.textContent : '?', hero: s.classList.contains('hero'), av: drawn(av) ? r(av) : null, nm: nm && parseFloat(getComputedStyle(nm).fontSize), st: st && parseFloat(getComputedStyle(st).fontSize),
            plate: (ps => ps.length ? u(ps) : null)([s.querySelector('.plate'), ...s.querySelectorAll('.badge')].filter(drawn).map(r)) }; });
        const slots = [...document.querySelectorAll('#board .slot, #board .card')].filter(drawn).map(r), pot = document.querySelector('#tableArea .pot');
        const btns = [...document.querySelectorAll('#game .dock .controls button')].filter(drawn).map(b => ({ id: b.id || b.className, ...r(b) }));
        return { cls: document.getElementById('tableArea').dataset.bcls, d: document.getElementById('game').classList.contains('b-d'), felt: r(document.querySelector('#tableArea .felt')), dock: r(document.getElementById('dock')), top: r(document.querySelector('#game .b-top')),
          seats, board: slots.length ? u(slots) : null, pot: drawn(pot) ? r(pot) : null, btns, W: innerWidth, H: innerHeight, scroll: document.documentElement.scrollWidth - innerWidth,
          all: [...document.querySelectorAll('#game *')].filter(e => e.getClientRects().length && !e.closest('#fx,svg') && e.id !== 'dock' && getComputedStyle(e).position !== 'fixed').filter(e => { const b = e.getBoundingClientRect(); return b.right > innerWidth + .5 || b.left < -.5 || b.bottom > innerHeight + .5; }).map(e => (e.id || String(e.className).split(' ')[0] || e.tagName) + ' ' + JSON.stringify(r(e))) };
      });
      const t = `${tag} ${n} players`, F = m.felt, fw = F.r - F.l, fh = F.b - F.t;
      check(m.cls === 'D' && m.d, `${t}: the D class (data-bcls ${m.cls})`);
      const want = Math.min(760, Math.round(.62 * w));
      check(fw / fh >= 1.85 && fw / fh <= 2.05 && Math.abs(fw - want) <= 2, `${t}: the table wide, w/h ${(fw / fh).toFixed(2)} (1.85-2.05), ${Math.round(fw)} px across (min(760, 0.62 W) = ${want})`);
      check(Math.abs((F.l + F.r) / 2 - w / 2) <= 2, `${t}: the table centred (${Math.round((F.l + F.r) / 2)} of ${w / 2})`);
      check(F.l >= 0 && F.t >= 0 && F.r <= w && F.b <= h && !hitB(F, m.dock, .5) && F.b <= m.dock.t + .5 && F.t >= m.top.b - .5, `${t}: the table wholly on screen, under the header and over the dock`);
      const others = m.seats.filter(q => !q.hero);
      check(others.every(q => q.av && Math.round(q.av.w) === 44 && q.nm === 15 && q.st === 14), `${t}: seats a size up: avatar 44, name 15, stack 14 (${[...new Set(others.map(q => `${q.av && Math.round(q.av.w)}/${q.nm}/${q.st}`))].join(', ')})`);
      const over = [], plates = m.seats.filter(q => q.plate);
      plates.forEach((a, i) => { plates.slice(i + 1).forEach(b => { if(hitB(a.plate, b.plate, .5)) over.push(`${a.name} x ${b.name}`); });
        if(m.board && hitB(a.plate, m.board, .5)) over.push(`${a.name} x board`); if(m.pot && hitB(a.plate, m.pot, .5)) over.push(`${a.name} x pot`); m.btns.forEach(b => { if(hitB(a.plate, b, .5)) over.push(`${a.name} x ${b.id}`); }); });
      check(!over.length, `${t}: no plate over another plate, the board, the pot or a button${over.length ? ' — ' + over.join('; ') : ''}`);
      const acts = m.btns.filter(b => /^a[A-Z]/.test(b.id));
      check(acts.length >= 3 && acts.every(b => b.w >= 44 && b.h >= 44 && b.l >= 0 && b.r <= w && b.b <= h), `${t}: the action buttons at least 44 and on screen (${acts.map(b => `${b.id} ${Math.round(b.w)}x${Math.round(b.h)}`).join(', ')})`);
      check(m.top.r - m.top.l <= 821 && Math.abs((m.top.l + m.top.r) / 2 - w / 2) <= 2 && m.dock.r - m.dock.l <= 821 && Math.abs((m.dock.l + m.dock.r) / 2 - w / 2) <= 2, `${t}: the header and the dock one centred column (${Math.round(m.top.r - m.top.l)} and ${Math.round(m.dock.r - m.dock.l)} px)`);
      check(m.scroll <= 0 && !m.all.length, `${t}: nothing past the screen's edge (scroll ${m.scroll})${m.all.length ? ' — ' + m.all.slice(0, 4).join(', ') : ''}`);
      if(n === 9) await shot(pg, `desktop-table-${tag}`);
    }
    // the details sheet on a wide screen: within the screen
    await pg.evaluate(() => document.getElementById('bHud').click()); await sleep(700);
    const sh = await pg.evaluate(() => { const b = document.querySelector('#bHudSheet .b-sheet-in').getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, W: innerWidth, H: innerHeight }; });
    check(sh.l >= 0 && sh.r <= sh.W && sh.t >= 0 && sh.b <= sh.H, `${tag}: the details sheet within the screen (${Math.round(sh.l)}-${Math.round(sh.r)})`);
    await shot(pg, `desktop-sheet-${tag}`);
    await pg.keyboard.press('Escape'); await sleep(200);
    // the tabs: one centred column, nothing sideways
    for(const k of ['home', 'poker', 'biz', 'club', 'profile']){
      await toLobby(pg, k);
      const L = await pg.evaluate(() => { const c = document.getElementById('lobbyBody').getBoundingClientRect(); return { l: c.left, r: c.right, W: innerWidth, scroll: document.documentElement.scrollWidth - innerWidth }; });
      check(L.scroll <= 0 && Math.abs((L.l + L.r) / 2 - L.W / 2) <= 2 && L.r - L.l <= 541, `${tag} ${k}: the tab in its centred column (${Math.round(L.l)}-${Math.round(L.r)}), nothing sideways`);
      if(k === 'home') await shot(pg, `desktop-home-${tag}`);
    }
    await ctx.close();
  }
  // phones keep their classes: sideways is L, upright P-*
  for(const [w, h, want] of [[932, 430, 'L'], [844, 390, 'L'], [430, 932, 'P-L'], [899, 1000, 'P-L']]){
    const { ctx, pg } = await page(browser, ids, tok, w, h);
    const c = await pg.evaluate(() => document.getElementById('tableArea').dataset.bcls);
    check(c === want, `${w}x${h}: still ${want} (${c})`);
    await ctx.close();
  }
}

(async () => {
  for(let i = 0; i < 60; i++){ try{ await fetch(BASE + '/health'); break; }catch(e){ await sleep(150); } }
  await sleep(400);
  const toks = [], ids = [null];
  for(let n = 1; n <= 3; n++) toks[n] = await login(n);
  const view = await new Promise((res, rej) => { const WebSocket = require('ws'), ws = new WebSocket(BASE.replace('http', 'ws') + '/ws');
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: toks[1] }))); ws.on('message', m => { m = JSON.parse(m); if(m.t === 'club'){ ws.close(); res(m.club); } }); ws.on('error', rej); });
  for(let n = 1; n <= 3; n++) ids[n] = (view.members.find(x => x.name === 'Test Player 0' + n) || {}).id;
  // Test Player 03 shows About and Business at tables and is open to connect (the profile sheet at its fullest)
  await api('profilePrefs', { photo: true, table: true, connect: true, area: 'Leslieville', job: 'Designer' }, toks[3]);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  check(ids.slice(1).every(Boolean), `staging seed players 01-03 signed in (${ids.slice(1).join(', ')})`);
  if(part('contrast')) await contrastSuite(browser, ids, toks[1]);
  if(part('motion')) await motionSuite(browser, ids, toks[1]);
  if(part('basics')) await basicsSuite(browser, ids, toks[1]);
  if(part('desktop')) await desktopSuite(browser, ids, toks[1]);
  await browser.close();
  console.log(`\n${oks} ok, ${fails.length} failed`);
  cleanup();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e.stack || e); cleanup(); process.exit(1); });
