// Actions tapped while the connection is down (Issue #34): they are never dropped silently and never shown as
// "sending…" before they leave the phone. Run against two servers from this tree, one with UI_BOARD=1 and one without
// (BOARD=1 or BOARD=0 runs only one). The browser reaches the server through a small TCP relay the test can cut, so the
// socket really drops (and reconnects fail) as on a bad Wi-Fi; the relay also counts the 'act' messages that reach the
// server. Two bots at the table check or call.
//  (A) the socket is killed on the player's turn, they tap Fold, the socket comes back: exactly one fold reaches the
//      server, nothing before the reconnect, and the seat is folded on the server
//  (B) the hand goes on without them before the reconnect: the queued action is dropped, nothing is sent, no error,
//      and the controls show the new state
//  (C) taps during the reconnect backoff (a retry has already failed): Call, then Fold replaces it; one fold reaches the
//      server after the reconnect
//  (D) an action sent into a connection that is already dead (nothing gets through), then the socket closes: it waits
//      again, and goes out once after the reconnect
// PLAYWRIGHT=/path/to/playwright-core CHROMIUM=/path/to/chromium node test/ui/t_outbox_ui.js
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), net = require('net');
const { chromium } = require(process.env.PLAYWRIGHT || process.env.PLAYWRIGHT_CORE || 'playwright');
const ROOT = process.env.ROOT || path.join(__dirname, '..', '..');
const WebSocket = require(require.resolve('ws', { paths: [ROOT] }));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fails = [];
let oks = 0;
const check = (cond, msg) => { if(cond) oks++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if(!cond) fails.push(msg); };
const srvs = [], datas = [];
const cleanup = () => { srvs.forEach(s => { try{ s.kill('SIGKILL'); }catch(e){} }); datas.forEach(d => fs.rmSync(d, { force: true })); };
process.on('exit', cleanup);
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const until = async (f, ms = 8000) => { const t0 = Date.now(); let v; while(!(v = await f()) && Date.now() - t0 < ms) await sleep(100); return v; };

// the relay: mode 'up' passes everything, 'dead' keeps the sockets open but passes nothing (a half-open connection),
// cut() closes every socket and, while down, refuses new ones at once
function relay(target){
  const R = { mode: 'up', socks: new Set(), acts: [], refused: 0 };
  // client→server WebSocket frames (masked, not compressed: the server has no permessage-deflate): count 'act' messages
  const parse = (st, buf, through) => {
    st.buf = Buffer.concat([st.buf, buf]);
    if(!st.ws){ const i = st.buf.indexOf('\r\n\r\n'); if(i < 0) return; if(!/^GET \/ws/.test(st.buf.slice(0, 8).toString())){ st.off = true; return; } st.ws = true; st.buf = st.buf.slice(i + 4); }
    for(;;){
      const b = st.buf; if(b.length < 2) return;
      let len = b[1] & 0x7f, off = 2;
      if(len === 126){ if(b.length < 4) return; len = b.readUInt16BE(2); off = 4; } else if(len === 127){ if(b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
      const masked = b[1] & 0x80, mk = masked ? b.slice(off, off + 4) : null; if(masked) off += 4;
      if(b.length < off + len) return;
      const p = Buffer.from(b.slice(off, off + len)); if(mk) for(let i = 0; i < p.length; i++) p[i] ^= mk[i & 3];
      st.buf = b.slice(off + len);
      if((b[0] & 0x0f) === 1) try{ const m = JSON.parse(p.toString()); if(m.t === 'act') R.acts.push({ ...m, through, at: Date.now() }); }catch(e){}
    }
  };
  const srv = net.createServer(c => {
    if(R.mode === 'down'){ R.refused++; c.destroy(); return; }
    const s = net.connect(target, '127.0.0.1'), st = { buf: Buffer.alloc(0) };
    R.socks.add(c); R.socks.add(s);
    c.on('data', d => { if(!st.off) parse(st, d, R.mode === 'up'); if(R.mode === 'up') s.write(d); });
    s.on('data', d => { if(R.mode === 'up') c.write(d); });
    const end = () => { c.destroy(); s.destroy(); R.socks.delete(c); R.socks.delete(s); };
    c.on('error', end); s.on('error', end); c.on('close', end); s.on('close', end);
  });
  R.listen = () => new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));
  R.cut = () => { R.mode = 'down'; for(const x of R.socks) x.destroy(); R.socks.clear(); };
  R.dead = () => { R.mode = 'dead'; };
  R.restore = () => { R.mode = 'up'; };
  R.close = () => srv.close();
  return R;
}

