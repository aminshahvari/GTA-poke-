// Tournament break and sponsor spotlight in the browser (Issues #11, #12), on a phone.
// Director form: the break (3-5 minutes) and the sponsor (published Exchange businesses, the Spotlight one picked first).
// At the start the sponsor ribbon covers only the clock bar for the set seconds; after level 10 the break card shows on the
// felt between hands with the countdown and the sponsor's name and logo, the clock bar says Break, a reload shows the same
// time, and neither ever overlaps the board, a seat or the action buttons. Short levels (FAST, LEVEL_MS).
// Usage: [VP=390x844] PLAYWRIGHT_CORE=... CHROMIUM=... node test/ui/t_breaks_ui.js [screenshot dir]
const path = require('path'), net = require('net'), fs = require('fs'), os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || process.env.PLAYWRIGHT || 'playwright-core');
const SHOTS = process.argv[2];
const VP = (process.env.VP || '390x844').split('x').map(Number), TAG = VP.join('x');
const ROOT = path.join(__dirname, '..', '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, oks = 0;
const check = (ok, msg) => { ok ? oks++ : fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const srvs = []; process.on('exit', () => srvs.forEach(s => { try{ s.kill('SIGKILL'); }catch(e){} }));
const shot = async (pg, name) => { if(SHOTS){ fs.mkdirSync(SHOTS, { recursive: true }); await pg.screenshot({ path: path.join(SHOTS, name + '-' + TAG + '.png') }); } };
const until = async (f, ms) => { const t0 = Date.now(); let v; while(!(v = await f()) && Date.now() - t0 < ms) await sleep(150); return v; };

function bot(port, tok){
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`), c = { ws, send: o => ws.send(JSON.stringify(o)) };
  ws.on('open', () => c.send({ t: 'hello', token: tok, device: 'bot' + Math.random() }));
  ws.on('message', raw => {
    const m = JSON.parse(raw);
    if(m.t === 'club'){ c.club = m.club; c.id = m.club.me.id; }
    if(m.t !== 'table') return;
    const tb = m.table;
    if(tb.actUid === c.id && tb.legal && c.last !== tb.tid + tb.seq){ c.last = tb.tid + tb.seq; const L = tb.legal; setTimeout(() => c.send({ t: 'act', tid: tb.tid, hand: tb.handNo, seq: tb.seq, a: L.canCheck ? { t: 'check' } : { t: 'call' } }), 30); }
  });
  return new Promise(r => { const t = setInterval(() => { if(c.club){ clearInterval(t); r(c); } }, 30); });
}
// rectangles that must not overlap the overlay
const overlaps = (pg, sel) => pg.evaluate(sel => {
  const o = document.querySelector(sel); if(!o || o.hidden) return null;
  const a = o.getBoundingClientRect(), hit = r => r.width && r.height && a.left < r.right && r.left < a.right && a.top < r.bottom && r.top < a.bottom;
  const box = e => [e, ...e.querySelectorAll('.av,.plate,.hole')].map(x => x.getBoundingClientRect()).filter(q => q.width);
  // a seat under the overlay counts only where the overlay is drawn over it (the break card sits under the seats)
  const covered = e => box(e).some(r => hit(r) && !e.contains(document.elementFromPoint(Math.min(Math.max(r.left + r.width / 2, a.left + 1), a.right - 1), Math.min(Math.max(r.top + r.height / 2, a.top + 1), a.bottom - 1))));
  o.style.pointerEvents = 'auto'; // (elementFromPoint skips an element that takes no taps)
  const named = [...document.querySelectorAll('#seats .seat, #board .card, #controls button, #dock')].filter(e => e.offsetParent && covered(e));
  o.style.pointerEvents = '';
  return named.map(e => e.id || e.className.split(' ')[0]);
}, sel);

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  // a small JPEG logo for the sponsor (drawn in the browser, so no image library is needed)
  const lp = await browser.newPage();
  const jpeg = await lp.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 96; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 96, 96); g.addColorStop(0, '#f3e2b6'); g.addColorStop(1, '#9c7a3c'); x.fillStyle = g; x.fillRect(0, 0, 96, 96);
    x.fillStyle = '#111a2e'; x.font = 'bold 40px serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('AC', 48, 50); return c.toDataURL('image/jpeg', .85).split(',')[1]; });
  await lp.close();
  // fake data only: one member with a published business and its logo
  const SP = 'u00000000005a', port = await freePort(), base = 'http://127.0.0.1:' + port, DATA = path.join(os.tmpdir(), 't_breaks_ui_' + port + '.json');
  fs.writeFileSync(DATA, JSON.stringify({
    ['user:' + SP]: { id: SP, name: 'Ava Test', salt: 'x', pin: 'x', role: 'member', createdAt: 1, agreedAt: 1 }, 'name:ava test': SP,
    ['biz:' + SP]: { uid: SP, name: 'Aurora Coffee Co.', category: 'food', area: 'Toronto', description: 'Test business', services: '', published: true, publishedAt: Date.now(), show: {} },
    ['bizlogo:' + SP]: { v: 'v1', data: jpeg }
  }));
  const env = { ...process.env, PORT: String(port), NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, DATABASE_URL: '', STAGING: '1', FAST: '1', LEVEL_MS: '1500', BREAK_MS: '45000', TIME_BANK_MS: '4000' };
  delete env.GAMEPLAY_OPTIONS; delete env.CLUB_SWITCHING; delete env.BREAKS;
  srvs.push(spawn('node', ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'ignore', 'inherit'] }));
  for(let i = 0; i < 100; i++){ try{ if((await fetch(base + '/healthz')).ok) break; }catch(x){} await sleep(100); }
  const post = (p, body, tok) => fetch(base + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body || {}) }).then(r => r.json());
  const dir = await post('login', { name: 'Test Director', pin: '246810' });
  const P = n => post('login', { name: 'Test Player 0' + n, pin: '1357' + String(n).repeat(2) });
  const p1 = await P(1), p2 = await P(2), p3 = await P(3);
  await post('bizSpotlight', { uid: SP }, dir.token);

  const page = async tok => {
    const pg = await browser.newPage({ viewport: { width: VP[0], height: VP[1] }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await pg.goto(base + '/'); await pg.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), tok);
    await pg.reload(); await pg.evaluate(() => document.fonts.ready); await sleep(500);
    return pg;
  };
  // ---- Director form ----
  const dpg = await page(dir.token);
  await dpg.click('#tabs [data-tab=director]'); await sleep(400);
  check(!!(await dpg.$('#nBreak')) && await dpg.$eval('#nBreak', e => e.value) === '5', 'form: break select, 5 minutes by default');
  check(JSON.stringify(await dpg.$$eval('#nBreak option', o => o.map(x => x.value))) === '["3","4","5"]', 'form: break is 3, 4 or 5 minutes');
  check(await dpg.$eval('#nSponsor', e => e.value) === SP, 'form: the Spotlight business is picked as sponsor by default');
  check(await dpg.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'form: no sideways scroll');
  await dpg.locator('#nSponsor').scrollIntoViewIfNeeded(); await shot(dpg, 'break-form');
  await dpg.selectOption('#nBreak', '4'); await dpg.selectOption('#nSponsorSec', '10'); await dpg.selectOption('#nLate', '0');
  await dpg.fill('#nName', 'Break Night');
  await dpg.click('#newForm button[type=submit]'); await sleep(800);
  const d = await bot(port, dir.token), b2 = await bot(port, p2.token), b3 = await bot(port, p3.token);
  check(d.club.tourney.breakMin === 4 && d.club.tourney.sponsor && d.club.tourney.sponsor.name === 'Aurora Coffee Co.' && d.club.tourney.sponsorSec === 10, 'saved: 4-minute break, sponsor, 10 seconds at the start');
  // the browser player plays too (check or call), so its table is the one on screen
  const pg = await page(p1.token);
  const me = await bot(port, p1.token); me.ws.on('message', raw => { const m = JSON.parse(raw); if(m.t === 'table' && m.table.actUid === me.id && m.table.legal && me.l !== m.table.seq){ me.l = m.table.seq; const L = m.table.legal; setTimeout(() => me.send({ t: 'act', tid: m.table.tid, hand: m.table.handNo, seq: m.table.seq, a: L.canCheck ? { t: 'check' } : { t: 'call' } }), 40); } });
  [b2, b3, me].forEach(b => b.send({ t: 'join' })); await sleep(500);
  d.send({ t: 'start' });

  // ---- start: the sponsor ribbon over the clock bar ----
  const spn = await until(() => pg.evaluate(() => { const e = document.getElementById('spn'); return e && !e.hidden && e.textContent.includes('Aurora Coffee Co.'); }), 8000);
  check(spn, 'start: the sponsor ribbon shows the sponsor name');
  await sleep(700);
  await shot(pg, 'sponsor-start');
  const sr = await pg.evaluate(() => { const a = document.getElementById('spn').getBoundingClientRect(), c = document.querySelector('#game .clock').getBoundingClientRect(); return { inClock: a.top >= c.top - 1 && a.bottom <= c.bottom + 1 && a.left >= c.left - 1 && a.right <= c.right + 1, img: !!document.querySelector('#spn img') }; });
  check(sr.inClock, 'start: the ribbon stays inside the clock bar');
  check(sr.img, 'start: the sponsor logo is shown');
  check((await overlaps(pg, '#spn') || []).length === 0, 'start: the ribbon covers no seat, card or button');
  check(await pg.evaluate(() => getComputedStyle(document.getElementById('spn')).pointerEvents === 'none'), 'start: the ribbon takes no taps');
  check(await until(() => pg.evaluate(() => document.getElementById('spn').hidden), 12000), 'start: the ribbon goes away by itself');

  // ---- break after level 10 ----
  const onBreak = await until(() => pg.evaluate(() => { const e = document.getElementById('brk'); return e && !e.hidden; }), 40000);
  check(onBreak, 'break: the break card shows on the felt');
  await sleep(800);
  await shot(pg, 'break');
  const bk = await pg.evaluate(() => ({ txt: document.getElementById('brk').textContent, time: document.getElementById('brkTime').textContent, lbl: document.getElementById('cTimeLbl').textContent, ct: document.getElementById('cTime').textContent, img: !!document.querySelector('#brk img'), lvl: document.getElementById('cLevel').textContent }));
  check(/Tournament break/.test(bk.txt) && /Play resumes by itself · Level 11/.test(bk.txt), 'break: says it resumes by itself on level 11: ' + bk.txt.replace(/\s+/g, ' ').slice(0, 120));
  check(/^\d+:\d\d$/.test(bk.time) && bk.lbl === 'Break' && bk.ct === bk.time, 'break: countdown ' + bk.time + ' in the card and the clock bar (' + bk.lbl + ')');
  check(/Presented by/.test(bk.txt) && /Aurora Coffee Co\./.test(bk.txt) && /Food/.test(bk.txt) && bk.img, 'break: the sponsor name, category and logo');
  check((await overlaps(pg, '#brk') || []).length === 0, 'break: the card covers no seat, card or button: ' + JSON.stringify(await overlaps(pg, '#brk')));
  check(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'break: no sideways scroll');
  // reconnect: a reload shows the same break time
  const t1 = await pg.evaluate(() => document.getElementById('brkTime').textContent);
  await pg.reload(); await pg.evaluate(() => document.fonts.ready);
  const back = await until(() => pg.evaluate(() => { const e = document.getElementById('brk'); return e && !e.hidden && document.getElementById('brkTime').textContent; }), 10000);
  const sec = s => { const [m, x] = String(s).split(':').map(Number); return m * 60 + x; };
  check(back && Math.abs(sec(back) - sec(t1)) <= 4, `reload: the same break time (${t1} before, ${back} after)`);
  // the lobby says when play resumes
  await pg.click('#lobbyBtn'); await sleep(500);
  check(/On break/.test(await pg.textContent('#lobbyBody')), 'lobby: shows On break and when play resumes');
  await shot(pg, 'break-lobby');
  // the sponsor on the break card opens its Exchange page; the player is back at the table when the break ends
  await pg.click('[data-watch]'); await until(() => pg.evaluate(() => !document.getElementById('game').hidden && !document.getElementById('brk').hidden), 8000);
  check(await pg.evaluate(() => /See their page/.test(document.getElementById('brk').textContent)), 'break: the sponsor says See their page');
  await pg.click('#brk [data-spbiz]');
  const opened = await until(() => pg.evaluate(() => !document.getElementById('lobby').hidden && /Aurora Coffee Co\./.test(document.getElementById('lobbyBody').textContent) && /Test business/.test(document.getElementById('lobbyBody').textContent)), 8000);
  check(opened, "tap: opens the sponsor's Exchange page");
  await shot(pg, 'sponsor-page');
  check(await until(() => pg.evaluate(() => !document.getElementById('game').hidden), 50000), 'break over: the player is back at the table');

  console.log(`t_breaks_ui (${TAG}): ${oks} ok, ${fails} failed`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
