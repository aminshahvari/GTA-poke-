// Free social play notices at the table (browser, phone emulation with touch, plus a desktop window).
//  - the start-of-game notice ("Free social play. No betting, no real money.") shows once at the start of a tournament,
//    sits only over the board's empty slots and the empty message line under them: clear of every seat, card, chip, the dealer button, the pot, the result
//    line and every button; its text fits; a tap dismisses it; it goes when the flop is dealt; it does not come back
//    for the same tournament (another hand, a reload) but does for a new tournament and for a new practice table
//  - the quiet line ("Free social play · No betting · No real money") is always at the table: on screen, inside the
//    dock (never over the table area), not cut off, and clear of every seat, card, chip, the dealer button, the pot,
//    the board, the helper, the result ("winner") line and every button, with your turn up, at a finished hand
//    (Winner badge, result line) and when watching; the table keeps the size it had without it (no layout change)
// The table state is written into the page's own socket (routeWebSocket), as t_table_layout does.
// PLAYWRIGHT=/path/to/playwright-core CHROMIUM=/path/to/chromium node test/ui/t_social_play.js
//   SHOTS=<dir> screenshots   ONLY=393x659 one size   NS=2,9 table sizes
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || process.env.PLAYWRIGHT_CORE || 'playwright');
const ROOT = process.env.ROOT || path.join(__dirname, '..', '..');
const PORT = 5480 + Math.floor(Math.random() * 80), BASE = 'http://localhost:' + PORT;
const DATA = require('os').tmpdir() + '/t_spn_' + process.pid + '.json';
const srv = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '', STAGING: '1', DATABASE_URL: '' }, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SHOTS = process.env.SHOTS || '';
const DEF = '320x568,375x667,393x659,430x739,667x375,844x390,1280x800';
const SIZES = (process.env.SIZES || DEF).split(',').filter(v => !process.env.ONLY || process.env.ONLY === v).map(v => v.split('x').map(Number));
const NS = (process.env.NS || '2,6,9').split(',').map(Number);
const api = async (p, body) => { const j = await (await fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })).json(); if(j.error) throw new Error(p + ': ' + j.error); return j; };
const fails = [];
let oks = 0;
const check = (cond, msg) => { if(cond) oks++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if(!cond) fails.push(msg); };
const hit = (a, b, pad = 0) => !!a && !!b && a.l < b.r - pad && b.l < a.r - pad && a.t < b.b - pad && b.t < a.b - pad;
const inside = (a, b, pad = .5) => a.l >= b.l - pad && a.t >= b.t - pad && a.r <= b.r + pad && a.b <= b.b + pad;

const NAMES = ['Alexandra Whitfield', 'Ben', 'Christina Okafor', 'Dev', 'Evangeline', 'Fitzgerald', 'Gwen', 'Maximilian Hart', 'Sam'];
// n seated; state 'turn' (your turn pre-flop, bets out), 'flop' (three board cards, waiting), 'result' (a finished
// hand: a winner with chips, the result line), 'watch' (you are not seated)
function tableFor(me, n, state, handNo){
  const watch = state === 'watch', result = state === 'result';
  const seats = Array.from({ length: n }, (_, s) => ({ uid: s ? 'p' + s : watch ? 'pw' : me.id, name: s ? NAMES[s - 1] : watch ? 'Watcher Wanda' : me.name, stack: 30000 - s * 1100, inHand: true,
    bet: result ? 0 : s === 1 ? 200 : s === 2 % n && n > 2 ? 1200 : 0, folded: n > 3 && s === n - 1, allIn: false, act: result ? '' : n > 3 && s === n - 1 ? 'Fold' : s === 2 % n && n > 2 ? 'Raise' : '',
    lastAmt: 1200, won: result && s === 1 ? 4200 : 0, shown: result && s === 1 ? ['As', 'Ks'] : null, cat: result && s === 1 ? 'Pair of Aces' : '', away: false }));
  const board = state === 'flop' ? ['2c', '7d', 'Jh'] : result ? ['2c', '7d', 'Jh', 'As', '9c'] : [];
  const mine = state === 'turn' && !watch;
  return { tid: 'spn', n: 1, phase: 'hand', handNo, street: board.length ? board.length - 2 : 0, seats, size: n, allowed: seats.map((p, s) => s), cur: 1200, board, pot: result ? 0 : 1500, btn: n - 1,
    blinds: [100, 200, 25], acting: mine ? 0 : result ? -1 : 1 % n, actUid: mine ? me.id : result ? null : seats[1 % n].uid, seq: 5, deadline: Date.now() + 60000, bank: 60000, usingBank: false, extras: 3,
    legal: mine ? { canCheck: false, toCall: 1200, canRaise: true, minTo: 2200, maxTo: 30000, isBet: false, cur: 1200, pot: 2700, bb: 200 } : null,
    result: result ? { lines: [`${NAMES[0]} wins 4,200 · Pair of Aces`], winCards: ['As', 'Ac'], showdown: true } : null, note: '' };
}

