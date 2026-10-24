// The board's Poker tab (Issue #32, Step-0 spec §6, phase B5: the board's "Tournament Lobby"), run with UI_BOARD=1.
// Staging seed accounts only (Test Director, Test Player 01); every tournament, prize, sponsor, result and domino game
// on the page is a fixture patched into the club messages in the page (as t_board_ui does), never real data. Scenarios
// are switched with a delta message (only the keys that changed, and "gone" for a key that went), the way the server
// sends them, so the tab is checked as drawn from merged deltas.
// At 320x568, 375x667, 390x844 and 430x932 portrait and 844x390 landscape:
//  - Live / Upcoming / My Tournaments, the lit segment gold-filled; Upcoming lit when nothing is live, Live when it is
//  - the hero card: --b-surface-2, radius 24, the gold hairline, the trophy art on the right; the title 22/700; the
//    prize line 28/700 in --b-gold-text, shown only when the director set one; "Sponsored by" with a 28 px logo and the
//    name; the meta line ("Starts in 18 min · 32 joined"); a gold "Join Now"; registered: "Registered" with a tick and
//    "Cancel" as text; running: "Go to my table" or "Watch"
//  - the rows under the hero (name, prize, "8:00 PM · 18 joined", a chevron); a tap puts that game in the hero
//  - Live: the club tournament, the Blindrise Open and the dominoes while they play; empty: when the next game starts
//  - My Tournaments: my registrations, my results (a tap opens the report card) and My hands
//  - the director's controls (Start now) for the director only; Standings & prizes, Learn and the practice table rows
//  - nothing wider than the screen, no horizontal scroll, every tap target at least 44 tall
// PLAYWRIGHT=/path/to/playwright-core CHROMIUM=/path/to/chromium node test/ui/t_poker_ui.js   SHOTS=<dir> screenshots
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const { chromium } = require(process.env.PLAYWRIGHT || process.env.PLAYWRIGHT_CORE || 'playwright');
const ROOT = process.env.ROOT || path.join(__dirname, '..', '..');
const PORT = 5800 + Math.floor(Math.random() * 80), BASE = 'http://localhost:' + PORT;
const DATA = path.join(os.tmpdir(), 't_poker_' + process.pid + '.json');
const srv = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, UI_BOARD: '1', PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '', STAGING: '1', DATABASE_URL: '' }, stdio: 'ignore' });
const cleanup = () => { try{ srv.kill(); }catch(e){} fs.rmSync(DATA, { force: true }); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SHOTS = process.env.SHOTS || '';
const SIZES = (process.env.SIZES || '320x568,375x667,390x844,430x932,844x390').split(',').filter(Boolean);
const api = async (p, body) => { const j = await (await fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })).json(); if(j.error) throw new Error(p + ': ' + j.error); return j; };
const fails = [];
let oks = 0;
const check = (cond, msg) => { if(cond) oks++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if(!cond) fails.push(msg); };
const rgb = hex => `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

// ---------- fixtures ----------
const FAKE = Array.from({ length: 31 }, (_, i) => 'fx' + String(i + 1).padStart(2, '0'));
const SPONSOR = { uid: 'u00000000005a', name: 'Aurora Test Roasters', categoryLabel: 'Food & drink', area: 'Toronto', logoV: null };
const regT = (me, mine, o = {}) => ({ id: 'tpk', name: "Tonight's Tournament", status: 'registering', regs: mine ? [me, ...FAKE] : FAKE.concat('fx32'), stack: 30000, levelMin: 20, tableSize: 9, lateLevels: 4, repeat: 'none',
  anteMode: 'bb', actSec: 20, startAt: Date.now() + 18 * 60000 - 5000, sponsor: SPONSOR, sponsorSec: 8, prize: '$100 Prize', ...o });
const runT = (me, o = {}) => ({ ...regT(me, false), status: 'running', regs: FAKE.concat('fx32'), entrants: 32, remaining: 18, level: 4, levelEndsAt: Date.now() + 600000, paused: false, places: [], lateOpen: false, ...o });
const OPEN_REG = { id: 'ev1', name: 'Blindrise Open Test', status: 'registering', startAt: Date.now() + 2 * 864e5, count: 18, stack: 30000, levelMin: 20, open: true, registered: false, playing: false, remaining: null };
const OPEN_RUN = { ...OPEN_REG, status: 'running', count: 40, remaining: 22, open: false };
const HIST = me => [{ id: 'hpk1', name: 'Last Friday', entrants: 9, endedAt: Date.now() - 3 * 864e5, results: [{ uid: 'fx01', name: 'Test Player 02', place: 1, pts: 45 }, { uid: me, name: 'Test Player 01', place: 2, pts: 27 }, { uid: 'fx02', name: 'Test Player 03', place: 3, pts: 1 }], payouts: [50, 30, 20] },
  { id: 'hpk2', name: 'Wednesday Night', entrants: 6, endedAt: Date.now() - 6 * 864e5, results: [{ uid: me, name: 'Test Player 01', place: 4, pts: 1 }], payouts: [65, 35] }];
const DOMINO = { now: Date.now(), t: { id: 'dpk', name: 'Domino Night Test', status: 'running', rules: { preset: 'allfives' }, entrants: Array.from({ length: 8 }, (_, i) => ({ uid: 'fd' + i, name: 'Test Player ' + (i + 2) })), teams: [], matches: [] }, mine: null, ranking: null };

async function page(browser, tok, w, h){
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pg = await ctx.newPage();
  await pg.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => r.abort());
  const S = { patch: null, ws: null };
  await pg.routeWebSocket(/\/ws$/, ws => {
    const server = ws.connectToServer(); S.ws = ws;
    ws.onMessage(m => { try{ const j = JSON.parse(m); if(j.t === 'watch' || j.t === 'join' || j.t === 'leave' || j.t === 'report') return; }catch(e){} server.send(m); });
    server.onMessage(m => { let j; try{ j = JSON.parse(m); }catch(e){ return ws.send(m); }
      if(j.t === 'club'){ if(j.club.me) S.me = j.club.me.id; if(S.patch) Object.assign(j.club, S.patch); }
      ws.send(JSON.stringify(j)); });
  });
  await pg.goto(BASE + '/'); await pg.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), tok);
  await pg.reload(); await pg.waitForSelector('#lobby:not([hidden]) #tabs [data-tab="poker"]', { timeout: 10000 }).catch(() => {}); await sleep(600);
  // a scenario: the keys it sets, the keys it removes, as one delta (and on every later club message from the server)
  S.set = async (patch, gone = []) => { S.patch = patch; S.ws.send(JSON.stringify({ t: 'club', d: 1, club: patch, gone })); await sleep(350); };
  return { ctx, pg, S };
}
const tapTab = async (pg, k) => { await pg.tap(`#tabs [data-tab="${k}"]`); await sleep(350); };
const tapSeg = async (pg, k) => { await pg.tap(`#lobbyBody [data-pseg="${k}"]`); await sleep(300); };
// what the tab shows, measured
const look = pg => pg.evaluate(() => {
  const W = innerWidth, q = s => document.querySelector('#lobbyBody ' + s), cs = e => getComputedStyle(e), r = e => e.getBoundingClientRect();
  const segs = [...document.querySelectorAll('#lobbyBody .b-seg [data-pseg]')].map(b => ({ k: b.dataset.pseg, text: b.textContent.trim(), on: b.getAttribute('aria-selected') === 'true', bg: cs(b).backgroundColor, color: cs(b).color, h: r(b).height }));
  const hero = q('.b-hero'), h3 = hero && hero.querySelector('h3'), prize = hero && hero.querySelector('.b-hero-prize'), art = hero && hero.querySelector('.b-hero-art'), sp = hero && hero.querySelector('.b-hero-sp'), logo = sp && sp.querySelector('.b-hero-logo');
  const wide = [...document.querySelectorAll('#lobby *')].filter(e => e.getClientRects().length && getComputedStyle(e).position !== 'fixed' && !e.closest('svg') && (r(e).right > W + .5 || r(e).left < -.5)).map(e => (e.id || e.className.toString()).slice(0, 40));
  const taps = [...document.querySelectorAll('#lobbyBody :is(.b-seg button,.b-hero button,.b-row,.b-hero-more summary)')].filter(e => e.getClientRects().length && r(e).height < 44 - .5).map(e => (e.textContent || '').trim().slice(0, 30) + ' ' + Math.round(r(e).height));
  return { W, segs, scroll: Math.max(document.documentElement.scrollWidth - W, document.body.scrollWidth - W), wide: wide.slice(0, 6), taps,
    hero: hero && { k: hero.dataset.bhero, bg: cs(hero).backgroundColor, radius: cs(hero).borderTopLeftRadius, border: cs(hero).borderTopColor, right: r(hero).right, left: r(hero).left,
      title: h3 && h3.textContent, tSize: h3 && cs(h3).fontSize, tWeight: h3 && cs(h3).fontWeight,
      prize: prize && prize.textContent, pSize: prize && cs(prize).fontSize, pWeight: prize && cs(prize).fontWeight, pColor: prize && cs(prize).color,
      art: !!art && r(art).width > 0 && r(art).right <= r(hero).right && r(art).left > r(hero).left + r(hero).width / 2, artClear: !!art && !!h3 && r(h3).right <= r(art).left + 2,
      sp: sp && sp.querySelector('.b-hero-sp-t').innerText.replace(/\s+/g, ' ').trim(), logo: logo && Math.round(r(logo).width) + 'x' + Math.round(r(logo).height),
      meta: (hero.querySelector('.b-hero-meta') || {}).textContent, acts: [...hero.querySelectorAll('.b-hero-acts > *')].map(b => ({ text: b.textContent.trim(), id: b.id, cls: b.className, bg: cs(b).backgroundImage, color: cs(b).color, tag: b.tagName })),
      note: (hero.querySelector('.b-hero-note') || {}).textContent || '', more: !!hero.querySelector('details.b-hero-more') },
    rows: [...document.querySelectorAll('#lobbyBody .b-pseg .b-row')].map(b => ({ text: b.textContent.replace(/\s+/g, ' ').trim(), pick: b.dataset.bpick || '', report: b.dataset.report || '', chev: !!b.querySelector('.b-chev'), prize: (b.querySelector('.b-trow-prize') || {}).textContent || '' })),
    empty: (q('.b-pempty') || {}).textContent || '', org: !!q('.b-org #startBtn') || !!q('#againBtn'),
    tail: [...document.querySelectorAll('#lobbyBody > nav.b-rows .b-row')].map(b => b.querySelector('b').textContent) };
});
const fitOk = (tag, m) => {
  check(m.scroll <= 0 && !m.wide.length, `${tag}: nothing wider than the screen, no sideways scroll (${m.scroll}${m.wide.length ? '; ' + m.wide.join(', ') : ''})`);
  check(!m.taps.length, `${tag}: every segment, button and row at least 44 tall${m.taps.length ? ': ' + m.taps.join(', ') : ''}`);
};
// the screen as the member sees it: the top, then scrolled to the end (the tab bar stays fixed at the foot)
const shot = async (pg, name) => { if(!SHOTS) return;
  await pg.evaluate(() => window.scrollTo(0, 0)); await sleep(120); await pg.screenshot({ path: path.join(SHOTS, name + '.png') });
  if(await pg.evaluate(() => document.documentElement.scrollHeight > innerHeight + 4)){ await pg.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await sleep(120); await pg.screenshot({ path: path.join(SHOTS, name + '-end.png') }); await pg.evaluate(() => window.scrollTo(0, 0)); } };

