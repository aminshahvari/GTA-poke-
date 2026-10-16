// CSP check of the Opportunity Club pages on the merged staging tree (evidence item 7). Local only, fake data only.
// test/browser/scan_csp.js covers sign-in + the business-card scanner. This walks every Opportunity Club screen as a
// member and as the director, collects Content-Security-Policy violations (securitypolicyviolation events in the page,
// CSP console messages), page errors and every request that leaves our own origin, then runs a negative control.
// Usage (from the repository root): node docs/evidence/2026-10-16/scripts/csp-opportunity.js
const path = require('path');
const L = require('./lib');

(async () => {
  console.log('code:', JSON.stringify(L.codeInfo()));
  const srv = await L.startServer(), base = srv.base;
  const R = new L.Recorder(base);
  const dir = await L.login(R, 'Test Director', '246810');
  const m = await L.login(R, L.playerName(6), L.playerPin(6)), o = await L.login(R, L.playerName(2), L.playerPin(2));
  // something in every state: a request on Player 02's listing, a reported listing for the director queue
  const list = (await R.call('oppList', {}, m)).body.items;
  const elec = list.find(x => x.title.includes('electrician'));
  await R.call('oppRequest', { id: elec.id, message: 'I know a good electrician.' }, m);
  const rep = list.find(x => x.title.includes('DJ'));
  await R.call('oppReport', { id: rep.id, reason: 'offtopic' }, m);
  const visited = [], fontReq = [];
  const run = async (tok, who, steps) => {
    const p = await L.phonePage(base, tok);
    for(const [label, fn] of steps){ await fn(p); await L.sleep(500); visited.push(`${who}: ${label}`); }
    const pageCsp = await p.evaluate(() => window.__csp.slice());
    fontReq.push(...p.context().fontReq);
    const res = { who, csp: [...pageCsp, ...p.csp], errors: p.errors.slice(), thirdParty: p.context().thirdParty.slice(), p };
    return res;
  };
  const toOpp = async p => { await L.tab(p, 'biz'); await p.click('.op-seg button:nth-child(2)'); await L.sleep(800); };
  const member = await run(m, 'member (Test Player 06)', [
    ['Home with Community Opportunities', async p => { await p.evaluate(() => document.querySelector('.op-home').scrollIntoView()); }],
    ['Business tab -> Opportunities feed', toOpp],
    ['feed filtered (Needs help + search)', async p => { await p.click('.bz-chips .bz-chip:nth-child(2)'); await p.fill('.bz-search', 'toronto'); }],
    ['listing detail', async p => { await p.fill('.bz-search', ''); await p.click('.bz-chips .bz-chip:nth-child(1)'); await p.click('.op-card:has-text("website to a new host")'); await L.sleep(700); }],
    ['contact request sheet', async p => { await p.click('.op-cta'); await L.sleep(400); await p.fill('.op-sheet textarea', 'Hi, I can help.'); await p.keyboard.press('Escape'); }],
    ['report sheet', async p => { await p.click('.op-report'); await L.sleep(400); await p.keyboard.press('Escape'); }],
    ['create form (I need help)', async p => { await p.click('.bz-back'); await L.sleep(500); await p.click('.op-top .op-big.need'); await L.sleep(700); }],
    ['My opportunities', async p => { await p.click('.bz-form .bz-stack button[type=button]'); await L.sleep(600); await p.click('.op-tools .op-row'); await L.sleep(700); }],
    ['Requests I sent', async p => { await p.click('.op-seg.small button:nth-child(2)'); }]
  ]);
  await member.p.context().close();
  const poster = await run(o, 'poster (Test Player 02)', [
    ['My opportunities with an incoming request', async p => { await toOpp(p); await p.click('.op-tools .op-row'); await L.sleep(700); }],
    ['share-contact sheet', async p => { await p.click('.op-req.sent .btn.bz-gold'); await L.sleep(400); await p.keyboard.press('Escape'); }]
  ]);
  await poster.p.context().close();
  const director = await run(dir, 'director', [
    ['Opportunities feed (director)', toOpp],
    ['Director view: show closed, expired and hidden', async p => { await p.click('.op-all input'); await L.sleep(700); await p.click('.op-all input'); await L.sleep(500); }],
    ['Reports queue', async p => { await p.click('.op-row.dir'); await L.sleep(700); }],
    ['listing detail with director controls', async p => { await p.click('.op-q .op-title-btn'); await L.sleep(700); }]
  ]);
  // negative control in the director page: a CDN script must be blocked and reported
  const before = (await director.p.evaluate(() => window.__csp.length));
  await director.p.evaluate(() => new Promise(r => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'; s.onerror = s.onload = r; document.head.appendChild(s); }));
  await L.sleep(300);
  const control = (await director.p.evaluate(() => window.__csp.slice())).slice(before);
  await director.p.context().close();
  await L.closeBrowser();
  const all = [member, poster, director];
  console.log('screens visited:\n  ' + visited.join('\n  '));
  for(const r of all) console.log(`${r.who}: CSP violations ${r.csp.length}${r.csp.length ? ' ' + r.csp.join(' | ') : ''}; page errors ${r.errors.length}${r.errors.length ? ' ' + r.errors.join(' | ') : ''}; blocked non-origin requests (excluding Google Fonts) ${r.thirdParty.length}${r.thirdParty.length ? ' ' + r.thirdParty.join(' ') : ''}`);
  console.log(`Google Fonts requests (pre-existing since before BC1; served locally only when FONTS_DIR is set, else aborted): ${fontReq.length}`);
  console.log('negative control (cdn.jsdelivr.net script injected):', control.length ? 'blocked and reported: ' + control.join('; ') : 'NOT BLOCKED');
  const ok = all.every(r => !r.csp.length && !r.errors.length && !r.thirdParty.length) && control.some(v => /script-src/.test(v));
  console.log(ok ? `PASS: ${visited.length} Opportunity Club screens, 0 CSP violations, 0 page errors, 0 third-party requests; control blocked` : 'FAIL');
  L.stopAll(); process.exit(ok ? 0 : 1);
})().catch(async e => { console.error('ERROR', e); await L.closeBrowser(); L.stopAll(); process.exit(2); });
