// Browser check (not part of npm test: needs Chromium + playwright-core, which are not dependencies of the app).
// Starts a local STAGING=1 server, signs in as a fake member, opens the card scanner, feeds a synthetic fake business card
// and checks that the fields get filled while: no Content-Security-Policy violation is reported (page or worker), and no
// request leaves our own origin other than the Google Fonts stylesheet that predates the Business Club.
// A negative control proves the violation collector works: a script from cdn.jsdelivr.net must be blocked and reported.
//
// Usage: PLAYWRIGHT_CORE=/path/to/playwright-core PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node test/browser/scan_csp.js [--no-simd]
//   --no-simd  pretends the browser has no WebAssembly SIMD, so the plain (older phones) core is exercised.
const assert = require('assert');
const { spawn } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const NO_SIMD = process.argv.includes('--no-simd');
const PORT = 4300 + Math.floor(Math.random() * 100), BASE = 'http://localhost:' + PORT;
const DATA = require('os').tmpdir() + '/t_scancsp_' + process.pid + '.json';
const PREEXISTING = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//; // in index.html since before BC1; aborted here (sandbox has no internet)
const srv = spawn('node', ['server/index.js'], { cwd: __dirname + '/../..', env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'scan-test', DATA_FILE: DATA, STAGING: '1', FAST: '' }, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);

