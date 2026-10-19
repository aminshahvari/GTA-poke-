// Browser check of the welcome + sign-in screens (not part of npm test: needs Chromium + playwright-core).
// Starts a local server, then on phone-sized viewports checks: welcome first, Join without an invite explains invite-only,
// Sign In with an existing PIN reaches the lobby, an invite link registers a new member, a returning member (saved token)
// skips the welcome, a stale token lands on Sign In, no horizontal scrolling, focused fields stay visible with a keyboard-sized
// viewport, and the Open Graph tags + image are served.
// Usage: PLAYWRIGHT_CORE=/path/to/playwright-core PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node test/ui/t_welcome.js [shotDir]
const assert = require('assert');
const fs = require('fs');
const { spawn } = require('child_process');
const { watchServer, waitReady } = require('../ready');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const SHOTS = process.argv[2];
const PORT = 4500 + Math.floor(Math.random() * 100), BASE = 'http://127.0.0.1:' + PORT;
const DATA = require('os').tmpdir() + '/t_welcome_' + process.pid + '.json';
const post = (p, b, t) => fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (t || '') }, body: JSON.stringify(b) }).then(r => r.json());
const ok = m => console.log('ok  ', m);
const PHONES = [[320, 568, 'iPhone SE 1st gen'], [375, 667, 'iPhone SE 2/3'], [390, 844, 'iPhone 13-15'], [430, 932, 'iPhone Pro Max'], [360, 800, 'Android small'], [412, 915, 'Pixel']];

