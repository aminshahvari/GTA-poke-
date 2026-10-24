// Sponsor and prize at the table (owner's requests, 2026-10-22): every player sees the sponsor intro the first time they
// open the table, even 20 seconds after the start; the prize in the lobby and on the sponsor; and a phone held sideways
// uses the free column beside the table for the sponsor and the tournament (players left, tables, chip leader, your
// place, watchers), the status box staying at the bottom. Upright, no side panel.
// Usage: PLAYWRIGHT_CORE=... CHROMIUM=... [FONTS_DIR=..] node test/ui/t_sponsor_ui.js [screenshot dir]
const path = require('path'), net = require('net'), fs = require('fs'), os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || process.env.PLAYWRIGHT || 'playwright-core');
const SHOTS = process.argv[2];
const ROOT = path.join(__dirname, '..', '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, oks = 0;
const check = (ok, msg) => { ok ? oks++ : fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const srvs = []; process.on('exit', () => srvs.forEach(s => { try{ s.kill('SIGKILL'); }catch(e){} }));
const shot = async (pg, name) => { if(SHOTS){ fs.mkdirSync(SHOTS, { recursive: true }); await pg.screenshot({ path: path.join(SHOTS, name + '.png') }); } };
const until = async (f, ms) => { const t0 = Date.now(); let v; while(!(v = await f()) && Date.now() - t0 < ms) await sleep(150); return v; };
const SP = 'u00000000005a', PRIZE = 'Dinner for two at Aurora';

// a player that checks or calls whenever it is their turn
function bot(port, tok){
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`), c = { ws, send: o => ws.send(JSON.stringify(o)) };
  ws.on('open', () => c.send({ t: 'hello', token: tok, device: 'bot' + Math.random() }));
  ws.on('message', raw => {
    const m = JSON.parse(raw);
    if(m.t === 'club'){ c.club = m.club; c.id = m.club.me.id; }
    if(m.t === 'error') c.err = m.error;
    if(m.t !== 'table') return;
    const tb = m.table;
    if(tb.actUid === c.id && tb.legal && c.last !== tb.tid + tb.seq){ c.last = tb.tid + tb.seq; const L = tb.legal; setTimeout(() => c.send({ t: 'act', tid: tb.tid, hand: tb.handNo, seq: tb.seq, a: L.canCheck ? { t: 'check' } : { t: 'call' } }), 30); }
  });
  return new Promise(r => { const t = setInterval(() => { if(c.club){ clearInterval(t); r(c); } }, 30); });
}
// what the given element covers of the seats, cards and buttons
const overlaps = (pg, sel) => pg.evaluate(sel => {
  const o = document.querySelector(sel); if(!o || o.hidden) return null;
  const a = o.getBoundingClientRect(), hit = r => r.width && r.height && a.left < r.right - 1 && r.left < a.right - 1 && a.top < r.bottom - 1 && r.top < a.bottom - 1;
  return [...document.querySelectorAll('#seats .seat, #seats .seat .av, #seats .seat .plate, #seats .seat .hole, #board .card, #controls button, #dock .helper, #dock .playline, #controls')]
    .filter(e => e.offsetParent && hit(e.getBoundingClientRect())).map(e => e.id || e.className.split(' ')[0]);
}, sel);

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const lp = await browser.newPage();
  const jpeg = await lp.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 96; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 96, 96); g.addColorStop(0, '#f3e2b6'); g.addColorStop(1, '#9c7a3c'); x.fillStyle = g; x.fillRect(0, 0, 96, 96);
    x.fillStyle = '#111a2e'; x.font = 'bold 40px serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('AC', 48, 50); return c.toDataURL('image/jpeg', .85).split(',')[1]; });
  await lp.close();
  // fake data only: one member with a published business and its logo
  const port = await freePort(), base = 'http://127.0.0.1:' + port, DATA = path.join(os.tmpdir(), 't_sponsor_ui_' + port + '.json');
  fs.writeFileSync(DATA, JSON.stringify({
    ['user:' + SP]: { id: SP, name: 'Ava Test', salt: 'x', pin: 'x', role: 'member', createdAt: 1, agreedAt: 1 }, 'name:ava test': SP,
    ['biz:' + SP]: { uid: SP, name: 'Aurora Coffee Co.', category: 'food', area: 'Toronto', description: 'Test business', services: '', published: true, publishedAt: Date.now(), show: {} },
    ['bizlogo:' + SP]: { v: 'v1', data: jpeg }
  }));
  process.on('exit', () => { try{ fs.unlinkSync(DATA); }catch(e){} });
  const env = { ...process.env, PORT: String(port), NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, DATABASE_URL: '', STAGING: '1', FAST: '1', LEVEL_MS: '600000', TIME_BANK_MS: '4000', BREAKS: '0' };
  delete env.GAMEPLAY_OPTIONS; delete env.CLUB_SWITCHING;
  srvs.push(spawn('node', ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'ignore', 'inherit'] }));
  for(let i = 0; i < 100; i++){ try{ if((await fetch(base + '/healthz')).ok) break; }catch(x){} await sleep(100); }
  const post = (p, body, tok) => fetch(base + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body || {}) }).then(r => r.json());
  const dir = await post('login', { name: 'Test Director', pin: '246810' });
  const P = n => post('login', { name: 'Test Player 0' + n, pin: '1357' + String(n).repeat(2) });
  const p1 = await P(1), p2 = await P(2), p3 = await P(3), p4 = await P(4);
  await post('bizSpotlight', { uid: SP }, dir.token);
  const page = async (tok, [w, h]) => {
    const pg = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await pg.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => { const u = r.request().url(), fd = process.env.FONTS_DIR;
      if(!fd) return r.abort();
      if(u.includes('fonts.googleapis.com/css2')) return r.fulfill({ status: 200, contentType: 'text/css', body: fs.readFileSync(path.join(fd, 'fonts.css')) });
      const f = path.join(fd, u.slice('https://fonts.gstatic.com/'.length).replace(/\//g, '_'));
      return fs.existsSync(f) ? r.fulfill({ status: 200, contentType: 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) }) : r.abort(); });
    await pg.goto(base + '/'); await pg.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), tok);
    await pg.reload(); await pg.evaluate(() => document.fonts.ready); await sleep(500);
    return pg;
  };
  const spnOn = pg => pg.evaluate(() => { const e = document.getElementById('spn'); return !!e && !e.hidden && e.textContent.includes('Aurora Coffee Co.'); });

  const d = await bot(port, dir.token);
  d.send({ t: 'create', name: 'Sponsor Night', stack: 30000, levelMin: 20, lateLevels: 0, sponsor: SP, sponsorSec: 5, prize: PRIZE });
  await until(() => d.club.tourney && d.club.tourney.status === 'registering', 5000);
  const bots = [d, await bot(port, p2.token), await bot(port, p3.token), await bot(port, p4.token), await bot(port, p1.token)];
  bots.forEach(b => b.send({ t: 'join' })); await sleep(600);
  d.send({ t: 'start' });
  await until(() => d.club.tourney.status === 'running', 5000);

  // ---- Part 1: a player who opens the table 20 seconds after the start still gets the sponsor intro ----
  await sleep(20000);
  const late = await page(p1.token, [430, 932]);
  check(await until(() => late.evaluate(() => !document.getElementById('game').hidden), 8000), 'late: the player is taken to their table');
  check(await until(() => spnOn(late), 4000), 'late: 20 s after the start, the sponsor intro shows the first time they open the table');
  await shot(late, 'sp-intro-late-430x932');
  check((await overlaps(late, '#spn') || []).length === 0, 'late: the intro covers no seat, card or button');
  check(await until(() => late.evaluate(() => document.getElementById('spn').hidden), 9000), 'late: and goes away by itself');
  await late.click('#lobbyBtn'); await sleep(500);
  // (the board's Poker tab, B5: the hero card names the sponsor and shows the prize line; classic: the card's note)
  check(await late.evaluate(p => { const h = document.querySelector('.b-hero[data-bhero="club"]');
    if(h){ const sp = h.querySelector('.b-hero-sp'), pr = h.querySelector('.b-hero-prize'); return !!sp && sp.textContent.includes('Aurora Coffee Co.') && !!pr && pr.textContent.includes(p); }
    const n = document.querySelector('#lobbyBody .sp-note'); return !!n && /Presented by Aurora Coffee Co\./.test(n.textContent) && n.textContent.includes('Prize: ' + p); }, PRIZE), 'lobby: the tournament card says who presents it and the prize');
  await shot(late, 'sp-lobby-430x932');
  await late.click('[data-watch]'); await sleep(1200);
  check(!(await spnOn(late)), 'late: back at the table from the lobby, not again');
  await late.close();

  // ---- Part 3: sideways, the free column beside the table ----
  const geo = pg => pg.evaluate(() => {
    const r = e => { if(!e || !e.offsetParent && getComputedStyle(e).position !== 'fixed') return null; const b = e.getBoundingClientRect(); return b.width && b.height ? { l: b.left, t: b.top, r: b.right, b: b.bottom } : null; };
    const side = document.getElementById('sidePanel'), shown = !side.hidden && getComputedStyle(side).visibility !== 'hidden';
    const dockKids = [...document.getElementById('dock').children].filter(e => e.id !== 'coachTip').map(r).filter(Boolean);
    return { side: shown ? r(side) : null, sideHidden: side.hidden, sideTxt: side.textContent.replace(/\s+/g, ' ').trim(), prizeShown: !!side.querySelector('.sp-prize') && !!r(side.querySelector('.sp-prize')),
      tap: !!side.querySelector('[data-spbiz]'), hud: r(document.getElementById('fieldBar')), area: r(document.getElementById('tableArea')), dockKids,
      ctl: r(document.getElementById('controls')), h: innerHeight, w: innerWidth, sideScroll: document.documentElement.scrollWidth > innerWidth,
      land: document.getElementById('game').classList.contains('land') };
  });
  const hit = (a, b) => a && b && a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
  const panel = async (pg, tag, sponsor) => {
    const land = tag !== '430x932';
    // (on the smallest phones the sponsor makes way while the hand helper needs its longest lines: wait for a short one)
    const g = await until(async () => { const x = await geo(pg); return !land || !sponsor || x.side ? x : null; }, 15000) || await geo(pg);
    await sleep(300);
    await shot(pg, `sp-${tag}${sponsor ? '' : '-nosponsor'}`);
    check(!g.sideScroll, `${tag}: no sideways scroll`);
    if(!land){ check(!g.land && g.sideHidden, `${tag}: upright, no side panel`); return; }
    check(g.land && g.hud && g.hud.l >= g.area.r - 1, `${tag}: the tournament HUD stands in the column beside the table`);
    check(g.ctl && Math.abs(g.ctl.b - g.h) <= 2 && g.ctl.l >= g.area.r - 1, `${tag}: the status box stays at the bottom of the column`);
    if(!sponsor){ check(g.sideHidden, `${tag}: no sponsor and no prize, so just the tournament`); return; }
    check(g.side && /Aurora Coffee Co\./.test(g.sideTxt) && g.sideTxt.includes('Prize: ' + PRIZE) && g.prizeShown, `${tag}: the side panel shows the sponsor and the prize: ${g.sideTxt}`);
    check(g.side && g.side.l >= g.area.r - 1 && g.side.r <= g.w + 1, `${tag}: the panel is in the free column, not over the table`);
    check(g.side && !hit(g.side, g.hud) && !g.dockKids.some(k => hit(g.side, k)), `${tag}: it overlaps neither the HUD nor the helper, the free-play line or the buttons`);
    check(g.tap, `${tag}: tapping it opens their page`);
  };
  for(const sz of [[932, 430], [844, 390], [430, 932]]){
    const pg = await page(p1.token, sz), tag = sz.join('x');
    await until(() => pg.evaluate(() => !document.getElementById('game').hidden), 8000); await sleep(1500);
    await panel(pg, tag, true);
    if(tag === '932x430'){
      // See their page: the sponsor's Exchange page (asked first when your hand is in play)
      await pg.click('#sidePanel [data-spbiz]'); await sleep(400);
      if(await pg.$('#modalRoot .btn.primary, #modalRoot button')) for(const b of await pg.$$('#modalRoot button')) if(/Open their page/.test(await b.textContent())){ await b.click(); break; }
      check(await until(() => pg.evaluate(() => !document.getElementById('lobby').hidden && /Test business/.test(document.getElementById('lobbyBody').textContent)), 6000), `${tag}: a tap opens the sponsor's Exchange page`);
    }
    await pg.close();
  }
  // a tournament with no sponsor and no prize: the column holds just the tournament
  d.send({ t: 'cancel' }); await until(() => d.club.tourney.status !== 'running', 5000);
  d.send({ t: 'create', name: 'Plain Night', stack: 30000, levelMin: 20, lateLevels: 0, sponsor: null, prize: '' });
  await until(() => d.club.tourney && d.club.tourney.status === 'registering', 5000);
  bots.forEach(b => b.send({ t: 'join' })); await sleep(600);
  d.send({ t: 'start' }); await until(() => d.club.tourney.status === 'running', 5000);
  for(const sz of [[932, 430], [844, 390], [430, 932]]){
    const pg = await page(p1.token, sz), tag = sz.join('x');
    await until(() => pg.evaluate(() => !document.getElementById('game').hidden), 8000); await sleep(1500);
    await panel(pg, tag, false);
    await pg.close();
  }

  console.log(`t_sponsor_ui: ${oks} ok, ${fails} failed`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
