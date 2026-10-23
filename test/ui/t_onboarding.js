// The board's first visit (Issue #39, problems 2, 3 and 5 of the first-visit audit), run against two servers from this
// tree: one with UI_BOARD=1, one without. Staging seed data only (Test Director, Test Players); newcomers join through
// the app's own invite page.
// Board on:
//  - a newcomer who joins with an invite gets the three-card welcome once (not again after a reload, nor on another
//    device: it is kept on the account), can skip it at any card, and Escape skips it too
//  - the reminder question waits until the welcome closes, and starts with one line saying they're registered; on an
//    iPhone outside the Home Screen app it says up front that reminders need Add to Home Screen
//  - Home's "Next game" card: registered (and that the invite signed them up), not registered (Register works), and no
//    game open (when to check back, and the practice table)
//  - "First steps": ticks from what the app knows (registered, a picture, the Club tab), hides once all three are done,
//    or when hidden (and stays hidden)
//  - at 390x844, 320x568, 844x390 and 1280x800: each welcome card clear of the tab bar, the Next game card clear of the
//    top bar and the tab bar, the end of Home clear of the tab bar, nothing scrolls sideways
// Board off: no welcome, no Next game, no First steps, the reminder question exactly as before, nothing stored.
// PLAYWRIGHT=/path/to/playwright-core CHROMIUM=/path/to/chromium node test/ui/t_onboarding.js   SHOTS=<dir> screenshots
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const { chromium } = require(process.env.PLAYWRIGHT || process.env.PLAYWRIGHT_CORE || 'playwright');
const ROOT = process.env.ROOT || path.join(__dirname, '..', '..');
const WebSocket = require(require.resolve('ws', { paths: [ROOT] }));
const SHOTS = process.env.SHOTS || '';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fails = [];
let oks = 0;
const check = (cond, msg) => { if(cond) oks++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if(!cond) fails.push(msg); };
const srvs = [], datas = [];
const cleanup = () => { srvs.forEach(s => { try{ s.kill(); }catch(e){} }); datas.forEach(d => fs.rmSync(d, { force: true })); };

async function server(board){
  const port = (board ? 5640 : 5720) + Math.floor(Math.random() * 80), DATA = path.join(os.tmpdir(), `t_onb_${board ? 'on' : 'off'}_${process.pid}.json`); datas.push(DATA);
  const env = { ...process.env, PORT: String(port), NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '', STAGING: '1', DATABASE_URL: '' };
  delete env.UI_BOARD; delete env.UI_QUIET; if(board) env.UI_BOARD = '1';
  srvs.push(spawn('node', ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'ignore', 'inherit'] }));
  const base = 'http://127.0.0.1:' + port;
  for(let i = 0; i < 100; i++){ try{ if((await fetch(base + '/healthz')).ok) break; }catch(e){} await sleep(100); }
  const api = async (p, body) => { const j = await (await fetch(base + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })).json(); if(j.error) throw new Error(p + ': ' + j.error); return j; };
  return { base, api, DATA };
}
// a socket signed in as someone: keeps the latest club message, answers an invite request
function sock(base, token){
  const ws = new WebSocket(base.replace('http', 'ws') + '/ws'), c = { ws, send: o => ws.send(JSON.stringify(o)), club: null, invite: null };
  ws.on('open', () => c.send({ t: 'hello', token, device: 'onb' + Math.random() }));
  ws.on('error', () => {});
  ws.on('message', raw => { const m = JSON.parse(raw); if(m.t === 'club') c.club = m.club; if(m.t === 'invite') c.invite = m.code; });
  return new Promise(r => { const t = setInterval(() => { if(c.club){ clearInterval(t); r(c); } }, 30); });
}
const until = async (f, ms = 6000) => { const t0 = Date.now(); let v; while(!(v = await f()) && Date.now() - t0 < ms) await sleep(100); return v; };
const nextSat8 = () => { const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7)); d.setHours(20, 0, 0, 0); return d.getTime(); };
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

