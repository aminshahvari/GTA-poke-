// Keeping the phone screen on at the table (browser, phone emulation with touch). Where the Wake Lock API is missing
// (Instagram's in-app browser, older iOS) or refuses (Low Power Mode), a tap at the table starts a muted, looping,
// invisible video instead (the NoSleep.js trick), which the page's CSP lets play from its data: URI; leaving the table
// stops it. Where the API grants the lock, no video plays; a refused lock is asked again on the next tap.
// The club and table are written into the page's own socket (routeWebSocket), as t_table_layout does.
// PLAYWRIGHT=/path/to/playwright-core CHROMIUM=/path/to/chromium node test/ui/t_keep_awake.js
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || process.env.PLAYWRIGHT_CORE || 'playwright');
const ROOT = process.env.ROOT || path.join(__dirname, '..', '..');
const PORT = 5700 + Math.floor(Math.random() * 80), BASE = 'http://localhost:' + PORT;
const DATA = require('os').tmpdir() + '/t_awake_' + process.pid + '.json';
const srv = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '', STAGING: '1', DATABASE_URL: '' }, stdio: 'ignore' });
process.on('exit', () => { try{ srv.kill('SIGKILL'); }catch(e){} fs.rmSync(DATA, { force: true }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const api = async (p, body) => { const j = await (await fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })).json(); if(j.error) throw new Error(p + ': ' + j.error); return j; };
let oks = 0, fails = 0;
const check = (cond, msg) => { cond ? oks++ : fails++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); };

// lock: 'none' (no Wake Lock API), 'refuse' (refuses the first request, grants the next), 'grant'
async function page(browser, tok, lock){
  const pg = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const csp = []; pg.on('console', m => { if(/Content Security Policy/i.test(m.text())) csp.push(m.text()); });
  await pg.addInitScript(lock => {
    window.__locks = 0;
    if(lock === 'none'){ delete Navigator.prototype.wakeLock; return; }
    let asked = 0;
    const fake = { request: () => { asked++; if(lock === 'refuse' && asked === 1) return Promise.reject(new DOMException('Low Power Mode', 'NotAllowedError'));
      window.__locks++; const l = new EventTarget(); l.release = () => { window.__locks--; return Promise.resolve(); }; return Promise.resolve(l); } };
    Object.defineProperty(Navigator.prototype, 'wakeLock', { get: () => fake, configurable: true });
  }, lock);
  let me = null;
  await pg.routeWebSocket(/\/ws$/, ws => {
    const server = ws.connectToServer();
    ws.onMessage(m => { try{ const j = JSON.parse(m); if(j.t === 'watch' || j.t === 'act') return; }catch(e){} server.send(m); });
    server.onMessage(m => {
      let j; try{ j = JSON.parse(m); }catch(e){ return ws.send(m); }
      if(j.t === 'table' || j.t === 'closed') return;
      if(j.t !== 'club') return ws.send(m);
      me = j.club.me;
      j.club.tourney = { ...j.club.tourney, status: 'running', name: 'Friday Night', stack: 30000, anteMode: 'bb', regs: [me.id], entrants: 2, remaining: 2, level: 2,
        levelEndsAt: Date.now() + 600000, paused: false, places: [], lateOpen: false, helper: true };
      j.club.myTable = 'awake'; j.club.tables = [{ tid: 'awake', n: 1, players: 2 }];
      ws.send(JSON.stringify(j));
    });
  });
  await pg.goto(BASE + '/'); await pg.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), tok);
  await pg.reload();
  await pg.waitForFunction(() => !document.getElementById('game').hidden, null, { timeout: 8000 }).catch(() => {});
  await sleep(400);
  return { pg, csp };
}
const video = pg => pg.evaluate(() => { const v = document.querySelector('video.nosleep'); if(!v) return null; const b = v.getBoundingClientRect(), s = getComputedStyle(v);
  return { playing: !v.paused && v.readyState >= 2 && v.currentTime > 0, paused: v.paused, muted: v.muted, inline: v.playsInline, loop: v.loop, w: b.width, h: b.height, op: s.opacity, pe: s.pointerEvents, pos: s.position, err: v.error && v.error.code }; });
const tap = async pg => { await pg.tap('#tName').catch(() => pg.mouse.click(200, 400)); await sleep(1200); };

(async () => {
  for(let i = 0; i < 60; i++){ try{ await fetch(BASE + '/healthz'); break; }catch(e){ await sleep(150); } }
  await sleep(400);
  const TOK = (await api('login', { name: 'Test Player 07', pin: '135777' })).token;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  {
    const { pg, csp } = await page(browser, TOK, 'none');
    check(await pg.evaluate(() => !document.getElementById('game').hidden), 'no Wake Lock API: the table is open');
    await tap(pg);
    const v = await video(pg);
    check(!!v && v.playing, `no Wake Lock API: a tap at the table starts the silent video (${JSON.stringify(v)})`);
    check(!!v && v.muted && v.inline && v.loop, 'the video is muted, inline and looping');
    check(!!v && v.w <= 1 && v.h <= 1 && v.op === '0' && v.pe === 'none' && v.pos === 'fixed', 'the video is invisible, 1px, untouchable and out of the layout');
    check(!csp.length, 'the page\'s CSP lets it play' + (csp.length ? ' — ' + csp[0] : ''));
    check(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight + 1), 'no scroll added');
    await pg.click('#lobbyBtn'); await sleep(400);
    const v2 = await video(pg);
    check(!!v2 && v2.paused, 'leaving the table stops the video');
    await pg.close();
  }
  {
    const { pg } = await page(browser, TOK, 'refuse');
    check(await pg.evaluate(() => window.__locks) === 0, 'lock refused when the table opens: none held');
    await tap(pg);
    check(await pg.evaluate(() => window.__locks) === 1, 'refused lock: the next tap at the table asks again and gets it');
    const v = await video(pg);
    check(!v || v.paused, 'with the lock held the video is not playing');
    await tap(pg);
    check(await pg.evaluate(() => window.__locks) === 1, 'more taps ask for no second lock');
    await pg.click('#lobbyBtn'); await sleep(400);
    check(await pg.evaluate(() => window.__locks) === 0, 'leaving the table releases the lock');
    await pg.close();
  }
  {
    const { pg } = await page(browser, TOK, 'grant');
    check(await pg.evaluate(() => window.__locks) === 1, 'Wake Lock API granted: one lock held at the table');
    await tap(pg);
    check(!(await video(pg)), 'granted: no video is ever made');
    await pg.close();
  }
  await browser.close();
  console.log(`t_keep_awake: ${oks} ok, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
