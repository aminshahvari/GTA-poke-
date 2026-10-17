// Browser check of a public campaign link (not part of npm test: needs Chromium + playwright-core).
// At 320, 375, 390 and 430 wide: the link opens the welcome and consent page (not the ordinary welcome), Continue needs the box
// ticked, the join form has no second checkbox, a new member lands in the lobby and is NOT signed up for the open tournament.
// Then the Instagram in-app browser (iPhone UA): the keep-your-name-and-PIN note appears, no popup is opened, and joining still
// works when the browser refuses localStorage. Finally the Director report counts the sign-ups and a cancelled link shows closed.
// Usage: PLAYWRIGHT_CORE=/path/to/playwright-core CHROMIUM=/opt/pw-browsers/chromium node test/ui/t_campaign_ui.js [shotDir]
const assert = require('assert');
const fs = require('fs');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const SHOTS = process.argv[2];
const PORT = 4700 + Math.floor(Math.random() * 100), BASE = 'http://127.0.0.1:' + PORT;
const DATA = require('os').tmpdir() + '/t_campaign_ui_' + process.pid + '.json';
const post = (p, b, t) => fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (t || '') }, body: JSON.stringify(b) }).then(r => r.json());
const sleep = ms => new Promise(r => setTimeout(r, ms));
let checks = 0; const ok = m => { checks++; console.log('ok  ', m); };
const PHONES = [[320, 568], [375, 667], [390, 844], [430, 932]];
const IG_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F90 Instagram 334.0.4.32.98 (iPhone15,3; iOS 17_5; en_US; en; scale=3.00; 1290x2796; 604147356)';
// the owner's live club view over the socket, as the Director sees it
function ownerView(token, msg){
  return new Promise(res => {
    const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws'); let v = null;
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token, device: 'owner-test' })));
    ws.on('message', raw => { const m = JSON.parse(raw); if(m.t === 'club'){ const first = !v; v = m.club; if(first){ if(msg) ws.send(JSON.stringify(msg)); setTimeout(() => { ws.close(); res(v); }, msg ? 300 : 0); } } });
  });
}

