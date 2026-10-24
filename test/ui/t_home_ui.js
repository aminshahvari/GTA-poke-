// The board's Home tab (Issue #32, Step-0 spec §7, phase B6: the board's "Live at Blindrise"), run with UI_BOARD=1.
// Staging seed accounts only (Test Director, Test Player NN, their staging demo businesses and Bulletin listings);
// every tournament, table, seat, result and post on the page is a fixture patched into the club messages in the page
// (as t_poker_ui does), never real data. Scenarios are switched with a delta message (only the keys that changed, and
// "gone" for a key that went), the way the server sends them, so Home is checked as drawn from merged deltas.
// At 320x568, 375x667, 390x844 and 430x932 portrait and 844x390 landscape:
//  - Live at Blindrise: the red live dot, "N Live Tables" opening Poker on Live; a card per table with a drawn mini
//    felt and its seated avatars (open seats as empty places), "<club> – Table 1", "Level 5 · 100/200 · 12:34" with a
//    clock that runs; a tap watches; empty: "No live tables right now" with the next start time
//  - the winner's day (owner decision): within a day of endedAt the result card (winner, field size, runner-up) and the
//    winner's Exchange card side by side; no published card: the result card alone; after the day both go, by
//    themselves, and the result is a Community Activity row again; the Exchange closed to members: no Exchange card
//  - Community Activity: the filters All / Tournaments / Business / Highlights; rows with a 40 lead; founder posts,
//    results, new members, the night's sponsor, the Exchange spotlight and new cards, the Bulletin's listings ("Offering
//    help" with its category and member, one tap to the listing, one tap to the request sheet)
//  - nothing wider than the screen (the sideways rails scroll inside themselves), every tap target at least 44 tall
// PLAYWRIGHT=/path/to/playwright-core CHROMIUM=/path/to/chromium node test/ui/t_home_ui.js   SHOTS=<dir> screenshots
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const { chromium } = require(process.env.PLAYWRIGHT || process.env.PLAYWRIGHT_CORE || 'playwright');
const ROOT = process.env.ROOT || path.join(__dirname, '..', '..');
const PORT = 5880 + Math.floor(Math.random() * 80), BASE = 'http://localhost:' + PORT;
const DATA = path.join(os.tmpdir(), 't_home_' + process.pid + '.json');
const srv = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, UI_BOARD: '1', PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '', STAGING: '1', DATABASE_URL: '' }, stdio: 'ignore' });
const cleanup = () => { try{ srv.kill(); }catch(e){} fs.rmSync(DATA, { force: true }); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SHOTS = process.env.SHOTS || '';
const SIZES = (process.env.SIZES || '320x568,375x667,390x844,430x932,844x390').split(',').filter(Boolean);
const api = async (p, body, tok) => { const j = await (await fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body || {}) })).json(); if(j.error) throw new Error(p + ': ' + j.error); return j; };
const fails = [];
let oks = 0;
const check = (cond, msg) => { if(cond) oks++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if(!cond) fails.push(msg); };
const DAY = 864e5, HOUR = 36e5;

// ---------- fixtures ----------
const FAKE = Array.from({ length: 31 }, (_, i) => 'fx' + String(i + 1).padStart(2, '0'));
const runT = (o = {}) => ({ id: 'thm', name: 'Friday Night Tournament', status: 'running', regs: FAKE.concat('fx32'), stack: 30000, levelMin: 20, tableSize: 9, lateLevels: 0, repeat: 'none', anteMode: 'bb', actSec: 20,
  startAt: Date.now() - HOUR, entrants: 16, remaining: 16, level: 4, levelEndsAt: Date.now() + 12 * 60000 + 34000, paused: false, places: [], lateOpen: false, sponsor: null, prize: '', ...o });
