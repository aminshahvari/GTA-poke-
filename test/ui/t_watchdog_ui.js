// The connection watchdog (2026-10-24: two players' screens froze at a live game on an old table, their own seat
// Disconnected, until they left the page and came back). A phone's socket can stay "open" while nothing goes through
// (half-open): no close ever comes. The app must find that out itself, say so over the table, reconnect on its own and
// be back in the live hand, with the player doing nothing. Run against two servers from this tree, one with UI_BOARD=1
// and one without (BOARD=1 or BOARD=0 runs only one). The browser reaches the server through a TCP relay that can
// stall its open sockets (they stay open and pass nothing either way, no close) and refuse new ones.
//  (W1) a silent stall on the player's turn: the app shows the connection lost, lets the dead socket go, reconnects by
//       itself and shows the live turn (same hand and seq as the server) with no Disconnected seat; a Call then works
//  (W2) a stall, then the network stays down until the hand is over: the Call tapped meanwhile waits; after the
//       network comes back the app reconnects by itself onto the later hand (the server's current state), says
//       "Call wasn't sent — the hand moved on.", and no act for the old hand reaches the server
//  (W3) back to the front (visibilitychange, then 'online') checks at once: a heartbeat leaves within a moment and a
//       stalled socket is found in about the wake wait (2.5 s), not the full one
//  (L)  the server's connection log: in/out/act/gone/summary lines with account ids, never names or addresses
// PLAYWRIGHT=/path/to/playwright-core CHROMIUM=/path/to/chromium node test/ui/t_watchdog_ui.js
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
const until = async (f, ms = 8000, step = 100) => { const t0 = Date.now(); let v; while(!(v = await f()) && Date.now() - t0 < ms) await sleep(step); return v; };

// the relay (the pattern of t_outbox_ui): stall() freezes every socket open now (they stay open, nothing passes either
// way, nothing closes: a half-open connection); new sockets pass, unless down() refuses them. Client→server frames are
// read to count 'act' and 'hb' messages, including those that a stall swallowed.
function relay(target){
  const R = { down: false, pairs: new Set(), msgs: [], closes: [], conns: 0, refused: 0 };
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
      if((b[0] & 0x0f) === 8) R.closes.push({ through, at: Date.now(), code: p.length >= 2 ? p.readUInt16BE(0) : 0 });
      if((b[0] & 0x0f) === 1) try{ const m = JSON.parse(p.toString()); if(m.t === 'act' || m.t === 'hb') R.msgs.push({ ...m, through, at: Date.now() }); }catch(e){}
    }
  };
  const srv = net.createServer(c => {
    if(R.down){ R.refused++; c.destroy(); return; }
    R.conns++;
    const s = net.connect(target, '127.0.0.1'), st = { buf: Buffer.alloc(0) }, pair = { c, s, stalled: false };
    R.pairs.add(pair);
    c.on('data', d => { if(!st.off) parse(st, d, !pair.stalled); if(!pair.stalled) s.write(d); });
    s.on('data', d => { if(!pair.stalled) c.write(d); });
    let done = false;
    const end = () => { if(done) return; done = true; c.destroy(); s.destroy(); R.pairs.delete(pair); };
    c.on('error', end); s.on('error', end); c.on('close', end); s.on('close', end);
  });
  R.listen = () => new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));
  R.stall = () => { for(const p of R.pairs) p.stalled = true; };
  R.close = () => { srv.close(); for(const p of R.pairs){ p.c.destroy(); p.s.destroy(); } };
  return R;
}

