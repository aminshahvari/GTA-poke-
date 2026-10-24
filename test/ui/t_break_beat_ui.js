// The break and the winner beat on a phone (Issue #34, the owner's live game of 2026-10-23). A full table (9 players: the
// phone and 8 bots), short levels (FAST, LEVEL_MS), a 3-second winner beat (WIN_BEAT_MS) and a sponsor.
//  - Winner beat: after each hand the felt shows who won and how much, and the winning hand where the pot was, for the
//    whole 3 seconds the server holds the result.
//  - Break: the card ("On break — back in M:SS", counting down, with the sponsor) is on screen within about a second of
//    the server's break start (breakAt), for the seated phone, a member who opens the app mid-break and a reconnect.
//  - Music (board design only): with the first tap made, the sting plays as the break begins, then the lounge loop, and it
//    stops when play resumes; Sound in "⋯" turns it off and on, remembered, on by default. Board off: no music, no row.
// Usage: [UI_BOARD=1] [VP=390x844] PLAYWRIGHT_CORE=... CHROMIUM=... node test/ui/t_break_beat_ui.js [screenshot dir]
const path = require('path'), net = require('net'), fs = require('fs'), os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || process.env.PLAYWRIGHT || 'playwright-core');
const SHOTS = process.argv[2];
const VP = (process.env.VP || '390x844').split('x').map(Number), TAG = VP.join('x');
const BOARD = process.env.UI_BOARD === '1', UI = BOARD ? 'board' : 'classic';
const ROOT = path.join(__dirname, '..', '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, oks = 0;
const check = (ok, msg) => { ok ? oks++ : fails++; console.log((ok ? 'ok   ' : 'FAIL ') + `[${UI}] ` + msg); };
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const srvs = []; process.on('exit', () => srvs.forEach(s => { try{ s.kill('SIGKILL'); }catch(e){} }));
const shot = async (pg, name) => { if(SHOTS){ fs.mkdirSync(SHOTS, { recursive: true }); const f = path.join(SHOTS, `${name}-${UI}-${TAG}.png`); await pg.screenshot({ path: f }); console.log('shot ' + f); } };
const until = async (f, ms) => { const t0 = Date.now(); let v; while(!(v = await f()) && Date.now() - t0 < ms) await sleep(50); return v; };
const BREAK_MS = 40000, BEAT = 3000;

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
// in the page: when the break card was first on screen (painted), when the first 'club' update that has the break
// arrived, and when the winner beat showed and went (the felt's win-beat mark)
const PROBE = () => {
  window.__t = { brk: 0, club: 0, beats: [], music: [] };
  const WS = window.WebSocket;
  window.WebSocket = class extends WS { constructor(...a){ super(...a); window.__ws = this; this.addEventListener('message', e => { try{ const m = JSON.parse(e.data); if(m.t === 'club' && m.club.tourney && m.club.tourney.breakUntil && !window.__t.club) window.__t.club = Date.now(); }catch(x){} }); } };
  const watch = () => {
    const b = document.getElementById('brk'), a = document.getElementById('tableArea'); if(!b || !a) return setTimeout(watch, 10);
    const seen = () => { if(!b.hidden && b.firstElementChild && !window.__t.brk) requestAnimationFrame(() => { if(!window.__t.brk) window.__t.brk = Date.now(); }); };
    new MutationObserver(seen).observe(b, { attributes: true, childList: true }); seen();
    const g = document.getElementById('game');
    new MutationObserver(() => { const v = g.dataset.music || ''; const L = window.__t.music; if(L[L.length - 1] !== v) L.push(v); }).observe(g, { attributes: true, attributeFilter: ['data-music'] });
    let on = 0;
    new MutationObserver(() => { const w = a.classList.contains('win-beat');
      if(w && !on){ on = Date.now(); window.__t.beats.push({ from: on, ms: 0, msg: document.getElementById('msg').textContent, pot: document.getElementById('pot').textContent }); }
      if(!w && on){ window.__t.beats[window.__t.beats.length - 1].ms = Date.now() - on; on = 0; } }).observe(a, { attributes: true, attributeFilter: ['class'] });
  };
  watch();
};

(async () => {
  // autoplay stays as browsers ship it: sound only after a tap (the test taps, as a member would)
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--autoplay-policy=user-gesture-required'] });
  // fake data only: one member with a published business, the night's sponsor
  const SP = 'u00000000005a', port = await freePort(), base = 'http://127.0.0.1:' + port, DATA = path.join(os.tmpdir(), 't_break_beat_ui_' + port + '.json');
  fs.writeFileSync(DATA, JSON.stringify({
    ['user:' + SP]: { id: SP, name: 'Ava Test', salt: 'x', pin: 'x', role: 'member', createdAt: 1, agreedAt: 1 }, 'name:ava test': SP,
    ['biz:' + SP]: { uid: SP, name: 'Aurora Coffee Co.', category: 'food', area: 'Toronto', description: 'Test business', services: '', published: true, publishedAt: Date.now(), show: {} }
  }));
  process.on('exit', () => { try{ fs.unlinkSync(DATA); }catch(e){} });
  const env = { ...process.env, PORT: String(port), NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, DATABASE_URL: '', STAGING: '1', FAST: '1',
    LEVEL_MS: '2500', BREAK_MS: String(BREAK_MS), TIME_BANK_MS: '4000', WIN_BEAT_MS: String(BEAT) };
  delete env.GAMEPLAY_OPTIONS; delete env.CLUB_SWITCHING; delete env.BREAKS;
  srvs.push(spawn('node', ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'ignore', 'inherit'] }));
  for(let i = 0; i < 100; i++){ try{ if((await fetch(base + '/healthz')).ok) break; }catch(x){} await sleep(100); }
  const post = (p, body, tok) => fetch(base + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body || {}) }).then(r => r.json());
  const dir = await post('login', { name: 'Test Director', pin: '246810' });
  const toks = []; for(let n = 1; n <= 9; n++) toks.push((await post('login', { name: 'Test Player 0' + n, pin: '1357' + String(n).repeat(2) })).token);
  await post('bizSpotlight', { uid: SP }, dir.token);
  const page = async tok => {
    const pg = await browser.newPage({ viewport: { width: VP[0], height: VP[1] }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await pg.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => r.abort());
    await pg.addInitScript(PROBE);
    await pg.goto(base + '/'); await pg.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), tok);
    await pg.reload(); await sleep(400);
    return pg;
  };
  const d = await bot(port, dir.token);
  d.send({ t: 'create', name: 'Beat Night', stack: 100000, levelMin: 20, lateLevels: 0, sponsor: SP, sponsorSec: 5 }); await sleep(400);
  const pg = await page(toks[0]);
  // the phone's own player is a bot on a second connection (it checks or calls), so the table plays on by itself
  const bots = []; for(const t of toks) bots.push(await bot(port, t));
  bots.forEach(b => b.send({ t: 'join' })); await sleep(500);
  d.send({ t: 'start' });
  check(await until(() => pg.evaluate(() => !document.getElementById('game').hidden), 8000), 'the phone opens its table');
  check(await until(() => d.club.tourney && d.club.tourney.status === 'running' && d.club.tables.length === 1, 4000), 'a full table of 9');
  // the member's first tap (on the felt: it takes no action)
  await pg.tap('#tableArea', { position: { x: 30, y: 30 } }).catch(() => {});

  // ---- winner beat ----
  // (the first beat seen can be one already under way when the table opened: the next ones are measured)
  const beat = await until(() => pg.evaluate(() => { const b = window.__t.beats.slice(1).filter(x => x.ms); return b.length >= 2 && b; }), 30000);
  check(!!beat, 'two hands finished with a winner beat');
  if(beat){
    check(beat.every(b => b.ms >= BEAT - 150), `the result stays on the felt for the whole beat: ${beat.map(b => b.ms).join(', ')} ms (beat ${BEAT} ms)`);
    check(beat.every(b => / (wins|split) [\d,]+/.test(b.msg)), `the winner and the amount on the felt: "${beat[0].msg}"`);
    check(beat.every(b => b.pot.trim()), `the winning hand where the pot was: "${beat[0].pot}"`);
  }
  // a screenshot in the middle of a beat, with its sizes for a phone
  await until(() => pg.evaluate(() => document.getElementById('tableArea').classList.contains('win-beat') && !!document.querySelector('#pot.beat')), 15000);
  await sleep(500);
  const look = await pg.evaluate(() => { const m = document.getElementById('msg'), p = document.querySelector('#pot.beat'), r = p && p.getBoundingClientRect(), A = document.getElementById('tableArea').getBoundingClientRect();
    return { msg: m.textContent, msgPx: parseFloat(getComputedStyle(m).fontSize), pot: p && p.textContent, potPx: p && parseFloat(getComputedStyle(p).fontSize), inside: !!r && r.left >= A.left && r.right <= A.right, cut: !!p && p.querySelector('.win-hand').scrollWidth > p.querySelector('.win-hand').clientWidth + 1 }; });
  check(look.pot && look.inside && look.potPx >= 13 && look.msgPx >= 12, `beat on a phone: "${look.msg}" (${look.msgPx}px) and "${look.pot}" (${look.potPx}px), on the felt`);
  await shot(pg, 'winner-beat');

  // ---- break: the seated phone ----
  const brkT = await until(() => d.club.tourney && d.club.tourney.breakUntil && d.club.tourney, 60000);
  check(!!brkT, 'the break starts after level 10');
  const shown = await until(() => pg.evaluate(() => window.__t.brk), 5000);
  const tm = await pg.evaluate(() => window.__t);
  const delay = shown - brkT.breakAt;
  check(shown && delay <= 1000, `seated phone: the break card is on screen ${delay} ms after the server's break start (target 1 s or less); its 'club' update came at ${tm.club - brkT.breakAt} ms`);
  await sleep(1200);
  const txt = async p => p.evaluate(() => { const b = document.getElementById('brk'); return { all: b.textContent.replace(/\s+/g, ' ').trim(), time: (document.getElementById('brkTime') || {}).textContent, op: getComputedStyle(b.firstElementChild).opacity }; });
  const k1 = await txt(pg);
  check(/On break — back in \d+:\d\d/.test(k1.all) && /Aurora Coffee Co\./.test(k1.all) && +k1.op > .99, `the card: "${k1.all.slice(0, 110)}"`);
  await sleep(2100);
  const k2 = await txt(pg), sec = s => { const [m, x] = String(s).split(':').map(Number); return m * 60 + x; };
  check(sec(k1.time) - sec(k2.time) >= 1, `the countdown runs: ${k1.time} then ${k2.time}`);
  const hand = await pg.evaluate(() => ({ cards: document.querySelectorAll('#seats .hole .card:not(.back)').length, acts: !!document.querySelector('#aFold,#aCall,#aCheck') }));
  check(!hand.acts, 'no action buttons during the break (it is not a frozen hand)');
  await shot(pg, 'break');

  // ---- music: sting, then the loop; Sound in "⋯" ----
  if(BOARD){
    // (the member tapped the felt before the break: the sound was unlocked then)
    check(await until(() => pg.evaluate(() => document.getElementById('game').dataset.music === 'loop'), 5000), 'the lounge loop plays');
    const seq = await pg.evaluate(() => window.__t.music);
    check(seq[0] === 'sting' && seq[1] === 'loop', `the break opened with the sting, then the loop: ${seq.join(' → ')}`);
    await pg.tap('[data-bmore]'); await sleep(400);
    const row = await pg.evaluate(() => { const b = document.querySelector('#bSheet [data-bm=sound]'); return b && { on: b.getAttribute('aria-checked'), text: b.textContent, h: b.getBoundingClientRect().height }; });
    check(row && row.on === 'true' && /Sound/.test(row.text) && row.h >= 44, `"⋯" has Sound, on by default: ${row && row.text}`);
    await shot(pg, 'menu-sound');
    await pg.tap('#bSheet [data-bm=sound]'); await sleep(300);
    const off = await pg.evaluate(() => ({ music: document.getElementById('game').dataset.music, saved: Object.keys(localStorage).filter(k => k.startsWith('stacked:sound:')).map(k => k + '=' + localStorage.getItem(k)) }));
    check(!off.music && off.saved.length === 1 && off.saved[0].endsWith('=0'), `Sound off: the music stops at once and is remembered (${off.saved.join(', ')})`);
    await pg.reload(); await until(() => pg.evaluate(() => !document.getElementById('game').hidden && !document.getElementById('brk').hidden), 8000);
    await pg.tap('[data-bmore]'); await sleep(400);
    check(await pg.evaluate(() => { const b = document.querySelector('#bSheet [data-bm=sound]'); return b && b.getAttribute('aria-checked') === 'false'; }), 'after a reload Sound is still off');
    await pg.tap('#bSheet [data-bm=sound]'); await sleep(500);
    check(await until(() => pg.evaluate(() => document.getElementById('game').dataset.music === 'loop'), 3000), 'Sound on again mid-break: the loop (no second sting)');
  } else {
    check(await pg.evaluate(() => !document.getElementById('game').dataset.music && !document.querySelector('[data-bm=sound]')), 'classic design: no music and no Sound row');
  }

  // ---- break: a member who opens the app mid-break, and a reconnect ----
  const fresh = await browser.newPage({ viewport: { width: VP[0], height: VP[1] }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await fresh.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => r.abort());
  await fresh.addInitScript(PROBE);
  await fresh.goto(base + '/'); await fresh.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), toks[4]);
  const f0 = Date.now(); await fresh.reload();
  const fShown = await until(() => fresh.evaluate(() => window.__t.brk), 8000), fT = await fresh.evaluate(() => window.__t);
  check(fShown && fShown - fT.club <= 1000, `fresh join mid-break: the card ${fShown - fT.club} ms after its first update (${fShown - f0} ms after opening the page)`);
  const fk = await txt(fresh);
  check(/On break — back in \d+:\d\d/.test(fk.all) && Math.abs(sec(fk.time) - sec((await txt(pg)).time)) <= 2, `fresh join: the same break time (${fk.time})`);
  // reconnect: the socket drops and comes back (the card stays, with the same time); then a reload
  await pg.evaluate(() => { window.__t.club = 0; window.__ws.close(); });
  const back = await until(() => pg.evaluate(() => window.__t.club), 10000);
  const rk = await txt(pg), bk = await txt(fresh);
  check(back && /On break — back in \d+:\d\d/.test(rk.all) && Math.abs(sec(rk.time) - sec(bk.time)) <= 2, `reconnect (socket dropped): the card shows the break on the new connection (${rk.time})`);
  await pg.evaluate(() => { window.__t.brk = 0; window.__t.club = 0; });
  const r0 = Date.now(); await pg.reload();
  const rlShown = await until(() => pg.evaluate(() => window.__t.brk), 8000), rlT = await pg.evaluate(() => window.__t);
  check(rlShown && rlShown - rlT.club <= 1000, `reconnect by reload: the card ${rlShown - rlT.club} ms after its first update (${rlShown - r0} ms after the reload)`);
  if(BOARD) await pg.tap('#tableArea', { position: { x: 30, y: 30 } }).catch(() => {});

  // ---- the break ends: the music stops the moment play resumes ----
  const buEnd = d.club.tourney.breakUntil, left = buEnd - Date.now();
  if(BOARD) check(await until(() => pg.evaluate(() => document.getElementById('game').dataset.music === 'loop'), 3000), 'after the reload and a tap, the loop plays again');
  await sleep(Math.max(0, left - 400));
  const ended = await until(() => pg.evaluate(() => document.getElementById('brk').hidden && Date.now()), 4000);
  const mEnd = await pg.evaluate(() => document.getElementById('game').dataset.music || '');
  check(!!ended && Math.abs(ended - buEnd) < 1500, 'the card goes when the break ends');
  check(!mEnd, 'the music has stopped as play resumes');
  check(await until(() => pg.evaluate(() => !!document.querySelector('#seats .hole')), 8000), 'play resumes');

  console.log(`t_break_beat_ui (${UI}, ${TAG}): ${oks} ok, ${fails} failed`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
