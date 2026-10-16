// Opportunity Club acceptance run (evidence item 1). Local only, fake staging seed data only.
// Spawns a local server from this checkout (STAGING=1, throwaway DATA_FILE), drives the six MVP scenarios through the
// HTTP API and a phone-sized Chromium (390x844), prints a PASS/FAIL table, saves every API exchange (tokens redacted)
// to raw/acceptance-S<n>.json and screenshots to screens/acceptance/.
//
// Usage (from the repository root):
//   npm ci && npm i --no-save playwright-core@1.56.1
//   node docs/evidence/2026-10-16/scripts/acceptance.js            # API + screenshots
//   node docs/evidence/2026-10-16/scripts/acceptance.js --no-browser   # API checks only
// Optional: FONTS_DIR=<folder with ibm-plex-sans-latin-<w>-normal.woff2> for real fonts in screenshots.
const path = require('path');
const L = require('./lib');
const NO_BROWSER = process.argv.includes('--no-browser');
const RAW = path.join(L.EVID, 'raw'), SCR = path.join(L.EVID, 'screens', 'acceptance');
const results = [], screens = {};
const check = (id, label, ok, detail) => { results.push({ id, check: label, ok: !!ok, detail: ok ? '' : detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${label}${ok || !detail ? '' : ' :: ' + detail}`); };
const S = (id, f) => (screens[id] = screens[id] || []).push(f);
// reload first: the app keeps "My opportunities" in memory, so changes made through the API show after a reload
async function openMine(p){ await p.reload(); await p.waitForSelector('#lobby:not([hidden])'); await L.sleep(900); await L.tab(p, 'biz'); await p.click('.op-seg button:nth-child(2)'); await L.sleep(800); await p.click('.op-tools .op-row'); await L.sleep(900); }
const sh = async (p, id, name, full) => { if(p) S(id, await L.shot(p, path.join(SCR, name + '.png'), full)); };

(async () => {
  const info = L.codeInfo();
  console.log('code:', JSON.stringify(info));
  const srv = await L.startServer();
  console.log('server:', srv.base, '| boot log:', srv.logs.join(' / '));
  const base = srv.base, R = {};
  const rec = n => (R[n] = R[n] || new L.Recorder(base));
  const r0 = rec('setup');
  const dir = await L.login(r0, 'Test Director', '246810');
  const P = {}; for(const n of [6, 7, 8, 9, 10, 12]) P[n] = await L.login(r0, L.playerName(n), L.playerPin(n));
  const ids = {}; for(const n of [6, 7, 8, 9, 12]) ids[n] = (await L.ws(base, P[n])).me;
  // the same tokens are named in every recorder
  const name = (r, tok, n) => r.name(tok, n);
  for(const k of ['S1', 'S2', 'S3', 'S4', 'S5', 'S6']){ const r = rec(k); name(r, dir, 'Test Director'); for(const n of Object.keys(P)) name(r, P[n], L.playerName(+n)); }
  const browser = !NO_BROWSER;
  if(browser) require('fs').rmSync(SCR, { recursive: true, force: true });

  // ---------------- S1: "I need help" post ----------------
  const S1title = 'Looking for a reliable mover in March';
  let p6 = null;
  if(browser){
    p6 = await L.phonePage(base, P[6]);
    await sh(p6, 'S3', 'S3-01-home-after-login-Player06');
    await p6.click('.op-home .op-big.need'); await L.sleep(900);
    await p6.click('.op-starter >> nth=0'); await p6.keyboard.type('reliable mover in March');
    await p6.fill('[aria-labelledby=op_tl]', S1title);
    await p6.click('.op-catchips [data-c="home"]');
    await p6.fill('.bz-form textarea', 'Moving a one-bedroom across town in March. Looking for a mover a member has used and trusts.');
    await p6.fill('.op-two input', 'East end');
    await sh(p6, 'S1', 'S1-01-need-form-filled', true);
    await p6.click('.bz-form button[type=submit]'); await p6.waitForSelector('.op-detail', { timeout: 10000 }).catch(() => {}); await L.sleep(700);
    await sh(p6, 'S1', 'S1-02-need-posted-detail');
  } else {
    await rec('S1').call('oppSave', { type: 'need', title: S1title, details: 'Moving a one-bedroom across town in March. Looking for a mover a member has used and trusts.', category: 'home', area: 'East end', expiresInDays: 30 }, P[6], 'S1 create (API, --no-browser)');
  }
  const f1 = await rec('S1').call('oppList', { type: 'need' }, P[7], 'S1 another member lists "I need help" listings');
  const L1 = (f1.body.items || []).find(x => x.title === S1title);
  check('S1.1', '"I need help" listing created by Player 06', !!L1, 'not in feed');
  check('S1.2', 'shows as type need / "I need help" to other members', L1 && L1.type === 'need' && L1.typeLabel === 'I need help', JSON.stringify(L1));
  check('S1.3', 'poster shown by club name only (member, no uid/contact)', L1 && L1.member === 'Test Player 06' && !('uid' in L1) && !('email' in L1) && !('phone' in L1), JSON.stringify(L1));
  check('S1.4', 'default expiry 30 days', L1 && Math.abs(L1.expiresAt - L1.createdAt - 30 * 864e5) < 60000, L1 && (L1.expiresAt - L1.createdAt));
  const v1 = await rec('S1').call('oppSave', { type: 'need', title: 'x', category: 'home' }, P[6], 'S1 validation: title too short');
  check('S1.5', 'server rejects a 1-character title (400)', v1.status === 400, v1.status);
  const v2 = await rec('S1').call('oppSave', { type: 'need', title: 'Need a mover', category: 'nope' }, P[6], 'S1 validation: unknown category');
  check('S1.6', 'server rejects an unknown category (400)', v2.status === 400, v2.status);

  // ---------------- S2: "I can help" post ----------------
  const S2title = 'Can help with resumes and cover letters';
  let p7 = null;
  if(browser){
    p7 = await L.phonePage(base, P[7]);
    await p7.click('.op-home .op-big.offer'); await L.sleep(900);
    await p7.fill('[aria-labelledby=op_tl]', S2title);
    await p7.click('.op-catchips [data-c="education"]');
    await p7.fill('.bz-form textarea', 'Happy to review a resume or cover letter for any member. Evenings only.');
    await p7.fill('.op-two input', 'Remote');
    await sh(p7, 'S2', 'S2-01-offer-form-filled', true);
    await p7.click('.bz-form button[type=submit]'); await p7.waitForSelector('.op-detail', { timeout: 10000 }).catch(() => {}); await L.sleep(700);
    await sh(p7, 'S2', 'S2-02-offer-posted-detail');
    await p7.context().close(); p7 = null;
  } else {
    await rec('S2').call('oppSave', { type: 'offer', title: S2title, details: 'Happy to review a resume or cover letter for any member. Evenings only.', category: 'education', area: 'Remote' }, P[7], 'S2 create (API, --no-browser)');
  }
  const f2 = await rec('S2').call('oppList', { type: 'offer' }, P[8], 'S2 another member filters "I can help"');
  const L2 = (f2.body.items || []).find(x => x.title === S2title);
  check('S2.1', '"I can help" listing created by Player 07', !!L2, 'not in feed');
  check('S2.2', 'shows as type offer / "I can help"; filter offer excludes needs', L2 && L2.typeLabel === 'I can help' && f2.body.items.every(x => x.type === 'offer'), JSON.stringify(L2));
  const f2b = await rec('S2').call('oppList', { q: 'resumes' }, P[8], 'S2 search finds it');
  check('S2.3', 'search "resumes" finds it', (f2b.body.items || []).some(x => x.id === (L2 && L2.id)), JSON.stringify(f2b.body.items && f2b.body.items.map(x => x.title)));

  // ---------------- S3: Home placement (UI) ----------------
  const h3 = await rec('S3').call('oppList', {}, P[8], 'S3 the Home card loads this right after sign-in');
  check('S3.1', 'feed API answers right after login (Home card data)', h3.status === 200 && h3.body.items.length >= 2, h3.status);
  let p8 = null;
  if(browser){
    p8 = await L.phonePage(base, P[8]);
    const dom = await p8.evaluate(() => {
      const body = document.getElementById('lobbyBody'), kids = [...body.children];
      const opp = document.querySelector('.op-home'), oppWrap = opp && opp.closest('.bz-homewrap');
      const bizWrap = oppWrap && oppWrap.previousElementSibling;
      return { tab: document.querySelector('#tabs [aria-selected=true]') && document.querySelector('#tabs [aria-selected=true]').dataset.tab,
        oppPresent: !!opp, heading: opp && opp.querySelector('h3').textContent, rows: opp ? opp.querySelectorAll('.op-hrow').length : 0,
        oppIndex: kids.indexOf(oppWrap), bizIndex: kids.indexOf(bizWrap), prevIsBizHome: !!(bizWrap && bizWrap.classList.contains('bz-homewrap') && bizWrap.textContent.length),
        prevText: bizWrap ? bizWrap.textContent.slice(0, 60) : null, firstCard: kids[0] && kids[0].className, top: opp ? Math.round(opp.getBoundingClientRect().top) : null };
    });
    console.log('S3 DOM:', JSON.stringify(dom));
    check('S3.2', 'Home (default "Tournament" tab) shows "Community Opportunities" after login', dom.tab === 'event' && dom.oppPresent && dom.heading === 'Community Opportunities', JSON.stringify(dom));
    check('S3.3', 'it sits directly after the Business Club home section', dom.prevIsBizHome && dom.oppIndex === dom.bizIndex + 1, JSON.stringify(dom));
    check('S3.4', 'it lists up to 4 newest open listings', dom.rows >= 1 && dom.rows <= 4, dom.rows);
    await sh(p8, 'S3', 'S3-02-home-after-login-Player08');
    await p8.evaluate(() => document.querySelector('.op-home').scrollIntoView({ block: 'start' }));
    await sh(p8, 'S3', 'S3-03-home-community-opportunities-scrolled');
  }

  // ---------------- S4: consent-based contact ----------------
  const r4 = rec('S4');
  if(browser){
    await p8.evaluate(() => document.querySelector('.op-home').scrollIntoView({ block: 'start' }));
    await p8.click(`.op-hrow:has-text("${S1title}")`); await p8.waitForSelector('.op-cta', { timeout: 10000 }); await L.sleep(500);
    await sh(p8, 'S4', 'S4-01-sender-opens-listing');
    await p8.click('.op-cta'); await L.sleep(500);
    await p8.fill('.op-sheet textarea', 'Hi! My cousin runs a two-person moving crew and moved me last year. Happy to connect you.');
    await sh(p8, 'S4', 'S4-02-sender-request-sheet');
    await p8.click('.op-sheet button[type=submit]'); await L.sleep(1000);
    await sh(p8, 'S4', 'S4-03-sender-request-sent');
  } else {
    await r4.call('oppRequest', { id: L1.id, message: 'Hi! My cousin runs a two-person moving crew and moved me last year. Happy to connect you.' }, P[8], 'S4 Player 08 sends a request');
  }
  let s8 = await r4.call('oppMine', {}, P[8], 'S4 sender: requests I sent (before reply)');
  const sent = (s8.body.sent || []).find(x => x.oppId === L1.id);
  check('S4.1', 'request stored as "sent" with no contact details', sent && sent.status === 'sent' && sent.shared === null, JSON.stringify(sent));
  let m6 = await r4.call('oppMine', {}, P[6], 'S4 poster: incoming requests');
  const inc = ((m6.body.listings || []).find(x => x.id === L1.id) || { requests: [] }).requests[0];
  check('S4.2', 'poster sees only sender club name + message (no uid, email, phone)', inc && inc.from === 'Test Player 08' && Object.keys(inc).sort().join() === 'answeredAt,createdAt,from,id,message,shared,status', JSON.stringify(inc));
  const dup = await r4.call('oppRequest', { id: L1.id, message: 'again' }, P[8], 'S4 duplicate request');
  check('S4.3', 'second request on the same listing refused (400)', dup.status === 400, dup.status);
  const self = await r4.call('oppRequest', { id: L1.id, message: 'me' }, P[6], 'S4 request on own listing');
  check('S4.4', 'request on own listing refused (400)', self.status === 400, self.status);
  const other = await r4.call('oppReply', { id: inc && inc.id, action: 'share', phone: '416-555-0199' }, P[9], 'S4 a third member tries to answer the request');
  check('S4.5', 'a third member cannot answer someone else\'s request (404)', other.status === 404, other.status);
  if(browser){
    await p6.click('#tabs [data-tab="event"]').catch(() => {}); await L.sleep(400);
    await L.tab(p6, 'biz'); await p6.click('.op-seg button:nth-child(2)'); await L.sleep(800);
    await p6.click('.op-tools .op-row'); await L.sleep(900);
    await sh(p6, 'S4', 'S4-04-poster-incoming-request', true);
    await p6.click('.op-req.sent .btn.bz-gold'); await L.sleep(500);
    await p6.click('.op-sheet .bz-switch:has-text("Share my phone")');
    await p6.fill('.op-sheet input[type=tel]', '416-555-0142');
    await p6.fill('.op-sheet input[maxlength="200"]', 'Text me after 6');
    await sh(p6, 'S4', 'S4-05-poster-chooses-phone-only');
    await p6.click('.op-sheet button[type=submit]'); await L.sleep(1000);
    await sh(p6, 'S4', 'S4-06-poster-after-sharing', true);
  } else {
    await r4.call('oppReply', { id: inc.id, action: 'share', phone: '416-555-0142', email: '', note: 'Text me after 6' }, P[6], 'S4 poster shares phone only');
  }
  s8 = await r4.call('oppMine', {}, P[8], 'S4 sender: requests I sent (after reply)');
  const sent2 = (s8.body.sent || []).find(x => x.oppId === L1.id);
  check('S4.6', 'sender now sees exactly the chosen field: phone + note, no email', sent2 && sent2.status === 'shared' && JSON.stringify(sent2.shared) === JSON.stringify({ phone: '416-555-0142', note: 'Text me after 6' }), JSON.stringify(sent2 && sent2.shared));
  const again = await r4.call('oppReply', { id: inc && inc.id, action: 'share', email: 'x@example.com' }, P[6], 'S4 poster tries to answer twice');
  check('S4.7', 'a request can be answered only once (400)', again.status === 400, again.status);
  // decline path
  const q9 = await r4.call('oppRequest', { id: L1.id, message: 'I have a van and two free Saturdays.' }, P[9], 'S4 Player 09 sends a request');
  await r4.call('oppReply', { id: q9.body.request && q9.body.request.id, action: 'decline' }, P[6], 'S4 poster declines Player 09');
  const s9 = await r4.call('oppMine', {}, P[9], 'S4 Player 09 sees the decline');
  const d9 = (s9.body.sent || []).find(x => x.oppId === L1.id);
  check('S4.8', 'declined request shares nothing', d9 && d9.status === 'declined' && d9.shared === null, JSON.stringify(d9));
  if(browser){
    await L.tab(p8, 'event'); await L.tab(p8, 'biz'); await p8.click('.op-seg button:nth-child(2)'); await L.sleep(800);
    await p8.click('.op-tools .op-row'); await L.sleep(800); await p8.click('.op-seg.small button:nth-child(2)'); await L.sleep(600);
    await sh(p8, 'S4', 'S4-07-sender-sees-only-phone');
    const txt = await p8.evaluate(() => document.getElementById('lobbyBody').innerText);
    check('S4.9', 'sender screen shows the phone and no email address', txt.includes('416-555-0142') && !/@/.test(txt), txt.slice(0, 200));
  }

  // ---------------- S5: My Posts edit / close / reopen / delete, server-side ownership ----------------
  const r5 = rec('S5');
  const ed = await r5.call('oppSave', { id: L1.id, type: 'need', title: 'Looking for a reliable mover in early March', details: L1.details, category: 'home', area: 'East end' }, P[6], 'S5 owner edits');
  check('S5.1', 'owner can edit; end date kept', ed.status === 200 && ed.body.item.title.endsWith('early March') && ed.body.item.expiresAt === L1.expiresAt, ed.status);
  for(const [api, body, lbl] of [['oppSave', { id: L1.id, type: 'need', title: 'Hijacked', category: 'home' }, 'edit'], ['oppClose', { id: L1.id }, 'close'], ['oppDelete', { id: L1.id }, 'delete']]){
    const x = await r5.call(api, body, P[7], `S5 another member tries to ${lbl}`);
    check('S5.2' + lbl[0], `another member cannot ${lbl} it (404)`, x.status === 404, x.status);
  }
  const forged = await r5.call('oppSave', { id: L1.id, uid: ids[7], type: 'need', title: 'Hijacked', category: 'home' }, P[7], 'S5 forged uid in the body');
  check('S5.3', 'a forged uid in the body changes nothing (404)', forged.status === 404, forged.status);
  const cl = await r5.call('oppClose', { id: L1.id, closed: true }, P[6], 'S5 owner closes');
  const gone = await r5.call('oppGet', { id: L1.id }, P[7], 'S5 others cannot open a closed listing');
  const feedC = await r5.call('oppList', {}, P[7], 'S5 feed after close');
  check('S5.4', 'closed: state closed, out of the feed, 404 for others', cl.body.item && cl.body.item.state === 'closed' && gone.status === 404 && !feedC.body.items.some(x => x.id === L1.id), `${cl.status} ${gone.status}`);
  if(browser){ await openMine(p6); await sh(p6, 'S5', 'S5-01-my-posts-closed', true); }
  const ro = await r5.call('oppClose', { id: L1.id, closed: false }, P[6], 'S5 owner reopens');
  const back = await r5.call('oppGet', { id: L1.id }, P[7], 'S5 others can open it again');
  check('S5.5', 'reopened: open again and visible to others', ro.body.item && ro.body.item.state === 'open' && back.status === 200, `${ro.status} ${back.status}`);
  if(browser){ await openMine(p6); await sh(p6, 'S5', 'S5-02-my-posts-reopened-edited'); }
  const del = await r5.call('oppDelete', { id: L1.id }, P[6], 'S5 owner deletes');
  const after = await r5.call('oppGet', { id: L1.id }, P[6], 'S5 owner opens deleted listing');
  const s8b = await r5.call('oppMine', {}, P[8], 'S5 sender: request removed with the listing');
  check('S5.6', 'deleted: 404 even for the owner, requests about it removed', del.status === 200 && after.status === 404 && !(s8b.body.sent || []).some(x => x.oppId === L1.id), `${del.status} ${after.status}`);
  if(browser){ await openMine(p6); await sh(p6, 'S5', 'S5-03-my-posts-after-delete'); await p6.context().close(); p6 = null; }

  // ---------------- S6: members only, reporting basics, removed member ----------------
  const r6 = rec('S6');
  const EPS = ['oppList', 'oppGet', 'oppSave', 'oppClose', 'oppDelete', 'oppMine', 'oppBadge', 'oppRequest', 'oppReply', 'oppRequestDelete', 'oppReport', 'oppReports', 'oppModerate'];
  const noTok = []; for(const e of EPS) noTok.push([(await r6.call(e, { id: 'o0000000000000000' }, null, 'S6 no token: ' + e)).status, e]);
  check('S6.1', 'every opportunity endpoint is 401 without sign-in (13 endpoints)', noTok.every(([s]) => s === 401), JSON.stringify(noTok.filter(([s]) => s !== 401)));
  const badTok = await r6.call('oppList', {}, 'not-a-real-token', 'S6 bad token');
  check('S6.2', 'a made-up token is 401', badTok.status === 401, badTok.status);
  check('S6.3', 'responses carry X-Robots-Tag noindex (even the 401)', badTok.headers.get('x-robots-tag') === 'noindex, nofollow, noarchive', badTok.headers.get('x-robots-tag'));
  const q403 = await r6.call('oppReports', {}, P[9], 'S6 member opens the director queue');
  const m403 = await r6.call('oppModerate', { id: L2.id, action: 'hide' }, P[9], 'S6 member tries to moderate');
  check('S6.4', 'members get 403 on the reports queue and moderation', q403.status === 403 && m403.status === 403, `${q403.status} ${m403.status}`);
  const rep = await r6.call('oppReport', { id: L2.id, reason: 'spam', note: 'Looks like an ad' }, P[9], 'S6 Player 09 reports a listing');
  const rep2 = await r6.call('oppReport', { id: L2.id, reason: 'spam' }, P[9], 'S6 same member reports again');
  const repOwn = await r6.call('oppReport', { id: L2.id, reason: 'spam' }, P[7], 'S6 poster reports own listing');
  const repBad = await r6.call('oppReport', { id: L2.id, reason: 'because' }, P[10], 'S6 report with an unknown reason');
  check('S6.5', 'report accepted once; duplicate, own and unknown-reason reports refused', rep.status === 200 && rep2.status === 400 && repOwn.status === 400 && repBad.status === 400, [rep, rep2, repOwn, repBad].map(x => x.status).join());
  const q = await r6.call('oppReports', {}, dir, 'S6 director queue');
  const qi = (q.body.items || []).find(x => x.id === L2.id);
  check('S6.6', 'director queue shows the report (reason, note, reporter name)', qi && qi.reports.length === 1 && qi.reports[0].reason === 'spam' && qi.reports[0].by === 'Test Player 09', JSON.stringify(qi));
  const vis = await r6.call('oppGet', { id: L2.id }, P[8], 'S6 one report does not hide it');
  check('S6.7', 'one report does not hide the listing (threshold is 3)', vis.status === 200 && vis.body.item.state === 'open', vis.status);
  // removed member
  const own12 = await r6.call('oppSave', { type: 'offer', title: 'Can help with tax forms', category: 'professional' }, P[12], 'S6 Player 12 posts before removal');
  await L.ws(base, dir, [{ t: 'remove', uid: ids[12] }], 600);
  const after12 = await r6.call('oppList', {}, P[12], 'S6 removed member uses old token');
  const gone12 = await r6.call('oppGet', { id: own12.body.item && own12.body.item.id }, P[9], 'S6 removed member listing');
  check('S6.8', 'removed member: old token is 401 and their listing is gone (404)', after12.status === 401 && gone12.status === 404, `${after12.status} ${gone12.status}`);
  if(browser){
    const anon = await L.phonePage(base, null, { wait: false });
    await sh(anon, 'S6', 'S6-01-not-signed-in-sign-in-screen');
    const anonApi = await anon.evaluate(async () => (await fetch('/api/oppList', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status);
    check('S6.9', 'browser without a token gets 401 from oppList', anonApi === 401, anonApi);
    await anon.context().close();
    const removed = await L.phonePage(base, P[12], { wait: false });
    await L.sleep(800);
    await sh(removed, 'S6', 'S6-02-removed-member-back-to-sign-in');
    await removed.context().close();
    const pd = await L.phonePage(base, dir);
    await L.tab(pd, 'biz'); await pd.click('.op-seg button:nth-child(2)'); await L.sleep(900); await pd.click('.op-row.dir'); await L.sleep(900);
    await sh(pd, 'S6', 'S6-03-director-queue-one-report');
    await pd.context().close();
  }

  // ---------------- S3 (cont.): hidden while seated in a running tournament ----------------
  await L.ws(base, dir, [{ t: 'create', name: 'Evidence Test', stack: 10000, levelMin: 20, startAt: null, repeat: 'none', anteMode: 'each', actSec: 20, tableSize: 9, lateLevels: 0, helper: 'on' }]);
  await L.ws(base, P[8], [{ t: 'join' }]); await L.ws(base, P[10], [{ t: 'join' }]);
  if(browser){
    await p8.close(); p8 = await L.phonePage(base, P[8]);
    const before = await p8.evaluate(() => ({ opp: !!document.querySelector('.op-home'), status: 'registered' }));
    await sh(p8, 'S3', 'S3-04-home-registered-not-started');
    await L.ws(base, dir, [{ t: 'start' }]); await L.sleep(1500);
    await p8.click('#lobbyBtn').catch(() => {}); await L.sleep(900);
    const during = await p8.evaluate(() => ({ opp: !!document.querySelector('.op-home'), bizHome: [...document.querySelectorAll('.bz-homewrap')].some(x => x.children.length), lobby: !document.getElementById('lobby').hidden, tab: document.querySelector('#tabs [aria-selected=true]') && document.querySelector('#tabs [aria-selected=true]').dataset.tab }));
    console.log('S3 seated: before', JSON.stringify(before), 'during', JSON.stringify(during));
    await sh(p8, 'S3', 'S3-05-home-while-seated-running');
    check('S3.5', 'Community Opportunities visible while only registered', before.opp, JSON.stringify(before));
    check('S3.6', 'hidden while seated in a running tournament (client side)', during.lobby && !during.opp && !during.bizHome, JSON.stringify(during));
    const apiSeated = await rec('S3').call('oppList', {}, P[8], 'S3 the API itself still answers while seated (hiding is client-side only)');
    console.log('S3 note: oppList while seated returns', apiSeated.status);
    await p8.context().close();
  } else {
    await L.ws(base, dir, [{ t: 'start' }]);
  }

  for(const [k, r] of Object.entries(R)) r.save(path.join(RAW, `acceptance-${k}.json`));
  await L.closeBrowser();
  console.log('\n' + L.table(results));
  const fails = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - fails} passed, ${fails} failed. Raw JSON: raw/acceptance-*.json. Screenshots:`);
  for(const [k, v] of Object.entries(screens)) console.log(' ', k, v.join(', '));
  console.log('server log:\n  ' + srv.logs.join('\n  '));
  L.stopAll(); process.exit(fails ? 1 : 0);
})().catch(async e => { console.error('ERROR', e); await L.closeBrowser(); L.stopAll(); process.exit(2); });
