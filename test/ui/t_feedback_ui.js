// Feedback Hub (browser) at 320 and 390 px: a member opens the sheet from the lobby top bar, picks a type, writes a note,
// attaches a screenshot, sends and sees the thank-you; from Business the note is tagged "business". The owner's Director
// tab lists it (markup shown as text, never run), filters by type and status, changes the status, opens the screenshot and
// deletes a note; closing feedback hides members' buttons live. 44 px targets, visible labels and errors. No CSP violations, no page
// errors, no sideways scrolling.
// Needs Playwright + Chromium, which are not repo dependencies:
//   PLAYWRIGHT_CORE=/path/to/playwright-core CHROMIUM=/path/to/chromium node test/ui/t_feedback_ui.js
// Set SHOTS=docs/evidence/r2/feedback to save small screenshots.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || process.env.PLAYWRIGHT || 'playwright');
const PORT = 4850 + Math.floor(Math.random() * 50), BASE = 'http://localhost:' + PORT;
const DATA = require('os').tmpdir() + '/t_fbui_' + process.pid + '.json';
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
const srv = spawn('node', ['server/index.js'], { cwd: __dirname + '/../..', env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '', STAGING: '', CLUBS_DEFAULT: 'on', DATABASE_URL: '', RENDER_GIT_COMMIT: 'feedb4c0ffee' }, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(p, body, tok){
  const r = await fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body || {}) });
  const j = await r.json(); if(j.error) throw new Error(p + ': ' + j.error); return j;
}