let browser, seq = 0;
async function page(w, h, ua){
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w > 900 ? 1 : 2, isMobile: w <= 900, hasTouch: w <= 900, ...(ua ? { userAgent: ua } : {}) });
  await ctx.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => r.abort());
  return ctx.newPage();
}
// join through the invite page, as a newcomer does
async function joinUI(pg, base, code, name){
  await pg.goto(base + '/join/' + code); await pg.waitForSelector('#wJoin'); await pg.click('#wJoin');
  await pg.fill('#aName', name); await pg.fill('#aPin', '4826'); await pg.check('#aAgree'); await pg.click('#authForm button[type=submit]');
  await pg.waitForSelector('#lobby:not([hidden])', { timeout: 8000 });
}
const tokenOf = pg => pg.evaluate(() => JSON.parse(localStorage.getItem('stacked:token')));
const text = (pg, sel) => pg.evaluate(s => { const e = document.querySelector(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }, sel);
const shot = async (pg, name) => { if(!SHOTS) return; await sleep(250); await pg.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true }); };
// the reminder question, once it shows: its html, then "No thanks" / "Not now"
async function reminder(pg, ms = 4000){
  const m = await until(() => pg.evaluate(() => { const g = document.querySelector('#modalRoot .modal .glass'); return g && /Get a reminder/.test(g.textContent) ? g.innerHTML : null; }), ms);
  if(m) await pg.click('#modalRoot [data-i="0"]');
  return m;
}
// the welcome card and the tab bar; the page's sideways scroll
const welcomeBox = pg => pg.evaluate(() => { const c = document.querySelector('#bOnb .b-onb-card'), t = document.getElementById('tabs').getBoundingClientRect(); if(!c) return null; const r = c.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, tabsTop: t.top, vw: innerWidth, sw: document.documentElement.scrollWidth, card: c.dataset.card, focus: !!document.activeElement && c.contains(document.activeElement) }; });
const homeBox = pg => pg.evaluate(async () => {
  window.scrollTo(0, 0); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const t = document.getElementById('tabs').getBoundingClientRect(), bar = document.querySelector('#lobby .topbar').getBoundingClientRect(), n = document.querySelector('#lobbyBody .b-next');
  const nr = n && n.getBoundingClientRect(), first = document.querySelector('#lobbyBody').firstElementChild;
  window.scrollTo(0, document.documentElement.scrollHeight); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const kids = [...document.querySelectorAll('#lobbyBody > *')].filter(e => e.getClientRects().length), last = kids[kids.length - 1].getBoundingClientRect();
  const t2 = document.getElementById('tabs').getBoundingClientRect();
  window.scrollTo(0, 0);
  return { next: nr ? { top: nr.top, bottom: nr.bottom } : null, firstIsNext: first === n, barBottom: bar.bottom, tabsTop: t.top, lastBottom: last.bottom, tabsTop2: t2.top, vw: innerWidth, sw: document.documentElement.scrollWidth };
});

