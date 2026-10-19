// Muse M-2 regression (browser): a business search makes the whole directory agree with the results.
// Needs Playwright + Chromium, which are not repo dependencies: PLAYWRIGHT=/path/to/playwright CHROMIUM=/path/to/chromium node test/ui/t_bizsearch.js
const assert = require('assert');
const { spawn } = require('child_process');
const { watchServer, waitReady } = require('../ready');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const PORT = 4800 + Math.floor(Math.random() * 50), BASE = 'http://localhost:' + PORT;
const DATA = require('os').tmpdir() + '/t_bizsearch_' + process.pid + '.json';
// STAGING=1 seeds fake "Test Player NN" members and 5 fake businesses, one of them in the spotlight
const srv = watchServer(spawn('node', ['server/index.js'], { cwd: __dirname + '/../..', env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '', STAGING: '1', DATABASE_URL: '' }, stdio: ['ignore', 'ignore', 'pipe'] }));
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await waitReady(BASE, srv);
  const { token } = await (await fetch(BASE + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Test Player 07', pin: '135777' }) })).json();
  assert.ok(token, 'fake member signs in');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto(BASE + '/'); await p.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), token);
  await p.reload(); await p.waitForSelector('#tabs [data-tab="biz"]:not([hidden])');
  await p.click('#tabs [data-tab="biz"]'); await p.waitForSelector('.bz-search');
  const state = () => p.evaluate(() => ({ spot: document.querySelector('.bz-spot') ? document.querySelector('.bz-spot').hidden : null,
    recent: document.querySelector('.bz-recent') ? document.querySelector('.bz-recent').hidden : null,
    count: document.querySelector('.bz-count').textContent, cards: document.querySelectorAll('.bz-grid .bz-card').length,
    nomatch: document.querySelector('.bz-nomatch') ? document.querySelector('.bz-nomatch').textContent : null }));
  const start = await state();
  assert.strictEqual(start.spot, false, 'spotlight shows with no search'); assert.strictEqual(start.count, '5 businesses');
  // zero results: spotlight and "New to the Club" step aside, the count says 0 of 5, the empty state explains and offers Clear
  await p.fill('.bz-search', 'zzqxxxy');
  let s = await state();
  assert.strictEqual(s.spot, true); assert.notStrictEqual(s.recent, false); assert.strictEqual(s.count, '0 of 5 businesses');
  assert.match(s.nomatch || '', /No businesses match/);
  // one result
  await p.fill('.bz-search', 'plumb'); s = await state();
  assert.strictEqual(s.count, '1 of 5 businesses'); assert.strictEqual(s.spot, true);
  // Clear search brings everything back
  await p.fill('.bz-search', 'zzqxxxy'); await p.click('.bz-nomatch button'); s = await state();
  assert.strictEqual(s.spot, false); assert.strictEqual(s.count, '5 businesses');
  // an industry chip filters too
  await p.click('.bz-chips .bz-chip:nth-child(2)'); s = await state();
  assert.match(s.count, /^\d of 5 businesses$/); assert.strictEqual(s.spot, true);
  await browser.close();
  console.log('business search ui test passed');
  srv.kill(); require('fs').rmSync(DATA, { force: true }); process.exit(0);
})().catch(e => { console.error(e); srv.kill(); process.exit(1); });
