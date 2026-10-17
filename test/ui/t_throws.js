// Egg and tomato throws at the table (ported from R2 edccaf0), browser test at phone sizes:
//  - an egg / tomato thrown at a player splats on that player's avatar (centred on it), then clears
//  - other items (a rose) still fly and pop as before
//  - the action buttons stay visible and tappable while a splat is on screen
//  - with reduced motion: no flight and no wobble, the splat just appears in place and clears
// The table state and the throws are written into the page's own socket (routeWebSocket).
// PLAYWRIGHT_CORE=/path/to/playwright-core CHROMIUM=/path/to/chromium node test/ui/t_throws.js   (SHOTS=<dir> saves screenshots)
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || process.env.PLAYWRIGHT_CORE || 'playwright');
const ROOT = process.env.ROOT || path.join(__dirname, '..', '..');
const PORT = 5200 + Math.floor(Math.random() * 80), BASE = 'http://localhost:' + PORT;
const DATA = require('os').tmpdir() + '/t_throws_' + process.pid + '.json';
const srv = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '', STAGING: '1', DATABASE_URL: '' }, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SHOTS = process.env.SHOTS || '', REPORT = process.env.REPORT === '1';
const PHONES = [[320, 568], [375, 667], [390, 844], [430, 932]].filter(v => !process.env.ONLY || process.env.ONLY === v.join('x'));
const api = async (p, body, tok) => { const j = await (await fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body || {}) })).json(); if(j.error) throw new Error(p + ': ' + j.error); return j; };
const fails = [];
let oks = 0;
const check = (cond, msg) => { if(cond) oks++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if(!cond) fails.push(msg); };

