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
  check(await late.evaluate(p => { const n = document.querySelector('#lobbyBody .sp-note'); return !!n && /Presented by Aurora Coffee Co\./.test(n.textContent) && n.textContent.includes('Prize: ' + p); }, PRIZE), 'lobby: the tournament card says who presents it and the prize');
  await shot(late, 'sp-lobby-430x932');
  await late.click('[data-watch]'); await sleep(1200);
  check(!(await spnOn(late)), 'late: back at the table from the lobby, not again');
  await late.close();

  console.log(`t_sponsor_ui: ${oks} ok, ${fails} failed`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