(async () => {
  if(SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  // ================= board on =================
  const S = await server(true);
  const dir = await sock(S.base, (await S.api('login', { name: 'Test Director', pin: '246810' })).token);
  dir.send({ t: 'create', name: 'Saturday Night Open', stack: 30000, levelMin: 15, startAt: nextSat8(), repeat: 'weekly', tableSize: 9, lateLevels: 2 });
  await until(() => dir.club.tourney && dir.club.tourney.status === 'registering');
  dir.send({ t: 'invite', group: true }); const code = await until(() => dir.invite);
  check(!!code, 'board on: the director has a group invite link');
  const tName = 'Saturday Night Open';

  // ---- newcomer A, 390x844: the whole welcome, the deferred reminder, Next game registered, First steps ticking ----
  const A = await page(390, 844);
  await joinUI(A, S.base, code, 'Newcomer A');
  await A.waitForSelector('#bOnb', { timeout: 6000 }).catch(() => {});
  let b = await welcomeBox(A);
  check(b && b.card === '1', 'A: the welcome opens on Home after joining with an invite (card 1 of 3)');
  check(await A.evaluate(() => { const d = document.querySelector('#bOnb [role=dialog]'); return !!d && d.getAttribute('aria-modal') === 'true' && !!document.getElementById(d.getAttribute('aria-labelledby')); }), 'A: the welcome is a labelled modal dialog');
  const c1 = await text(A, '#bOnb .b-onb-card');
  check(/Welcome to Blindrise/.test(c1) && c1.includes("Blindrise is a private members' club — a place to meet people, build real relationships, and grow your business, with social game nights to unwind together.") && c1.includes("It's free to join.") && !/poker club|betting|real money|gambl|wager|casino/i.test(c1), `A: card 1 says what Blindrise is: "${c1}"`);
  check(b && b.focus, 'A: focus is inside the welcome');
  await sleep(2200);
  check(!(await A.$('#modalRoot .modal')), 'A: the reminder question waits while the welcome is open');
  await A.click('#bOnb [data-onb=next]'); b = await welcomeBox(A);
  const c2 = await text(A, '#bOnb .b-onb-card');
  check(b.card === '2' && /Where things are/.test(c2) && await A.$$eval('#bOnb .b-onb-tabs b', l => l.map(e => e.textContent).join()) === 'Home,Poker,Exchange,Club,Profile' && c2.includes('Member businesses. Find services, exchange referrals, and get found.') && c2.includes('Your picture, your business, and your settings.'), `A: card 2 says where things are: "${c2}"`);
  await A.click('#bOnb [data-onb=next]'); b = await welcomeBox(A);
  const c3 = await text(A, '#bOnb .b-onb-card');
  check(b.card === '3' && c3.includes(tName) && /You're registered/.test(c3) && /Your invite signed you up/.test(c3), `A: card 3 names the next game and says they're registered by their invite: "${c3}"`);
  check(!(await A.$('#bOnb [data-onb=skip]')) && c3.includes("so there's nothing else to do."), 'A: card 3 has no Skip, and reads "so there\'s nothing else to do."');
  check(c2.includes('Club games, a practice table, and short lessons.'), 'A: card 2, the Poker line with its comma');
  check(await A.$eval('#bOnb [data-onb=poker]', e => e.textContent.trim()) === 'See my game', 'A: card 3 has a button to the game ("See my game")');
  await A.click('#bOnb [data-onb=poker]');
  check(!(await A.$('#bOnb')) && await A.evaluate(() => document.querySelector('#tabs [data-tab=poker]').getAttribute('aria-selected') === 'true'), 'A: "See my game" closes the welcome and opens Poker');
  const rem = await reminder(A);
  check(!!rem && /class="b-reg-line">You're registered for Saturday Night Open\.<\/p><h2>Get a reminder\?<\/h2>/.test(rem), 'A: then the reminder question, with "You\'re registered for Saturday Night Open." before it');
  await A.click('#tabs [data-tab=home]'); await sleep(300);
  const nA = await text(A, '#lobbyBody .b-next');
  check(/Next game/.test(nA) && nA.includes(tName) && /You're registered/.test(nA) && /Your invite signed you up/.test(nA) && !(await A.$('#lobbyBody .b-next [data-bjoin]')), `A: Home leads with Next game, registered: "${nA}"`);
  check(await A.evaluate(() => document.querySelector('#lobbyBody').firstElementChild.classList.contains('b-next')), 'A: Next game is the first card on Home');
  // Home's order (spec §7): Next game, First steps, Live at Blindrise, Community Activity, then the Exchange's section
  const order = await until(() => A.evaluate(() => { const k = [...document.querySelectorAll('#lobbyBody > *')].map(e => e.classList.contains('b-next') ? 'next' : e.classList.contains('b-steps') ? 'steps' : e.classList.contains('b-live') ? 'live' : e.classList.contains('b-feed') ? 'feed' : e.classList.contains('hsec-biz') ? 'biz' : '?');
    return document.querySelector('#lobbyBody .b-feed [data-bgo=opp]') ? k.join() : null; }));
  check(order === 'next,steps,live,feed,biz', `A: Home top to bottom: ${order}`);
  const lv = await text(A, '#lobbyBody .b-live');
  check(/Live at Blindrise/.test(lv) && /No live tables right now/.test(lv) && /The next game starts Sat/.test(lv), `A: Live at Blindrise, empty, with the next start time: "${lv}"`);
  const fd = await text(A, '#lobbyBody .b-feed');
  check(/Community Activity/.test(fd) && /The Bulletin/.test(fd), `A: Community Activity with the Bulletin's newest listings: "${fd.slice(0, 160)}"`);
  check(await A.evaluate(() => document.querySelectorAll('#lobbyBody .bz-rail').length <= 1 && !document.querySelector('#lobbyBody .b-feed .bz-vcard')), 'A: the Exchange\'s businesses show once on Home (its own section), not in Community Activity');
  let st = await text(A, '#lobbyBody .b-steps');
  check(/First steps/.test(st) && /1 of 4 done/.test(st), `A: First steps shows, the registration already ticked: "${st}"`);
  check(await A.evaluate(() => [...document.querySelectorAll('#lobbyBody .b-steps li')].map(l => !!l.querySelector('.b-step.done')).join()) === 'true,false,false,false', 'A: the ticks: registered yes, picture no, business no, invite no');
  check(st.includes("So people know who they're playing with.") && st.includes('List it in the Exchange so members can find and refer you.') && st.includes("Bring someone you'd like in the club.") && /Register for the next game.*Add a profile picture.*Introduce your business.*Invite a friend/s.test(st), `A: the four steps, in order, with their lines: "${st}"`);
  await A.reload(); await A.waitForSelector('#lobby:not([hidden]) #lobbyBody .b-next'); await sleep(1500);
  check(!(await A.$('#bOnb')), 'A: the welcome does not come back after a reload');
  { const A2 = await page(390, 844); await A2.goto(S.base + '/'); await A2.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), await tokenOf(A)); await A2.reload();
    await A2.waitForSelector('#lobby:not([hidden]) #lobbyBody .b-next'); await sleep(1200);
    check(!(await A2.$('#bOnb')) && !!(await A2.$('#lobbyBody .b-steps')), 'A: on another device (a fresh browser) no welcome either: it is kept on the account; First steps still there'); await A2.context().close(); }
  // "Introduce your business" opens My business on the Exchange; a published card ticks it
  await A.click('#lobbyBody [data-bstep=biz]'); await sleep(400);
  check(await A.evaluate(() => document.querySelector('#tabs [data-tab=biz]').getAttribute('aria-selected') === 'true'), 'A: "Introduce your business" opens the Exchange (My business)');
  { const tok = await tokenOf(A), call = (p, b) => fetch(S.base + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: JSON.stringify(b) }).then(r => r.json());
    await call('bizSave', { name: 'Newcomer Studio', category: 'education', description: 'Lessons.', services: 'Lessons', area: 'Toronto', fullName: 'Newcomer A', jobTitle: 'Owner', categoryOther: '', website: '', instagram: '', email: '', phone: '' });
    await call('bizPublish', { on: true }); }
  await A.reload(); await A.waitForSelector('#lobby:not([hidden]) #lobbyBody .b-next');
  st = await until(async () => { const t = await text(A, '#lobbyBody .b-steps'); return /2 of 4 done/.test(t) && t; });
  check(!!st, `A: with a published business card, two ticked: "${st}"`);
  // "Invite a friend": making an invite link ticks it
  await A.click('#lobbyBody [data-bstep=invite]');
  await A.waitForSelector('#modalRoot .modal', { timeout: 4000 }).catch(() => {});
  await A.keyboard.press('Escape'); await sleep(300); await A.evaluate(() => { const m = document.querySelector('#modalRoot'); if(m) m.innerHTML = ''; });
  st = await until(async () => { const t = await text(A, '#lobbyBody .b-steps'); return /3 of 4 done/.test(t) && t; });
  check(!!st, `A: after making an invite link, three ticked: "${st}"`);
  // a picture: the last step; the card hides
  await A.click('#lobbyBody [data-bstep=pic]'); await A.waitForSelector('#modalRoot .av-grid'); await A.click('#modalRoot .av-grid [data-v="g:fox"]');
  check(!!(await until(() => A.evaluate(() => !document.querySelector('#lobbyBody .b-steps')))), 'A: with a picture added all four are done and First steps hides');
  await A.reload(); await A.waitForSelector('#lobby:not([hidden]) #lobbyBody .b-next'); await sleep(800);
  check(!(await A.$('#lobbyBody .b-steps')), 'A: and stays hidden after a reload');
  const aws = await sock(S.base, await tokenOf(A));
  check(aws.club.me.onb === 3, `A: the account record says the first visit is finished (onb ${aws.club.me.onb})`);

  // ---- newcomer B, 390x844: skips at card 1; not registered; Register; hides First steps ----
  const B = await page(390, 844);
  await joinUI(B, S.base, code, 'Newcomer B');
  await B.waitForSelector('#bOnb', { timeout: 6000 }).catch(() => {});
  check(!!(await B.$('#bOnb [data-onb=skip]')), 'B: card 1 has Skip');
  await B.click('#bOnb [data-onb=skip]');
  check(!(await B.$('#bOnb')) && await B.evaluate(() => document.querySelector('#tabs [data-tab=home]').getAttribute('aria-selected') === 'true'), 'B: Skip on card 1 closes the welcome and stays on Home');
  check(!!(await reminder(B)), 'B: the reminder question follows the skipped welcome');
  const bws = await sock(S.base, await tokenOf(B));
  check(bws.club.me.onb === 2, `B: the account record says the welcome was seen (onb ${bws.club.me.onb})`);
  bws.send({ t: 'leave' }); await until(() => B.evaluate(() => !!document.querySelector('#lobbyBody .b-next [data-bjoin]')));
  const nB = await text(B, '#lobbyBody .b-next');
  check(nB.includes(tName) && !/You're registered/.test(nB) && !!(await B.$('#lobbyBody .b-next [data-bjoin]')), `B: not registered, Next game offers Register: "${nB}"`);
  check(/0 of 4 done/.test(await text(B, '#lobbyBody .b-steps')), 'B: First steps has nothing ticked');
  await shot(B, 'test-home-unregistered-390x844');
  await B.click('#lobbyBody .b-next [data-bjoin]');
  check(!!(await until(() => B.evaluate(() => /You're registered/.test(document.querySelector('#lobbyBody .b-next').textContent)))), 'B: Register on Home registers (the card now says "You\'re registered")');
  const remB = await reminder(B);
  check(!!remB && /You're registered for Saturday Night Open\./.test(remB), 'B: and the reminder question starts with the registered line');
  check(!/Your invite signed you up/.test(await text(B, '#lobbyBody .b-next')), 'B: registered by hand, the card does not say the invite did it');
  check(/1 of 4 done/.test(await text(B, '#lobbyBody .b-steps')), 'B: First steps ticks the registration');
  await B.click('#lobbyBody [data-bstepsx]');
  check(!(await B.$('#lobbyBody .b-steps')), 'B: Hide removes First steps');
  await B.reload(); await B.waitForSelector('#lobby:not([hidden]) #lobbyBody .b-next'); await sleep(800);
  check(!(await B.$('#lobbyBody .b-steps')) && !(await B.$('#bOnb')), 'B: still hidden after a reload, and no welcome');

  // ---- Escape skips; an iPhone outside the Home Screen app hears about Add to Home Screen first ----
  const I = await page(390, 844, IPHONE);
  await joinUI(I, S.base, code, 'Newcomer I');
  await I.waitForSelector('#bOnb', { timeout: 6000 }).catch(() => {});
  await I.click('#bOnb [data-onb=next]'); await I.keyboard.press('Escape');
  check(!(await I.$('#bOnb')), 'I: Escape on card 2 skips the welcome');
  const remI = await reminder(I);
  check(!!remI && /You're registered for Saturday Night Open\./.test(remI) && /only work after you add Blindrise to your Home Screen/.test(remI), 'I: on iPhone Safari the reminder question says first that reminders need Add to Home Screen');

  // ---- the four sizes: the welcome cards and Home against the tab bar ----
  const SIZES = (process.env.SIZES || '390x844,320x568,844x390,1280x800').split(',');
  const pages = [];
  for(const size of SIZES){
    const [w, h] = size.split('x').map(Number), P = await page(w, h);
    await joinUI(P, S.base, code, 'Size ' + size.replace('x', ' ')); pages.push([size, P]);
    await P.waitForSelector('#bOnb', { timeout: 6000 }).catch(() => {});
    for(let k = 1; k <= 3; k++){
      const r = await welcomeBox(P);
      check(r && r.card === String(k) && r.bottom <= r.tabsTop + .5 && r.top >= -.5 && r.left >= -.5 && r.right <= r.vw + .5 && r.sw <= r.vw, `${size}: welcome card ${k} clear of the tab bar and on screen (card ${r && Math.round(r.top)}-${r && Math.round(r.bottom)}, tab bar at ${r && Math.round(r.tabsTop)})`);
      await shot(P, `welcome-${k}-${size}`);
      if(k < 3) await P.click('#bOnb [data-onb=next]');
    }
    await P.keyboard.press('Escape'); await reminder(P, 3000);  // card 3 has no Skip; Escape still closes it
    const hb = await homeBox(P);
    check(hb.next && hb.firstIsNext && hb.next.top >= hb.barBottom - .5 && hb.next.bottom <= hb.tabsTop + .5, `${size}: Home opens on the whole Next game card, between the top bar and the tab bar (${hb.next && Math.round(hb.next.top)}-${hb.next && Math.round(hb.next.bottom)}, bar ${Math.round(hb.barBottom)}, tabs ${Math.round(hb.tabsTop)})`);
    check(hb.lastBottom <= hb.tabsTop2 + .5 && hb.sw <= hb.vw, `${size}: the end of Home clears the tab bar (${Math.round(hb.lastBottom)} <= ${Math.round(hb.tabsTop2)}) and nothing scrolls sideways`);
    if(size === '390x844' || size === '1280x800') await shot(P, `home-registered-${size}`);
  }
  // the unregistered state at both shot sizes
  for(const [size, P] of pages) if(size === '390x844' || size === '1280x800'){
    const s = await sock(S.base, await tokenOf(P)); s.send({ t: 'leave' });
    await until(() => P.evaluate(() => !!document.querySelector('#lobbyBody .b-next [data-bjoin]')));
    await shot(P, `home-unregistered-${size}`); s.ws.close();
  }

  // ---- no game open: the organizer cancels ----
  dir.send({ t: 'cancel' }); await until(() => dir.club.tourney && dir.club.tourney.status === 'cancelled');
  await until(() => A.evaluate(() => /No game open yet/.test((document.querySelector('#lobbyBody .b-next') || {}).textContent || '')));
  const nN = await text(A, '#lobbyBody .b-next');
  check(/No game open yet/.test(nN) && /Check back in a day or two/.test(nN) && !!(await A.$('#lobbyBody .b-next [data-demo]')), `no game: Next game says when to check back and offers the practice table: "${nN}"`);
  for(const [size, P] of pages){
    const hb = await homeBox(P);
    check(hb.next && hb.next.bottom <= hb.tabsTop + .5 && hb.lastBottom <= hb.tabsTop2 + .5 && hb.sw <= hb.vw, `${size}: no game, Home still clear of the tab bar`);
    if(size === '390x844' || size === '1280x800') await shot(P, `home-no-tournament-${size}`);
  }
  // a newcomer with no game open: card 3 leads to the practice table
  dir.send({ t: 'invite', group: true }); await sleep(300);
  const N = await page(390, 844);
  await joinUI(N, S.base, dir.invite, 'Newcomer N');
  await N.waitForSelector('#bOnb', { timeout: 6000 }).catch(() => {});
  await N.click('#bOnb [data-onb=next]'); await N.click('#bOnb [data-onb=next]');
  const cN = await text(N, '#bOnb .b-onb-card');
  check(/How to start/.test(cN) && /No game is open yet/.test(cN) && !!(await N.$('#bOnb [data-onb=demo]')), `N: with no game open, card 3 points to the practice table: "${cN}"`);
  check(/Register for the next game/.test(await text(N, '#lobbyBody .b-steps')) && /No game open yet/.test(await text(N, '#lobbyBody .b-steps [data-bstep=reg]')), 'N: First steps says no game is open yet');
  await N.click('#bOnb [data-onb=demo]');
  check(!!(await until(() => N.evaluate(() => !document.getElementById('game').hidden))), 'N: "Try the practice table" opens the practice table');
  // a seeded member (no first visit on the account): Next game, but no welcome and no First steps
  const P7 = await page(390, 844); await P7.goto(S.base + '/'); await P7.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), (await S.api('login', { name: 'Test Player 07', pin: '135777' })).token); await P7.reload();
  await P7.waitForSelector('#lobby:not([hidden]) #lobbyBody .b-next'); await sleep(1200);
  check(!(await P7.$('#bOnb')) && !(await P7.$('#lobbyBody .b-steps')), 'an existing member: Next game only, no welcome and no First steps');
  // the director's Home is as it was
  const D = await page(390, 844); await D.goto(S.base + '/'); await D.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), (await S.api('login', { name: 'Test Director', pin: '246810' })).token); await D.reload();
  await D.waitForSelector('#lobby:not([hidden])'); await sleep(1200);
  check(!(await D.$('#lobbyBody .b-steps')) && !(await D.$('#bOnb')) && /Open Director/.test(await text(D, '#lobbyBody .b-next') || ''), 'the director: Next game (open one from Director), no welcome, no First steps');
  // a running tournament: Live at Blindrise lists this club's tables, a tap watches
  dir.send({ t: 'create', name: 'Sunday Live', stack: 30000, levelMin: 60, tableSize: 9, lateLevels: 0 }); await until(() => dir.club.tourney && dir.club.tourney.name === 'Sunday Live');
  const regs = []; for(const n of ['01', '02', '03', '04']){ const s = await sock(S.base, (await S.api('login', { name: 'Test Player ' + n, pin: '1357' + n[1].repeat(2) })).token); s.send({ t: 'join' }); regs.push(s); }
  await until(() => dir.club.tourney.regs.length >= 4); dir.send({ t: 'start' });
  const lr = await until(() => P7.evaluate(() => { const r = document.querySelector('#lobbyBody .b-live .b-ltable'); return r && document.querySelector('#lobbyBody .b-live-dot.on') ? r.textContent.replace(/\s+/g, ' ').trim() : null; }), 10000);
  check(!!lr && /Table 1/.test(lr) && /Level 1/.test(lr) && /Watch/.test(lr), `running: Live at Blindrise shows the table with the red live dot: "${lr}"`);
  await P7.click('#lobbyBody .b-live .b-ltable');
  check(!!(await until(() => P7.evaluate(() => !document.getElementById('game').hidden))), 'running: a tap on the table watches it');
  regs.forEach(r => r.ws.close());

  // ================= board off =================
  const O = await server(false);
  const odir = await sock(O.base, (await O.api('login', { name: 'Test Director', pin: '246810' })).token);
  odir.send({ t: 'create', name: tName, stack: 30000, levelMin: 15, startAt: nextSat8(), repeat: 'weekly', tableSize: 9, lateLevels: 2 });
  await until(() => odir.club.tourney && odir.club.tourney.status === 'registering');
  odir.send({ t: 'invite', group: true }); const ocode = await until(() => odir.invite);
  const F = await page(390, 844);
  await joinUI(F, O.base, ocode, 'Newcomer F');
  const remF = await reminder(F);
  check(await F.evaluate(() => document.documentElement.dataset.ui !== 'board'), 'off: the page is not the board');
  check(!(await F.$('#bOnb')) && !(await F.$('.b-next')) && !(await F.$('.b-steps')), 'off: no welcome, no Next game, no First steps');
  check(remF === `<h2>Get a reminder?</h2><p>We'll send a notification to this phone 15 minutes before ${tName} starts, and again when the cards are dealt.</p><div class="row"><button class="btn-ghost" data-i="0">No thanks</button><button class="btn-red" data-i="1">Notify me</button></div>`, 'off: the reminder question exactly as before');
  const fws = await sock(O.base, await tokenOf(F));
  check(!('onb' in fws.club.me), 'off: the club message carries no first-visit field');
  fws.send({ t: 'onb', step: 3 }); await sleep(600);
  const fws2 = await sock(O.base, await tokenOf(F));
  check(!('onb' in fws2.club.me), 'off: an "onb" message changes nothing');
  await sleep(1200);
  const rec = (() => { try{ const j = JSON.parse(fs.readFileSync(O.DATA, 'utf8')); return Object.entries(j.kv || j).filter(([k]) => k.startsWith('user:')).map(([, v]) => v); }catch(e){ return null; } })();
  if(rec) check(rec.length > 0 && rec.every(u => !('onb' in u)), `off: no account record holds a first-visit field (${rec.length} records)`);

  await browser.close();
  console.log(`\n${oks} ok, ${fails.length} failed`);
  cleanup();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e.stack || e); cleanup(); process.exit(1); });
