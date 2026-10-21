// Dominoes in the app (browser, 390x844 and 320x568), DOMINO=1:
// - the director opens registration from the Director form; members register from the Home card
// - after the start, each player's Home shows their match and table; the scorepad records an All Fives scoring play
//   and a hand (pips only), the other phone updates live, both confirm, the result is final
// - Undo asks for confirmation first (Back changes nothing)
// - the director's TV board follows the live table (phone and 1280x720) and names the winner
// - Home then names the winner and shows the club's domino rankings
// - the scorepad fits the screen with no sideways scroll; screenshots of each step
// Usage: PLAYWRIGHT_CORE=/path/to/playwright-core CHROMIUM=/path/to/chromium [FONTS_DIR=..] node test/ui/t_domino_ui.js [shotDir]
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT || process.env.PLAYWRIGHT_CORE || 'playwright-core');
const SHOTS = process.argv[2];
if(SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const ROOT = path.join(__dirname, '..', '..');
const PORT = 5950 + Math.floor(Math.random() * 200), BASE = 'http://127.0.0.1:' + PORT, DATA = path.join(require('os').tmpdir(), 't_domino_ui_' + PORT + '.json');
const srv = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '1', STAGING: '', CLUBS_DEFAULT: 'on', CLUB_SWITCHING: '1', DOMINO: '1', DATABASE_URL: '' }, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, oks = 0;
const check = (ok, msg) => { ok ? oks++ : fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
const api = (p, body, tok) => fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body || {}) }).then(r => r.json());
let browser;
async function page(tok, [w, h]){
  const c = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await c.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => { const u = r.request().url(), dir = process.env.FONTS_DIR;
    if(!dir) return r.abort();
    if(u.includes('fonts.googleapis.com/css2')) return r.fulfill({ status: 200, contentType: 'text/css', body: fs.readFileSync(path.join(dir, 'fonts.css')) });
    const f = path.join(dir, u.slice('https://fonts.gstatic.com/'.length).replace(/\//g, '_'));
    return fs.existsSync(f) ? r.fulfill({ status: 200, contentType: 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) }) : r.abort(); });
  const pg = await c.newPage();
  await pg.goto(BASE + '/');
  await pg.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), tok);
  await pg.reload(); await pg.evaluate(() => document.fonts.ready); await sleep(700);
  return pg;
}
const noSideScroll = pg => pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth && (!document.getElementById('dmPad') || document.getElementById('dmPad').scrollWidth <= innerWidth));
const shot = (pg, name) => SHOTS ? pg.screenshot({ path: path.join(SHOTS, name) }) : null;
(async () => {
  for(let i = 0; i < 50; i++){ try{ if((await fetch(BASE + '/healthz')).ok) break; }catch(e){} await sleep(200); }
  const O = (await api('setup', { code: 'secret', name: 'Founder', pin: '1234', agree: true })).token;
  const mk = async name => (await api('redeem', { code: (await api('invite', {}, O)).code, name, pin: '1357', agree: true })).token;
  const Ann = await mk('Annabelle Moreau'), Ben = await mk('Ben');
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });

  for(const vp of [[390, 844], [320, 568]]){
    const w = vp[0];
    // director: the form
    const dp = await page(O, vp);
    await dp.click('#tabs [data-tab=director]'); await sleep(400);
    await dp.locator('#dmForm').scrollIntoViewIfNeeded(); await shot(dp, `director-form-${w}.png`);
    check(await dp.locator('#dmForm').isVisible() && await noSideScroll(dp), `${w}px: the director sees the domino form, no sideways scroll`);
    await dp.fill('#dmName', 'Tuesday Dominoes'); await dp.selectOption('#dmPreset', 'allfives'); await dp.fill('#dmTables', '2');
    await dp.click('#dmForm button[type=submit]'); await sleep(500);
    check(/Registration open/.test(await dp.locator('.dm-card').first().textContent()), `${w}px: registration opens`);
    // members register from Home
    const a = await page(Ann, vp), b = await page(Ben, vp);
    for(const p of [a, b]){ await p.locator('[data-dm=join]').click(); await sleep(300); }
    check(/you're in/.test(await a.locator('.dm-card').textContent()), `${w}px: the Home card says you're in`);
    await a.locator('.dm-card').scrollIntoViewIfNeeded(); await shot(a, `home-registered-${w}.png`);
    await dp.locator('[data-dm=start]').click(); await sleep(700);
    // a player's Home: their match and table
    const card = await a.locator('.dm-card').textContent();
    check(/Your match · Table 1/.test(card) && /0 – 0/.test(card), `${w}px: after the start, Home shows "Your match · Table 1" and 0 – 0`);
    await a.locator('.dm-card').scrollIntoViewIfNeeded(); await shot(a, `home-match-${w}.png`);
    // scorepad
    await a.locator('[data-dm=pad]').first().click(); await sleep(300);
    await b.locator('[data-dm=pad]').first().click(); await sleep(300);
    check(await a.locator('#dmPad').isVisible() && await noSideScroll(a), `${w}px: the scorepad opens full screen, no sideways scroll`);
    await shot(a, `scorepad-${w}.png`);
    await a.locator('[data-dmp=count][data-p="15"]').click(); await sleep(500);
    const sc = async p => (await p.locator('.dm-score').allTextContents()).map(Number);
    check(JSON.stringify(await sc(a)) === JSON.stringify([15, 0]) && JSON.stringify(await sc(b)) === JSON.stringify([15, 0]), `${w}px: a +15 scoring play shows on both phones (15 – 0)`);
    // Undo asks first: Back changes nothing; "Undo it" takes the 15 away on both phones; then the play is entered again
    await a.locator('[data-dmp=undo]').first().click(); await sleep(200);
    check(/Undo #1\?/.test(await a.locator('#modalRoot').textContent()) && /\+15/.test(await a.locator('#modalRoot').textContent()), `${w}px: Undo asks for confirmation and names what it takes away (+15)`);
    await a.click('#modalRoot button:has-text("Back")'); await sleep(300);
    check(JSON.stringify(await sc(b)) === JSON.stringify([15, 0]), `${w}px: Back leaves the score as it was`);
    await a.locator('[data-dmp=undo]').first().click(); await sleep(200);
    await a.click('#modalRoot button:has-text("Undo it")'); await sleep(500);
    check(JSON.stringify(await sc(b)) === JSON.stringify([0, 0]) && await a.locator('.dm-ev.undone').count() === 1, `${w}px: "Undo it" takes the 15 away on both phones and keeps it crossed out in the record`);
    await a.locator('[data-dmp=count][data-p="15"]').click(); await sleep(500);
    // the director's TV board (read-only) follows the same match live, on the phone and on a big screen
    await dp.locator('[data-dm=tv]').click(); await sleep(300);
    const tile = async p => (await p.locator('#dmTV .dm-tile').allTextContents()).join(' ');
    check(await dp.locator('#dmTV').isVisible() && /Table 1/.test(await tile(dp)) && /15/.test(await tile(dp)) && await noSideScroll(dp) && await dp.locator('#dmTV button:not([data-tv])').count() === 0,
      `${w}px: the TV board shows Table 1 at 15 – 0, has no scoring buttons, and no sideways scroll`);
    await shot(dp, `tv-board-${w}.png`);
    if(w === 390){
      const tvp = await page(O, [1280, 720]); await tvp.click('#tabs [data-tab=director]'); await sleep(300); await tvp.locator('[data-dm=tv]').click(); await sleep(400);
      check(await tvp.locator('#dmTV .dm-tile').count() === 1 && await noSideScroll(tvp), '1280x720: the TV board fills a big screen with the live table');
      await shot(tvp, 'tv-board-1280.png'); await tvp.context().close();
    }
    await a.locator('[data-dmp=hand]').click(); await sleep(200);
    await shot(a, `hand-sheet-${w}.png`);
    const uids = await a.locator('.dm-pip').evaluateAll(xs => xs.map(x => [x.dataset.uid, x.disabled]));
    check(uids.length === 2 && uids[0][1] === true, `${w}px: the hand sheet asks pips per player; whoever went out is fixed at 0`);
    await a.locator('.dm-pip:not([disabled])').fill('138'); await a.click('#modalRoot button:has-text("Record hand")'); await sleep(500);
    check(JSON.stringify(await sc(a)) === JSON.stringify([15, 0]), `${w}px: an impossible hand (138 pips) is refused and nothing changes`);
    await a.locator('[data-dmp=hand]').click(); await sleep(200);
    await a.locator('.dm-pip:not([disabled])').fill('84'); await a.click('#modalRoot button:has-text("Record hand")'); await sleep(500);
    check(JSON.stringify(await sc(b)) === JSON.stringify([100, 0]), `${w}px: going out on 84 pips scores 85 (rounded): 100 – 0 on the other phone too`);
    await a.locator('[data-dmp=hand]').click(); await sleep(200);
    await a.locator('.dm-pip:not([disabled])').fill('50'); await a.click('#modalRoot button:has-text("Record hand")'); await sleep(500);
    check(/Confirm the result/.test(await a.locator('.dm-status').textContent()) && await a.locator('[data-dmp=confirm]').isVisible(), `${w}px: 150 reached: both sides are asked to confirm`);
    await shot(a, `scorepad-review-${w}.png`);
    await a.locator('[data-dmp=confirm]').click(); await sleep(300);
    await b.locator('[data-dmp=confirm]').click(); await sleep(500);
    check(/won/.test(await b.locator('.dm-final').textContent()) && /Final/.test(await a.locator('.dm-status').textContent()), `${w}px: both confirmed: final on both phones`);
    check(await noSideScroll(a) && await noSideScroll(b), `${w}px: no sideways scroll on the record`);
    await shot(b, `scorepad-final-${w}.png`);
    check(/Winner/.test(await dp.locator('#dmTV').textContent()), `${w}px: the TV board names the winner when it is over`);
    await shot(dp, `tv-board-final-${w}.png`); await dp.locator('[data-tv=close]').click();
    await b.locator('[data-dmp=close]').click(); await sleep(300);
    const fin = await b.locator('.dm-card').first().textContent();
    check(/Winner: (Annabelle Moreau|Ben)/.test(fin) && /Club rankings/.test(fin) && await b.locator('.dm-rank').count() === 2 && await noSideScroll(b), `${w}px: Home names the winner and shows the club's domino rankings, no sideways scroll`);
    await b.locator('.dm-ranks').scrollIntoViewIfNeeded(); await shot(b, `home-rankings-${w}.png`);
    for(const p of [a, b, dp]) await p.context().close();
  }
  await browser.close(); srv.kill(); try{ fs.unlinkSync(DATA); }catch(e){}
  console.log(`t_domino_ui: ${oks} ok, ${fails} failed`); process.exit(fails ? 1 : 0);
})().catch(async e => { console.error(e); try{ await browser.close(); }catch(_){} srv.kill(); process.exit(1); });