async function server(board){
  const port = await freePort(), DATA = path.join(os.tmpdir(), `t_outbox_${board ? 'on' : 'off'}_${process.pid}.json`); datas.push(DATA);
  fs.writeFileSync(DATA, '{}');
  const env = { ...process.env, PORT: String(port), NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, DATABASE_URL: '', STAGING: '1', FAST: '1', TIME_BANK_MS: '10000', DC_PROTECT_MS: '2000' };
  delete env.UI_BOARD; delete env.UI_QUIET; delete env.GAMEPLAY_OPTIONS; delete env.CLUB_SWITCHING; if(board) env.UI_BOARD = '1';
  srvs.push(spawn('node', ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'ignore', 'inherit'] }));
  const base = 'http://127.0.0.1:' + port;
  for(let i = 0; i < 100; i++){ try{ if((await fetch(base + '/healthz')).ok) break; }catch(e){} await sleep(100); }
  const post = (p, body) => fetch(base + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) }).then(r => r.json());
  return { port, base, post };
}
// a bot that checks or calls on its turn, and keeps every table state it sees
function bot(port, tok){
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`), c = { ws, states: [], send: o => ws.readyState === 1 && ws.send(JSON.stringify(o)) };
  ws.on('open', () => c.send({ t: 'hello', token: tok, device: 'bot' + Math.random() }));
  ws.on('error', () => {});
  ws.on('message', raw => {
    const m = JSON.parse(raw);
    if(m.t === 'club'){ c.club = m.club; c.id = m.club.me.id; }
    if(m.t !== 'table') return;
    const tb = m.table; c.states.push(tb); c.last = tb;
    if(tb.actUid === c.id && tb.legal && c.done !== tb.tid + tb.seq){
      c.done = tb.tid + tb.seq; const L = tb.legal;
      setTimeout(() => c.send({ t: 'act', tid: tb.tid, hand: tb.handNo, seq: tb.seq, a: L.canCheck ? { t: 'check' } : { t: 'call' } }), 30);
    }
  });
  return new Promise(r => { const t = setInterval(() => { if(c.club){ clearInterval(t); r(c); } }, 30); });
}

async function run(board){
  const TAG = board ? '[board on] ' : '[board off] ';
  const S = await server(board), R = relay(S.port), P = await R.listen();
  const dir = await S.post('login', { name: 'Test Director', pin: '246810' });
  const L = n => S.post('login', { name: 'Test Player 0' + n, pin: '1357' + String(n).repeat(2) });
  const p1 = await L(1), p2 = await L(2);
  const d = await bot(S.port, dir.token);
  d.send({ t: 'create', name: 'Outbox Night', stack: 100000, levelMin: 20, lateLevels: 0 }); await sleep(500);
  const v = await bot(S.port, p2.token);
  [d, v].forEach(b => b.send({ t: 'join' }));
  // the player in the browser joins from a socket of their own first (then the browser opens on the table)
  const j = await bot(S.port, p1.token); j.send({ t: 'join' }); await sleep(400); j.ws.close();
  const meId = j.id;

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => r.abort());
  const pg = await ctx.newPage(), errors = [];
  pg.on('pageerror', e => errors.push(String(e)));
  pg.on('console', m => { if(m.type() === 'error' && !/WebSocket|ERR_|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const base = 'http://127.0.0.1:' + P;
  await pg.goto(base + '/'); await pg.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), p1.token);
  await pg.reload(); await sleep(600);
  check(await pg.evaluate(() => document.documentElement.dataset.ui || '') === (board ? 'board' : ''), TAG + 'the page runs the ' + (board ? 'board' : 'classic') + ' design');
  d.send({ t: 'start' });

  // what the app shows (the app keeps its state private: the page's DOM only), and the table as the server has it
  const ui = async () => ({ ...await pg.evaluate(() => {
    const c = document.getElementById('controls'), off = document.getElementById('offline');
    const vis = e => !!e && !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length) && getComputedStyle(e).visibility !== 'hidden';
    const line = [...c.querySelectorAll('.info-line')].filter(vis).map(e => e.textContent).join(' | ');
    const btn = id => { const b = document.getElementById(id); return !!b && vis(b) && !b.disabled; };
    return { text: c.textContent, line, fold: btn('aFold'), call: btn('aCall'), offline: !off.hidden, pill: off.textContent,
      modal: (document.getElementById('modalRoot') || {}).textContent || '' };
  }), ...srvTurn() });
  const srvTurn = () => { const t = d.last; return t ? { key: t.tid + ':' + t.handNo + ':' + t.seq, hand: t.handNo, seq: t.seq, tid: t.tid, mine: t.actUid === meId && !!t.legal } : {}; };
  // wait for a turn of the browser's player that has a Fold button (checking through the others, in the app)
  const foldTurn = async () => {
    for(let i = 0; i < 40; i++){
      const u = await until(async () => { const x = await ui(); return x.call && x.mine ? x : null; }, 30000);
      if(!u) return null;
      if(u.fold) return u;
      await pg.click('#aCall'); await until(async () => !(await ui()).call || (await ui()).key !== u.key, 5000);
    }
    return null;
  };
  const backOnline = () => until(async () => { const x = await ui(); return !x.offline; }, 20000);
  const actsFor = u => R.acts.filter(a => a.tid === u.tid && a.hand === u.hand && a.seq === u.seq);
  const seatOn = (st, uid) => st.seats.find(p => p && p.uid === uid);
  const foldedOnServer = u => until(() => d.states.some(st => st.tid === u.tid && st.handNo === u.hand && (seatOn(st, meId) || {}).folded), 6000);
  const mineAfter = (u, at) => R.acts.filter(a => a.through && a.at > at && !(a.tid === u.tid && a.hand === u.hand && a.seq === u.seq));

  // (A) killed on the turn → Fold → restored: exactly one fold reaches the server
  let u = await foldTurn();
  check(!!u, TAG + 'A: the player has a turn with Fold');
  if(u){
    R.cut();
    check(!!await until(async () => (await ui()).offline, 4000), TAG + 'A: the app sees the connection drop');
    await pg.click('#aFold'); await sleep(300);
    let x = await ui();
    check(!/sending/i.test(x.text), TAG + 'A: the controls never say "sending…" while offline: ' + x.text.slice(0, 80));
    check(/Fold will be sent when you're back/.test(x.line), TAG + 'A: the controls say the fold waits: ' + x.line);
    check(/Fold will be sent when you're back/.test(x.pill), TAG + 'A: so does the reconnecting pill: ' + x.pill);
    check(x.fold && x.call, TAG + 'A: the buttons stay live while the fold waits');
    check(actsFor(u).length === 0, TAG + 'A: nothing reached the server before the reconnect');
    const t0 = Date.now(); R.restore();
    check(!!await backOnline(), TAG + 'A: the app reconnects');
    await foldedOnServer(u); await sleep(800);
    const got = actsFor(u).filter(a => a.through);
    check(got.length === 1 && got[0].a.t === 'fold', TAG + 'A: exactly one fold reached the server: ' + JSON.stringify(got.map(a => a.a)));
    check(d.states.some(st => st.tid === u.tid && st.handNo === u.hand && (seatOn(st, meId) || {}).folded), TAG + 'A: the server has the seat folded in that hand');
    check(mineAfter(u, t0).every(a => a.hand !== u.hand), TAG + 'A: no other action of this player in that hand');
    x = await ui(); check(!/will be sent|sending/.test(x.text) && !x.offline, TAG + 'A: the note and the pill are gone once the server moved on: ' + x.text.slice(0, 60));
  }

  // (C) taps during the reconnect backoff: Call, then Fold replaces it
  u = await foldTurn();
  check(!!u, TAG + 'C: another turn with Fold');
  if(u){
    R.cut();
    check(!!await until(async () => { const x = await ui(); return x.offline && R.refused >= 1; }, 6000), TAG + 'C: offline, and a reconnect has already failed (in the backoff)');
    await pg.click('#aCall'); await sleep(200);
    let x = await ui();
    check(/Call will be sent when you're back/.test(x.line) && !/sending/i.test(x.text), TAG + 'C: Call waits, not "sending…": ' + x.line);
    await pg.click('#aFold'); await sleep(200);
    x = await ui();
    check(/Fold will be sent when you're back/.test(x.line) && /Fold will be sent/.test(x.pill), TAG + 'C: a newer tap (Fold) replaces it: ' + x.line);
    check(!/Call will be sent/.test(x.text + x.pill), TAG + 'C: the Call is no longer queued');
    await sleep(1200);
    check(actsFor(u).length === 0, TAG + 'C: nothing reached the server while down');
    R.restore();
    check(!!await backOnline(), TAG + 'C: the app reconnects');
    await foldedOnServer(u); await sleep(800);
    const got = actsFor(u).filter(a => a.through);
    check(got.length === 1 && got[0].a.t === 'fold', TAG + 'C: exactly one action reached the server, the fold: ' + JSON.stringify(got.map(a => a.a)));
  }

  // (D) sent into a dead connection, then it closes: it waits again and goes out once
  u = await foldTurn();
  check(!!u, TAG + 'D: another turn with Fold');
  if(u){
    R.dead();
    await pg.click('#aFold'); await sleep(250);
    let x = await ui();
    check(/Fold · sending/.test(x.text), TAG + 'D: the fold left the phone, so "sending…" is true: ' + x.text.slice(0, 60));
    check(actsFor(u).filter(a => a.through).length === 0, TAG + 'D: but it did not get through');
    R.cut();
    check(!!await until(async () => (await ui()).offline, 4000), TAG + 'D: the connection drops');
    x = await ui();
    check(/Fold will be sent when you're back/.test(x.line) && !/sending/i.test(x.text), TAG + 'D: the fold waits again: ' + x.line);
    R.restore();
    check(!!await backOnline(), TAG + 'D: the app reconnects');
    await foldedOnServer(u); await sleep(800);
    const got = actsFor(u).filter(a => a.through);
    check(got.length === 1 && got[0].a.t === 'fold', TAG + 'D: exactly one fold reached the server: ' + JSON.stringify(got.map(a => a.a)));
  }

  // (B) the hand goes on before the reconnect: the queued fold is dropped, no error, the controls show the new state
  u = await foldTurn();
  check(!!u, TAG + 'B: another turn with Fold');
  if(u){
    R.cut();
    await until(async () => (await ui()).offline, 4000);
    await pg.click('#aFold'); await sleep(200);
    check(/Fold will be sent/.test((await ui()).line), TAG + 'B: the fold waits');
    // the server's clock runs out (10s + 2s disconnect protection) and the hand goes on without the player
    check(!!await until(() => d.states.some(st => st.tid === u.tid && st.handNo > u.hand), 30000), TAG + 'B: the hand ended while the player was away');
    const t0 = Date.now(); R.restore();
    check(!!await backOnline(), TAG + 'B: the app reconnects');
    await sleep(1500);
    const x = await ui();
    check(actsFor(u).filter(a => a.through).length === 0, TAG + 'B: the stale fold was never sent');
    check(!x.offline, TAG + 'B: the reconnecting pill (which held the fold) is gone');
    check(!/will be sent|sending/i.test(x.text) && x.key !== u.key, TAG + 'B: the controls show the new state: ' + x.text.slice(0, 80));
    check(!/didn't work/i.test(x.modal), TAG + 'B: no error shown');
    check(mineAfter(u, t0).every(a => a.hand > u.hand), TAG + 'B: nothing sent for the old hand after the reconnect');
  }
  check(errors.length === 0, TAG + 'no page errors: ' + errors.join(' / '));
  await ctx.close(); R.close();
  [d, v].forEach(b => { try{ b.ws.close(); }catch(e){} });
}

let browser;
(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const modes = process.env.BOARD === '1' ? [true] : process.env.BOARD === '0' ? [false] : [false, true];
  for(const b of modes) await run(b);
  await browser.close();
  console.log(`t_outbox_ui: ${oks} ok, ${fails.length} failed`);
  cleanup();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); cleanup(); process.exit(1); });
