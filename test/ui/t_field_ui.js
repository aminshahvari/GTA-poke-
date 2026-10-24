// The tournament bar at the table (players' feedback, 2026-10-21), at 390x844, 320x568, 844x390 and 1280x800:
// players still playing and tables, the chip leader of every table, how many watch, and your place among everyone.
// Under UI_BOARD=1 (Issue #32 B3) the same facts are checked where the board puts them (boardField): the header card,
// the tournament sheet and, sideways on a wide phone, the column beside the table.
// Usage: PLAYWRIGHT=/path/to/playwright-core CHROMIUM=/path/to/chromium [FONTS_DIR=..] node test/ui/t_field_ui.js [shotDir]
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require(require.resolve('ws', { paths: [path.join(__dirname, '..', '..')] }));
const { chromium } = require(process.env.PLAYWRIGHT || process.env.PLAYWRIGHT_CORE || 'playwright-core');
const SHOTS = process.argv[2];
if(SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const ROOT = path.join(__dirname, '..', '..');
const PORT = 6900 + Math.floor(Math.random() * 200), BASE = 'http://127.0.0.1:' + PORT, DATA = path.join(require('os').tmpdir(), 't_field_ui_' + PORT + '_' + process.pid + '.json');
try{ fs.unlinkSync(DATA); }catch(e){}
const srv = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '1', STAGING: '', CLUBS_DEFAULT: 'on', CLUB_SWITCHING: '1', DOMINO: '1', DATABASE_URL: '', TIME_BANK_MS: '1500', DC_GONE_MS: '600', LEVEL_MS: '600000', BREAKS: '0' }, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, oks = 0;
const check = (ok, msg) => { ok ? oks++ : fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
const api = (p, body, tok, club) => fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}), ...(club ? { 'x-club': club } : {}) }, body: JSON.stringify(body || {}) }).then(r => r.json());
let browser;
async function page(tok, [w, h], club){
  const c = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 800, hasTouch: w < 800, deviceScaleFactor: 2 });
  await c.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => { const u = r.request().url(), dir = process.env.FONTS_DIR;
    if(!dir) return r.abort();
    if(u.includes('fonts.googleapis.com/css2')) return r.fulfill({ status: 200, contentType: 'text/css', body: fs.readFileSync(path.join(dir, 'fonts.css')) });
    const f = path.join(dir, u.slice('https://fonts.gstatic.com/'.length).replace(/\//g, '_'));
    return fs.existsSync(f) ? r.fulfill({ status: 200, contentType: 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) }) : r.abort(); });
  const pg = await c.newPage();
  await pg.goto(BASE + '/');
  await pg.evaluate(([t, cl]) => { localStorage.setItem('stacked:token', JSON.stringify(t)); if(cl) localStorage.setItem('stacked:club', JSON.stringify(cl)); }, [tok, club]);
  await pg.reload(); await pg.evaluate(() => document.fonts.ready); await sleep(800);
  // (the board: these accounts are new, so their first visit opens the welcome (Issue #39); skip it, as a member can)
  if(await pg.$('#bOnb')){ await pg.click('#bOnb [data-onb=skip]'); await sleep(300); }
  return pg;
}
function sock(tok, club){
  return new Promise(res => { const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws'); ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: tok, club }))); ws.on('message', m => { if(JSON.parse(m).t === 'club' && !ws.ready){ ws.ready = true; res(ws); } }); });
}
const noSideScroll = pg => pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const shot = (pg, name) => SHOTS ? pg.screenshot({ path: path.join(SHOTS, name) }) : null;
async function boardField(pg, tag, sz, seated){
  const card = pg.locator('#bHud');
  check(await card.isVisible(), `${tag} (board): the header card shows`);
  const ct = (await card.innerText()).replace(/\s+/g, ' ');
  check(/\d+\s*\/\s*\d+/.test(ct), `${tag} (board): players left of the field on the card: ${ct}`);
  check(seated ? /\d+(st|nd|rd|th)/.test(ct) : !/(st|nd|rd|th)\b/.test(ct.replace(/\d+:\d+/, '')), `${tag} (board): ${seated ? 'your rank on the card' : 'no place of their own'}`);
  check(!/leader|Avg/i.test(ct), `${tag} (board): and nothing more on the card`);
  // (owner's ruling, Issue #32 item 11: "N watching" is back in the collapsed bar: sideways in the pill, upright under Lobby)
  const wt = (await pg.evaluate(() => { const e = document.getElementById(document.getElementById('game').classList.contains('land') ? 'bhWt' : 'bWatch'); return e && e.getClientRects().length ? e.innerText : ''; })).replace(/\s+/g, ' ').trim();
  check(/^\d+ watching$/.test(wt), `${tag} (board): "${wt}" in the collapsed bar`);
  if(sz[0] >= 740 && sz[1] <= 600){ const col = (await pg.locator('#fieldBar').innerText()).replace(/\s+/g, ' ');
    check(await pg.locator('#fieldBar').isVisible() && /Chip leader/.test(col) && /\d+ watching/.test(col), `${tag} (board): sideways the column holds the tiles: ${col}`); }
  await card.click(); await sleep(500);
  const sh = (await pg.locator('#bHudSheet').innerText()).replace(/\s+/g, ' ');
  check(/Avg stack [\d,]+/.test(sh) && /Chip leader \S.*[\d,]{3,}/.test(sh) && /Active tables \d+/.test(sh) && /Spectators \d+ watching/.test(sh), `${tag} (board): the sheet: avg stack, chip leader with chips, tables, watching: ${sh.slice(0, 160)}`);
  check(seated ? /Your place \d+(st|nd|rd|th) of \d+/.test(sh) : !/Your place/.test(sh), `${tag} (board): ${seated ? '"Your place" in the sheet' : 'no "Your place" for a watcher'}`);
  check(!/\p{Extended_Pictographic}/u.test(ct + sh), `${tag} (board): no emoji`);
  check(await noSideScroll(pg), `${tag} (board): no sideways scroll`);
  await shot(pg, `field-board-${sz.join('x')}${seated ? '' : '-watcher'}.png`);
  await pg.keyboard.press('Escape'); await sleep(200);
}
const firstInHome = pg => pg.evaluate(() => { const b = document.getElementById('lobbyBody'), f = b && b.firstElementChild; return f ? f.className : null; });
(async () => {
  for(let i = 0; i < 50; i++){ try{ if((await fetch(BASE + '/healthz')).ok) break; }catch(e){} await sleep(200); }
  const O = (await api('setup', { code: 'secret', name: 'Test Director', pin: '1234', agree: true })).token;
  const mk = async (name, club) => (await api('redeem', { code: (await api('invite', {}, O, club)).code, name, pin: '1357', agree: true })).token;
  const names = ['Test Ali', 'Test Bea', 'Test Cy', 'Test Dan', 'Test Eve', 'Test Fay', 'Test Gus', 'Test Hal', 'Test Ivy', 'Test Jo'];
  const toks = []; for(const n of names) toks.push(await mk(n));
  const H = (await api('createClub', { name: 'Harbour Club', code: 'secret', rulesV: 1, acceptRules: true }, O)).club;
  const Pia = await mk('Test Pia', H);
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const so = await sock(O);
  so.send(JSON.stringify({ t: 'create', name: 'Tuesday Night Tournament', stack: 10000, levelMin: 60, tableSize: 6, lateLevels: 0 })); await sleep(400);
  const socks = []; for(const t of toks){ const s = await sock(t); s.send(JSON.stringify({ t: 'join' })); socks.push(s); }
  await sleep(500); so.send(JSON.stringify({ t: 'start' })); await sleep(1500);
  for(const s of socks.slice(1)) s.close();          // the others are away: their hands play on by themselves
  await sleep(9000);                                   // a few hands, so stacks differ
  // a watcher from another club
  for(const sz of [[390, 844], [1280, 800]]){
    const hp = await page(Pia, sz, H), tag = 'home ' + sz.join('x'); await sleep(800);
    const card = hp.locator('.lv-bc');
    check(await card.isVisible(), `${tag}: the live tournament card heads the club home`);
    const ct = (await card.textContent()).replace(/\s+/g, ' ');
    check(/Live tournament/i.test(ct) && /Level \d+/.test(ct) && /Remaining/i.test(ct) && /Active tables/i.test(ct) && /Overall leader/i.test(ct), `${tag}: badge, level and blinds, remaining, tables and overall leader: ${ct.slice(0, 160)}`);
    const tcs = await hp.locator('.lv-tc').count();
    check(tcs === 2, `${tag}: one card per table: ${tcs}`);
    check(await hp.evaluate(() => [...document.querySelectorAll('.lv-tc')].every(b => { const lit = b.querySelectorAll('.mini-table circle.on').length, n = +b.querySelector('.lv-tc-cnt b').textContent; return lit === n && b.querySelectorAll('.mini-table circle').length === 6; })), `${tag}: each mini table lights a seat for every player at it`);
    check(!/\p{Extended_Pictographic}/u.test(ct), `${tag}: no emoji on the card`);
    check(await hp.evaluate(() => { let e = document.getElementById('hudGold'); for(; e; e = e.parentElement) if(getComputedStyle(e).display === 'none') return false; return document.querySelectorAll('.lv-bc svg.ic').length >= 4; }), `${tag}: the gold the icons are drawn in is on this screen too`);
    check(await noSideScroll(hp), `${tag}: no sideways scroll`);
    await shot(hp, `live-card-${sz.join('x')}.png`);
    if(sz[0] >= 800){
      await hp.hover('.lv-tele-lead .vip'); await sleep(300);
      const tip = await hp.evaluate(() => { const t = document.querySelector('.lv-tele-lead .vip-tip').getBoundingClientRect(); const tipEl = document.querySelector('.lv-tele-lead .vip-tip'); if(getComputedStyle(tipEl).opacity !== '1') return 'hidden'; for(let a = tipEl.parentElement; a; a = a.parentElement){ const r = a.getBoundingClientRect(), o = getComputedStyle(a).overflow; if(o !== 'visible' && (t.top < r.top - 1 || t.left < r.left - 1 || t.right > r.right + 1)) return 'clipped by ' + a.className; } return true; });
      check(tip === true && /BB · Table \d/.test(await hp.locator('.lv-tele-lead .vip-tip').textContent()), `${tag}: hovering the leader shows their card with big blinds and table ${tip === true ? '' : tip}`);
      await shot(hp, 'live-card-1280-tooltip.png');
      await hp.mouse.move(5, 5);
    }
    await hp.context().close();
  }
  const watcher = await page(Pia, [390, 844], H);
  await watcher.click('.lv-head [data-live=watch-main]'); await watcher.waitForLoadState('load'); await sleep(1200);
  await watcher.click('.lv-tables [data-wt]'); await sleep(1500);
  for(const sz of [[390, 844], [320, 568], [844, 390], [1280, 800]]){
    const pg = await page(toks[0], sz, 'main'), tag = sz.join('x');
    await sleep(1500);
    // the board design (UI_BOARD, Issue #32 B3): the same facts, where the board puts them: players left and your rank
    // on the header card, the chip leader, tables, watchers and average in the sheet a tap away (and sideways on a wide
    // phone, in the column beside the table too)
    if(await pg.evaluate(() => document.documentElement.dataset.ui === 'board')){ await boardField(pg, tag, sz, true); await pg.context().close(); continue; }
    const bar = pg.locator('#fieldBar');
    check(await bar.isVisible(), `${tag}: the tournament bar shows under the table header`);
    const txt = await bar.textContent();
    check(/Players\s*\d+\s*\/\s*\d+/.test(txt), `${tag}: players left of the field: ${txt.replace(/\s+/g, ' ').trim()}`);
    check(await pg.locator('#fieldBar [aria-label$=" tables"]').count() === 1 && await pg.locator('#fieldBar [aria-label$=" watching"]').count() === 1, `${tag}: tables and watchers as icon badges`);
    check(/Chip leader/i.test(txt) && /Chip leader.*[\d,]{3,}/.test(txt.replace(/\s+/g, ' ')), `${tag}: the chip leader with their chips`);
    check(/Your rank\s*\d+(st|nd|rd|th)\s*\/\s*\d+/.test(txt), `${tag}: your rank among everyone, as a pill`);
    check(await pg.evaluate(() => { const v = document.querySelector('#fieldBar .hud-rank .hud-vs'), r = document.querySelector('#fieldBar .hud-rank'); return !v || (v.classList.contains('up') ? !r.classList.contains('down') : !r.classList.contains('up')); }), `${tag}: the arrow, when there is one, agrees with the pill's colour`);
    check(await pg.locator('#fieldBar .hud-avg').isVisible() === (sz[0] >= 480), `${tag}: the average stack ${sz[0] >= 480 ? 'shows' : 'stays off on a narrow phone'}`);
    check(await pg.evaluate(() => { const n = document.querySelector('#fieldBar .hud-val'), l = document.querySelector('#fieldBar .hud-lbl');
      return /JetBrains Mono/.test(getComputedStyle(n).fontFamily) && /Plus Jakarta Sans/.test(getComputedStyle(l).fontFamily) && getComputedStyle(n).fontVariantNumeric.includes('tabular-nums'); }), `${tag}: numbers in a mono face with even digits, labels in the sans`);
    check(await pg.evaluate(() => [...document.querySelectorAll('#fieldBar svg.ic:not(.hud-vs svg)')].every(s => /url\(.*hudGold/.test(getComputedStyle(s).stroke) && getComputedStyle(s).strokeWidth === '1.5px')), `${tag}: icons are gold line drawings, no emoji`);
    check(!/\p{Extended_Pictographic}/u.test(txt), `${tag}: no emoji anywhere in the bar`);
    if(tag === '390x844'){
      await pg.click('#fieldBar .hud-lead'); await sleep(300);
      const bbTxt = (await bar.textContent()).replace(/\s+/g, ' ');
      check(/[\d.,]+\s*BB/.test(bbTxt) && await pg.locator('#fieldBar .bb-pill').count() >= 1, `${tag}: a tap on the leader shows stacks in big blinds: ${bbTxt.trim()}`);
      await shot(pg, `field-${tag}-bb.png`);
      await pg.click('#fieldBar .hud-lead'); await sleep(300);
      check(await pg.locator('#fieldBar .bb-pill').count() === 0, `${tag}: and a second tap goes back to chips`);
    }
    check(await pg.evaluate(() => [...document.querySelectorAll('#fieldBar .hud-val, #fieldBar .hud-name, #fieldBar .hud-badge b')].every(e => parseFloat(getComputedStyle(e).fontSize) >= 14)), `${tag}: every value is at least 14px`);
    { const spill = await pg.evaluate(() => { const b = document.getElementById('fieldBar').getBoundingClientRect();
      return [...document.querySelectorAll('#fieldBar .hud-mod, #fieldBar .hud-lt')].filter(m => m.getClientRects().length).filter(m => { const r = m.getBoundingClientRect(); return !(r.left >= b.left - 1 && r.right <= b.right + 1 && m.scrollWidth <= m.clientWidth + 1); })
        .map(m => `${m.className} ${m.scrollWidth}>${m.clientWidth}`); });
      check(!spill.length, `${tag}: every module fits, nothing spills over ${spill.join('; ')}`); }
    check(await pg.evaluate(() => [...document.querySelectorAll('#fieldBar .hud-lbl, #fieldBar .hud-val')].every(e => e.getClientRects().length <= 1 && e.offsetHeight < 40)), `${tag}: no label or number wraps`);
    check(await noSideScroll(pg), `${tag}: no sideways scroll`);
    await shot(pg, `field-${tag}.png`);
    await pg.context().close();
  }
  await shot(watcher, 'field-watcher-390.png');
  if(await watcher.evaluate(() => document.documentElement.dataset.ui === 'board')) await boardField(watcher, 'a watcher from another club, 390x844', [390, 844], false);
  else check(await watcher.locator('#fieldBar').isVisible() && /leader/i.test(await watcher.locator('#fieldBar').textContent()) && !/Your rank/.test(await watcher.locator('#fieldBar').textContent()) && /Chip leader/i.test(await watcher.locator('#fieldBar').textContent()), 'a watcher from another club sees the bar too');
  check(/Watching/.test(await watcher.locator('#sPos').textContent()), 'and no place of their own');
  await watcher.context().close();
  so.close(); socks[0].close();
  await browser.close(); srv.kill(); try{ fs.unlinkSync(DATA); }catch(e){}
  console.log(`\n${oks} ok, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(async e => { console.error('FAIL', e.stack || e.message); try{ await browser.close(); }catch(x){} srv.kill(); process.exit(1); });
