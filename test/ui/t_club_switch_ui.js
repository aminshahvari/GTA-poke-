// Club switching in the app (browser, 390x844 and 320x568): someone in two clubs sees the club button next to their name,
// can pick the other club and lands in it (its own members, no Director for a plain member); someone in one club sees
// no button; the organizer's Director lists the clubs and opens a new one with the setup code.
// Runs on a staging-mode server (STAGING=1 turns club switching on). Usage: node test/ui/t_club_switch_ui.js [screenshot dir]
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const SHOTS = process.argv[2];
const ROOT = path.join(__dirname, '..', '..');
const PORT = 4900 + Math.floor(Math.random() * 100), BASE = 'http://127.0.0.1:' + PORT, DATA = '/tmp/t_club_switch_ui_' + PORT + '.json';
const srv = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '1', STAGING: '1', DATABASE_URL: '' }, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, oks = 0;
const check = (ok, msg) => { ok ? oks++ : fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
const post = (p, body, tok, club) => fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}), ...(club ? { 'x-club': club } : {}) }, body: JSON.stringify(body || {}) }).then(r => r.json());
async function signedIn(browser, tok, [w, h]){
  const pg = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await pg.goto(BASE + '/'); await pg.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), tok);
  await pg.reload(); await pg.evaluate(() => document.fonts.ready); await sleep(500);
  return pg;
}
(async () => {
  for(let i = 0; i < 40; i++){ try{ if((await fetch(BASE + '/healthz')).ok) break; }catch(e){} await sleep(150); }
  await sleep(500);
  const dir = (await post('login', { name: 'Test Director', pin: '246810' })).token;
  const p1 = (await post('login', { name: 'Test Player 01', pin: '135711' })).token;
  const p2 = (await post('login', { name: 'Test Player 02', pin: '135722' })).token;
  const B = (await post('createClub', { name: 'Test Lounge Two', code: 'secret' }, dir)).club;
  const code = (await post('invite', {}, dir, B)).code;
  const j = await post('joinClub', { code }, p1);
  check(B && j.club === B, 'test club made and Test Player 01 joined it');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  for(const vp of [[390, 844], [320, 568]]){
    const pg = await signedIn(browser, p1, vp);
    const btn = pg.locator('#clubBtn');
    check(await btn.isVisible(), `${vp[0]}px: two-club member sees the club button`);
    const box = await btn.boundingBox(), me = await pg.locator('#meBtn').boundingBox();
    check(box && me && box.x >= 0 && box.x + box.width <= vp[0] && me.x + me.width <= vp[0] + 1, `${vp[0]}px: club button and name fit the top bar`);
    check(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${vp[0]}px: no sideways scroll`);
    if(SHOTS) await pg.screenshot({ path: path.join(SHOTS, `club-bar-${vp[0]}.png`) });
    await btn.click(); await sleep(300);
    const picks = await pg.locator('.club-pick').allTextContents();
    check(picks.length === 2 && picks.some(t => /Test Lounge Two/.test(t)), `${vp[0]}px: the picker lists both clubs`);
    if(SHOTS) await pg.screenshot({ path: path.join(SHOTS, `club-picker-${vp[0]}.png`) });
    const other = await pg.evaluate(() => [...document.querySelectorAll('.club-pick')].find(b => !b.classList.contains('on')).dataset.v);
    await pg.locator(`.club-pick[data-v="${other}"]`).click();
    await pg.waitForLoadState('load'); await sleep(900);
    const now = await pg.evaluate(() => JSON.parse(localStorage.getItem('stacked:club')));
    check(now === other, `${vp[0]}px: picking a club switches to it`);
    check((await pg.locator('#clubBtn').textContent()).trim().length > 0, `${vp[0]}px: the button shows the current club's name`);
    check(await pg.locator('#dirTab').isHidden(), `${vp[0]}px: a plain member has no Director tab in either club`);
    if(SHOTS) await pg.screenshot({ path: path.join(SHOTS, `club-switched-${vp[0]}.png`) });
    await pg.close();
  }
  // one-club member: nothing changes
  const pg2 = await signedIn(browser, p2, [390, 844]);
  check(await pg2.locator('#clubBtn').count() === 0, 'one-club member sees no club button');
  await pg2.close();
  // organizer: Director lists the clubs and opens a new one
  const pd = await signedIn(browser, dir, [390, 844]);
  await pd.evaluate(() => localStorage.setItem('stacked:club', JSON.stringify('main'))); await pd.reload(); await sleep(600);
  await pd.click('#tabs [data-tab=director]'); await sleep(400);
  check(await pd.locator('#newClubBtn').isVisible(), 'organizer sees "Open a new club" in Director');
  await pd.click('#newClubBtn'); await sleep(200);
  await pd.fill('#ncName', 'Second Test Club'); await pd.fill('#ncCode', 'secret');
  await pd.click('.modal button:has-text("Open club")'); await sleep(700);
  const listed = await pd.locator('#lobby .card-box:has(#newClubBtn) .trow b').allTextContents();
  check(listed.includes('Second Test Club') && listed.length === 3, 'the new club is listed in Director');
  check(await pd.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll on Director');
  if(SHOTS){ await pd.locator('#newClubBtn').scrollIntoViewIfNeeded(); await pd.screenshot({ path: path.join(SHOTS, 'club-director-390.png') }); }
  await browser.close();
  console.log(`\n${oks} ok, ${fails} failed`);
  srv.kill(); try{ require('fs').unlinkSync(DATA); }catch(e){}
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); srv.kill(); process.exit(1); });