(async () => {
  for(let i = 0; i < 60; i++){ try{ if((await fetch(BASE + '/healthz')).ok) break; }catch(e){} await sleep(150); }
  const csp = (await fetch(BASE + '/')).headers.get('content-security-policy');
  log('CSP on / :', csp);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const violations = [], thirdParty = [], preexisting = [], requests = [], errors = [];
  const isCsp = t => /Content Security Policy|Content-Security-Policy|Refused to/i.test(t);
  ctx.on('request', r => {
    const u = r.url();
    if(u.startsWith(BASE) || u.startsWith(BASE.replace('http', 'ws')) || u.startsWith('blob:') || u.startsWith('data:')){ requests.push(u.slice(BASE.length)); return; }
    (PREEXISTING.test(u) ? preexisting : thirdParty).push(u);
  });
  // nothing may reach the internet from this test
  await ctx.route(u => !String(u).startsWith(BASE), route => route.abort());
  const page = await ctx.newPage();
  page.on('console', m => { if(isCsp(m.text())) violations.push('[page console] ' + m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('worker', w => { log('worker started:', w.url().replace(BASE, '')); w.on('console', m => { if(isCsp(m.text())) violations.push('[worker console] ' + m.text()); }); });
  await page.addInitScript(noSimd => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective} blocked ${e.blockedURI} (${e.sourceFile || ''}:${e.lineNumber || ''})`));
    if(noSimd){ const v = WebAssembly.validate; WebAssembly.validate = b => (b && b.length === 31 && b[14] === 123) ? false : v(b); }
  }, NO_SIMD);

  // sign in as a fake member (seeded by STAGING=1)
  await page.goto(BASE + '/');
  await page.waitForSelector('#wSignIn'); await page.click('#wSignIn'); // welcome screen first (live since 49d9ece)
  await page.waitForSelector('#aName');
  await page.fill('#aName', 'Test Player 07'); await page.fill('#aPin', '135777');
  await page.click('#authForm button[type=submit]');
  await page.waitForSelector('[data-tab=biz]:visible', { timeout: 15000 });
  log('signed in as Test Player 07');
  await page.click('[data-tab=biz]');
  await page.getByRole('button', { name: /Add your business|My business/ }).first().click();
  await page.getByRole('button', { name: /Scan your business card/ }).first().click();
  await page.waitForSelector('input[data-scan=library]', { state: 'attached' });
  const beforePick = requests.filter(u => u.startsWith('/vendor/'));
  assert.deepStrictEqual(beforePick, [], 'no OCR file is downloaded before a photo is chosen');
  log('scanner open; OCR files requested so far: 0');

  // draw a synthetic fake card in a blank page and take its PNG bytes
  const card = await browser.newPage();
  const png = Buffer.from(await card.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 1400; c.height = 900; const x = c.getContext('2d');
    x.fillStyle = '#9a9a96'; x.fillRect(0, 0, 1400, 900);
    x.translate(700, 450); x.rotate(-0.02); x.translate(-525, -300);
    x.fillStyle = '#fbfaf6'; x.fillRect(0, 0, 1050, 600);
    x.fillStyle = '#12355b'; x.font = 'bold 64px DejaVu Sans'; x.fillText('RIVERA PLUMBING', 70, 120);
    x.fillStyle = '#222'; x.font = '44px DejaVu Sans'; x.fillText('Alex Rivera', 70, 230);
    x.font = '34px DejaVu Sans'; x.fillText('Owner', 70, 280);
    x.font = '32px DejaVu Sans';
    ['416-555-0100', 'alex@example.com', 'riveraplumbing.example', '123 Queen St W', 'Toronto, ON M5H 2M9'].forEach((t, i) => x.fillText(t, 70, 370 + i * 46));
    return c.toDataURL('image/png').split(',')[1];
  }), 'base64');
  await card.close();
  log('synthetic card PNG:', png.length, 'bytes');

  const t0 = Date.now();
  await page.setInputFiles('input[data-scan=library]', { name: 'card.png', mimeType: 'image/png', buffer: png });
  await page.waitForSelector('#bz_name', { timeout: 90000 }).catch(async e => { log('scan screen text:', await page.locator('#lobbyBody').innerText().catch(() => '')); log('CSP violations so far:', violations.concat(await page.evaluate(() => window.__csp)).join('\n')); throw e; });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const fields = await page.evaluate(() => Object.fromEntries(['name', 'fullName', 'jobTitle', 'phone', 'email', 'website', 'address', 'category'].map(k => [k, (document.getElementById('bz_' + k) || {}).value || ''])));
  log(`card read in ${secs}s, fields:`, JSON.stringify(fields));
  assert.match(fields.name, /rivera plumbing/i, 'company');
  assert.strictEqual(fields.fullName, 'Alex Rivera', 'person');
  assert.match(fields.jobTitle, /owner/i, 'title');
  assert.match(fields.phone, /416.?555.?0100/, 'phone');
  assert.strictEqual(fields.email, 'alex@example.com', 'email');
  assert.match(fields.website, /riveraplumbing\.example/, 'website');
  assert.match(fields.address, /123 Queen St W/, 'address');
  assert.ok(fields.category, 'industry guessed');

  const vendor = requests.filter(u => u.startsWith('/vendor/'));
  log('OCR files loaded from our origin:', JSON.stringify(vendor));
  assert.ok(vendor.includes('/vendor/tesseract-5.1.1/worker.min.js'), 'worker from /vendor (no blob: worker)');
  assert.ok(vendor.some(u => u.endsWith(NO_SIMD ? '/tesseract-core-lstm.wasm' : '/tesseract-core-simd-lstm.wasm')), 'expected core variant');
  assert.ok(vendor.includes('/vendor/tessdata-eng-1.0.0/eng.traineddata.gz'), 'language data from /vendor');
  const pageCsp = await page.evaluate(() => window.__csp.slice());
  violations.push(...pageCsp.map(v => '[securitypolicyviolation] ' + v));

  const thirdPartyDuringScan = thirdParty.slice(), violationsDuringScan = violations.slice();
  // negative control: the collector must catch a script from the CDN BC1 used to allow
  await page.evaluate(() => new Promise(r => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'; s.onerror = s.onload = r; document.head.appendChild(s); }));
  await sleep(300);
  const control = (await page.evaluate(() => window.__csp.slice())).slice(pageCsp.length);
  log('negative control (cdn.jsdelivr.net script):', control.length ? 'blocked by CSP: ' + control.join('; ') : 'NOT BLOCKED');
  assert.ok(control.some(v => /script-src/.test(v) && /cdn\.jsdelivr\.net/.test(v)), 'CSP blocks cdn.jsdelivr.net scripts');

  log('CSP violations during sign-in + scan:', violationsDuringScan.length, violationsDuringScan.join('\n'));
  log('third-party requests during sign-in + scan:', thirdPartyDuringScan.length, thirdPartyDuringScan.join(' '));
  log('pre-existing Google Fonts requests (not BC1, aborted in this sandbox):', preexisting.length);
  log('page errors:', errors.length, errors.join(' | '));
  assert.strictEqual(violationsDuringScan.length, 0, 'zero CSP violations');
  assert.strictEqual(thirdPartyDuringScan.length, 0, 'zero third-party requests (other than the pre-existing Google Fonts)');
  assert.strictEqual(errors.length, 0, 'no page errors');
  await browser.close();
  log(`scan + CSP browser test passed (${NO_SIMD ? 'plain core, no SIMD' : 'SIMD core'})`);
  srv.kill(); require('fs').rmSync(DATA, { force: true }); process.exit(0);
})().catch(e => { console.error('FAILED:', e.message); srv.kill(); require('fs').rmSync(DATA, { force: true }); process.exit(1); });