(async () => {
  for(let i = 0; i < 60; i++){ try{ if((await fetch(BASE + '/healthz')).ok) break; }catch(e){} await sleep(150); }
  const O = (await api('setup', { code: 'secret', name: 'Director', pin: '2468', agree: true })).token;
  const join = async name => { const { code } = await api('invite', {}, O); return (await api('redeem', { code, name, pin: '1357', agree: true })).token; };
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  if(SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const problems = [];
  async function page(width, token){
    const ctx = await browser.newContext({ viewport: { width, height: width === 320 ? 640 : 844 }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    p.on('pageerror', e => problems.push(width + ' pageerror: ' + e.message));
    // "Failed to load resource" lines carry no URL: failed responses are checked by URL below instead
    p.on('console', m => { if(m.type() === 'error' && !/^Failed to load resource/.test(m.text())) problems.push(width + ' console: ' + m.text()); });
    p.on('response', r => { if(r.status() >= 400 && !(r.status() === 403 && /\/api\/fb(List|Send)$/.test(r.url()) && token !== O)) problems.push(width + ' ' + r.status() + ' ' + r.url()); });
    await p.addInitScript(() => document.addEventListener('securitypolicyviolation', e => console.error('CSP violation: ' + e.violatedDirective + ' ' + e.blockedURI)));
    await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await p.goto(BASE + '/'); await p.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), token);
    await p.reload(); await p.waitForSelector('#fbBtnLobby');
    return p;
  }
  const noSideScroll = async (p, what) => assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), what + ': no sideways scrolling');
  const shot = async (p, name) => { if(SHOTS) await p.screenshot({ path: path.join(SHOTS, name + '.jpg'), type: 'jpeg', quality: 60 }); };

  for(const width of [320, 390]){
    const M = await join('Member ' + width);
    const p = await page(width, M);
    // the button is in the lobby top bar and inside the screen; the table header has one too
    const box = await p.locator('#fbBtnLobby').boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= width && box.height >= 44 && box.width >= 44, width + ': Feedback button fits and is a 44 px target');
    assert.strictEqual(await p.locator('#chatSheet #fbBtnTable').count(), 1, 'the table chat has a Feedback button');
    await noSideScroll(p, width + ' lobby');
    // it never squeezes your name in the top bar (on phones it floats at the lower right instead)
    assert.ok(await p.evaluate(() => { const s = document.querySelector('#meChip .me-btn span:not(.av)'); return s.scrollWidth <= s.clientWidth + 1 && s.scrollHeight <= s.clientHeight + 1; }), width + ': name in the top bar is not cut');
    assert.strictEqual(await p.evaluate(() => getComputedStyle(document.getElementById('fbBtnLobby')).position), 'fixed');
    await shot(p, `lobby-${width}`);
    // open the sheet; sending without a type or text explains what is missing
    await p.click('#fbBtnLobby'); await p.waitForSelector('.fb-sheet[role="dialog"]');
    await shot(p, `sheet-${width}`);
    // every control is at least 44 px tall, and the fields have real visible labels
    const small = await p.$$eval('.fb-sheet button:not([hidden]), .fb-sheet label.btn:not([hidden]), .fb-sheet textarea', els => els.filter(e => e.getBoundingClientRect().height < 44 || e.getBoundingClientRect().width < 44).map(e => e.id || e.className));
    assert.deepStrictEqual(small, [], width + ': 44 px targets in the sheet');
    assert.strictEqual(await p.isVisible('label[for="fbText"]'), true); assert.strictEqual(await p.textContent('#fbCatLabel'), 'Type');
    await p.click('#fbSend'); assert.match(await p.textContent('.fb-err'), /Pick Bug, Idea or UX/);
    // the error and the Send button are on screen, not below the fold
    for(const sel of ['.fb-err', '#fbSend']){ const b = await p.locator(sel).boundingBox(); assert.ok(b.y >= 0 && b.y + b.height <= (width === 320 ? 640 : 844), width + ': ' + sel + ' visible'); }
    await p.click('[data-fbcat="bug"]'); assert.strictEqual(await p.getAttribute('[data-fbcat="bug"]', 'aria-pressed'), 'true');
    await p.click('#fbSend'); assert.match(await p.textContent('.fb-err'), /few more words/);
    await p.fill('#fbText', `The raise slider jumps at ${width} px wide.`);
    // attach a screenshot: a real PNG of this page, shrunk to a small JPEG on the phone
    const png = await p.screenshot({ type: 'png' });
    await p.setInputFiles('#fbFile', { name: 'screen.png', mimeType: 'image/png', buffer: png });
    await p.waitForSelector('.fb-shot img');
    assert.ok(await p.evaluate(() => document.querySelector('.fb-shot img').src.startsWith('data:image/jpeg;base64,')), 'preview is the shrunk JPEG');
    await noSideScroll(p, width + ' sheet');
    await shot(p, `sheet-filled-${width}`);
    await p.click('#fbSend'); await p.waitForSelector('#fbDone');
    assert.match(await p.textContent('.fb-done'), /Thank you!/);
    await shot(p, `sent-${width}`);
    await p.click('#fbDone'); assert.strictEqual(await p.locator('.fb-wrap').count(), 0, 'sheet closes');
    // from Business: a second note, tagged with that section, without a screenshot; Escape closes an open sheet
    await p.click('#tabs [data-tab="biz"]'); await p.waitForSelector('#tabs [data-tab="biz"][aria-selected="true"]');
    await p.click('#fbBtnLobby'); await p.keyboard.press('Escape'); assert.strictEqual(await p.locator('.fb-wrap').count(), 0, 'Escape closes');
    // the note carries markup on purpose: the owner's inbox must show it as text and never run it
    await p.click('#fbBtnLobby'); await p.click('[data-fbcat="idea"]'); await p.fill('#fbText', '<img src=x onerror="window.__xss=1"><b>Let me save businesses as favourites.</b>');
    await p.click('#fbSend'); await p.waitForSelector('#fbDone'); await p.click('#fbDone');
    // a member has no inbox: the Director tab stays hidden and the API says no
    assert.strictEqual(await p.locator('#dirTab').isHidden(), true);
    assert.strictEqual(await p.evaluate(async () => (await fetch('/api/fbList', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + JSON.parse(localStorage.getItem('stacked:token')) }, body: '{}' })).status), 403);
    await p.context().close();

    // ---- the owner's inbox ----
    const q = await page(width, O);
    // at a table (the owner's practice table): Chat, then Feedback; the note is tagged Poker
    await q.click('#dirTab'); await q.click('[data-demo]'); await q.waitForSelector('#game:not([hidden])');
    await q.click('#chatBtn'); await q.waitForSelector('#fbBtnTable', { state: 'visible' });
    const tb = await q.locator('#fbBtnTable').boundingBox();
    assert.ok(tb.width >= 44 && tb.height >= 44 && tb.x + tb.width <= width, width + ': table Feedback button is a 44 px target on screen');
    await q.click('#fbBtnTable'); await q.click('[data-fbcat="ux"]'); await q.fill('#fbText', `At the table on a ${width} px phone.`);
    await shot(q, `table-sheet-${width}`);
    await q.click('#fbSend'); await q.waitForSelector('#fbDone'); await q.click('#fbDone');
    await q.click('#chatClose'); await q.click('#lobbyBtn'); await q.waitForSelector('#lobby:not([hidden])');
    await q.click('#dirTab'); await q.waitForSelector('#fbList .fb-item');
    await q.waitForFunction(w => [...document.querySelectorAll('#fbList .fb-item')].some(e => e.querySelector('.fb-text').textContent.includes(w + ' px phone') && / · Poker · /.test(e.querySelector('.fb-meta').textContent)), width);
    const items = () => q.$$eval('#fbList .fb-item', els => els.map(e => ({ cat: e.querySelector('.fb-pill').textContent, status: e.querySelector('select').value, text: e.querySelector('.fb-text').textContent, meta: e.querySelector('.fb-meta').textContent, shot: !!e.querySelector('.fb-view-shot'), markup: !!e.querySelector('.fb-text *') })));
    let L = await items();
    const mine = L.filter(x => x.meta.startsWith('Member ' + width));
    assert.strictEqual(mine.length, 2, width + ': both notes listed');
    const bug = mine.find(x => x.cat === 'Bug'), idea = mine.find(x => x.cat === 'Idea');
    assert.ok(bug.shot && !idea.shot, 'screenshot only on the bug');
    assert.match(bug.meta, /Home · vfeedb4c · Linux · Chrome · \d+×\d+/); assert.match(idea.meta, /Business · vfeedb4c/);
    // stored XSS: shown as the literal text, no element created, nothing ran
    assert.ok(idea.text.startsWith('<img src=x onerror=') && !idea.markup, 'markup shown as text');
    assert.strictEqual(await q.evaluate(() => window.__xss), undefined, 'the payload never ran');
    assert.match(bug.text, new RegExp(width + ' px'));
    await noSideScroll(q, width + ' inbox');
    await sleep(300); await q.evaluate(() => document.getElementById('fbAdmin').scrollIntoView());
    await shot(q, `inbox-${width}`);
    // filter by type
    await q.selectOption('#fbFilterCat', 'idea'); await q.waitForFunction(() => [...document.querySelectorAll('#fbList .fb-pill')].every(e => e.textContent === 'Idea'));
    L = await items(); assert.ok(L.length >= 1 && L.every(x => x.cat === 'Idea'));
    await q.selectOption('#fbFilterCat', 'bug'); await q.waitForFunction(() => [...document.querySelectorAll('#fbList .fb-pill')].every(e => e.textContent === 'Bug'));
    // change the status of this width's bug to In progress, then filter by status
    const id = await q.$$eval('#fbList .fb-item', (els, w) => els.find(e => e.querySelector('.fb-meta').textContent.startsWith('Member ' + w)).dataset.fbitem, width);
    await q.selectOption(`select[data-fbid="${id}"]`, 'progress');
    await q.waitForSelector('.toast'); assert.match(await q.textContent('.toast'), /Marked In progress/);
    await q.selectOption('#fbFilterStatus', 'progress');
    await q.waitForFunction(i => { const it = [...document.querySelectorAll('#fbList .fb-item')]; return it.length && it.every(e => e.querySelector('select').value === 'progress') && it.some(e => e.dataset.fbitem === i); }, id);
    assert.match(await q.textContent('.fb-counts'), /In progress [1-9]/);
    await sleep(2800); await q.evaluate(() => document.getElementById('fbAdmin').scrollIntoView());
    await shot(q, `inbox-filtered-${width}`);
    // the screenshot opens for the owner, from a blob URL fetched with the token
    await q.click(`[data-fbitem="${id}"] .fb-view-shot`); await q.waitForSelector('.fb-full');
    await q.waitForFunction(() => document.querySelector('.fb-full').complete && document.querySelector('.fb-full').naturalWidth > 0);
    assert.ok((await q.getAttribute('.fb-full', 'src')).startsWith('blob:'));
    await shot(q, `screenshot-view-${width}`);
    await q.keyboard.press('Escape');
    // a plain link to the screenshot (no token) is refused
    assert.strictEqual((await fetch(BASE + '/fbshot/' + id)).status, 404);
    // clearing the filters shows everything again
    await q.selectOption('#fbFilterStatus', ''); await q.selectOption('#fbFilterCat', '');
    await q.waitForFunction(n => document.querySelectorAll('#fbList .fb-item').length >= n, width === 320 ? 3 : 5);   // members' notes plus the owner's table note; at 390 the 320 idea note is already deleted
    // inbox controls are 44 px targets too
    const smallQ = await q.$$eval('#fbAdmin button, #fbAdmin select', els => els.filter(e => e.getBoundingClientRect().height < 44).map(e => e.id || e.className));
    assert.deepStrictEqual(smallQ, [], width + ': 44 px targets in the inbox');
    // delete this width's idea note: asks first, then it is gone
    const ideaId = await q.$$eval('#fbList .fb-item', (els, w) => els.find(e => e.querySelector('.fb-meta').textContent.startsWith('Member ' + w) && e.querySelector('.fb-pill').textContent === 'Idea').dataset.fbitem, width);
    const n0 = await q.locator('#fbList .fb-item').count();
    await q.click(`[data-fbitem="${ideaId}"] .fb-del`); await q.click('#modalRoot .btn-red');
    await q.waitForFunction(i => !document.querySelector(`[data-fbitem="${i}"]`), ideaId);
    assert.strictEqual(await q.locator('#fbList .fb-item').count(), n0 - 1);
    await q.context().close();
  }

  // ---- the owner's off switch: members' Feedback buttons go away live, and come back when reopened ----
  {
    const M = await join('Member switch');
    const p = await page(390, M), q = await page(390, O);
    await q.click('#dirTab'); await q.waitForSelector('#fbSwitch');
    await q.click('#fbSwitch'); await q.click('#modalRoot .btn-red');
    await p.waitForFunction(() => document.getElementById('fbBtnLobby').hidden && document.getElementById('fbBtnTable').hidden);
    assert.strictEqual(await p.isVisible('#fbBtnLobby'), false, 'no button while closed');
    await q.waitForFunction(() => /Open feedback to members/.test(document.getElementById('fbSwitch').textContent));
    await q.evaluate(() => document.getElementById('fbAdmin').scrollIntoView());
    await shot(q, 'inbox-closed-390');
    assert.strictEqual(await p.evaluate(async () => (await fetch('/api/fbSend', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + JSON.parse(localStorage.getItem('stacked:token')) }, body: JSON.stringify({ cat: 'bug', text: 'Closed, so refused.' }) })).status), 403);
    await q.click('#fbSwitch'); await q.click('#modalRoot .btn-red');
    await p.waitForFunction(() => !document.getElementById('fbBtnLobby').hidden);
    await p.context().close(); await q.context().close();
  }
  await browser.close();
  assert.deepStrictEqual(problems, [], 'no page errors, console errors or CSP violations');
  console.log('feedback hub ui test passed (320 and 390 px)');
  srv.kill(); fs.rmSync(DATA, { force: true }); process.exit(0);
})().catch(e => { console.error(e); srv.kill(); fs.rmSync(DATA, { force: true }); process.exit(1); });
