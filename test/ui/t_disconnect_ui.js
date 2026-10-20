// Disconnect protection in the browser (Issue #9), on a phone: when the player to act loses their connection, their seat
// shows a "Disconnected" badge and an orange clock bar (refilled with the protection time), and the hero's line says
// "Waiting for <name> · disconnected, protection time". The badge stays on screen and nothing scrolls sideways.
// Usage: [VP=390x844] PLAYWRIGHT_CORE=... CHROMIUM=... node test/ui/t_disconnect_ui.js [screenshot dir]
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

// a bot that checks or calls; drop(tb) true closes its connection on that turn instead of acting
function bot(port, tok, drop){
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`), c = { ws, send: o => ws.readyState === 1 && ws.send(JSON.stringify(o)) };
  ws.on('open', () => c.send({ t: 'hello', token: tok, device: 'bot' + Math.random() }));
  ws.on('message', raw => {
    const m = JSON.parse(raw);
    if(m.t === 'club'){ c.club = m.club; c.id = m.club.me.id; }
    if(m.t !== 'table') return;
    const tb = m.table;
    if(tb.actUid === c.id && tb.legal && c.last !== tb.tid + tb.seq){
      c.last = tb.tid + tb.seq;
      if(drop && drop(tb)){ c.dropped = tb; setTimeout(() => ws.close(), 300); return; }
      const L = tb.legal; setTimeout(() => c.send({ t: 'act', tid: tb.tid, hand: tb.handNo, seq: tb.seq, a: L.canCheck ? { t: 'check' } : { t: 'call' } }), 30);
    }
  });
  return new Promise(r => { const t = setInterval(() => { if(c.club){ clearInterval(t); r(c); } }, 30); });
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const port = await freePort(), base = 'http://127.0.0.1:' + port, DATA = path.join(os.tmpdir(), 't_disconnect_ui_' + port + '.json');
  fs.writeFileSync(DATA, '{}');
  const env = { ...process.env, PORT: String(port), NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, DATABASE_URL: '', STAGING: '1', FAST: '1', TIME_BANK_MS: '4000', DC_PROTECT_MS: '25000' };
  delete env.GAMEPLAY_OPTIONS; delete env.CLUB_SWITCHING;
  srvs.push(spawn('node', ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'ignore', 'inherit'] }));
  for(let i = 0; i < 100; i++){ try{ if((await fetch(base + '/healthz')).ok) break; }catch(x){} await sleep(100); }
  const post = (p, body, tok) => fetch(base + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body || {}) }).then(r => r.json());
  const dir = await post('login', { name: 'Test Director', pin: '246810' });
  const P = n => post('login', { name: 'Test Player 0' + n, pin: '1357' + String(n).repeat(2) });
  const p1 = await P(1), p2 = await P(2);

  const d = await bot(port, dir.token);
  d.send({ t: 'create', name: 'Drop Night', stack: 100000, levelMin: 20, lateLevels: 0 }); await sleep(500);
  // Test Player 02 drops on their first turn from the third hand on
  const v = await bot(port, p2.token, tb => tb.handNo >= 3);
  const me = await bot(port, p1.token);
  [d, v, me].forEach(b => b.send({ t: 'join' })); await sleep(500);
  const pg = await browser.newPage({ viewport: { width: VP[0], height: VP[1] }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await pg.goto(base + '/'); await pg.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), p1.token);
  await pg.reload(); await pg.evaluate(() => document.fonts.ready); await sleep(500);
  d.send({ t: 'start' });

  const seen = await until(() => pg.evaluate(() => { const b = document.querySelector('#seats .seat.acting .badge.dc'); return b && b.offsetParent ? b.textContent : null; }), 40000);
  check(seen === 'Disconnected', 'the acting seat shows the Disconnected badge: ' + seen);
  await sleep(600);
  const st = await pg.evaluate(() => {
    const seat = document.querySelector('#seats .seat.acting'), b = seat && seat.querySelector('.badge.dc'), r = b && b.getBoundingClientRect(), bar = seat && seat.querySelector('.shotBar');
    return { name: seat && seat.querySelector('.nm').textContent, inView: !!r && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
      bar: !!bar && bar.classList.contains('dc') && getComputedStyle(bar).backgroundColor, scale: bar && bar.style.transform,
      line: (document.getElementById('controls') || document.body).textContent, wide: document.documentElement.scrollWidth > innerWidth };
  });
  check(/02/.test(st.name || ''), 'it is the dropped player\'s seat: ' + st.name);
  check(st.inView, 'the badge is fully on screen');
  check(!!st.bar && st.bar !== 'rgb(0, 0, 0)', 'the seat clock bar turns orange: ' + st.bar);
  check(/scaleX\(0\.9|scaleX\(1\)/.test(st.scale || ''), 'the clock bar is refilled with the protection time: ' + st.scale);
  check(/disconnected, protection time/.test(st.line), 'the hero line says disconnected, protection time');
  check(!st.wide, 'no sideways scroll');
  await shot(pg, 'disconnect-protection');
  // the dropped player comes back: the mark goes and they play on
  const v2 = await bot(port, p2.token);
  check(await until(() => pg.evaluate(() => !document.querySelector('#seats .badge.dc')), 8000), 'after a reconnect the Disconnected badge goes');
  check(await until(() => pg.evaluate(() => ![...document.querySelectorAll('#seats .badge')].some(b => b.textContent === 'Away')), 4000), 'and the player is not marked away');
  v2.ws.close();

  console.log(`t_disconnect_ui (${TAG}): ${oks} ok, ${fails} failed`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
