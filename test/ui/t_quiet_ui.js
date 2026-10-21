// The quiet-luxury design at a live table (owner GO for preview/development only, 2026-10-21), with UI_QUIET=1:
// a real 9-player tournament, seen by a seated player at 390x844, 320x568, 844x390 and 1280x800 and by a member who
// watches. It checks that the design is on (marker, type), that the table still plays (the action buttons are on
// screen, big enough, readable, and a tap on Fold folds), the name plates' sizes (Issue #21), no sideways scroll,
// and the watcher gets the table with no action buttons. Screenshots go to the directory given.
// Usage: PLAYWRIGHT=/path/to/playwright-core CHROMIUM=/path/to/chromium [FONTS_DIR=..] node test/ui/t_quiet_ui.js [shotDir]
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require(require.resolve('ws', { paths: [path.join(__dirname, '..', '..')] }));
const { chromium } = require(process.env.PLAYWRIGHT || process.env.PLAYWRIGHT_CORE || 'playwright-core');
const SHOTS = process.argv[2];
if(SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const ROOT = path.join(__dirname, '..', '..');
const PORT = 7100 + Math.floor(Math.random() * 200), BASE = 'http://127.0.0.1:' + PORT, DATA = path.join(require('os').tmpdir(), 't_quiet_ui_' + PORT + '_' + process.pid + '.json');
try{ fs.unlinkSync(DATA); }catch(e){}
const srv = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, UI_QUIET: '1', PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '1', STAGING: '', DATABASE_URL: '', TIME_BANK_MS: '20000', DC_GONE_MS: '600', LEVEL_MS: '600000', BREAKS: '0' }, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, oks = 0;
const check = (ok, msg) => { ok ? oks++ : fails++; console.log((ok ? 'ok   ' : 'FAIL ') + msg); };
const api = (p, body, tok) => fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body || {}) }).then(r => r.json());
let browser;
async function page(tok, [w, h]){
  const c = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 800, hasTouch: w < 800, deviceScaleFactor: 2 });
  await c.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => { const u = r.request().url(), dir = process.env.FONTS_DIR;
    if(!dir) return r.abort();
    if(u.includes('fonts.googleapis.com/css2')) return r.fulfill({ status: 200, contentType: 'text/css', body: fs.readFileSync(path.join(dir, 'fonts.css')) });
    const f = path.join(dir, u.slice('https://fonts.gstatic.com/'.length).replace(/\//g, '_'));
    return fs.existsSync(f) ? r.fulfill({ status: 200, contentType: 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) }) : r.abort(); });
  const pg = await c.newPage();
  await pg.goto(BASE + '/');
  await pg.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), tok);
  await pg.reload(); await pg.evaluate(() => document.fonts.ready); await sleep(800);
  return pg;
}
// a player at the table who checks or calls whenever it is their turn, so hands move at a human pace
function bot(tok){
  return new Promise(res => { const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws'); let me = null, watching = null;
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: tok })));
    ws.on('message', m => { m = JSON.parse(m);
      if(m.t === 'club'){ me = m.club.me.id; if(m.club.myTable && m.club.myTable !== watching){ watching = m.club.myTable; ws.send(JSON.stringify({ t: 'watch', tid: watching })); } if(!ws.ready){ ws.ready = true; res(ws); } }
      if(m.t === 'table' && m.table.actUid === me && m.table.legal){ const t = m.table, k = t.tid + ':' + t.handNo + ':' + t.seq; if(ws.last === k) return; ws.last = k;
        setTimeout(() => ws.send(JSON.stringify({ t: 'act', tid: t.tid, hand: t.handNo, seq: t.seq, a: { t: t.legal.canCheck ? 'check' : 'call' } })), 250); } }); });
}
function sock(tok){
  return new Promise(res => { const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws'); ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: tok }))); ws.on('message', m => { if(JSON.parse(m).t === 'club' && !ws.ready){ ws.ready = true; res(ws); } }); });
}
const shot = (pg, name) => SHOTS ? pg.screenshot({ path: path.join(SHOTS, name) }) : null;
// contrast ratio of an element's text against its own background colour (WCAG)
const contrastOf = (pg, sel) => pg.evaluate(sel => {
  const lum = c => { const v = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(x => { x /= 255; return x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; }); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; };
  // a see-through button is measured over the dock behind it (#05080f)
  const over = c => { const v = c.match(/[\d.]+/g).map(Number), al = v.length > 3 ? v[3] : 1, bg = [5, 8, 15]; return `rgb(${v.slice(0, 3).map((x, i) => x * al + bg[i] * (1 - al)).join(',')})`; };
  const e = document.querySelector(sel); if(!e) return 0; const s = getComputedStyle(e), b = getComputedStyle(e.closest('.act-btn') || e);
  const a = lum(s.color), z = lum(over(b.backgroundColor)); return (Math.max(a, z) + .05) / (Math.min(a, z) + .05);
}, sel);
(async () => {
  for(let i = 0; i < 50; i++){ try{ if((await fetch(BASE + '/healthz')).ok) break; }catch(e){} await sleep(200); }
  const O = (await api('setup', { code: 'secret', name: 'Test Director', pin: '1234', agree: true })).token;
  const mk = async name => (await api('redeem', { code: (await api('invite', {}, O)).code, name, pin: '1357', agree: true })).token;
  const names = ['Test Alexandra', 'Test Ben', 'Test Christina', 'Test Dev', 'Test Evangeline', 'Test Fitzgerald', 'Test Gwen', 'Test Maximilian', 'Test Sam'];
  const toks = []; for(const n of names) toks.push(await mk(n));
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const so = await sock(O);
  so.send(JSON.stringify({ t: 'create', name: 'Quiet Night', stack: 10000, levelMin: 60, tableSize: 9, lateLevels: 0 })); await sleep(400);
  const socks = []; for(const t of toks){ const s = await bot(t); s.send(JSON.stringify({ t: 'join' })); socks.push(s); }
  await sleep(500); so.send(JSON.stringify({ t: 'start' })); await sleep(1500);
  socks[0].close();                                    // the first player is the one in the browser
  for(const sz of [[390, 844], [320, 568], [844, 390], [1280, 800]]){
    const pg = await page(toks[0], sz), tag = sz.join('x');
    await sleep(1200);
    check(await pg.evaluate(() => document.documentElement.dataset.ui === 'quiet' && /Inter|apple-system/.test(getComputedStyle(document.body).fontFamily)), `${tag}: the quiet design is on`);
    check(await pg.locator('#game').isVisible() && await pg.locator('#seats .seat').count() === 9, `${tag}: the table shows with 9 seats`);
    // plate type: top and bottom seats larger than today; side seats keep today's sizes (9-10px at 320 wide) and geometry,
    // which Issue #21 changes on its own branch
    const sizes = await pg.evaluate(() => [...document.querySelectorAll('#seats .seat')].map(s => [s.dataset.side ? 'side' : 'top', parseFloat(getComputedStyle(s.querySelector('.nm')).fontSize), parseFloat(getComputedStyle(s.querySelector('.st')).fontSize)]));
    check(sizes.every(([, nm, st]) => nm >= 9 && st >= 10), `${tag}: plate type (side/top name/stack px): ${sizes.map(x => x.join(' ')).join(', ')}`);
    check(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${tag}: no sideways scroll`);
    // the whole tournament in one line: players left of the field and my rank; the chip leader is in the sheet (Issue #31)
    const ql = pg.locator('#qline'); let qt = '';
    for(let i = 0; i < 20 && !/\/9/.test(qt); i++){ qt = (await ql.textContent().catch(() => '')).replace(/\s+/g, ' '); if(!/\/9/.test(qt)) await sleep(250); }
    // (short screens and phones held sideways, the one-row header: the line is the header's first cell, "9/9 · 1st of 9",
    // where the level box was, and the level is written under or beside the clock; its tap area reaches 44px with ::after)
    const row1 = await pg.evaluate(() => document.getElementById('game').classList.contains('row1'));
    check(await ql.isVisible() && /9\s*\/9/.test(qt) && (row1 ? /\d+(st|nd|rd|th)\s*of 9/ : /Your rank\s*\d+(st|nd|rd|th)\s*of 9/).test(qt), `${tag}: the line shows players left and my rank (the rest is in the sheet): ${qt.trim()}`);
    check(await pg.evaluate(r1 => { const q = document.getElementById('qline'), b = q.getBoundingClientRect(), tap = b.height + (r1 ? 2 * -parseFloat(getComputedStyle(q, '::after').top) : 0);
      return tap >= 44 && [...q.children].every(s => { const r = s.getBoundingClientRect(); return r.left >= b.left - 1 && r.right <= b.right + 1; }); }, row1), `${tag}: the line is a 44px tap target and nothing in it spills over`);
    if(row1) check(await pg.evaluate(() => document.querySelector('#game .clock').contains(document.getElementById('qline')) && /Level \d+/.test(document.getElementById('cTimeLbl').offsetParent ? document.getElementById('cTimeLbl').textContent : document.getElementById('cNext').textContent)),
      `${tag}: one-row header: the line sits in the clock row and the level is still written`);
    check(await pg.locator('#game .stats').isHidden() && await pg.locator('#game .clock #lobbyBtn').isVisible(), `${tag}: the old stats row gives way; Lobby sits in the clock row`);
    if(tag === '390x844' || tag === '1280x800' || tag === '320x568'){
      await ql.click(); await sleep(500);
      const sh = (await pg.locator('#modalRoot .qsheet').textContent().catch(() => '')).replace(/\s+/g, ' ');
      check(/Players left\s*9 of 9/.test(sh) && /Chip leader/.test(sh) && /Your place\s*\d+(st|nd|rd|th) of 9/.test(sh) && /Average stack/.test(sh) && /BB/.test(sh), `${tag}: a tap opens the details: ${sh.slice(0, 140)}`);
      await shot(pg, `quiet-sheet-${tag}.png`);
      await pg.locator('#modalRoot [data-i]').first().click(); await sleep(300);
      check(!(await pg.locator('#modalRoot .qsheet').count()), `${tag}: Done closes it`);
    }
    // wait for my turn: the action buttons
    // (a turn that came while the test was between pages timed out and sat me out: I'm back, as a player would)
    let mine = false; for(let i = 0; i < 60 && !mine; i++){ mine = await pg.locator('.act-btn.fold, .act-btn.call').first().isVisible().catch(() => false);
      if(!mine && await pg.locator('#backBtn').isVisible().catch(() => false)) await pg.locator('#backBtn').click().catch(() => {}); if(!mine) await sleep(500); }
    check(mine, `${tag}: my turn comes and the action buttons show`);
    if(mine){
      await sleep(400);
      check(await pg.evaluate(() => [...document.querySelectorAll('.act-btn')].filter(b => b.offsetParent).every(b => { const r = b.getBoundingClientRect(); return r.width >= 44 && r.height >= 44 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.right <= innerWidth + 1; })), `${tag}: every action button is on screen and at least 44x44`);
      for(const k of ['fold', 'call', 'raise']){ const c = await contrastOf(pg, `.act-btn.${k} b`); if(c) check(c >= 4.5, `${tag}: ${k} label contrast ${c.toFixed(1)}:1 (at least 4.5)`); }
      await shot(pg, `quiet-table-${tag}.png`);
      // (Fold when I face a bet; when I can check there is no Fold button, so Check)
      const k = await pg.locator('.act-btn.fold').isVisible() ? 'fold' : 'call';
      await pg.locator('.act-btn.' + k).click();
      let gone = false; for(let i = 0; i < 20 && !gone; i++){ gone = !(await pg.locator('.act-btn.' + k).isVisible().catch(() => false)); if(!gone) await sleep(150); }
      check(gone, `${tag}: a tap on ${k === 'fold' ? 'Fold' : 'Check'} plays (the buttons go away)`);
    }
    await pg.context().close();
  }
  // a member who is not playing watches a table
  const w = await page(O, [390, 844]);
  if(await w.locator('[data-lx="poker"]').count()) await w.locator('[data-lx="poker"]').click();
  await sleep(600);
  const watch = w.locator('[data-watch]').first();
  check(await watch.count() === 1, 'a member who is not playing gets a Watch button');
  if(await watch.count()){
    await watch.click(); await sleep(1500);
    check(await w.locator('#game').isVisible() && await w.locator('#seats .seat').count() === 9, 'the watcher sees the table with its 9 seats');
    check(!(await w.locator('.act-btn').count()), 'and no action buttons');
    check(/Watching/.test(await w.locator('#qline').textContent()) && /9\s*\/9/.test(await w.locator('#qline').textContent()), 'the watcher\'s line shows the field and Watching instead of a place');
    check(await w.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'the watcher has no sideways scroll');
    await shot(w, 'quiet-watcher-390x844.png');
  }
  await w.context().close();
  // the demo table: its line opens the sheet too, with the demo's own field (owner's iPhone, 2026-10-21: the tap did nothing)
  const dm = await page(O, [390, 844]);
  await dm.locator('#tabs [data-tab=director]').click().catch(() => {}); await sleep(300); await dm.locator('[data-demo]').first().click().catch(() => {}); await sleep(2500);
  let dl = false; for(let i = 0; i < 20 && !dl; i++){ dl = await dm.locator('#qline').isVisible().catch(() => false); if(!dl) await sleep(300); }
  check(dl, 'demo table: the line shows');
  if(dl){
    await dm.locator('#qline').click(); await sleep(500);
    const st = await dm.locator('#modalRoot .qsheet').textContent().catch(() => '');
    check(/Demo table/.test(st) && /Players left/.test(st) && /Your place/.test(st), 'demo table: a tap on the line opens the sheet with the players left and my place');
  }
  await dm.context().close();
  // the Lounge
  for(const sz of [[390, 844], [1280, 800]]){
    const pg = await page(toks[1], sz); await pg.locator('#lobbyBtn').click().catch(() => {}); await sleep(800);
    check(await pg.locator('#lobby').isVisible(), `${sz.join('x')}: the Lounge opens`);
    await shot(pg, `quiet-lounge-${sz.join('x')}.png`);
    await pg.context().close();
  }
  so.close(); for(const s of socks) s.close();
  await browser.close(); srv.kill(); try{ fs.unlinkSync(DATA); }catch(e){}
  console.log(`\n${oks} ok, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(async e => { console.error('FAIL', e.stack || e.message); try{ await browser.close(); }catch(x){} srv.kill(); process.exit(1); });