(async () => {
  const srv = watchServer(spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT, OWNER_CODE: 'secret', DATA_FILE: DATA, NO_BEACON: '1' }, stdio: ['ignore', 'ignore', 'pipe'] }), { forward: true });
  try{
    await waitReady(BASE, srv);
    const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
    const ctxFor = async (w, h) => { const c = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); await c.route(/fonts\.(googleapis|gstatic)/, r => r.abort()); return c; };
    const noHScroll = async (p, what) => { const d = await p.evaluate(() => { const a = document.getElementById('auth'); return { sw: a.scrollWidth, cw: a.clientWidth, dw: document.documentElement.scrollWidth, vw: innerWidth }; }); assert(d.sw <= d.cw && d.dw <= d.vw, what + ' scrolls sideways ' + JSON.stringify(d)); };
    const allInside = async (p, sel, what) => { const bad = await p.$$eval(sel, (els) => els.filter(e => e.offsetParent).map(e => e.getBoundingClientRect()).filter(r => r.left < -0.5 || r.right > innerWidth + 0.5).length); assert.strictEqual(bad, 0, what + ': control clipped at the side'); };

    // first run (no owner yet): the setup form, not the welcome
    { const c = await ctxFor(390, 844), p = await c.newPage(); await p.goto(BASE + '/'); await p.waitForSelector('#authForm:not([hidden]) #aCode');
      assert(await p.isHidden('#welcome')); ok('no owner yet: setup form shown directly'); await c.close(); }
    const own = await post('/api/setup', { code: 'secret', name: 'Sean', pin: '1234', agree: true });
    assert(own.token, 'setup failed');

    // Open Graph
    const html = await (await fetch(BASE + '/join/abc')).text();
    for(const k of ['og:title', 'og:description', 'og:image', 'og:url', 'twitter:card']) assert(html.includes(`"${k}"`), 'missing ' + k);
    const og = await fetch(BASE + '/og.png'); assert.strictEqual(og.status, 200); assert.strictEqual(og.headers.get('content-type'), 'image/png');
    const ogBuf = Buffer.from(await og.arrayBuffer()); assert(ogBuf.length < 300 * 1024, 'og.png over 300 KB (WhatsApp skips big previews)');
    assert.strictEqual(ogBuf.readUInt32BE(16), 1200); assert.strictEqual(ogBuf.readUInt32BE(20), 630);
    ok(`Open Graph tags on invite pages; og.png 1200x630, ${Math.round(ogBuf.length / 1024)} KB`);

    let n = 0;
    for(const [w, h, label] of PHONES){
      const tag = `${w}x${h}`;
      // welcome, Join without invite, Sign In with existing PIN, lobby
      let c = await ctxFor(w, h), p = await c.newPage();
      await p.goto(BASE + '/'); await p.waitForSelector('#welcome:not([hidden])');
      assert.strictEqual((await p.textContent('.lux-word')).trim(), 'BLINDRISE');
      assert.strictEqual((await p.textContent('.lux-tag')).trim(), 'Where Connections Rise.');
      assert.deepStrictEqual(await p.$$eval('.lux-card b', e => e.map(x => x.firstChild.textContent.trim())), ['Poker Club', 'Business Club', 'Opportunity Club']);
      assert.strictEqual((await p.textContent('#wJoin')).trim(), 'Join Blindrise');
      await noHScroll(p, tag + ' welcome'); await allInside(p, '#auth button, .lux-card', tag + ' welcome');
      if(SHOTS) await p.waitForTimeout(900), await p.screenshot({ path: `${SHOTS}/welcome-${tag}.png` });
      await p.click('#wJoin'); assert(await p.isVisible('#wNote')); assert(/invite-only/.test(await p.textContent('#wNote')));
      await p.click('#wSignIn'); await p.waitForSelector('#authForm:not([hidden]) #aPin');
      assert(await p.isHidden('#welcome')); await noHScroll(p, tag + ' sign-in'); await allInside(p, '#authForm button, #authForm input', tag + ' sign-in');
      if(SHOTS) await p.waitForTimeout(900), await p.screenshot({ path: `${SHOTS}/signin-${tag}.png` });
      await p.click('#toWelcome'); await p.waitForSelector('#welcome:not([hidden])'); await p.click('#wSignIn');
      await p.fill('#aName', 'Sean'); await p.fill('#aPin', '9999'); await p.click('#authForm button[type=submit]');
      await p.waitForFunction(() => document.getElementById('aErr').textContent.length > 0); ok(`${tag} wrong PIN refused with a message`);
      await p.fill('#aPin', '1234'); await p.click('#authForm button[type=submit]');
      await p.waitForSelector('#lobby:not([hidden]) [data-tab="event"]'); ok(`${tag} ${label}: welcome → Sign In → existing PIN → lobby`);
      // returning member: saved token skips the welcome
      await p.reload(); await p.waitForSelector('#lobby:not([hidden])'); assert(await p.isHidden('#auth')); ok(`${tag} returning member goes straight to the lobby`);
      // stale token lands on the sign-in form
      await p.evaluate(() => localStorage.setItem('stacked:token', JSON.stringify('t-not-valid')));
      await p.reload(); await p.waitForSelector('#authForm:not([hidden]) #aPin'); ok(`${tag} expired session lands on Sign In`);
      await c.close();

      // invite link → welcome with invitation → join form → new member in the lobby
      const { code } = await post('/api/invite', {}, own.token);
      c = await ctxFor(w, h); p = await c.newPage();
      await p.goto(BASE + '/join/' + code); await p.waitForSelector('#welcome:not([hidden])');
      assert(await p.isVisible('#wInvite')); assert.strictEqual((await p.textContent('#wJoin')).trim(), 'Accept invitation');
      await noHScroll(p, tag + ' invite');
      if(SHOTS) await p.waitForTimeout(900), await p.screenshot({ path: `${SHOTS}/invite-${tag}.png` });
      await p.click('#wJoin'); await p.waitForSelector('#authForm:not([hidden]) #aAgree');
      await noHScroll(p, tag + ' join form'); await allInside(p, '#authForm button, #authForm input:not([type=checkbox])', tag + ' join form');
      if(SHOTS) await p.waitForTimeout(900), await p.screenshot({ path: `${SHOTS}/join-${tag}.png` });
      // keyboard: shrink the viewport like an on-screen keyboard and check the focused field and the button can be reached
      await p.setViewportSize({ width: w, height: Math.round(h * 0.55) });
      for(const sel of ['#aName', '#aPin']){ await p.focus(sel); await p.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'nearest' }), sel);
        const r = await p.$eval(sel, e => { const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, vh: innerHeight }; });
        assert(r.top >= 0 && r.bottom <= r.vh, `${tag} ${sel} hidden behind keyboard ${JSON.stringify(r)}`); }
      await p.setViewportSize({ width: w, height: h });
      const name = 'W' + (++n) + 'x' + w;
      await p.fill('#aName', name); await p.fill('#aPin', '2468'); await p.check('#aAgree'); await p.click('#authForm button[type=submit]');
      await p.waitForSelector('#lobby:not([hidden]) [data-tab="event"]'); assert.strictEqual(new URL(p.url()).pathname, '/');
      ok(`${tag} invite link → Accept invitation → new name + PIN → lobby`);
      await c.close();
      // the new member can sign in again with their PIN
      const again = await post('/api/login', { name, pin: '2468' }); assert(again.token, 'new member cannot sign in');
    }
    if(SHOTS){ const c = await b.newContext({ viewport: { width: 1280, height: 800 } }); await c.route(/fonts/, r => r.abort()); const p = await c.newPage(); await p.goto(BASE + '/'); await p.waitForSelector('#welcome:not([hidden])'); await p.waitForTimeout(800); await p.screenshot({ path: `${SHOTS}/welcome-1280x800.png` }); await c.close(); }
    await b.close();
    console.log('welcome ui test passed');
  } finally { srv.kill(); try{ fs.unlinkSync(DATA); }catch(e){} }
})().catch(e => { console.error(e); process.exit(1); });