const regT = (o = {}) => ({ ...runT(), status: 'registering', regs: FAKE, entrants: 0, remaining: 0, level: 0, startAt: Date.now() + 2 * DAY, ...o });
const TABLES = [{ tid: 'th1', n: 1, players: 9 }, { tid: 'th2', n: 2, players: 7 }];
const result = (id, name, endedAt, winner, second, entrants) => ({ id, name, entrants, endedAt, results: [{ uid: winner.id, name: winner.name, place: 1, pts: 50 }, { uid: second.id, name: second.name, place: 2, pts: 30 }], payouts: [60, 40] });
const POSTS = [{ id: 'p1', kind: 'news', title: 'A note from the founder', body: 'Thank you for a great month. (Test post.)', when: null, at: Date.now() - 5 * HOUR }];

async function page(browser, tok, w, h){
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pg = await ctx.newPage();
  await pg.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => r.abort());
  const S = { patch: null, ws: null, members: null };
  await pg.routeWebSocket(/\/ws$/, ws => {
    const server = ws.connectToServer(); S.ws = ws;
    ws.onMessage(m => { try{ const j = JSON.parse(m); if(j.t === 'watch' || j.t === 'join' || j.t === 'leave') return; }catch(e){} server.send(m); });
    server.onMessage(m => { let j; try{ j = JSON.parse(m); }catch(e){ return ws.send(m); }
      if(j.t === 'club'){ if(j.club.me) S.me = j.club.me.id; if(j.club.members && j.club.members.length) S.members = j.club.members; if(S.patch) Object.assign(j.club, S.patch); }
      ws.send(JSON.stringify(j)); });
  });
  await pg.goto(BASE + '/'); await pg.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), tok);
  await pg.reload(); await pg.waitForSelector('#lobby:not([hidden]) #tabs [data-tab="home"]', { timeout: 10000 }).catch(() => {}); await sleep(800);
  // (as the server does, every delta carries its "now": the app keeps its clock to the server's with it)
  S.set = async (patch, gone = []) => { S.patch = { ...(S.patch || {}), ...patch }; gone.forEach(k => delete S.patch[k]); S.ws.send(JSON.stringify({ t: 'club', d: 1, club: { ...patch, now: Date.now() }, gone })); await sleep(400); };
  S.who = n => S.members.find(m => m.name === n);
  return { ctx, pg, S };
}
const tapTab = async (pg, k) => { await pg.tap(`#tabs [data-tab="${k}"]`); await sleep(350); };
const until = async (f, ms = 5000) => { const t0 = Date.now(); for(;;){ const v = await f(); if(v || Date.now() - t0 > ms) return v; await sleep(150); } };
// what Home shows, measured
const look = pg => pg.evaluate(() => {
  const W = innerWidth, q = s => document.querySelector('#lobbyBody ' + s), r = e => e.getBoundingClientRect(), txt = e => { if(!e) return ''; const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT), out = []; while(w.nextNode()) if(!w.currentNode.parentElement.closest('.av')) out.push(w.currentNode.nodeValue); return out.join(' ').replace(/\s+/g, ' ').trim(); };
  const RAILS = '.b-win-rail,.b-ltables,.bz-rail,.b-fchips';
  const wide = [...document.querySelectorAll('#lobby *')].filter(e => e.getClientRects().length && getComputedStyle(e).position !== 'fixed' && !e.closest('svg') && !e.parentElement.closest(RAILS) && (r(e).right > W + .5 || r(e).left < -.5)).map(e => (e.id || e.className.toString()).slice(0, 40));
  const taps = [...document.querySelectorAll('#lobbyBody :is(.b-row,.b-fchip,.b-fi-act,.b-ltable,.b-win-card,.b-sec-link,.b-win .bz-vcard,.b-next .btn)')].filter(e => e.getClientRects().length && r(e).height < 44 - .5).map(e => txt(e).slice(0, 30) + ' ' + Math.round(r(e).height));
  const live = q('.b-live'), win = q('.b-win'), feed = q('.b-feed');
  return { W, scroll: Math.max(document.documentElement.scrollWidth - W, document.body.scrollWidth - W), wide: wide.slice(0, 6), taps,
    order: [...document.querySelectorAll('#lobbyBody > *')].map(e => ['b-next', 'b-steps', 'b-live', 'b-win', 'lv-head', 'b-feed', 'hsec-biz'].find(c => e.classList.contains(c)) || '?').join(','),
    live: live && { dot: !!live.querySelector('.b-live-dot.on'), link: txt(live.querySelector('.b-sec-link')), none: txt(live.querySelector('.b-live-none')),
      tables: [...live.querySelectorAll('.b-ltable')].map(b => ({ text: txt(b), tid: b.dataset.watch, avs: b.querySelectorAll('.b-mseat .av').length, open: b.querySelectorAll('.b-mseat.open').length, felt: !!b.querySelector('.b-mfelt-o'), clk: txt(b.querySelector('[data-bclk]')), w: r(b).width })) },
    win: win && { card: txt(win.querySelector('.b-win-card')), biz: txt(win.querySelector('.bz-vcard')), one: win.querySelector('.b-win-rail').classList.contains('one'), av: !!win.querySelector('.b-win-card .av') },
    feed: feed && { chips: [...feed.querySelectorAll('.b-fchip')].map(c => c.textContent + (c.getAttribute('aria-pressed') === 'true' ? '*' : '')).join('|'),
      rows: [...feed.querySelectorAll('.b-fi')].map(f => ({ text: txt(f.querySelector('.b-row')), k: txt(f.querySelector('.b-feed-k')), lead: (() => { const l = f.querySelector('.b-feed-row > :first-child'); return l ? Math.round(r(l).width) + 'x' + Math.round(r(l).height) : ''; })(),
        opp: (f.querySelector('[data-bopp]') || {}).dataset ? f.querySelector('[data-bopp]').dataset.bopp : '', act: txt(f.querySelector('.b-fi-acts')), req: !!f.querySelector('[data-boppreq]') })),
      none: txt(feed.querySelector('.b-feed-none')) } };
});
const fitOk = (tag, m) => {
  check(m.scroll <= 0 && !m.wide.length, `${tag}: nothing wider than the screen, no sideways scroll (${m.scroll}${m.wide.length ? '; ' + m.wide.join(', ') : ''})`);
  check(!m.taps.length, `${tag}: every row, chip, card and button at least 44 tall${m.taps.length ? ': ' + m.taps.join(', ') : ''}`);
};
const shot = async (pg, name) => { if(!SHOTS) return;
  await pg.evaluate(() => window.scrollTo(0, 0)); await sleep(150); await pg.screenshot({ path: path.join(SHOTS, name + '.png') });
  if(await pg.evaluate(() => document.documentElement.scrollHeight > innerHeight + 4)) await pg.screenshot({ path: path.join(SHOTS, name + '-full.png'), fullPage: true }); };