async function server(board){
  const port = await freePort(), DATA = path.join(os.tmpdir(), `t_watchdog_${board ? 'on' : 'off'}_${process.pid}.json`); datas.push(DATA);
  fs.writeFileSync(DATA, '{}');
  const env = { ...process.env, PORT: String(port), NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, DATABASE_URL: '', STAGING: '1', FAST: '1', TIME_BANK_MS: '20000', DC_PROTECT_MS: '2000', CONN_SUMMARY_MS: '3000' };
  delete env.UI_BOARD; delete env.UI_QUIET; delete env.GAMEPLAY_OPTIONS; delete env.CLUB_SWITCHING; delete env.CONN_LOG; if(board) env.UI_BOARD = '1';
  const p = spawn('node', ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'inherit'] }); srvs.push(p);
  const log = []; let rest = '';
  p.stdout.on('data', d => { const parts = (rest + d).split('\n'); rest = parts.pop(); log.push(...parts); });
  const base = 'http://127.0.0.1:' + port;
  for(let i = 0; i < 100; i++){ try{ if((await fetch(base + '/healthz')).ok) break; }catch(e){} await sleep(100); }
  const post = (q, body) => fetch(base + '/api/' + q, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) }).then(r => r.json());
  return { port, base, post, log, proc: p };
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
  d.send({ t: 'create', name: 'Watchdog Night', stack: 100000, levelMin: 20, lateLevels: 0 }); await sleep(500);
  const v = await bot(S.port, p2.token);
  [d, v].forEach(b => b.send({ t: 'join' }));
  const j = await bot(S.port, p1.token); j.send({ t: 'join' }); await sleep(400); j.ws.close();
  const meId = j.id;

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => r.abort());
  const pg = await ctx.newPage(), errors = [];
  pg.on('pageerror', e => errors.push(String(e)));
  pg.on('console', m => { if(m.type() === 'error' && !/WebSocket|ERR_|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  // every toast the page shows, and every time the connection-lost state comes or goes, kept (both can be brief: a
  // stalled socket whose network still works is replaced within milliseconds)
  await ctx.addInitScript(() => {
    window.__toasts = []; window.__lost = []; let was = false;
    new MutationObserver(ms => {
      ms.forEach(m => m.addedNodes.forEach(n => { if(n.classList && n.classList.contains('toast')) window.__toasts.push({ text: n.textContent, at: Date.now() }); }));
      const g = document.getElementById('game'), el = document.getElementById('connLost');
      const on = !!g && g.classList.contains('conn-lost') && !!el && !el.hidden && /Connection lost/.test(el.textContent) && getComputedStyle(el).display !== 'none';
      if(on !== was){ was = on; window.__lost.push({ on, at: Date.now(), offline: !document.getElementById('offline').hidden }); }
    }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
  });
  const base = 'http://127.0.0.1:' + P;
  await pg.goto(base + '/'); await pg.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), p1.token);
  await pg.reload(); await sleep(600);
  check(await pg.evaluate(() => document.documentElement.dataset.ui || '') === (board ? 'board' : ''), TAG + 'the page runs the ' + (board ? 'board' : 'classic') + ' design');
  d.send({ t: 'start' });

  const ui = async () => ({ ...await pg.evaluate(() => {
    const c = document.getElementById('controls'), off = document.getElementById('offline'), lost = document.getElementById('connLost');
    const vis = e => !!e && !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length) && getComputedStyle(e).visibility !== 'hidden';
    const btn = id => { const b = document.getElementById(id); return !!b && vis(b) && !b.disabled; };
    const line = [...c.querySelectorAll('.info-line')].filter(vis).map(e => e.textContent).join(' | ');
    return { state: document.getElementById('tableArea').dataset.state || '', turn: c.dataset.turn || '', line, call: btn('aCall'), fold: btn('aFold'),
      offline: !off.hidden, lost: vis(lost) && /Connection lost/.test(lost.textContent), dimmed: document.getElementById('game').classList.contains('conn-lost'),
      dcSeat: /Disconnected/.test(document.getElementById('seats').textContent), toasts: window.__toasts.map(t => t.text), callWord: (document.getElementById('aCall') || {}).textContent || '', modal: (document.getElementById('modalRoot') || {}).textContent || '' };
  }), ...srvTurn() });
  const srvTurn = () => { const t = d.last; return t ? { key: t.tid + ':' + t.handNo + ':' + t.seq, hand: t.handNo, seq: t.seq, tid: t.tid, mine: t.actUid === meId && !!t.legal } : {}; };
  const myTurn = () => until(async () => { const x = await ui(); return x.call && x.mine && x.state === x.key && x.turn === x.key ? x : null; }, 40000);
  const actsFor = u => R.msgs.filter(a => a.t === 'act' && a.tid === u.tid && a.hand === u.hand && a.seq === u.seq);
  const lostSince = t0 => until(async () => (await pg.evaluate(() => window.__lost)).find(e => e.on && e.at >= t0), 12000, 50);
  const backLive = () => until(async () => { const x = await ui(); return !x.offline && !x.lost && !x.dimmed && x.state && x.state === x.key ? x : null; }, 15000);

  // (W1) a silent stall on the player's turn
  let u = await myTurn();
  check(!!u, TAG + 'W1: the player has a turn');
  if(u){
    const conns = R.conns, t0 = Date.now(); R.stall();
    const lost = await lostSince(t0), tLost = lost ? lost.at - t0 : -1;
    check(!!lost, TAG + `W1: the app finds the silent connection dead by itself and shows "Connection lost" over the table (${tLost} ms)`);
    check(!!lost && tLost <= 9000, TAG + 'W1: within the heartbeat time (3 s idle + 4 s wait, plus a tick): ' + tLost + ' ms');
    check(!!lost && lost.offline, TAG + 'W1: the reconnecting pill shows with it');
    check(R.closes.some(c => !c.through && c.at >= t0), TAG + 'W1: the app closed the dead socket itself (no close ever came from the network)');
    const back = await backLive();
    check(!!back, TAG + `W1: with no tap, the app reconnects by itself and the lost state leaves (${Date.now() - t0} ms after the stall)`);
    check(R.conns > conns, TAG + 'W1: a new connection was made');
    const x = await until(async () => { const y = await ui(); return y.turn === y.key && y.call && !y.dcSeat ? y : null; }, 5000);
    check(!!x && x.key === u.key, TAG + `W1: back in the live hand, on the same turn as the server: ${x && x.state} / ${u.key}`);
    check(!!x && !x.dcSeat, TAG + 'W1: no seat shows Disconnected once back');
    if(x){
      await pg.click('#aCall');
      check(!!await until(() => actsFor(u).some(a => a.through), 4000), TAG + 'W1: a Call after the recovery reaches the server');
      check(!!await until(() => d.last && d.last.tid + ':' + d.last.handNo + ':' + d.last.seq !== u.key, 5000), TAG + 'W1: and the server moves on');
      check(actsFor(u).filter(a => a.through).length === 1, TAG + 'W1: exactly one act for that turn reached the server');
    }
  }

  // (W2) the stall, then no network until the hand is over: reconnects by itself onto the later hand
  u = await myTurn();
  check(!!u, TAG + 'W2: another turn');
  if(u){
    R.stall(); R.down = true;
    let x = await until(async () => { const y = await ui(); return y.lost && y.dimmed && y.offline ? y : null; }, 12000);
    check(!!x, TAG + 'W2: the lost state shows over the table, with the reconnecting pill');
    check(!!x && x.call, TAG + 'W2: the action buttons stay usable under it');
    const word = /check/i.test(u.callWord) ? 'Check' : 'Call';
    await pg.click('#aCall'); await sleep(250);
    x = await ui();
    check(new RegExp(word + " will be sent when you're back").test(x.line), TAG + `W2: the ${word} tapped meanwhile waits: ` + x.line);
    check(!!await until(() => d.states.some(st => st.tid === u.tid && st.handNo > u.hand), 45000), TAG + 'W2: the hand went on without the player');
    const toastsBefore = x.toasts.length, t0 = Date.now(); R.down = false;
    const back = await backLive();
    check(!!back, TAG + `W2: with no tap, the app reconnects by itself once the network is back (${Date.now() - t0} ms)`);
    // (the bots play on fast: the page and the server's latest state are read a moment apart, so look until they meet)
    x = await until(async () => { const y = await ui(); return y.state === y.key ? y : null; }, 3000) || await ui();
    const shown = x.state.split(':');
    check(x.state === x.key && +shown[1] > u.hand, TAG + `W2: it shows the server's current state, a later hand: ${x.state} (was ${u.key})`);
    const notes = x.toasts.slice(toastsBefore);
    check(notes.includes(word + " wasn't sent — the hand moved on."), TAG + `W2: the notice says the ${word} was not sent: ` + JSON.stringify(notes));
    await sleep(800);
    check(actsFor(u).filter(a => a.through).length === 0, TAG + 'W2: no act for the old turn reached the server');
    check(!/will be sent|sending/i.test((await ui()).line), TAG + 'W2: nothing waits any more');
    check(!/didn't work/i.test(x.modal), TAG + 'W2: no error shown');
  }

  // (W3) coming back to the front checks at once
  for(const how of ['visibilitychange', 'online']){
    await until(async () => { const x = await ui(); return !x.offline && !x.lost; }, 10000);
    await sleep(300);
    const t0 = Date.now(); R.stall();
    await pg.evaluate(h => h === 'online' ? window.dispatchEvent(new Event('online')) : document.dispatchEvent(new Event('visibilitychange')), how);
    const hb = await until(() => R.msgs.some(m => m.t === 'hb' && m.at >= t0), 1500, 25);
    check(!!hb, TAG + `W3 (${how}): a heartbeat leaves at once (${hb ? R.msgs.find(m => m.t === 'hb' && m.at >= t0).at - t0 : '-'} ms)`);
    const lost = await lostSince(t0), tl = lost ? lost.at - t0 : -1;
    check(!!lost && tl <= 4500, TAG + `W3 (${how}): the dead socket is found in the wake wait, not the full one: ${tl} ms`);
    check(!!await backLive(), TAG + `W3 (${how}): and the app is back by itself`);
  }
  check(errors.length === 0, TAG + 'no page errors: ' + errors.join(' / '));

  // (L) the server's connection log
  await sleep(3500);
  const lg = S.log;
  const has = re => lg.some(l => re.test(l));
  check(has(new RegExp(`^ws in s=\\d+ uid=${meId} club=\\S+ tid=\\S+ hand=\\d+ seq=\\d+$`)), TAG + 'L: a "ws in" line for the player, with table, hand and seq');
  check(has(new RegExp(`^ws out s=\\d+ uid=${meId} club=\\S+ code=\\d+ dur_s=\\d+ quiet_ms=\\d+$`)), TAG + 'L: a "ws out" line with its code and how long it lasted');
  check(has(new RegExp(`^act s=\\d+ uid=${meId} club=\\S+ tid=\\S+ hand=\\d+ seq=\\d+ a=(call|check) res=applied ms=[\\d.]+$`)), TAG + 'L: an "act" line with its result');
  check(has(new RegExp(`^ws gone s=\\d+ uid=${meId} club=\\S+ quiet_ms=\\d+ tid=`)), TAG + 'L: a "ws gone" line when the seat went Disconnected');
  check(has(/^ws min open=\d+ in=\d+ out=\d+ gone=\d+ kill=\d+ acts=\d+ applied=\d+ stale=\d+ rejected=\d+ handle_ms_p50=(\d+|-) p95=(\d+|-) hb_rtt_ms_p50=(\d+|-) p95=(\d+|-) act_rtt_ms_p50=(\d+|-) p95=(\d+|-)$/) && has(/^ws min .* handle_ms_p50=\d+ p95=\d+ /), TAG + 'L: a summary line a minute (here every 3 s), with the act handling times');
  check(!lg.some(l => /^(ws|act) /.test(l) && /Test (Player|Director)|127\.0\.0\.1|token/i.test(l)), TAG + 'L: no names, addresses or tokens in the connection log');
  console.log(TAG + 'log sample:\n  ' + lg.filter(l => /^(ws|act) /.test(l)).slice(-8).join('\n  '));
  await ctx.close(); R.close();
  [d, v].forEach(b => { try{ b.ws.close(); }catch(e){} });
}

let browser;
(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const modes = process.env.BOARD === '1' ? [true] : process.env.BOARD === '0' ? [false] : [false, true];
  for(const b of modes) await run(b);
  await browser.close();
  console.log(`t_watchdog_ui: ${oks} ok, ${fails.length} failed`);
  cleanup();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); cleanup(); process.exit(1); });
