// Blindrise platform screens in the app (browser, 390x844 and 320x568), club switching on:
// - a business member sees "Create your club" on Home; it opens the Club Rules first (Continue waits for the tick), then the name
// - the founder's Director: clubs with counts only and Suspend / Restore / Cancel, the moderation log, the broadcast form
// - a member of a suspended club sees the notice instead of the club; Blindrise posts show badged in every club
// - addresses in a Blindrise post are tappable links; markup in a post shows as text and never runs
// Usage: PLAYWRIGHT=/path/to/playwright-core CHROMIUM=/path/to/chromium [FONTS_DIR=..] node test/ui/t_platform_ui.js [shotDir]
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT || process.env.PLAYWRIGHT_CORE || 'playwright-core');
const SHOTS = process.argv[2];
if(SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const ROOT = path.join(__dirname, '..', '..');
const PORT = 5700 + Math.floor(Math.random() * 200), BASE = 'http://127.0.0.1:' + PORT, DATA = path.join(require('os').tmpdir(), 't_platform_ui_' + PORT + '.json');
const srv = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '1', STAGING: '', CLUBS_DEFAULT: 'on', CLUB_SWITCHING: '1', DATABASE_URL: '' }, stdio: 'ignore' });
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
const noSideScroll = pg => pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const inView = async (pg, sel, w) => { const b = await pg.locator(sel).first().boundingBox(), h = pg.viewportSize().height; return !!b && b.x >= 0 && b.x + b.width <= w + 1 && b.y >= 0 && b.y + b.height <= h + 1; };
const shot = (pg, name) => SHOTS ? pg.screenshot({ path: path.join(SHOTS, name) }) : null;
(async () => {
  for(let i = 0; i < 50; i++){ try{ if((await fetch(BASE + '/healthz')).ok) break; }catch(e){} await sleep(200); }
  const O = (await api('setup', { code: 'secret', name: 'Founder', pin: '1234', agree: true })).token;
  const mk = async name => (await api('redeem', { code: (await api('invite', {}, O)).code, name, pin: '1357', agree: true })).token;
  const biz = name => ({ name, category: 'food', tagline: 'Fresh daily', about: 'A test business for this run.' });
  const Bo = await mk('Test Baker'), Cy = await mk('Test Cafe');
  for(const [t, nm] of [[Bo, 'Test Bakery'], [Cy, 'Test Cafe Co']]){ await api('bizSave', biz(nm), t); await api('bizPublish', { on: true }, t); }
  const B = (await api('createClub', { name: 'Test Lounge', code: 'secret', rulesV: 1, acceptRules: true }, O)).club;
  const P = (await api('redeem', { code: (await api('invite', {}, O, B)).code, name: 'Test Member', pin: '2468', agree: true })).token;
  await api('joinInvite', { code: (await api('invite', {}, O)).code }, P); // Test Member is in main and Test Lounge
  await api('platformPost', { kind: 'event', title: 'Blindrise Open Night', body: 'Every club is invited to a night of free social play.', when: Date.now() + 5 * 864e5 }, O);
  // a post with join links (one bare, as people paste them) and a hostile tail: only http(s) addresses become links
  const HOSTILE = 'javascript:alert(1) <img src=x onerror="window.__x=1"> <script>window.__x=1</script> "q" \'q\'';
  await api('platformPost', { kind: 'announcement', title: 'Join my club', body: `Tap ${BASE}/join/test-lounge or blindrise.com/join/test-lounge. ${HOSTILE}` }, O);
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });

  // ---------- business member: Create your club → rules → name ----------
  for(const vp of [[390, 844], [320, 568]]){
    const tok = vp[0] === 390 ? Bo : Cy, w = vp[0];
    const pg = await page(tok, vp, 'main');
    check(await pg.locator('#openClubBtn').isVisible(), `${w}px: a business member sees "Create your club" on Home`);
    check(await pg.locator('.br-post .br-badge').first().isVisible() && /Blindrise/.test(await pg.locator('.br-post .br-badge').first().textContent()), `${w}px: the Blindrise post shows on Home, badged Blindrise`);
    const lk = pg.locator('.br-post:has(h3:text("Join my club")) p a');
    const links = await lk.evaluateAll(as => as.map(a => [a.getAttribute('href'), a.textContent, a.target, a.rel, getComputedStyle(a).textDecorationLine, getComputedStyle(a).color]));
    check(links.length === 2 && links[0][0] === BASE + '/join/test-lounge' && links[1][0] === 'https://blindrise.com/join/test-lounge' && links[1][1] === 'blindrise.com/join/test-lounge', `${w}px: join links in a Blindrise post are links, the bare one gets https:// (${JSON.stringify(links.map(l => l[0]))})`);
    check(links.every(l => l[2] === '_blank' && /noopener/.test(l[3]) && l[4] === 'underline' && l[5] !== 'rgb(232, 235, 241)'), `${w}px: post links are underlined in gold and open safely in a new tab`);
    const post = pg.locator('.br-post:has(h3:text("Join my club"))');
    check(await post.locator('img, script, [onerror]').count() === 0 && (await post.locator('p').textContent()).includes(HOSTILE) && !(await pg.evaluate(() => window.__x)), `${w}px: markup and script: text in a post show as plain text and never run`);
    await post.scrollIntoViewIfNeeded(); await shot(pg, `broadcast-link-${w}.png`);
    check(await inView(pg, '.br-post:has(h3:text("Join my club")) p a', w) && await noSideScroll(pg), `${w}px: the link fits the screen, no sideways scroll`);
    const [tab] = await Promise.all([pg.context().waitForEvent('page'), lk.first().tap()]);
    await tab.waitForLoadState(); await tab.waitForFunction(() => /Test Lounge/.test(document.body.innerText), null, { timeout: 5000 }).catch(() => {}); check(tab.url() === BASE + '/join/test-lounge' && /Test Lounge/.test(await tab.evaluate(() => document.body.innerText)), `${w}px: tapping the link opens the club's join page`); await tab.close();
    await pg.locator('.br-post').first().scrollIntoViewIfNeeded(); await shot(pg, `broadcast-home-${w}.png`);
    await pg.click('#openClubBtn'); await sleep(250);
    const items = await pg.locator('.cr-rules p').allTextContents();
    check(items.length === 8 && items[0].startsWith('1. Your club, your responsibility') && /BLINDRISE CLUB RULES/.test(await pg.locator('.cr-rules h3').textContent()), `${w}px: the rules screen shows the 8 Club Rules in full`);
    check(await pg.locator('.modal button:has-text("Continue")').isDisabled(), `${w}px: Continue stays off until the rules are ticked`);
    check(await inView(pg, '.cr-agree', w) && await inView(pg, '.modal button:has-text("Continue")', w) && await noSideScroll(pg), `${w}px: the tick box and buttons fit the screen, no sideways scroll`);
    await shot(pg, `rules-${w}.png`);
    await pg.check('#crAgree');
    check(await pg.locator('.modal button:has-text("Continue")').isEnabled(), `${w}px: ticking enables Continue`);
    await shot(pg, `rules-ticked-${w}.png`);
    await pg.click('.modal button:has-text("Continue")'); await sleep(200);
    check(await pg.locator('#ncName').isVisible() && await pg.locator('#ncCode').count() === 0, `${w}px: then the name, with no setup code for a business member`);
    await shot(pg, `rules-name-${w}.png`);
    await pg.fill('#ncName', w === 390 ? 'Test Bakery Club' : 'Test Cafe Club');
    await pg.click('.modal button:has-text("Open club")'); await sleep(900);
    check(await pg.locator('#clubBtn').isVisible() && await pg.locator('#openClubBtn').count() === 0, `${w}px: the club is opened, the club button appears and the offer is gone`);
    // a club a member opens is practice only: tournaments are Blindrise's (owner decision of 2026-10-20)
    await pg.click('#clubBtn'); await sleep(200); await pg.click(`.club-pick:has-text("${w === 390 ? 'Test Bakery Club' : 'Test Cafe Club'}")`); await sleep(900);
    check(/Tournaments are run by Blindrise/.test(await pg.locator('#lobby').textContent()), `${w}px: its Home says tournaments are run by Blindrise`);
    await pg.click('#tabs [data-tab=director]'); await sleep(400);
    check(await pg.locator('#newForm').count() === 0 && /Run by Blindrise/.test(await pg.locator('#lobby').textContent()) && await pg.locator('.demo-box').count() > 0, `${w}px: its Director has no tournament form, only "Run by Blindrise" and the practice table`);
    await pg.locator('h3:text("Run by Blindrise")').scrollIntoViewIfNeeded(); await shot(pg, `member-club-director-${w}.png`);
    check(await noSideScroll(pg), `${w}px: no sideways scroll`);
    await pg.context().close();
  }

  // ---------- founder: Director clubs with counts, suspend control, broadcast ----------
  for(const vp of [[390, 844], [320, 568]]){
    const w = vp[0], pg = await page(O, vp, 'main');
    await pg.click('#tabs [data-tab=director]'); await sleep(400);
    const rows = await pg.locator('.pf-row').allTextContents();
    check(rows.length === 3 && rows.every(r => /member/.test(r) && /QR sign-up/.test(r)), `${w}px: Director lists the 3 other clubs with counts`);
    check(!rows.some(r => /Test Member|@/.test(r)) && !/Test Member|@example/.test(await pg.locator('.pf-card').first().textContent()), `${w}px: no member names or emails in the list`);
    await pg.locator('.pf-row [data-pfact=suspend]').first().scrollIntoViewIfNeeded();
    check(await inView(pg, '.pf-row [data-pfact=suspend]', w) && await noSideScroll(pg), `${w}px: the suspend control fits, no sideways scroll`);
    await pg.locator('.pf-card').first().scrollIntoViewIfNeeded(); await shot(pg, `founder-clubs-${w}.png`);
    const own = await pg.locator(`.pf-row[data-pfclub="${B}"]`).textContent(), theirs = await pg.locator('.pf-row:not([data-pfclub="' + B + '"])').allTextContents();
    check(/runs tournaments/.test(own) && !/Allow tournaments/.test(own) && theirs.length === 2 && theirs.every(r => /practice only/.test(r) && /Allow tournaments/.test(r)), `${w}px: his own club runs tournaments; members' clubs read practice only, with Allow tournaments`);
    check(await inView(pg, '.pf-row [data-pfact=host]', w) || (await pg.locator('.pf-row [data-pfact=host]').first().scrollIntoViewIfNeeded(), await inView(pg, '.pf-row [data-pfact=host]', w)), `${w}px: Allow tournaments fits the screen`);
    if(w === 390){
      await pg.click(`.pf-row[data-pfclub="${B}"] [data-pfact=suspend]`); await sleep(200);
      await shot(pg, `suspend-confirm-${w}.png`);
      await pg.fill('#pfReason', 'UI test'); await pg.click('.modal button:has-text("Suspend")'); await sleep(700);
      check(/Suspended/.test(await pg.locator(`.pf-row[data-pfclub="${B}"]`).textContent()) && await pg.locator(`.pf-row[data-pfclub="${B}"] [data-pfact=unsuspend]`).isVisible(), `${w}px: suspending marks the club Suspended and offers Restore`);
      await pg.locator('.pf-log summary').click(); await sleep(150);
      check(/Suspended · Test Lounge/.test(await pg.locator('.pf-log').textContent()), `${w}px: the log shows the suspension`);
      await pg.locator('#bcPost').scrollIntoViewIfNeeded(); await shot(pg, `founder-broadcast-${w}.png`);
    } else {
      check(/Suspended/.test(await pg.locator(`.pf-row[data-pfclub="${B}"]`).textContent()), `${w}px: the suspended club reads Suspended`);
      await pg.locator(`.pf-row[data-pfclub="${B}"]`).scrollIntoViewIfNeeded(); await shot(pg, `founder-suspended-${w}.png`);
    }
    await pg.context().close();
  }

  // ---------- a member of the suspended club ----------
  for(const vp of [[390, 844], [320, 568]]){
    const w = vp[0], pg = await page(P, vp, B);
    check(await pg.locator('.cs-notice').isVisible() && /Test Lounge is suspended/.test(await pg.locator('.cs-notice h2').textContent()), `${w}px: the member sees the suspended notice`);
    check(await pg.locator('#tabs').isHidden() && await pg.locator('.pchip, .lx-doors').count() === 0, `${w}px: no club tabs, members or doors behind it`);
    check(await pg.locator('.br-post').first().isVisible(), `${w}px: Blindrise posts still show, badged`);
    check(await inView(pg, '#csSwitch', w) && await noSideScroll(pg), `${w}px: the way back to another club fits, no sideways scroll`);
    await shot(pg, `suspended-member-${w}.png`);
    if(w === 320){ await pg.click('#csSwitch'); await pg.waitForLoadState('load'); await sleep(900); check(await pg.locator('.cs-notice').count() === 0 && (await pg.evaluate(() => JSON.parse(localStorage.getItem('stacked:club')))) === 'main', `${w}px: "Go to" takes the member to their other club`); }
    await pg.context().close();
  }
  await browser.close();
  console.log(`\nt_platform_ui: ${oks} ok, ${fails} failed`);
  srv.kill(); try{ fs.unlinkSync(DATA); }catch(e){}
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); try{ browser && browser.close(); }catch(x){} srv.kill(); process.exit(1); });
