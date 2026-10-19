// Production default (no STAGING, no CLUBS_DEFAULT): Business Club and Opportunity Club start closed.
//  - members: the Exchange tab is hidden; the Exchange, Bulletin and Scanner doors read "Opening soon", do nothing when
//    tapped, and the label never covers the door's title; /api/biz* and /api/opp* answer 403
//  - the owner is exempt: doors open, tab visible, APIs answer
//  - the owner opens the clubs from the Director tab: members see them at once; closing them again hides them
// PLAYWRIGHT=/path/to/playwright-core CHROMIUM=/path/to/chromium node test/ui/t_clubs_closed.js
const { spawn } = require('child_process');
const { watchServer, waitReady } = require('../ready');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || process.env.PLAYWRIGHT_CORE || 'playwright');
const ROOT = process.env.ROOT || path.join(__dirname, '..', '..');
const PORT = 5300 + Math.floor(Math.random() * 80), BASE = 'http://localhost:' + PORT;
const DATA = require('os').tmpdir() + '/t_clubs_closed_' + process.pid + '.json';
const env = { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '', DATABASE_URL: '' };
delete env.STAGING; delete env.CLUBS_DEFAULT;
const srv = watchServer(spawn('node', ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'ignore', 'pipe'] }));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const post = async (p, body, tok) => { const r = await fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body || {}) }); return { status: r.status, j: await r.json() }; };
const api = async (p, body, tok) => { const { j } = await post(p, body, tok); if(j.error) throw new Error(p + ': ' + j.error); return j; };
const fails = [];
let oks = 0;
const check = (cond, msg) => { if(cond) oks++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if(!cond) fails.push(msg); };

async function signedIn(browser, tok, [w, h]){
  const pg = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await pg.goto(BASE + '/'); await pg.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), tok);
  await pg.reload(); await pg.evaluate(() => document.fonts.ready); await sleep(500);
  return pg;
}
// the member Home doors: which are live buttons, which are "Opening soon", and whether a label overlaps its title
const doors = pg => pg.evaluate(() => [...document.querySelectorAll('#lobby .lx-door')].map(d => {
  const t = d.querySelector('.lx-door-t b'), em = d.querySelector('em'), r = a => a && a.getBoundingClientRect();
  const a = r(t), b = r(em), W = document.documentElement.clientWidth;
  const overlap = !!(a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom);
  return { k: [...d.classList].find(c => c.startsWith('lx-') && c !== 'lx-door'), soon: d.classList.contains('soon'), button: d.tagName === 'BUTTON',
    disabled: d.getAttribute('aria-disabled') === 'true', label: em ? em.textContent.trim() : '', overlap, inside: d.getBoundingClientRect().right <= W + 1 };
}));
const tabHidden = pg => pg.evaluate(() => document.querySelector('#tabs [data-tab="biz"]').hidden);
const selected = pg => pg.evaluate(() => document.querySelector('#tabs [aria-selected="true"]').dataset.tab);

(async () => {
  await waitReady(BASE, srv);
  await sleep(300);
  const OWN = (await api('setup', { code: 'secret', name: 'Test Director', pin: '246810', agree: true })).token;
  const MEM = (await api('redeem', { code: (await api('invite', {}, OWN)).code, name: 'Test Player 01', pin: '135711', agree: true })).token;

  // ---- server: closed by default for members, owner exempt ----
  for(const p of ['bizList', 'oppList']){
    const m = await post(p, {}, MEM), o = await post(p, {}, OWN);
    check(m.status === 403, `member ${p} refused while closed (${m.status})`);
    check(o.status === 200, `owner ${p} answers while closed (${o.status})`);
  }

  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  for(const vp of [[320, 568], [390, 844]]){
    const tag = vp.join('x');
    const pg = await signedIn(browser, MEM, vp);
    check(await tabHidden(pg), `${tag} member: Exchange tab hidden`);
    const ds = await doors(pg);
    const poker = ds.find(d => d.k === 'lx-poker'), rest = ds.filter(d => d.k !== 'lx-poker');
    check(poker && poker.button && !poker.soon, `${tag} member: poker door is a live button`);
    check(rest.length === 3 && rest.every(d => d.soon && !d.button && d.disabled && /opening soon/i.test(d.label)), `${tag} member: Exchange, Bulletin, Scanner doors read "Opening soon" and are inert (${JSON.stringify(rest.map(d => [d.k, d.soon, d.button]))})`);
    check(rest.every(d => !d.overlap), `${tag} member: "Opening soon" never covers a door title`);
    check(ds.every(d => d.inside), `${tag} member: every door inside the screen`);
    for(const d of rest){ await pg.click(`#lobby .lx-door.${d.k}`); await sleep(250); }
    check(await selected(pg) === 'event' && !(await pg.locator('.modal').count()), `${tag} member: tapping a closed door opens nothing`);
    const side = await pg.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    check(!side, `${tag} member: no sideways scroll`);
    if(process.env.SHOTS) await pg.screenshot({ path: path.join(process.env.SHOTS, `closed-member-${tag}.png`) });
    await pg.close();

    const op = await signedIn(browser, OWN, vp);
    check(!(await tabHidden(op)), `${tag} owner: Exchange tab visible while closed (owner preview)`);
    await op.close();
  }

  // ---- the owner opens the clubs in Director; members see them at once; closing hides them again ----
  const mp = await signedIn(browser, MEM, [390, 844]);
  const op = await signedIn(browser, OWN, [390, 844]);
  op.on('dialog', d => d.accept());
  await op.click('#tabs [data-tab=director]'); await sleep(300);
  await op.click('#clubsBtn'); await sleep(800);
  check(!(await tabHidden(mp)), 'opened in Director: member Exchange tab appears without reload');
  const open = await doors(mp);
  check(open.filter(d => d.k !== 'lx-poker').every(d => d.button && !d.soon), 'opened: member doors become live buttons');
  check((await post('bizList', {}, MEM)).status === 200, 'opened: member bizList answers');
  await op.click('#clubsBtn'); await sleep(800);
  check(await tabHidden(mp), 'closed again: member Exchange tab hidden again');
  check((await post('oppList', {}, MEM)).status === 403, 'closed again: member oppList refused');

  await browser.close();
  console.log(`\n${oks} ok, ${fails.length} failed`);
  srv.kill(); try{ require('fs').unlinkSync(DATA); }catch(e){}
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); srv.kill(); process.exit(1); });