// a running 6-handed hand where it is my turn
function tableFor(me){
  const seats = Array.from({ length: 6 }, (_, s) => ({ uid: s ? 'p' + s : me.id, name: s ? 'Test Player 0' + s : me.name, stack: 28000 - s * 900, inHand: true, bet: s === 2 ? 600 : s === 1 ? 100 : 0, folded: s === 5, allIn: false, act: s === 2 ? 'Raise' : '', lastAmt: 0, won: 0, shown: null, cat: '', away: false }));
  return { tid: 'tpu', n: 1, phase: 'hand', handNo: 7, street: 0, seats, size: 6, allowed: seats.map((p, s) => s), cur: 600, board: [], pot: 900, btn: 4, blinds: [100, 200, 25], acting: 0, actUid: me.id, seq: 9,
    deadline: Date.now() + 60000, bank: 60000, usingBank: false, extras: 3, legal: { canCheck: false, toCall: 600, canRaise: true, minTo: 1000, maxTo: 28000, isBet: false, cur: 600, pot: 1500, bb: 200 }, result: null, note: '' };
}
async function signedIn(browser, tok, [w, h], ws){
  const pg = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  if(ws) await ws(pg);
  await pg.goto(BASE + '/'); await pg.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), tok);
  await pg.reload(); await pg.evaluate(() => document.fonts.ready);
  return pg;
}
let pageWS = null, meId = null;
const tableWS = pg => pg.routeWebSocket(/\/ws$/, ws => {
  pageWS = ws;
  const server = ws.connectToServer();
  ws.onMessage(m => { try{ const j = JSON.parse(m); if(j.t === 'watch' || j.t === 'act' || j.t === 'throw' || j.t === 'chat') return; }catch(e){} server.send(m); });
  server.onMessage(m => {
    let j; try{ j = JSON.parse(m); }catch(e){ return ws.send(m); }
    if(j.t === 'table' || j.t === 'closed') return;
    if(j.t !== 'club') return ws.send(m);
    const me = j.club.me; meId = me.id;
    j.club.tourney = { ...j.club.tourney, status: 'running', name: 'Friday Night', stack: 30000, anteMode: 'bb', regs: [me.id], entrants: 6, remaining: 6, level: 2, levelEndsAt: Date.now() + 600000, paused: false, places: [], lateOpen: false, helper: true };
    j.club.myTable = 'tpu'; j.club.tables = [{ tid: 'tpu', n: 1, players: 6 }];
    ws.send(JSON.stringify(j));
    ws.send(JSON.stringify({ t: 'table', table: tableFor(me), you: { hand: 7, cards: ['Ah', 'Qd'] } }));
  });
});
const throwAt = (from, to, item) => pageWS.send(JSON.stringify({ t: 'chat', msg: { tid: 'tpu', from, name: 'Test Player 0' + from.slice(1), kind: 'throw', item, to, at: Date.now() } }));
// where the splat sits relative to the target avatar, and whether the action buttons are still on top
const probe = (pg, uid) => pg.evaluate(uid => {
  const s = document.querySelector('#fx .splatfx'), av = document.querySelector(`#tableArea .seat[data-uid="${uid}"] .av`);
  const top = id => { const b = document.getElementById(id); if(!b) return false; const r = b.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!h && (h === b || b.contains(h)); };
  if(!s || !av) return { splat: !!s, kind: s && s.className, flying: !!document.querySelector('#fx .throw') };
  const a = s.getBoundingClientRect(), b = av.getBoundingClientRect();
  return { splat: true, kind: s.className, flying: !!document.querySelector('#fx .throw'), dx: Math.abs(a.left + a.width / 2 - (b.left + b.width / 2)), dy: Math.abs(a.top + a.height / 2 - (b.top + b.height / 2)), w: a.width, avw: b.width, buttons: ['aFold', 'aCall', 'aRaise'].every(top) };
}, uid);
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
    for(const rm of ['no-preference', 'reduce']){
      const pg = await signedIn(browser, MEM, vp, tableWS);
      await pg.emulateMedia({ reducedMotion: rm });
      await pg.waitForSelector('#aRaise', { timeout: 15000 }); await sleep(700);
      const me = meId, t = `${tag} ${rm === 'reduce' ? 'reduced motion' : 'motion'}`;
      for(const [item, from, to] of [['egg', 'p2', me], ['tomato', me, 'p3']]){
        throwAt(from, to, item);
        if(rm !== 'reduce'){
          await sleep(300);
          check(await pg.locator('#fx .throw').count() === 1, `${t}: the ${item} flies toward the target`);
          await sleep(800);
        } else {
          await sleep(120);
          check(await pg.locator('#fx .throw').count() === 0, `${t}: no flight for the ${item}`);
        }
        const p = await probe(pg, to);
        check(p.splat && p.kind.includes(item), `${t}: ${item} splats (${p.kind || 'none'})`);
        check(p.dx <= 3 && p.dy <= 3, `${t}: ${item} splat is centred on the target avatar (off by ${Math.round(p.dx)},${Math.round(p.dy)} px)`);
        check(p.w > p.avw * 1.5 && p.w < p.avw * 2.3, `${t}: ${item} splat covers the avatar (${Math.round(p.w)} px over a ${Math.round(p.avw)} px avatar)`);
        check(p.buttons, `${t}: Fold, Call and Raise stay on top and tappable during the ${item} splat`);
        if(SHOTS) await pg.screenshot({ path: path.join(SHOTS, `${item}-${rm}-${tag}.png`) });
        // a splat stays about 1.6 s, fades for 0.5 s and is removed (2.1 s after impact)
        const gone = await pg.waitForFunction(() => !document.querySelector('#fx .splatfx'), null, { timeout: 3000 }).then(() => true, () => false);
        check(gone, `${t}: ${item} splat clears`);
      }
      throwAt('p4', me, 'rose'); await sleep(rm === 'reduce' ? 150 : 900);
      check(await pg.locator('#fx .splatfx').count() === 0, `${t}: a rose does not splat`);
      if(rm !== 'reduce') check(await pg.locator('#fx .throw').count() === 1, `${t}: a rose still flies and pops`);
      await pg.close();
    }
  }
  await browser.close();
  console.log(`\n${oks} ok, ${fails.length} failed`);
  srv.kill(); fs.rmSync(DATA, { force: true });
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e.stack || e); srv.kill(); fs.rmSync(DATA, { force: true }); process.exit(1); });
