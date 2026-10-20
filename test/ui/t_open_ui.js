// The Blindrise Open in the app (browser, 390x844 and 320x568), club switching on:
// - the founder's Director offers "Run the Blindrise Open" and takes him there, where Director runs its tournaments
// - every club shows the Blindrise Open card with counts only; Register asks first, then the card says you're in
// - inside it: no Exchange, Prizes or invites; players and seats show table names, look-alikes with their club tag
// Usage: PLAYWRIGHT=/path/to/playwright-core CHROMIUM=/path/to/chromium [FONTS_DIR=..] node test/ui/t_open_ui.js [shotDir]
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require(require.resolve('ws', { paths: [path.join(__dirname, '..', '..')] }));
const { chromium } = require(process.env.PLAYWRIGHT || process.env.PLAYWRIGHT_CORE || 'playwright-core');
const SHOTS = process.argv[2];
if(SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const ROOT = path.join(__dirname, '..', '..');
const PORT = 6100 + Math.floor(Math.random() * 200), BASE = 'http://127.0.0.1:' + PORT, DATA = path.join(require('os').tmpdir(), 't_open_ui_' + PORT + '_' + process.pid + '.json');
try{ fs.unlinkSync(DATA); }catch(e){}
const srv = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '1', STAGING: '', CLUBS_DEFAULT: 'on', CLUB_SWITCHING: '1', DATABASE_URL: '', TIME_BANK_MS: '60000' }, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, oks = 0;
const check = (ok, msg) => { ok ? oks++ : fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
const api = (p, body, tok, club) => fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}), ...(club ? { 'x-club': club } : {}) }, body: JSON.stringify(body || {}) }).then(r => r.json());
let browser;
async function page(tok, [w, h], club){
  const c = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await c.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => { const u = r.request().url(), dir = process.env.FONTS_DIR;
    if(!dir) return r.abort();
    if(u.includes('fonts.googleapis.com/css2')) return r.fulfill({ status: 200, contentType: 'text/css', body: fs.readFileSync(path.join(dir, 'fonts.css')) });
    const f = path.join(dir, u.slice('https://fonts.gstatic.com/'.length).replace(/\//g, '_'));
    return fs.existsSync(f) ? r.fulfill({ status: 200, contentType: 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) }) : r.abort(); });
  const pg = await c.newPage();
  await pg.goto(BASE + '/');
  await pg.evaluate(([t, cl]) => { localStorage.setItem('stacked:token', JSON.stringify(t)); if(cl) localStorage.setItem('stacked:club', JSON.stringify(cl)); }, [tok, club]);
  await pg.reload(); await pg.evaluate(() => document.fonts.ready); await sleep(700);
  return pg;
}
// the founder's director socket in the Blindrise Open
function director(tok){
  return new Promise(res => { const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws'); ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: tok, club: 'events' }))); ws.on('message', m => { if(JSON.parse(m).t === 'club') res(ws); }); });
}
const noSideScroll = pg => pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const fits = async (pg, sel, w) => { const b = await pg.locator(sel).first().boundingBox(); return !!b && b.x >= 0 && b.x + b.width <= w + 1; };
const shot = (pg, name) => SHOTS ? pg.screenshot({ path: path.join(SHOTS, name) }) : null;
(async () => {
  for(let i = 0; i < 50; i++){ try{ if((await fetch(BASE + '/healthz')).ok) break; }catch(e){} await sleep(200); }
  const O = (await api('setup', { code: 'secret', name: 'Test Director', pin: '1234', agree: true })).token;
  const mk = async (name, club) => (await api('redeem', { code: (await api('invite', {}, O, club)).code, name, pin: '1357', agree: true })).token;
  const Ali = await mk('Ali'), Bea = await mk('Test Bea'), Cy = await mk('Test Cy');
  const H = (await api('createClub', { name: 'Harbour Club', code: 'secret', rulesV: 1, acceptRules: true }, O)).club;
  const Al2 = await mk('AIi', H);
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });

  // ---------- the founder opens it ----------
  {
    const pg = await page(O, [390, 844], 'main');
    await pg.click('#tabs [data-tab=director]'); await sleep(400);
    check(await pg.locator('#runEventsBtn').isVisible(), 'the founder\'s Director offers "Run the Blindrise Open"');
    await pg.locator('#runEventsBtn').scrollIntoViewIfNeeded(); await shot(pg, 'founder-run-390.png');
    await pg.click('#runEventsBtn'); await pg.waitForLoadState('load'); await sleep(1200);
    check(await pg.evaluate(() => JSON.parse(localStorage.getItem('stacked:club'))) === 'events' && /Blindrise Open/.test(await pg.locator('#clubBtn').textContent()), 'it takes him into the Blindrise Open');
    await pg.click('#tabs [data-tab=director]'); await sleep(400);
    check(await pg.locator('#inviteBtn').count() === 0 && await pg.locator('#runEventsBtn').count() === 0 && await pg.locator('#clubsBtn').count() === 0, 'its Director has no invites, Exchange switch or platform cards');
    check(await pg.locator('#tabs [data-tab=biz]').isHidden(), 'no Exchange tab in it, even for the founder');
    await pg.context().close();
  }
  const dws = await director(O);
  dws.send(JSON.stringify({ t: 'create', name: 'Blindrise Open Night', stack: 30000, levelMin: 15, tableSize: 6, lateLevels: 0, startAt: Date.now() + 3 * 3600000 }));
  await sleep(500);
  await api('eventJoin', {}, Ali); await api('eventJoin', {}, Al2, H);

  // ---------- the card in a club, and registering ----------
  for(const [vp, tok] of [[[390, 844], Bea], [[320, 568], Cy]]){
    const w = vp[0], pg = await page(tok, vp, 'main');
    const card = pg.locator('.bo-card');
    check(await card.isVisible() && /Blindrise Open Night/.test(await card.textContent()) && new RegExp((w === 390 ? 2 : 3) + '\\s*registered').test(await card.textContent()), `${w}px: Home shows the Blindrise Open card with the count`);
    check(!/Ali|AIi/.test(await card.textContent()), `${w}px: the card never says who registered`);
    check(await fits(pg, '.bo-card', w) && await fits(pg, '.bo-card [data-bev=join]', w) && await noSideScroll(pg), `${w}px: the card and its button fit, no sideways scroll`);
    await card.scrollIntoViewIfNeeded(); await shot(pg, `open-card-${w}.png`);
    await pg.click('.bo-card [data-bev=join]'); await sleep(250);
    check(/table name/.test(await pg.locator('.modal').textContent()) && (await pg.locator('.modal').textContent()).includes(w === 390 ? 'Test Bea' : 'Test Cy'), `${w}px: Register asks first and says which name they will play under`);
    await shot(pg, `open-register-${w}.png`);
    await pg.click('.modal button:has-text("Register")'); await sleep(900);
    check(/You're registered/.test(await card.textContent()) && await pg.locator('.bo-card [data-bev=leave]').isVisible() && new RegExp((w === 390 ? 3 : 4) + '\\s*registered').test(await card.textContent()), `${w}px: the card then says you're registered, with Unregister`);
    check(await pg.locator('#clubBtn').isVisible(), `${w}px: the club button appears (the Blindrise Open is now one of your clubs)`);
    await card.scrollIntoViewIfNeeded(); await shot(pg, `open-registered-${w}.png`);
    await pg.context().close();
  }

  // ---------- inside it ----------
  for(const vp of [[390, 844], [320, 568]]){
    const w = vp[0], pg = await page(Al2, vp, H);
    await pg.locator('.bo-card [data-bev=go]').click(); await pg.waitForLoadState('load'); await sleep(1200);
    check(/The Open/.test(await pg.locator('.lx-hello').textContent()) && await pg.locator('[data-lx=biz]').count() === 0, `${w}px: inside, Home is the Open, with no Exchange doors`);
    check(await pg.locator('#tabs [data-tab=biz]').isHidden() && await pg.locator('[data-invite]').count() === 0 && await pg.locator('.coming-box').count() === 0, `${w}px: no Exchange tab, invite card or Coming soon card`);
    check(await noSideScroll(pg), `${w}px: no sideways scroll inside`);
    await shot(pg, `open-inside-${w}.png`);
    await pg.click('#tabs [data-tab=board]'); await sleep(300);
    check(await pg.locator('[data-bseg=prizes]').count() === 0, `${w}px: the Leaderboard has no Prizes`);
    await pg.context().close();
  }

  // ---------- at the table ----------
  dws.send(JSON.stringify({ t: 'start' })); await sleep(1500);
  for(const vp of [[390, 844], [320, 568]]){
    const w = vp[0], pg = await page(Ali, vp, 'main');
    check(await pg.locator('.bo-card [data-bev=go]').isVisible() && /Go to your table/.test(await pg.locator('.bo-card [data-bev=go]').textContent()), `${w}px: once it runs, a seated player's own club says "Go to your table"`);
    await pg.locator('.bo-card [data-bev=go]').click(); await pg.waitForLoadState('load'); await sleep(1800);
    const nms = await pg.locator('#seats .nm').allTextContents();
    check(nms.includes('AIi (HC)') && !nms.some(n => /Ali|AIi/.test(n) && !/\(/.test(n)), `${w}px: the seats show the look-alike names with their club tag: ${nms.join(', ')}`);
    const hero = await pg.locator('#seats .seat.hero .nm').textContent();
    check(hero === 'Ali (BLI)', `${w}px: the player's own seat too: ${hero}`);
    check(await noSideScroll(pg), `${w}px: no sideways scroll at the table`);
    await shot(pg, `open-table-${w}.png`);
    await pg.context().close();
  }
  dws.close();
  await browser.close();
  console.log(`\nt_open_ui: ${oks} ok, ${fails} failed`);
  srv.kill(); try{ fs.unlinkSync(DATA); }catch(e){}
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); srv.kill(); try{ fs.unlinkSync(DATA); }catch(x){} process.exit(1); });
