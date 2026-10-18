// Table extras in the browser (phone size): the Director form offers them only where the server allows them,
// the winner of an uncontested pot gets Show left / Show right / Show both / Muck, a spectator sees exactly the shown
// cards, and rabbit-hunt cards appear faded in the empty board slots after a hand ends on the flop or turn.
// Real timing (no FAST) so the show window is as long as on the live site; players act after 1.5 s.
// Usage: node test/ui/t_extras_ui.js [screenshot dir]
const path = require('path'), net = require('net');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const SHOTS = process.argv[2];
const ROOT = path.join(__dirname, '..', '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, oks = 0;
const check = (ok, msg) => { ok ? oks++ : fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const srvs = []; process.on('exit', () => srvs.forEach(s => { try{ s.kill('SIGKILL'); }catch(e){} }));
async function boot(env){
  const port = await freePort(), base = 'http://127.0.0.1:' + port;
  const e = { ...process.env, PORT: String(port), NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: '/tmp/t_extras_ui_' + port + '.json', DATABASE_URL: '', ...env };
  if(!env.STAGING) delete e.STAGING; delete e.GAMEPLAY_OPTIONS; delete e.FAST;
  srvs.push(spawn('node', ['server/index.js'], { cwd: ROOT, env: e, stdio: 'ignore' }));
  for(let i = 0; i < 100; i++){ try{ if((await fetch(base + '/healthz')).ok) break; }catch(x){} await sleep(100); }
  const post = (p, body, tok) => fetch(base + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body || {}) }).then(r => r.json());
  return { port, base, post };
}
async function signedIn(browser, s, tok, [w, h] = [390, 844]){
  const pg = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await pg.goto(s.base + '/'); await pg.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), tok);
  await pg.reload(); await pg.evaluate(() => document.fonts.ready); await sleep(500);
  return pg;
}
function bot(s, tok, plan){
  const ws = new WebSocket(`ws://127.0.0.1:${s.port}/ws`), c = { ws, send: o => ws.send(JSON.stringify(o)) };
  ws.on('open', () => c.send({ t: 'hello', token: tok, device: 'bot' + Math.random() }));
  ws.on('message', raw => {
    const m = JSON.parse(raw);
    if(m.t === 'club'){ c.club = m.club; c.id = m.club.me.id; }
    if(m.t !== 'table' || !plan) return;
    const tb = m.table;
    if(tb.actUid === c.id && tb.legal && c.last !== tb.tid + tb.seq){ c.last = tb.tid + tb.seq; const a = plan(tb, tb.legal); setTimeout(() => c.send({ t: 'act', tid: tb.tid, hand: tb.handNo, seq: tb.seq, a }), 30); }
  });
  return new Promise(r => { const t = setInterval(() => { if(c.club){ clearInterval(t); r(c); } }, 30); });
}
const optionsOnForm = pg => pg.evaluate(() => ['nShow', 'nRabbit', 'nPause'].map(id => !!document.getElementById(id)));

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  // ---- without GAMEPLAY_OPTIONS (production): the form has no extras ----
  {
    const s = await boot({});
    const own = await s.post('setup', { code: 'secret', name: 'Owner', pin: '1234', agree: true });
    const pg = await signedIn(browser, s, own.token);
    await pg.click('#tabs [data-tab=director]'); await sleep(400);
    check(!!(await pg.$('#newForm')), 'production-like server: Director shows the new-tournament form');
    check((await optionsOnForm(pg)).every(x => !x), 'production-like server: no table-extras fields on the form');
    await pg.close();
  }
  // ---- staging (extras allowed) ----
  const s = await boot({ STAGING: '1', TIME_BANK_MS: '1500' });
  const dir = await s.post('login', { name: 'Test Director', pin: '246810' });
  const P = n => s.post('login', { name: 'Test Player 0' + n, pin: '1357' + String(n).repeat(2) });
  const p1 = await P(1), p2 = await P(2), p3 = await P(3);
  const dpg = await signedIn(browser, s, dir.token);
  await dpg.click('#tabs [data-tab=director]'); await sleep(400);
  check((await optionsOnForm(dpg)).every(Boolean), 'staging: Show or muck, Rabbit hunt and Pause fields on the form');
  check(await dpg.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'staging: form has no sideways scroll at 390px');
  if(SHOTS){ await dpg.locator('#nShow').scrollIntoViewIfNeeded(); await dpg.screenshot({ path: path.join(SHOTS, 'extras-form-390.png') }); }
  await dpg.selectOption('#nShow', 'on'); await dpg.selectOption('#nRabbit', 'on'); await dpg.selectOption('#nPause', '4');
  await dpg.fill('#nName', 'Extras Night'); await dpg.selectOption('#nLate', '0');
  await dpg.click('#newForm button[type=submit]'); await sleep(800);
  // when the browser player is the big blind everyone folds to them (a walk, which they win);
  // otherwise: limp, then the first player on the flop bets and the other folds (rabbit hunt)
  // (3 players: the big blind is the second seat after the button)
  const p1BB = tb => { const occ = tb.seats.map((x, i) => x && x.inHand ? i : -1).filter(i => i >= 0), k = occ.indexOf(tb.btn); return k >= 0 && tb.seats[occ[(k + 2) % occ.length]].name === 'Test Player 01'; };
  const plan = (tb, L) => tb.street === 0
    ? (p1BB(tb) ? (L.canCheck ? { t: 'check' } : { t: 'fold' }) : (L.canCheck ? { t: 'check' } : { t: 'call' }))
    : (L.canCheck ? (L.canRaise ? { t: 'raise', to: L.minTo } : { t: 'check' }) : { t: 'fold' });
  const b2 = await bot(s, p2.token, plan), b3 = await bot(s, p3.token, plan), b1 = await bot(s, p1.token, null);
  const T = b2.club.tourney;
  check(T && T.showMuck === true && T.rabbit === true && T.handPause === 4, 'tournament saved with the extras from the form');
  for(const b of [b1, b2, b3]) b.send({ t: 'join' });
  await sleep(500);
  const ppg = await signedIn(browser, s, p1.token); // the browser player never acts: they time out and sit out, but win walks
  const dws = await bot(s, dir.token, null); dws.send({ t: 'start' });
  await sleep(1500);
  // the Director watches the only table from the lobby
  await dpg.reload(); await sleep(800);
  for(const t of await dpg.$$eval('#tabs [data-tab]', bs => bs.map(b => b.dataset.tab))){
    if(await dpg.$('[data-watch]')) break;
    await dpg.click(`#tabs [data-tab=${t}]`).catch(() => {}); await sleep(300);
  }
  check(!!(await dpg.$('[data-watch]')), 'Director finds the table to watch');
  await dpg.click('[data-watch]');
  await sleep(800);
  let sawRabbit = false, sawOffer = 0, sawSpecShown = { both: false, one: false }, offerChecks = [];
  for(let i = 0; i < 700 && !(sawRabbit && sawSpecShown.both && sawSpecShown.one); i++){
    await sleep(250);
    const r = await dpg.evaluate(() => ({ rabbit: document.querySelectorAll('#board .card.board.rabbit').length, board: document.querySelectorAll('#board .card.board:not(.rabbit)').length,
      fit: [...document.querySelectorAll('#board .card')].every(c => { const b = c.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth; }), sx: document.documentElement.scrollWidth <= innerWidth }));
    if(r.rabbit && !sawRabbit){
      sawRabbit = true;
      check(r.rabbit === 5 - r.board && [3, 4].includes(r.board), `spectator sees ${r.rabbit} rabbit card(s) after a ${r.board}-card board`);
      check(r.fit && r.sx, 'rabbit cards fit the screen, no sideways scroll');
      if(SHOTS) await dpg.screenshot({ path: path.join(SHOTS, 'extras-rabbit-390.png') });
    }
    const btns = await ppg.$$eval('#controls [data-show]', bs => bs.map(b => { const r = b.getBoundingClientRect(); return { t: b.textContent, h: r.height, in: r.left >= 0 && r.right <= innerWidth }; }));
    if(btns.length === 4){
      sawOffer++;
      offerChecks.push(btns.every(b => b.h >= 40 && b.in) && btns.map(b => b.t).join('|') === 'Show left|Show right|Show both|Muck');
      if(SHOTS && sawOffer === 1) await ppg.screenshot({ path: path.join(SHOTS, 'extras-show-390.png') });
      const pick = !sawSpecShown.both ? 'Show both' : 'Show left';
      await ppg.click(`#controls [data-show]:has-text("${pick}")`).catch(() => {});
      // the spectator's view of the browser player's seat
      for(let k = 0; k < 12; k++){
        await sleep(100);
        const n = await dpg.evaluate(uid => { const s = document.querySelector(`.seat[data-uid="${uid}"]`); return s ? s.querySelectorAll('.hole .card.show').length : -1; }, b1.id);
        if(pick === 'Show both' && n === 2){ sawSpecShown.both = true; break; }
        if(pick === 'Show left' && n === 1){ sawSpecShown.one = true; break; }
      }
      if(SHOTS && sawSpecShown.both && !sawSpecShown.one) await dpg.screenshot({ path: path.join(SHOTS, 'extras-spectator-shown-390.png') });
      await sleep(600);
    }
  }
  check(sawRabbit, 'rabbit hunt cards appeared on the spectator\'s table');
  check(sawOffer >= 2 && offerChecks.every(Boolean), `winner got Show left / Show right / Show both / Muck, 44px-ish and on screen (${sawOffer} offers)`);
  check(sawSpecShown.both, 'spectator saw both cards after Show both');
  check(sawSpecShown.one, 'spectator saw exactly one card after Show left');
  await browser.close();
  console.log(`t_extras_ui: ${oks} ok, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
