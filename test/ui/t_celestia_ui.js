// Browser check of the Celestia invitation flow (not part of npm test: needs Chromium + playwright-core), CAMPAIGNS=1.
// At 320, 390 and 430 wide: /v/celestia → the welcome and consent page (venue line, brand lines, no offer, club or prize claims)
// → Continue needs the box → the join form with an optional email and its own unticked box → the Lounge. The Director report
// then counts the scans, welcome views, joins and the one shared email. Screenshots go to the folder given as argument.
// Usage: PLAYWRIGHT=/path/to/playwright-core CHROMIUM=/opt/pw-browsers/chromium node test/ui/t_celestia_ui.js [shotDir]
const assert = require('assert');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const { chromium } = require(process.env.PLAYWRIGHT || process.env.PLAYWRIGHT_CORE || 'playwright-core');
const SHOTS = process.argv[2];
const PORT = 4600 + Math.floor(Math.random() * 100), BASE = 'http://127.0.0.1:' + PORT;
const DATA = require('os').tmpdir() + '/t_celestia_ui_' + process.pid + '.json';
const post = (p, b, t) => fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (t || '') }, body: JSON.stringify(b) }).then(r => r.json());
const sleep = ms => new Promise(r => setTimeout(r, ms));
let checks = 0; const ok = m => { checks++; console.log('ok  ', m); };
function ownerView(token){
  return new Promise(res => {
    const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws');
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token, device: 'owner-test' })));
    ws.on('message', raw => { const m = JSON.parse(raw); if(m.t === 'club'){ ws.close(); res(m.club); } });
  });
}
const FORBIDDEN = /partner|discount|prize|reward|guarantee|% off|free (drink|meal|dessert)|celestia club|official/i;

(async () => {
  const srv = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT, OWNER_CODE: 'secret', DATA_FILE: DATA, NO_BEACON: '1', NO_PUSH: '1', CAMPAIGNS: '1', STAGING: '', DATABASE_URL: '' }, stdio: ['ignore', 'ignore', 'inherit'] });
  let b;
  try{
    for(let i = 0; i < 50; i++){ try{ if((await fetch(BASE + '/healthz')).ok) break; }catch(e){} await sleep(200); }
    const own = (await post('/api/setup', { code: 'secret', name: 'Director', pin: '246810', agree: true })).token;
    const { code } = await post('/api/campaign', { source: 'celestia', max: 50, hours: 720 }, own);
    assert((await post('/api/vmap', { slug: 'celestia', code }, own)).ok); ok('owner made a celestia link and pointed /v/celestia at it');
    b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
    let n = 0;
    for(const [w, h] of [[320, 568], [390, 844], [430, 932]]){
      const c = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      await c.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
      const p = await c.newPage();
      await p.goto(BASE + '/v/celestia'); await p.waitForSelector('#authForm:not([hidden]) #cAgree');
      assert(p.url().endsWith('/join/' + code)); ok(`${w}px: /v/celestia opened the invitation`);
      const text = await p.innerText('#auth');
      assert(/You were invited at Celestia Restaurant & Lounge\./.test(text) && /Play\. Connect\. Belong\. Grow\./i.test(text) && /Together We Rise\./.test(text)); ok(`${w}px: venue line and brand lines shown`);
      assert(!FORBIDDEN.test(text), 'claim found: ' + (text.match(FORBIDDEN) || [])[0]); ok(`${w}px: no partnership, offer, prize, reward or Celestia-club claim`);
      for(const re of [/Free, no real money/, /19 and over/, /What other members see/, /Contact details stay private/, /seen only by the club owner/]) assert(re.test(text), 'consent text missing ' + re);
      ok(`${w}px: consent notice shown before joining`);
      const sideways = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.getElementById('auth').scrollWidth > document.getElementById('auth').clientWidth);
      assert(!sideways); ok(`${w}px: no sideways scroll`);
      if(SHOTS){ await p.waitForTimeout(800); await p.screenshot({ path: `${SHOTS}/landing-${w}.png`, fullPage: true }); }
      await p.click('#cGo'); await p.waitForFunction(() => document.getElementById('cErr').textContent.length > 0);
      ok(`${w}px: Continue without the box stays on the consent page`);
      await p.check('#cAgree'); await p.click('#cGo'); await p.waitForSelector('#authForm:not([hidden]) #aName');
      assert(await p.isVisible('#aEmail') && !(await p.isChecked('#aEmailOk')) && (await p.locator('#aAgree').count()) === 0); ok(`${w}px: join form has an optional email with its own unticked box, no second rules box`);
      if(SHOTS){ await p.waitForTimeout(400); await p.screenshot({ path: `${SHOTS}/join-${w}.png`, fullPage: true }); }
      await p.fill('#aName', 'Guest' + w); await p.fill('#aPin', '2468');
      if(w === 390){
        await p.fill('#aEmail', 'guest@example.com'); await p.click('#authForm button[type=submit]');
        await p.waitForFunction(() => /email box/.test(document.getElementById('aErr').textContent)); ok(`${w}px: an email without its box is refused with a clear message`);
        await p.check('#aEmailOk');
      }
      await p.click('#authForm button[type=submit]');
      await p.waitForSelector('#lobby:not([hidden])', { timeout: 8000 }); ok(`${w}px: joined and landed in the Lounge`);
      if(SHOTS){ await p.waitForTimeout(800); await p.screenshot({ path: `${SHOTS}/lounge-${w}.png` }); }
      await c.close(); n++;
    }
    const v = await ownerView(own), row = v.campaigns[0], src = v.campaignSources.find(x => x.source === 'celestia');
    assert.deepStrictEqual([src.visits, row.joined, row.emails, row.played, row.returned], [3, 3, 1, 0, 0]); ok('Director report: 3 scans, 3 joined, 1 email, 0 played, 0 returned (nothing invented)');
    assert(src.views >= 3); ok('Director report: welcome views counted (' + src.views + ')');
    // the Director card itself
    const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await c.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
    const p = await c.newPage(); await p.goto(BASE + '/'); await p.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), own); await p.reload();
    await p.waitForSelector('#tabs [data-tab=director]'); await p.click('#tabs [data-tab=director]'); await p.waitForSelector('#campaignBox');
    const card = await p.textContent('#campaignBox');
    assert(/\/v\/celestia/.test(card) && /3 visits/.test(card) && /3 joined/.test(card) && /guest@example\.com/.test(card)); ok('Director shows /v/celestia, counts and the shared email to the owner');
    if(SHOTS){ await p.locator('#campaignBox').scrollIntoViewIfNeeded(); await p.waitForTimeout(400); await p.locator('#campaignBox').screenshot({ path: `${SHOTS}/director-390.png` }); }
    await c.close();
    console.log(`\n${checks} ok, 0 failed`);
  }catch(e){ console.error(e); console.log(`\n${checks} ok, 1 failed`); process.exitCode = 1; }
  finally{ if(b) await b.close(); srv.kill(); try{ require('fs').unlinkSync(DATA); }catch(e){} }
})();
