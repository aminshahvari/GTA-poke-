// Live at Blindrise in the app (Issue #25), club switching and dominoes on, at 390x844, 320x568 and 1280x800:
// - a member club's home opens with the games headline, above everything else, empty or not
// - Watch takes a member of another club to a live table in two taps (Watch, then the table), read-only, no chat
// - "Back to <club>" returns them to their own club; their club choice is never changed
// - a registered player's "Go to your seat" takes them to their seat
// - Watch the board opens the domino TV board straight away
// Usage: PLAYWRIGHT=/path/to/playwright-core CHROMIUM=/path/to/chromium [FONTS_DIR=..] node test/ui/t_live_ui.js [shotDir]
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require(require.resolve('ws', { paths: [path.join(__dirname, '..', '..')] }));
const { chromium } = require(process.env.PLAYWRIGHT || process.env.PLAYWRIGHT_CORE || 'playwright-core');
const SHOTS = process.argv[2];
if(SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const ROOT = path.join(__dirname, '..', '..');
const PORT = 6300 + Math.floor(Math.random() * 200), BASE = 'http://127.0.0.1:' + PORT, DATA = path.join(require('os').tmpdir(), 't_live_ui_' + PORT + '_' + process.pid + '.json');
try{ fs.unlinkSync(DATA); }catch(e){}
const srv = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '1', STAGING: '', CLUBS_DEFAULT: 'on', CLUB_SWITCHING: '1', DOMINO: '1', DATABASE_URL: '', TIME_BANK_MS: '60000', LEVEL_MS: '600000', BREAKS: '0' }, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, oks = 0;
const check = (ok, msg) => { ok ? oks++ : fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
const api = (p, body, tok, club) => fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}), ...(club ? { 'x-club': club } : {}) }, body: JSON.stringify(body || {}) }).then(r => r.json());
let browser;
async function page(tok, [w, h], club){
  const c = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 800, hasTouch: w < 800, deviceScaleFactor: 2 });
  await c.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => { const u = r.request().url(), dir = process.env.FONTS_DIR;
    if(!dir) return r.abort();
    if(u.includes('fonts.googleapis.com/css2')) return r.fulfill({ status: 200, contentType: 'text/css', body: fs.readFileSync(path.join(dir, 'fonts.css')) });
    const f = path.join(dir, u.slice('https://fonts.gstatic.com/'.length).replace(/\//g, '_'));
    return fs.existsSync(f) ? r.fulfill({ status: 200, contentType: 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) }) : r.abort(); });
  const pg = await c.newPage();
  await pg.goto(BASE + '/');
  await pg.evaluate(([t, cl]) => { localStorage.setItem('stacked:token', JSON.stringify(t)); if(cl) localStorage.setItem('stacked:club', JSON.stringify(cl)); }, [tok, club]);
  await pg.reload(); await pg.evaluate(() => document.fonts.ready); await sleep(800);
  return pg;
}
function sock(tok, club){
  return new Promise(res => { const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws'); ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: tok, club }))); ws.on('message', m => { if(JSON.parse(m).t === 'club' && !ws.ready){ ws.ready = true; res(ws); } }); });
}
const noSideScroll = pg => pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const shot = (pg, name) => SHOTS ? pg.screenshot({ path: path.join(SHOTS, name) }) : null;
const firstInHome = pg => pg.evaluate(() => { const b = document.getElementById('lobbyBody'), f = b && b.firstElementChild; return f ? f.className : null; });
(async () => {
  for(let i = 0; i < 50; i++){ try{ if((await fetch(BASE + '/healthz')).ok) break; }catch(e){} await sleep(200); }
  const O = (await api('setup', { code: 'secret', name: 'Test Director', pin: '1234', agree: true })).token;
  const mk = async (name, club) => (await api('redeem', { code: (await api('invite', {}, O, club)).code, name, pin: '1357', agree: true })).token;
  const Ali = await mk('Test Ali'), Bea = await mk('Test Bea');
  const H = (await api('createClub', { name: 'Harbour Club', code: 'secret', rulesV: 1, acceptRules: true }, O)).club;
  const Pia = await mk('Test Pia', H);
  await api('joinInvite', { code: (await api('invite', {}, O, H)).code }, Ali);
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });

  // ---------- nothing on: the headline is still there, at the top ----------
  {
    const pg = await page(Pia, [390, 844], H);
    check((await firstInHome(pg) || '').includes('lv-head'), 'the games headline is the first thing on a member club\'s home');
    check(/No Blindrise game right now/.test(await pg.locator('.lv-head').textContent()), 'with nothing on, it says games show here');
    await shot(pg, 'live-empty-390.png');
    await pg.context().close();
  }

  // ---------- a Blindrise club tournament runs, and dominoes are open ----------
  const so = await sock(O), sa = await sock(Ali), sb = await sock(Bea);
  so.send(JSON.stringify({ t: 'create', name: 'Tuesday Night Tournament', stack: 10000, levelMin: 60, tableSize: 6, lateLevels: 0 })); await sleep(400);
  sa.send(JSON.stringify({ t: 'join' })); sb.send(JSON.stringify({ t: 'join' })); await sleep(400);
  so.send(JSON.stringify({ t: 'start' })); await sleep(800);
  await api('dominoCreate', { name: 'Domino Night', preset: 'allfives', format: 'hu', target: 150, tables: 2, roundMin: 0 }, O);
  for(const sz of [[390, 844], [320, 568], [1280, 800]]){
    const pg = await page(Pia, sz, H), tag = sz[0];
    const txt = await pg.locator('.lv-head').textContent();
    check(/Tuesday Night Tournament/.test(txt) && /Live/.test(txt) && /2 of 2 left/.test(txt) && /Domino Night/.test(txt) && /Registration open/.test(txt), `${tag}: the headline shows the live tournament and the open dominoes`);
    check(!/Test Ali|Test Bea/.test(txt), `${tag}: and never who is playing`);
    check(await pg.locator('.lv-head [data-live=watch-main]').isVisible(), `${tag}: Watch is offered`);
    check(await noSideScroll(pg), `${tag}: no sideways scroll`);
    await shot(pg, `live-headline-${tag}.png`);
    await pg.context().close();
  }

  // ---------- two taps to a live table ----------
  {
    const pg = await page(Pia, [390, 844], H);
    await pg.click('.lv-head [data-live=watch-main]'); await pg.waitForLoadState('load'); await sleep(1200);   // tap 1
    check(await pg.locator('.lv-watch').isVisible() && await pg.locator('#tabs').isHidden(), 'Watch opens the watch screen (no club tabs)');
    check(await pg.evaluate(() => JSON.parse(localStorage.getItem('stacked:club'))) === H, 'the member\'s own club choice is unchanged');
    await shot(pg, 'live-watch-390.png');
    await pg.click('.lv-tables [data-wt]'); await sleep(1200);                                                    // tap 2
    check(await pg.locator('#game').isVisible() && await pg.locator('#seats .seat').count() >= 2, 'the second tap shows the live table');
    check(await pg.locator('#chatBtn').isHidden(), 'no chat button while watching');
    check(!/Fold|Call|Check/.test(await pg.locator('#controls').textContent()), 'no action buttons');
    await shot(pg, 'live-table-390.png');
    await pg.click('#lobbyBtn'); await sleep(500);
    check(await pg.locator('.lv-watch').isVisible(), 'Lobby goes back to the watch screen');
    await pg.click('.lv-watch [data-live=home]'); await pg.waitForLoadState('load'); await sleep(1200);
    check(await pg.locator('.lv-head').isVisible() && !(await pg.evaluate(() => sessionStorage.getItem('watch'))) && await pg.locator('#tabs').isVisible(), 'Back returns to the member\'s own club home');
    await pg.context().close();
  }

  // ---------- a registered player reaches their seat ----------
  {
    const pg = await page(Ali, [390, 844], H);
    check(await pg.locator('.lv-head [data-live=seat-main]').isVisible(), 'a seated player sees "Go to your seat" in their other club');
    await shot(pg, 'live-seat-390.png');
    await pg.click('.lv-head [data-live=seat-main]'); await pg.waitForLoadState('load'); await sleep(1500);
    check(await pg.locator('#game').isVisible() && await pg.evaluate(() => JSON.parse(localStorage.getItem('stacked:club'))) === 'main', 'one tap takes them to their seat in the Blindrise club');
    await pg.context().close();
  }

  // ---------- the domino board ----------
  await api('dominoJoin', {}, Ali); await api('dominoJoin', {}, Bea); await api('dominoStart', {}, O); await sleep(400);
  {
    const pg = await page(Pia, [390, 844], H);
    check(await pg.locator('.lv-head [data-live=board]').isVisible(), 'running dominoes offer Watch the board');
    await pg.click('.lv-head [data-live=board]'); await pg.waitForLoadState('load'); await sleep(1500);
    check(await pg.locator('#dmTV').isVisible() && /Domino Night/.test(await pg.locator('#dmTV').textContent()), 'it opens the domino TV board');
    check(await pg.locator('#dmTV [data-dm], #dmPad').count() === 0, 'read-only: no scorepad or director buttons');
    await shot(pg, 'live-board-390.png');
    await pg.context().close();
  }
  {
    const pg = await page(Pia, [1280, 800], H);
    await pg.click('.lv-head [data-live=board]'); await pg.waitForLoadState('load'); await sleep(1500);
    check(await pg.locator('#dmTV').isVisible(), '1280: the board opens');
    await shot(pg, 'live-board-1280.png');
    await pg.context().close();
  }

  for(const s of [so, sa, sb]) s.close();
  await browser.close(); srv.kill(); try{ fs.unlinkSync(DATA); }catch(e){}
  console.log(`\n${oks} ok, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(async e => { console.error('FAIL', e.stack || e.message); try{ await browser.close(); }catch(x){} srv.kill(); process.exit(1); });