async function member(browser, tok, w, h){
  const s = `${w}x${h}`, land = w > h;
  const { ctx, pg, S } = await page(browser, tok, w, h);
  const me = S.me;
  await S.set({ tourney: regT(me, false), bevent: OPEN_REG, history: HIST(me) });
  await tapTab(pg, 'poker');
  // ---- Upcoming: the club tournament as the hero, the Blindrise Open as a row ----
  let m = await look(pg), tag = `${s} member Upcoming`;
  check(m.segs.map(x => x.text).join('|') === 'Live|Upcoming|My Tournaments' && m.segs.find(x => x.on).k === 'up', `${tag}: the segments Live / Upcoming / My Tournaments, Upcoming lit with nothing live (${m.segs.map(x => x.text + (x.on ? '*' : '')).join(', ')})`);
  const lit = m.segs.find(x => x.on), off = m.segs.find(x => !x.on);
  check(lit.bg === rgb('#d9a651') && lit.color === rgb('#1a1206') && off.bg === 'rgba(0, 0, 0, 0)', `${tag}: the lit segment gold-filled with a dark label, the others clear (${lit.bg} / ${lit.color}; ${off.bg})`);
  const H = m.hero;
  check(H && H.k === 'club' && H.bg === rgb('#111f2b') && H.radius === '24px' && H.border === 'rgba(217, 166, 81, 0.3)', `${tag}: the hero card: --b-surface-2, radius 24, the gold hairline (${H && [H.bg, H.radius, H.border].join(', ')})`);
  check(H && H.art && H.artClear, `${tag}: the trophy art on the right, clear of the title`);
  check(H && H.title === "Tonight's Tournament" && H.tSize === '22px' && H.tWeight === '700', `${tag}: the title 22/700 (${H && H.title}, ${H && H.tSize}/${H && H.tWeight})`);
  check(H && H.prize === '$100 Prize' && H.pSize === '28px' && H.pWeight === '700' && H.pColor === rgb('#ebe1b9'), `${tag}: the prize line 28/700 in --b-gold-text (${H && [H.prize, H.pSize, H.pWeight, H.pColor].join(', ')})`);
  check(H && /^Sponsored by Aurora Test Roasters/.test(H.sp) && H.logo === '28x28', `${tag}: "Sponsored by", the 28 px logo and the name (${H && H.sp}, ${H && H.logo})`);
  check(H && /^Starts in 18 min · 32 joined$/.test(H.meta), `${tag}: the meta line "${H && H.meta}"`);
  const join = H && H.acts[0];
  check(join && join.text === 'Join Now' && join.id === 'joinBtn' && join.bg.includes(rgb('#ca9a4d')) && join.color === rgb('#1a1206'), `${tag}: a gold "Join Now" (${join && join.text}, ${join && join.color})`);
  check(H && H.more, `${tag}: the tournament's details (stack, levels, who joined) under "Details"`);
  check(m.rows.length === 1 && m.rows[0].pick === 'open' && /Blindrise Open Test/.test(m.rows[0].text) && /· 18 joined/.test(m.rows[0].text) && m.rows[0].chev, `${tag}: the Blindrise Open as a row: name, when and how many, a chevron (${m.rows.map(x => x.text).join(' | ')})`);
  check(m.tail.join('|') === 'Standings & prizes|Learn|Practice table', `${tag}: the rows under the segments: ${m.tail.join(', ')}`);
  check(!m.org, `${tag}: no organizer controls for a member`);
  fitOk(tag, m);
  await shot(pg, `b5-member-${s}-upcoming`);
  // a tap on the row puts the Blindrise Open in the hero, the club tournament becomes the row
  await pg.tap('#lobbyBody [data-bpick="open"]'); await sleep(350);
  m = await look(pg);
  check(m.hero && m.hero.k === 'open' && m.hero.title === 'Blindrise Open Test' && !m.hero.prize && m.hero.acts.some(a => a.text === 'Join Now' && /b-gold/.test(a.cls)) && m.rows.length === 1 && m.rows[0].pick === 'club' && m.rows[0].prize === '$100 Prize',
    `${tag}: a tap on a row shows that game in the hero; the club tournament is a row with its prize (${m.hero && m.hero.title}; ${m.rows.map(x => x.text).join(' | ')})`);
  fitOk(tag + ' (Open in the hero)', m);
  // registered: "Registered" with a tick and "Cancel" as text
  await pg.tap('#lobbyBody [data-bpick="club"]'); await sleep(250);
  await S.set({ tourney: regT(me, true), bevent: { ...OPEN_REG, registered: true, count: 19 } });
  m = await look(pg); tag = `${s} member registered`;
  const reg = m.hero && m.hero.acts;
  check(reg && reg[0].text === 'Registered' && reg[0].tag === 'SPAN' && reg[1] && reg[1].text === 'Cancel' && reg[1].id === 'leaveBtn' && /b-textbtn/.test(reg[1].cls), `${tag}: "Registered" with a tick, "Cancel" as text (${reg && reg.map(a => a.text).join(' / ')})`);
  fitOk(tag, m);
  await shot(pg, `b5-member-${s}-registered`);
  // ---- My Tournaments: my registrations, my results, My hands ----
  await tapSeg(pg, 'mine');
  m = await look(pg); tag = `${s} member My Tournaments`;
  check(m.segs.find(x => x.on).k === 'mine' && m.hero && m.hero.k === 'club' && m.rows.some(x => x.pick === 'open' && /Registered/.test(x.text)), `${tag}: my registrations: the club tournament in the hero, the Blindrise Open as a row`);
  check(m.rows.filter(x => x.report).map(x => x.text).join(' | ').match(/Last Friday.*2nd of 9.*27 points.*\|.*Wednesday Night.*4th of 6.*1 point$/), `${tag}: my results, each a row: ${m.rows.filter(x => x.report).map(x => x.text).join(' | ')}`);
  check(m.rows.some(x => /My hands/.test(x.text)), `${tag}: My hands (the hand review)`);
  fitOk(tag, m);
  await shot(pg, `b5-member-${s}-mine`);
  await pg.tap('#lobbyBody [data-bgo="learn"][data-seg="hands"]'); await sleep(500);
  check(await pg.evaluate(() => !!document.querySelector('#lobbyBody [data-seg="hands"][aria-pressed="true"]') && document.querySelector('#tabs [aria-selected="true"]').dataset.tab === 'poker'), `${tag}: My hands opens today's hand review, Poker still lit`);
  await tapTab(pg, 'poker');
  check((await look(pg)).segs.find(x => x.on).k === 'mine', `${tag}: back on Poker, My Tournaments is still the segment`);
  // ---- Live: the club tournament playing, the Blindrise Open live, the dominoes ----
  await S.set({ tourney: runT(me), bevent: OPEN_RUN, tables: [{ tid: 'tpk1', n: 1, players: 9 }, { tid: 'tpk2', n: 2, players: 9 }], myTable: null, domino: true });
  S.ws.send(JSON.stringify({ t: 'domino', v: DOMINO })); await sleep(300);
  await tapSeg(pg, 'live');
  m = await look(pg); tag = `${s} member Live`;
  check(m.segs.find(x => x.on).k === 'live' && m.hero && m.hero.k === 'club' && /Level 5 · .* · 18 of 32 left/.test(m.hero.meta) && m.hero.prize === '$100 Prize', `${tag}: the club tournament playing in the hero, its level, blinds and players left (${m.hero && m.hero.meta})`);
  check(m.hero && m.hero.acts.some(a => a.text === 'Watch' && /b-gold/.test(a.cls)), `${tag}: not seated: "Watch"`);
  check(m.rows.map(x => x.pick).join(',') === 'open,dom' && /Live · 22 of 40 left/.test(m.rows[0].text) && /Domino Night Test/.test(m.rows[1].text), `${tag}: the Blindrise Open live and the dominoes as rows (${m.rows.map(x => x.text).join(' | ')})`);
  fitOk(tag, m);
  await shot(pg, `b5-member-${s}-live`);
  await pg.tap('#lobbyBody [data-bpick="dom"]'); await sleep(300);
  m = await look(pg);
  check(m.hero && m.hero.k === 'dom' && m.hero.acts.some(a => a.text === 'Watch the board'), `${tag}: the dominoes in the hero: "Watch the board"`);
  fitOk(tag + ' (dominoes in the hero)', m);
  // seated: "Go to my table"
  await pg.tap('#lobbyBody [data-bpick="club"]'); await sleep(200);
  await S.set({ myTable: 'tpk1' });
  // (with a table of my own the app opens it: come back to the lobby the way a player does)
  await pg.evaluate(() => { const b = document.getElementById('lobbyBtn'); if(b && b.getClientRects().length) b.click(); }); await sleep(400);
  if(!(await pg.$('#lobbyBody .b-hero'))) await tapTab(pg, 'poker');
  m = await look(pg);
  check(m.hero && m.hero.acts.some(a => a.text === 'Go to my table' && /b-gold/.test(a.cls)) && !m.tail.includes('Practice table'), `${tag}: seated: "Go to my table", and no practice table while playing (${m.hero && m.hero.acts.map(a => a.text).join(' / ')})`);
  // ---- empty: nothing open, nothing live (bevent gone) ----
  await S.set({ tourney: { ...regT(me, false), status: 'finished' }, myTable: null, tables: [], domino: false }, ['bevent']);
  S.ws.send(JSON.stringify({ t: 'domino', v: { ...DOMINO, t: null } })); await sleep(300);
  m = await look(pg); tag = `${s} member empty`;
  check(!m.hero && /No live games right now/.test(m.empty), `${tag}: Live: "No live games right now" (${m.empty.trim()})`);
  await tapSeg(pg, 'up'); m = await look(pg);
  check(!m.hero && /No tournament open right now/.test(m.empty) && !m.rows.length, `${tag}: Upcoming: "No tournament open right now"`);
  fitOk(tag, m);
  await shot(pg, `b5-member-${s}-empty`);
  // the next game, as a delta: the hero comes back with no prize line when none is set
  await S.set({ tourney: regT(me, false, { prize: '', sponsor: null, startAt: null }) });
  m = await look(pg);
  check(m.hero && !m.hero.prize && !m.hero.sp && /^Starts when the organizer is ready · 32 joined$/.test(m.hero.meta), `${tag}: no prize and no sponsor: neither line is drawn (${m.hero && m.hero.meta})`);
  // Standings & prizes: today's leaderboard, then the last tournament's full results
  await pg.tap('#lobbyBody [data-bgo="board"]'); await sleep(400);
  check(await pg.evaluate(() => !!document.querySelector('#lobbyBody [data-bseg="prizes"]') && /Last tournament/.test(document.getElementById('lobbyBody').textContent) && !!document.querySelector('#lobbyBody [data-report="hpk1"]')), `${s}: Standings & prizes: the leaderboard, then the last tournament's results with my report card`);
  if(land) await shot(pg, `b5-member-${s}-standings`);
  await ctx.close();
}
async function owner(browser, tok, w, h){
  const s = `${w}x${h}`;
  const { ctx, pg, S } = await page(browser, tok, w, h);
  await S.set({ tourney: regT(S.me, false), history: [] }, ['bevent']);
  await tapTab(pg, 'poker');
  let m = await look(pg), tag = `${s} director`;
  check(m.hero && m.hero.k === 'club' && m.org, `${tag}: the hero, then the organizer's controls (Start now)`);
  fitOk(tag, m);
  await shot(pg, `b5-director-${s}-upcoming`);
  await S.set({ tourney: { ...regT(S.me, false), status: 'finished' } });
  m = await look(pg);
  check(!m.hero && /Open the next one below/.test(m.empty) && m.org, `${tag}: nothing open: "Open the next one below" and "Start the next tournament"`);
  fitOk(tag + ' nothing open', m);
  await ctx.close();
}

(async () => {
  for(let i = 0; i < 60; i++){ try{ await fetch(BASE + '/health'); break; }catch(e){ await sleep(150); } }
  await sleep(400);
  if(SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const MEM = (await api('login', { name: 'Test Player 01', pin: '135711' })).token, OWN = (await api('login', { name: 'Test Director', pin: '246810' })).token;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  for(const size of SIZES){ const [w, h] = size.split('x').map(Number); await member(browser, MEM, w, h); }
  for(const size of ['390x844', '320x568', '844x390']){ const [w, h] = size.split('x').map(Number); await owner(browser, OWN, w, h); }
  await browser.close();
  console.log(`\nt_poker_ui: ${oks} ok, ${fails.length} failed`);
  cleanup(); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); cleanup(); process.exit(1); });