async function measure(pg){
  return pg.evaluate(() => {
    const r = el => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
    const drawn = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none';
    const u = rs => rs.length ? { l: Math.min(...rs.map(x => x.l)), t: Math.min(...rs.map(x => x.t)), r: Math.max(...rs.map(x => x.r)), b: Math.max(...rs.map(x => x.b)) } : null;
    const all = sel => [...document.querySelectorAll(sel)].filter(drawn).map(r);
    const seats = [...document.querySelectorAll('#seats .seat')].map(s => ({ name: (s.querySelector('.nm') || {}).textContent || '?',
      box: u([s.querySelector('.av'), s.querySelector('.plate'), ...s.querySelectorAll('.badge, .hole .card')].filter(drawn).map(r)) }));
    const txt = el => { if(!drawn(el) || !el.textContent.trim()) return null; const rg = document.createRange(); rg.selectNodeContents(el); const rs = [...rg.getClientRects()].filter(x => x.width > 0).map(x => ({ l: x.left, t: x.top, r: x.right, b: x.bottom })); return u(rs); };
    const line = document.getElementById('playLine'), note = document.getElementById('playNote'), ls = line && getComputedStyle(line);
    return {
      w: innerWidth, h: innerHeight,
      area: r(document.getElementById('tableArea')), dock: r(document.getElementById('dock')), felt: r(document.querySelector('#tableArea .felt')),
      seats, cards: all('#seats .hole .card'), bets: all('#tableArea .bet'), dealer: all('#tableArea .dealer'), pot: drawn(document.getElementById('pot')) && document.getElementById('pot').textContent ? r(document.getElementById('pot')) : null,
      board: u(all('#board .card')), slots: u(all('#board .slot, #board .card')), msg: txt(document.getElementById('msg')),
      buttons: all('#game button'), helper: drawn(document.getElementById('helper')) ? r(document.getElementById('helper')) : null,
      info: [...document.querySelectorAll('#controls .info-line')].map(txt).filter(Boolean),
      line: line && drawn(line) ? { box: r(line), text: line.textContent, cut: line.scrollWidth > line.clientWidth + 1, font: parseFloat(ls.fontSize), color: ls.color } : null,
      note: note && !note.hidden && drawn(note) ? { box: r(note), text: note.textContent, cut: note.scrollWidth > note.clientWidth + 1 || note.scrollHeight > note.clientHeight + 1, font: parseFloat(getComputedStyle(note).fontSize) } : null,
      scroll: { x: document.documentElement.scrollWidth - innerWidth, y: document.documentElement.scrollHeight - innerHeight }
    };
  });
}
// everything a label may never cover
function clashes(m, box){
  const out = [];
  m.seats.forEach(s => { if(hit(box, s.box, .5)) out.push('seat ' + s.name); });
  m.cards.forEach((c, i) => { if(hit(box, c, .5)) out.push('card ' + i); });
  m.bets.forEach((c, i) => { if(hit(box, c, .5)) out.push('chips ' + i); });
  m.dealer.forEach(c => { if(hit(box, c, .5)) out.push('dealer button'); });
  if(hit(box, m.pot, .5)) out.push('pot');
  if(hit(box, m.msg, .5)) out.push('result line on the felt');
  m.info.forEach(c => { if(hit(box, c, .5)) out.push('result/status line in the bar'); });
  m.buttons.forEach((c, i) => { if(hit(box, c, .5)) out.push('button ' + i); });
  return out;
}