(async () => {
  const srv = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT, OWNER_CODE: 'secret', DATA_FILE: DATA, NO_BEACON: '1', NO_PUSH: '1', CAMPAIGN_IP_HOUR: '50' }, stdio: ['ignore', 'ignore', 'inherit'] });
  try{
    for(let i = 0; i < 50; i++){ try{ await fetch(BASE + '/healthz'); break; }catch(e){ await sleep(200); } }
    const own = (await post('/api/setup', { code: 'secret', name: 'Director', pin: '246810', agree: true })).token;
    await ownerView(own, { t: 'create', name: 'Friday Night', stack: 30000, levelMin: 10, tableSize: 9 });
    assert.strictEqual((await ownerView(own)).tourney.status, 'registering'); ok('an open tournament is taking sign-ups');
    const { code } = await post('/api/campaign', { source: 'instagram-oct', max: 50, hours: 168 }, own);
    assert(code, 'campaign link not created');

    const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
    const ctxFor = async (w, h, extra = {}) => { const c = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, ...extra }); await c.route(/fonts\.(googleapis|gstatic)/, r => r.abort()); await c.addInitScript(() => { window.__opened = 0; window.open = () => { window.__opened++; return null; }; }); return c; };
    const noHScroll = async (p, what) => { const d = await p.evaluate(() => { const a = document.getElementById('auth'); return { sw: a.scrollWidth, cw: a.clientWidth, dw: document.documentElement.scrollWidth, vw: innerWidth }; }); assert(d.sw <= d.cw && d.dw <= d.vw, what + ' scrolls sideways ' + JSON.stringify(d)); };
    const allInside = async (p, sel, what) => { const bad = await p.$$eval(sel, els => els.filter(e => e.offsetParent).map(e => e.getBoundingClientRect()).filter(r => r.left < -0.5 || r.right > innerWidth + 0.5).length); assert.strictEqual(bad, 0, what + ': control clipped at the side'); };
    const joined = [];
    async function joinFlow(p, tag, name, { ig = false } = {}){
      await p.goto(BASE + '/join/' + code); await p.waitForSelector('#authForm:not([hidden]) #cAgree');
      assert(await p.isHidden('#welcome'), tag + ' ordinary welcome is not shown for a campaign link');
      const text = await p.textContent('#authForm');
      for(const [re, what] of [[/private members' club/i, 'private club'], [/Free, no real money/, 'free, no real money'], [/19 and over/, '19+'], [/display name, your picture/, 'what members see'], [/not your full name/, 'nickname advice']]) assert(re.test(text), tag + ' consent text missing: ' + what);
      assert.strictEqual(await p.locator('#authForm input[type=checkbox]').count(), 1, tag + ' one consent checkbox');
      await noHScroll(p, tag + ' consent'); await allInside(p, '#authForm button, #authForm li, #authForm label', tag + ' consent');
      if(SHOTS) await p.waitForTimeout(800), await p.screenshot({ path: `${SHOTS}/consent-${tag}.png`, fullPage: true });
      await p.click('#cGo'); await p.waitForFunction(() => document.getElementById('cErr').textContent.length > 0);
      assert(await p.isVisible('#cAgree'), tag + ' Continue without the box stays on consent');
      await p.check('#cAgree'); await p.click('#cGo'); await p.waitForSelector('#authForm:not([hidden]) #aName');
      assert.strictEqual(await p.locator('#aAgree').count(), 0, tag + ' join form does not ask a second time');
      assert(/nickname/.test(await p.textContent('#authForm p')), tag + ' join form suggests a nickname');
      await noHScroll(p, tag + ' join'); await allInside(p, '#authForm button, #authForm input', tag + ' join');
      if(SHOTS) await p.waitForTimeout(500), await p.screenshot({ path: `${SHOTS}/join-${tag}.png` });
      await p.fill('#aName', name); await p.fill('#aPin', '2468'); await p.click('#authForm button[type=submit]');
      if(ig){
        await p.waitForSelector('.modal .keep-box');
        const note = await p.textContent('.modal');
        assert(note.includes(name) && note.includes('2468') && /Safari/.test(note), tag + ' Instagram note shows name, PIN and the Safari tip');
        if(SHOTS) await p.waitForTimeout(400), await p.screenshot({ path: `${SHOTS}/instagram-note-${tag}.png` });
        await p.click('.modal [data-i="0"]');
      } else assert.strictEqual(await p.locator('.modal .keep-box').count(), 0, tag + ' no Instagram note outside Instagram');
      await p.waitForSelector('#lobby:not([hidden]) [data-tab="event"]'); assert.strictEqual(new URL(p.url()).pathname, '/');
      assert.strictEqual(await p.evaluate(() => window.__opened), 0, tag + ' no popup window was opened');
      if(SHOTS) await p.waitForTimeout(800), await p.screenshot({ path: `${SHOTS}/lobby-${tag}.png` });
      joined.push(name);
    }

    for(const [w, h] of PHONES){
      const tag = `${w}x${h}`, c = await ctxFor(w, h), p = await c.newPage();
      await joinFlow(p, tag, 'Pub' + w);
      ok(`${tag} campaign link → consent → name + PIN → lobby`);
      await c.close();
    }
    // Instagram in-app browser on an iPhone
    { const c = await ctxFor(390, 844, { userAgent: IG_UA }), p = await c.newPage();
      await joinFlow(p, 'instagram-390x844', 'Insta One', { ig: true }); ok('Instagram UA: consent → join → keep-your-PIN note → lobby, no popup');
      await c.close(); }
    // Instagram with storage refused: sign-in still works for this visit
    { const c = await ctxFor(390, 844, { userAgent: IG_UA }); await c.addInitScript(() => { const no = () => { throw new Error('blocked'); }; Storage.prototype.setItem = no; Storage.prototype.getItem = no; });
      const p = await c.newPage(); await joinFlow(p, 'instagram-nostorage', 'Insta Two', { ig: true }); ok('Instagram UA with storage blocked still reaches the lobby');
      await c.close(); }

    // nobody who came in through the campaign link was signed up for the tournament
    const v = await ownerView(own);
    const ids = v.members.filter(m => joined.includes(m.name)).map(m => m.id);
    assert.strictEqual(ids.length, joined.length, 'all campaign joiners are members');
    assert(ids.every(id => !v.tourney.regs.includes(id)), 'a campaign joiner was signed up for the tournament');
    ok(`${joined.length} campaign members, none signed up for the open tournament`);

    // Director report
    { const c = await ctxFor(390, 844), p = await c.newPage();
      await c.addInitScript(t => localStorage.setItem('stacked:token', JSON.stringify(t)), own);
      await p.goto(BASE + '/'); await p.waitForSelector('#lobby:not([hidden])'); await p.waitForSelector('#dirTab:not([hidden])');
      await p.click('#tabs [data-tab=director]'); await p.waitForSelector('#campaignBox .camp-row[data-source="instagram-oct"]');
      const row = (await p.textContent('#campaignBox .camp-row[data-source="instagram-oct"]')).replace(/\s+/g, ' ');
      assert(row.includes(`${joined.length} of 50 joined`) && row.includes(`${50 - joined.length} left`) && /Active/.test(row), 'report row: ' + row);
      ok(`Director report: instagram-oct shows ${joined.length} of 50 joined`);
      await p.locator('#campaignBox').scrollIntoViewIfNeeded();
      if(SHOTS) await p.waitForTimeout(500), await p.locator('#campaignBox').screenshot({ path: `${SHOTS}/director-report-390.png` });
      // create a link from the Director form
      await p.click('#campaignBtn'); await p.fill('#cmSource', 'flyer-test'); await p.fill('#cmMax', '25'); await p.selectOption('#cmHours', '24');
      if(SHOTS) await p.screenshot({ path: `${SHOTS}/director-create-390.png` });
      await p.click('.modal [data-i="1"]'); await p.waitForSelector('.modal #invUrl');
      const url = await p.inputValue('#invUrl'); assert(/\/join\/[A-Za-z0-9_-]{12}$/.test(url), 'link format ' + url);
      await p.click('.modal [data-i="0"]'); await p.waitForSelector('#campaignBox .camp-row[data-source="flyer-test"]');
      ok('Director form creates a link of the form <origin>/join/<code> and lists it');
      // cancel it from the report, then the link shows closed
      await p.click('#campaignBox .camp-row[data-source="flyer-test"] [data-revoke]');
      await p.waitForFunction(() => /Cancelled/.test(document.querySelector('#campaignBox .camp-row[data-source="flyer-test"]').textContent));
      await c.close();
      const c2 = await ctxFor(375, 667), p2 = await c2.newPage();
      await p2.goto(url); await p2.waitForSelector('#cSignIn'); assert(/has closed/.test(await p2.textContent('#authForm')));
      if(SHOTS) await p2.screenshot({ path: `${SHOTS}/closed-375.png` });
      ok('a cancelled public link shows "This link has closed" with Sign in'); await c2.close(); }

    // an ordinary group link still shows the ordinary invitation welcome
    { const c = await ctxFor(375, 667), p = await c.newPage(), group = (await ownerView(own, { t: 'invite', group: true })).invites.find(i => i.multi).code;
      await p.goto(BASE + '/join/' + group); await p.waitForSelector('#welcome:not([hidden])');
      assert(await p.isVisible('#wInvite') && (await p.textContent('#wJoin')).trim() === 'Accept invitation');
      assert.strictEqual(await p.locator('#cAgree').count(), 0);
      ok('ordinary group link still opens the ordinary invitation welcome'); await c.close(); }

    await b.close();
    console.log(`campaign ui test passed (${checks} checks)`);
  } finally { srv.kill(); try{ fs.unlinkSync(DATA); }catch(e){} }
})().catch(e => { console.error(e); process.exit(1); });