const scrollTo = (pg, sel) => pg.evaluate(s => { const e = document.querySelector(s); if(e) e.scrollIntoView({ block: 'center' }); }, sel);

async function member(browser, tok, w, h){
  const s = `${w}x${h}`;
  const { ctx, pg, S } = await page(browser, tok, w, h);
  const me = S.who('Test Player 01'), p2 = S.who('Test Player 02'), p3 = S.who('Test Player 03'), p6 = S.who('Test Player 06');
  // (the staging seed has 12 test players and the director: the second table reuses some of them, as a fixture)
  const seated = S.members.map(m => m.id);
  const SEATS = { th1: seated.slice(0, 9), th2: [...seated.slice(seated.length - 7), null, null] };
  // ---- running, with a result from two hours ago (Test Player 02 has a published demo card) ----
  await S.set({ tourney: runT(), tables: TABLES, seats: SEATS, myTable: null, history: [result('hw1', 'Thursday Night', Date.now() - 2 * HOUR, p2, p3, 37), result('hw0', 'Monday Social', Date.now() - 4 * DAY, p3, p2, 12)], blindrise: POSTS, features: { clubs: true } });
  await tapTab(pg, 'poker'); await tapTab(pg, 'home');
  await until(() => pg.evaluate(() => !!document.querySelector('#lobbyBody .b-win .bz-vcard') && !!document.querySelector('#lobbyBody [data-boppreq]')));
  let m = await look(pg), tag = `${s} live`;
  check(m.order === 'b-next,b-live,b-win,b-feed,hsec-biz', `${tag}: Home top to bottom: ${m.order}`);
  check(m.live && m.live.dot && m.live.link === '2 Live Tables', `${tag}: "Live at Blindrise" with the red live dot and "2 Live Tables" (${m.live && m.live.link})`);
  const [t1, t2] = m.live.tables;
  check(t1 && t1.felt && t1.avs === 9 && t1.open === 0 && t2 && t2.avs === 7 && t2.open === 2, `${tag}: a drawn mini felt per table with its seated avatars (${t1 && t1.avs}+${t1 && t1.open} open, ${t2 && t2.avs}+${t2 && t2.open} open)`);
  check(/– Table 1 Level 5 · [\d,]+\/[\d,]+ · 12:\d\d 9 players Watch$/.test(t1.text), `${tag}: the card: "<club> – Table 1", "Level 5 · 100/200 · 12:34" (${t1.text})`);
  check(t1.w <= w, `${tag}: a table card fits the screen (${Math.round(t1.w)})`);
  const c0 = t1.clk; await sleep(1300); const c1 = (await look(pg)).live.tables[0].clk;
  check(c0 !== c1 && /^12:\d\d$/.test(c1), `${tag}: the level clock runs (${c0} → ${c1})`);
  check(m.win && /^Latest result · .+ Test Player 02 won Thursday Night 37 players · 2nd Test Player 03 Standings$/.test(m.win.card) && m.win.av, `${tag}: the winner's result card: name, field size, runner-up (${m.win && m.win.card})`);
  check(m.win && /Maple & Main Realty/.test(m.win.biz) && /Test Player 02/.test(m.win.biz) && !m.win.one, `${tag}: and the winner's Exchange card beside it (${m.win && m.win.biz})`);
  check(m.feed && m.feed.chips === 'All*|Tournaments|Business|Highlights', `${tag}: Community Activity filters: ${m.feed && m.feed.chips}`);
  const rows = m.feed.rows, offer = rows.find(x => /Offering help/.test(x.k) && /Can review your small-business books/.test(x.text));
  check(!rows.some(x => /Thursday Night/.test(x.text)) && rows.some(x => /^Result · .*Test Player 03 won Monday Social 12 players · 2nd Test Player 02/.test(x.text)), `${tag}: the winner's result is in the rail, not twice; the older result is a row`);
  check(rows.some(x => /From Blindrise.*A note from the founder/.test(x.text)), `${tag}: the founder's post`);
  check(rows.some(x => /^New member · .* joined the club/.test(x.text)), `${tag}: new members (when they joined; nothing about who invited them)`);
  check(!!offer && /[A-Za-z&]+ · Test Player 05$/.test(offer.text) && offer.req && /I'm interested/.test(offer.act), `${tag}: a Bulletin offer: "Offering help", its category and member, and a request button (${offer && offer.text} / ${offer && offer.act})`);
  check(rows.some(x => /Offering help/.test(x.k) && /Free plumbing advice/.test(x.text) && /Your listing/.test(x.act)), `${tag}: my own offer says "Your listing" (no request to myself)`);
  check(rows.filter(x => x.lead).every(x => x.lead === '40x40'), `${tag}: every row leads with a 40 avatar, logo or icon (${[...new Set(rows.map(x => x.lead))].join(', ')})`);
  check(rows.some(x => /New in the Exchange|Exchange spotlight/.test(x.k)), `${tag}: the Exchange (spotlight or new cards) in Business`);
  fitOk(tag, m);
  await shot(pg, `b6-member-${s}-live`);
  // one tap: the request sheet for the offer (closed again without sending), and the listing itself
  await scrollTo(pg, `[data-boppreq="${offer.opp}"]`);
  await pg.tap(`#lobbyBody [data-boppreq="${offer.opp}"]`); await sleep(400);
  const sheet = await pg.evaluate(() => { const s = document.querySelector('.op-sheet-wrap'); return s ? s.textContent.replace(/\s+/g, ' ') : ''; });
  check(/Show interest/.test(sheet) && /Posted by Test Player 05/.test(sheet) && /Send request/.test(sheet), `${tag}: one tap on "I'm interested" opens the request sheet (${sheet.slice(0, 80)})`);
  if(s === '390x844') await shot(pg, `b6-member-${s}-request`);
  await pg.keyboard.press('Escape'); await sleep(250);
  await pg.tap(`#lobbyBody [data-bopp="${offer.opp}"]`);
  const det = await until(() => pg.evaluate(() => { const d = document.querySelector('#lobbyBody .op-detail'); return d ? d.textContent.replace(/\s+/g, ' ') : ''; }));
  check(/Can review your small-business books/.test(det) && /Test Player 05/.test(det) && /I'm interested/.test(det), `${tag}: one tap on the row opens the listing: who posted it and the request button`);
  await tapTab(pg, 'home');
  // the filters
  for(const [k, want, not] of [['b', /Offering help/, /From Blindrise|won /], ['t', /won Monday Social/, /The Bulletin|New member/], ['h', /A note from the founder.*New member|New member.*A note from the founder/, /The Bulletin ·/]]){
    await pg.tap(`#lobbyBody [data-bfcat="${k}"]`); await sleep(250);
    const f = (await look(pg)).feed, all = f.rows.map(x => x.text + ' ' + x.k).join(' | ');
    check(want.test(all) && !not.test(all), `${tag}: filter ${f.chips}: ${all.slice(0, 140)}`);
  }
  await pg.tap('#lobbyBody [data-bfcat="all"]'); await sleep(250);
  // "2 Live Tables" opens Poker on Live; a tap on a table watches it
  await pg.tap('#lobbyBody .b-live .b-sec-link'); await sleep(400);
  check(await pg.evaluate(() => document.querySelector('#tabs [aria-selected="true"]').dataset.tab === 'poker' && document.querySelector('#lobbyBody [data-pseg="live"]').getAttribute('aria-selected') === 'true'), `${tag}: "2 Live Tables" opens Poker on Live`);
  await tapTab(pg, 'home');
  // ---- the winner's day ends: 3 s before endedAt + 24 h the rail shows; then it goes by itself ----
  await S.set({ history: [result('hw1', 'Thursday Night', Date.now() - DAY + 3000, p2, p3, 37)] });
  check(!!(await pg.$('#lobbyBody .b-win')), `${tag}: within the day the winner's cards show`);
  const gone = await until(() => pg.evaluate(() => !document.querySelector('#lobbyBody .b-win')), 6000);
  m = await look(pg);
  check(gone && m.feed.rows.some(x => /^Latest result · .*Test Player 02 won Thursday Night 37 players · 2nd Test Player 03/.test(x.text)), `${tag}: a day after it ended both cards go by themselves; the result stays as a "Latest result" row`);
  fitOk(tag + ' after the day', m);
  // ---- a winner with no published card: the result card alone; then the Exchange closed: no Exchange card ----
  await S.set({ history: [result('hw2', 'Saturday Night', Date.now() - 30 * 60000, p6, me, 9)] });
  await sleep(800); m = await look(pg);
  check(m.win && m.win.one && !m.win.biz && /Test Player 06 won Saturday Night 9 players · 2nd Test Player 01/.test(m.win.card), `${tag}: no published card: the result card alone (${m.win && m.win.card})`);
  fitOk(tag + ' result card alone', m);
  await S.set({ history: [result('hw1', 'Thursday Night', Date.now() - 2 * HOUR, p2, p3, 37)], features: { clubs: false } });
  m = await look(pg);
  check(m.win && m.win.one && !m.win.biz && !m.feed.rows.some(x => /The Bulletin|Exchange/.test(x.k)), `${tag}: the Exchange closed to members: the result card only, no Exchange or Bulletin rows`);
  // ---- nothing live, the next game registering; the history gone (a delta "gone") ----
  await S.set({ tourney: regT(), tables: [], seats: {}, features: { clubs: true } }, ['history']);
  m = await look(pg); tag = `${s} empty`;
  check(m.live && !m.live.dot && !m.live.tables.length && /^No live tables right now The next game starts .+\.$/.test(m.live.none) && !m.live.link, `${tag}: "No live tables right now" with the next start time (${m.live && m.live.none})`);
  check(!m.win && !m.feed.rows.some(x => / won /.test(x.text)), `${tag}: no history: no winner cards and no result rows`);
  fitOk(tag, m);
  await shot(pg, `b6-member-${s}-empty`);
  await ctx.close();
}
// one request sent from Home: the row says so after
async function sendOne(browser, tok){
  const { ctx, pg, S } = await page(browser, tok, 390, 844);
  await S.set({ tourney: regT(), tables: [], seats: {}, history: [], features: { clubs: true } });
  await tapTab(pg, 'poker'); await tapTab(pg, 'home');
  await until(() => pg.$('#lobbyBody [data-boppreq]'));
  const id = await pg.evaluate(() => [...document.querySelectorAll('#lobbyBody .b-fi-opp')].find(f => /small-business books/.test(f.textContent)).querySelector('[data-boppreq]').dataset.boppreq);
  await scrollTo(pg, `[data-boppreq="${id}"]`); await pg.tap(`#lobbyBody [data-boppreq="${id}"]`); await sleep(400);
  await pg.fill('.op-sheet textarea', 'Hello, I would like a quick look at my books this month. (Test.)');
  await pg.tap('.op-sheet button[type="submit"]');
  const after = await until(() => pg.evaluate(i => { const b = document.querySelector(`#lobbyBody [data-bopp="${i}"]`); const f = b && b.closest('.b-fi-opp'); return f && /Request sent/.test(f.textContent) && !f.querySelector('[data-boppreq]') ? f.textContent.replace(/\s+/g, ' ') : ''; }, id), 5000);
  check(!!after, `390x844 request: sent from Home in two taps; the row then says "Request sent"`);
  await ctx.close();
}
async function owner(browser, tok){
  const { ctx, pg, S } = await page(browser, tok, 390, 844);
  await S.set({ tourney: runT(), tables: TABLES.slice(0, 1), myTable: null, history: [], blindrise: [] }, ['seats']);
  await tapTab(pg, 'poker'); await tapTab(pg, 'home');
  const m = await look(pg), t = m.live && m.live.tables[0];
  check(t && t.avs === 0 && t.open === 0 && t.text.includes('9 players') && await pg.evaluate(() => document.querySelectorAll('#lobbyBody .b-ltable .b-mseat:not(.open)').length) === 9, `390x844 director: without the seats in the view, the felt shows the seats taken as plain discs`);
  fitOk('390x844 director', m);
  await ctx.close();
}

(async () => {
  for(let i = 0; i < 60; i++){ try{ await fetch(BASE + '/health'); break; }catch(e){ await sleep(150); } }
  await sleep(400);
  if(SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const MEM = (await api('login', { name: 'Test Player 01', pin: '135711' })).token, OWN = (await api('login', { name: 'Test Director', pin: '246810' })).token;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  for(const size of SIZES){ const [w, h] = size.split('x').map(Number); await member(browser, MEM, w, h); }
  await sendOne(browser, MEM);
  await owner(browser, OWN);
  await browser.close();
  console.log(`\nt_home_ui: ${oks} ok, ${fails.length} failed`);
  cleanup(); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); cleanup(); process.exit(1); });