(async () => {
  for(let i = 0; i < 60; i++){ try{ await fetch(BASE + '/health'); break; }catch(e){ await sleep(150); } }
  await sleep(400);
  const TOK = (await api('login', { name: 'Test Player 07', pin: '135777' })).token;
  if(SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  for(const [w, h] of SIZES){
    const mobile = w < 1000, size = `${w}x${h}`;
    const pg = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
    if(process.env.FONTS_DIR){
      const dir = process.env.FONTS_DIR;
      await pg.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => { const u = r.request().url();
        if(u.includes('fonts.googleapis.com/css2')) return r.fulfill({ status: 200, contentType: 'text/css', body: fs.readFileSync(path.join(dir, 'fonts.css')) });
        const f = path.join(dir, u.slice('https://fonts.gstatic.com/'.length).replace(/\//g, '_'));
        return fs.existsSync(f) ? r.fulfill({ status: 200, contentType: 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) }) : r.abort(); });
    }
    let sock = null, me = null, club0 = null;
    const T = { id: 'tspn1' };
    await pg.routeWebSocket(/\/ws$/, ws => {
      const server = ws.connectToServer();
      ws.onMessage(m => { try{ const j = JSON.parse(m); if(j.t === 'watch' || j.t === 'act') return; }catch(e){} server.send(m); });
      server.onMessage(m => {
        let j; try{ j = JSON.parse(m); }catch(e){ return ws.send(m); }
        if(j.t === 'table' || j.t === 'closed') return;
        if(j.t !== 'club') return ws.send(m);
        me = j.club.me; club0 = j.club;
        ws.send(JSON.stringify({ ...j, club: clubWith(j.club, T.id) })); sock = ws;
      });
    });
    const clubWith = (c, id) => ({ ...c, tourney: { ...(c.tourney || {}), id, status: 'running', name: 'Friday Night', stack: 30000, anteMode: 'bb', regs: [me.id], entrants: 9, remaining: 9, level: 2,
      levelEndsAt: Date.now() + 600000, paused: false, places: [], lateOpen: false, helper: true }, myTable: 'spn', tables: [{ tid: 'spn', n: 1, players: 9 }] });
    const sendClub = id => sock.send(JSON.stringify({ t: 'club', club: clubWith(club0, id) }));
    let hand = 10;
    const deal = async (n, state, wait = 'turn') => {
      sock.send(JSON.stringify({ t: 'table', table: tableFor(me, n, state, ++hand), you: state === 'watch' ? null : { hand, cards: ['Ah', 'Qd'] } }));
      if(wait === 'turn' && state === 'turn') try{ await pg.waitForSelector('#aRaise', { timeout: 8000 }); }catch(e){}
      await sleep(650);
      return measure(pg);
    };
    const shot = async name => { if(SHOTS) await pg.screenshot({ path: path.join(SHOTS, `${size}-${name}.png`) }); };
    await pg.goto(BASE + '/'); await pg.evaluate(t => { localStorage.setItem('stacked:token', JSON.stringify(t)); localStorage.removeItem('stacked:playnote'); }, TOK);
    await pg.reload(); await pg.evaluate(() => document.fonts.ready);
    for(let k = 0; k < 100 && !sock; k++) await sleep(100);

    // 1. the start of a tournament: the notice, over the empty board only
    let m = await deal(NS[NS.length - 1], 'turn');
    let tag = `${size} start (${NS[NS.length - 1]} players)`;
    check(!!m.note, `${tag}: the free-play notice shows at the start of the tournament`);
    if(m.note){
      check(/free social play/i.test(m.note.text) && /no betting/i.test(m.note.text) && /no real money/i.test(m.note.text), `${tag}: notice says free social play, no betting, no real money ("${m.note.text}")`);
      check(!m.note.cut && m.note.font >= 10.95, `${tag}: notice text fits at 11 px or more (font ${m.note.font}px)`);
      check(!!m.slots && m.note.box.l >= m.slots.l - 1 && m.note.box.r <= m.slots.r + 1 && Math.abs(m.note.box.t - m.slots.t) <= 1 && m.note.box.b <= m.slots.b + 24, `${tag}: notice sits over the board's empty slots (and the empty message line under them) only`);
      const c = clashes(m, m.note.box);
      check(!c.length, `${tag}: notice clear of seats, cards, chips, dealer button, pot, result line and buttons${c.length ? ' — ' + c.join(', ') : ''}`);
      check(inside(m.note.box, { l: 0, t: 0, r: m.w, b: m.h }) && inside(m.note.box, m.area), `${tag}: notice on screen, inside the table area`);
    }
    await shot('start-notice');
    // your action buttons still work with the notice up (nothing blocks them)
    const free = await pg.evaluate(() => ['aFold', 'aCall', 'aRaise'].every(id => { const b = document.getElementById(id); if(!b) return false; const r = b.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e && (e === b || b.contains(e)); }));
    check(free, `${tag}: Fold / Call / Raise are the topmost element under a tap (not blocked)`);
    // a tap dismisses it
    if(m.note){ await pg.click('#playNote'); await sleep(150); }
    m = await measure(pg);
    check(!m.note, `${tag}: a tap dismisses the notice`);
    // another hand of the same tournament: not again
    m = await deal(NS[0], 'turn');
    check(!m.note, `${size}: next hand of the same tournament: no notice again`);
    // a reload in the same tournament: not again
    await pg.reload(); await pg.evaluate(() => document.fonts.ready); sock = null;
    for(let k = 0; k < 100 && !sock; k++) await sleep(100);
    m = await deal(NS[0], 'turn');
    check(!m.note, `${size}: after a reload, same tournament: no notice again`);
    // a new tournament: shown again; and it goes by itself when the flop is dealt
    T.id = 'tspn2'; sendClub(T.id); await sleep(150);
    m = await deal(NS[0], 'turn');
    check(!!m.note, `${size}: a new tournament shows the notice again`);
    m = await deal(NS[0], 'flop', 'none');
    check(!m.note, `${size}: the notice goes when the flop is dealt (never over board cards)`);

    // 2. the quiet line, in every state and table size
    for(const n of NS) for(const state of ['turn', 'result', 'watch']){
      tag = `${size} ${n} players ${state}`;
      m = await deal(n, state);
      check(!m.note, `${tag}: no notice mid-tournament`);
      check(!!m.line, `${tag}: the free-play line is shown`);
      if(!m.line) continue;
      check(/free social play/i.test(m.line.text) && /no betting/i.test(m.line.text) && /no real money/i.test(m.line.text), `${tag}: line says free social play, no betting, no real money`);
      check(!m.line.cut && m.line.font >= 10.95, `${tag}: line not cut off, text at least 11 px like all game text (font ${m.line.font}px)`);
      check(inside(m.line.box, { l: 0, t: 0, r: m.w, b: m.h }), `${tag}: line on screen`);
      check(inside(m.line.box, m.dock, .5) && !hit(m.line.box, m.area, .5), `${tag}: line inside the dock, never over the table area`);
      const c = clashes(m, m.line.box);
      if(m.helper && hit(m.line.box, m.helper, .5)) c.push('helper');
      if(hit(m.line.box, m.board, .5)) c.push('board');
      check(!c.length, `${tag}: line clear of seats, cards, chips, dealer button, pot, board, helper, result line and buttons${c.length ? ' — ' + c.join(', ') : ''}`);
      check(m.scroll.x <= 0 && m.scroll.y <= 0, `${tag}: nothing scrolls`);
      if(state === 'result') check(m.info.length > 0, `${tag}: the result line is shown in the bar`);
      if(n === NS[NS.length - 1]) await shot(`${n}p-${state}`);
    }

    // 3. a new practice table is a new game: the notice shows there too
    {
      // the tournament is over; the practice table is offered from the club's home (as for anyone not seated)
      sock.send(JSON.stringify({ t: 'club', club: { ...club0, tourney: null, myTable: null, tables: [] } })); await sleep(200);
      await pg.evaluate(() => { const b = document.getElementById('lobbyBtn'); if(b) b.click(); }); await sleep(400);
      const started = await pg.evaluate(() => { const b = document.querySelector('[data-demo]'); if(!b) return false; b.click(); return true; });
      check(started, `${size}: the practice table can be opened from the lobby`);
      if(started){
        let seen = false;
        for(let k = 0; k < 40 && !seen; k++){ await sleep(200); seen = await pg.evaluate(() => { const n = document.getElementById('playNote'); return !!n && !n.hidden; }); }
        check(seen, `${size}: the practice table shows the notice at its start`);
        if(seen){ m = await measure(pg); const c = clashes(m, m.note.box); check(!c.length, `${size} practice: notice clear of seats, cards, chips, dealer button, pot and buttons${c.length ? ' — ' + c.join(', ') : ''}`); await shot('practice-notice'); }
      }
    }
    await pg.close();
  }
  await browser.close();
  console.log(`\n${oks} ok, ${fails.length} failed`);
  srv.kill(); fs.rmSync(DATA, { force: true });
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e.stack || e); srv.kill(); fs.rmSync(DATA, { force: true }); process.exit(1); });
