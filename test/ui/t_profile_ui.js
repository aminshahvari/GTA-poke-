// The board's player profile sheet (Issue #32, Step-0 spec §8, phase B7: the board's "Player Profile (Optional)"), run
// with UI_BOARD=1. Staging seed accounts only (Test Player NN, their staging demo businesses); the table, its seats and
// the tournament are fixtures patched into the messages in the page (as t_board_ui does), never real data.
// At 320x568, 390x844, 430x932 portrait and 844x390 landscape:
//  - a tap on a seat opens the sheet: the picture 64 with its presence dot, the name, the chips at the table, "View
//    Profile"; a member with everything off (the default): picture, name and chips only (no About | Business, no
//    Open to Connect, no request button), and no photo even though one is uploaded
//  - a member with "Show my photo", "Show About and Business at tables" and "Open to Connect" on: their photo (fetched
//    with the token, from a blob), About (area, job title, Open to Connect), Business (their Exchange card), the gold
//    Send Connection Request and "Only visible with member consent"; their seat shows the photo too
//  - nothing wider than the screen, every tap target in the sheet at least 44 tall; Escape and Done close it
//  - a connection request that arrives while it is the member's turn: no notice until the turn is over, then the notice
//    (its View opens the requests, Accept and Decline at least 44 tall)
//  - once (390x844): sending a request from the sheet ("Request sent"), withdrawing it; a picture on Home opens the sheet
// PLAYWRIGHT=/path/to/playwright-core CHROMIUM=/path/to/chromium node test/ui/t_profile_ui.js   SHOTS=<dir> screenshots
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const { chromium } = require(process.env.PLAYWRIGHT || process.env.PLAYWRIGHT_CORE || 'playwright');
const ROOT = process.env.ROOT || path.join(__dirname, '..', '..');
const PORT = 6040 + Math.floor(Math.random() * 80), BASE = 'http://localhost:' + PORT;
const DATA = path.join(os.tmpdir(), 't_profui_' + process.pid + '.json');
const srv = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, UI_BOARD: '1', PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '', STAGING: '1', DATABASE_URL: '', CONN_HOUR_MAX: '50' }, stdio: 'ignore' });
const cleanup = () => { try{ srv.kill(); }catch(e){} fs.rmSync(DATA, { force: true }); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SHOTS = process.env.SHOTS || '';
const SIZES = (process.env.SIZES || '320x568,390x844,430x932,844x390').split(',').filter(Boolean);
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
const api = async (p, body, tok) => { const j = await (await fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body || {}) })).json(); if(j.error) throw new Error(p + ': ' + j.error); return j; };
const fails = [];
let oks = 0;
const check = (cond, msg) => { if(cond) oks++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if(!cond) fails.push(msg); };
const pin = n => '1357' + String(n % 10).repeat(2);
const login = async n => (await api('login', { name: 'Test Player ' + String(n).padStart(2, '0'), pin: pin(n) })).token;

// the fixture table: you (Test Player 01) at seat 0, Test Player 02 (everything off) at 1, Test Player 03 (everything on)
// at 2, made-up players elsewhere (not members: their seats keep the throw)
function tableFor(ids, turn){
  const seats = Array.from({ length: 9 }, (_, s) => ({ uid: s === 0 ? ids[1] : s === 1 ? ids[2] : s === 2 ? ids[3] : 'px' + s, name: s < 3 ? 'Test Player 0' + (s + 1) : 'Player ' + s,
    stack: 30000 - s * 1100, inHand: true, bet: s === 1 ? 200 : 0, folded: false, allIn: false, act: '', lastAmt: 0, won: 0, shown: null, cat: '', away: s === 2 }));
  return { tid: 'tpf', n: 1, phase: 'hand', handNo: 3, street: 0, seats, size: 9, allowed: seats.map((p, s) => s), cur: 200, board: [], pot: 300, btn: 8, blinds: [100, 200, 0],
    acting: turn ? 0 : 5, actUid: turn ? ids[1] : 'px5', seq: turn ? 30 : 31, deadline: Date.now() + 60000, bank: 60000, usingBank: false, extras: 3,
    legal: turn ? { canCheck: false, toCall: 200, canRaise: true, minTo: 400, maxTo: 30000, isBet: false, cur: 200, pot: 300, bb: 200 } : null, result: null, note: '' };
}
async function page(browser, tok, ids, w, h){
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPHONE_UA });
  const pg = await ctx.newPage();
  await pg.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => r.abort());
  const S = { sock: null };
  const T = () => ({ id: 'tpf-t', status: 'running', name: 'Friday Night', stack: 30000, anteMode: 'bb', regs: [ids[1], ids[2], ids[3]], entrants: 9, remaining: 9, level: 2, levelEndsAt: Date.now() + 600000, paused: false, places: [], lateOpen: false, helper: true, levelMin: 20, tableSize: 9, actSec: 20, sponsor: null, prize: '' });
  await pg.routeWebSocket(/\/ws$/, ws => {
    const server = ws.connectToServer(); S.sock = ws;
    ws.onMessage(m => { try{ const j = JSON.parse(m); if(j.t === 'watch' || j.t === 'act' || j.t === 'join' || j.t === 'leave') return; }catch(e){} server.send(m); });
    server.onMessage(m => { let j; try{ j = JSON.parse(m); }catch(e){ return ws.send(m); }
      if(j.t === 'table' || j.t === 'closed') return;
      if(j.t === 'club' && (!j.d || 'tourney' in j.club || 'myTable' in j.club || 'tables' in j.club)) Object.assign(j.club, { tourney: T(), myTable: 'tpf', tables: [{ tid: 'tpf', n: 1, players: 9 }] });
      ws.send(JSON.stringify(j)); });
  });
  await pg.goto(BASE + '/'); await pg.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), tok);
  await pg.reload();
  for(let k = 0; k < 100 && !S.sock; k++) await sleep(100);
  await pg.waitForSelector('#game:not([hidden])', { timeout: 10000 }).catch(() => {});
  S.table = turn => S.sock.send(JSON.stringify({ t: 'table', table: tableFor(ids, turn), you: { hand: 3, cards: ['Ah', 'Qd'] }, field: { players: 9, tables: 1, leader: { name: 'Test Player 01', stack: 30000, table: 1 }, watchers: 0, rank: 1 } }));
  S.table(false); await sleep(1200);
  return { ctx, pg, S };
}
// the sheet, measured
const sheet = pg => pg.evaluate(() => {
  const sh = document.getElementById('bProf'); if(!sh || sh.hidden) return null;
  const W = innerWidth, H = innerHeight, r = e => e.getBoundingClientRect(), q = s => sh.querySelector(s), txt = e => e ? e.innerText.replace(/\s+/g, ' ').trim() : '';
  const inner = q('.bp-in'), av = q('.bp-av'), img = av && av.querySelector('img:not([hidden])');
  const taps = [...sh.querySelectorAll('button, a')].filter(e => e.getClientRects().length).map(e => ({ t: txt(e).slice(0, 28), h: r(e).height, w: r(e).width })).filter(e => e.h < 44 - .5 || e.w < 44 - .5);
  const wide = [...sh.querySelectorAll('*')].filter(e => e.getClientRects().length && (r(e).right > W + .5 || r(e).left < -.5)).map(e => e.className.toString().slice(0, 30));
  return { name: txt(q('#bpName')), chips: txt(q('.bp-chips')), av: av && Math.round(r(av).width) + 'x' + Math.round(r(av).height), photo: !!img && /^blob:/.test(img.src) && img.naturalWidth > 0, initials: av && !img ? txt(av) : '',
    dot: (q('.bp-dot') || {}).className || '', view: txt(q('[data-bpview]')), seg: [...sh.querySelectorAll('[data-bpseg]')].map(b => txt(b) + (b.getAttribute('aria-selected') === 'true' ? '*' : '')).join('|'),
    pane: txt(q('.bp-pane')), open: !!q('.bp-open'), send: txt(q('[data-bpsend]')), sendBg: q('[data-bpsend]') ? getComputedStyle(q('[data-bpsend]')).backgroundImage : '', foot: txt(q('.bp-foot')), state: txt(q('.bp-state')),
    biz: txt(q('.bz-sheet b')), dialog: !!q('[role=dialog][aria-modal=true]'), focus: document.activeElement && document.activeElement.hasAttribute('data-bpclose'),
    all: txt(inner), taps, wide: wide.slice(0, 5), fits: r(inner).left >= -.5 && r(inner).right <= W + .5 && r(inner).bottom <= H + .5, scrollW: document.documentElement.scrollWidth - W };
});
const tapSeat = async (pg, uid) => { const el = await pg.$(`#seats .seat[data-uid="${uid}"] .av`) || await pg.$(`#seats .seat[data-uid="${uid}"]`); await el.tap(); await sleep(700); };
const shot = async (pg, name) => { if(SHOTS) await pg.screenshot({ path: path.join(SHOTS, name + '.png') }); };

async function size(browser, tok, ids, w, h, sender){
  const tag = `${w}x${h}`;
  const { ctx, pg, S } = await page(browser, tok, ids, w, h);
  // ---- a member with everything off ----
  await tapSeat(pg, ids[2]);
  let m = await sheet(pg);
  check(!!m && m.dialog, `${tag}: a tap on a seat opens the profile sheet (a dialog)`);
  if(m){
    check(m.name === 'Test Player 02' && m.chips === '28,900 chips' && m.av === '64x64' && m.dot === 'bp-dot' && m.view === 'View Profile', `${tag}: picture 64 (${m.av}) with its presence dot, name, chips at the table (${m.chips}), View Profile`);
    check(!m.photo && m.initials === 'TP', `${tag}: everything off: the initials disc, no photo (an uploaded photo stays hidden)`);
    check(!m.seg && !m.open && !m.send && !m.foot && !m.biz && !m.state && m.all === 'TP Test Player 02 28,900 chips View Profile Done', `${tag}: everything off: picture, name and chips only ("${m.all}")`);
    check(!m.taps.length && !m.wide.length && m.fits && m.scrollW <= 0, `${tag}: nothing wider than the screen, every tap at least 44${m.taps.length ? ' — ' + JSON.stringify(m.taps) : ''}${m.wide.length ? ' wide: ' + m.wide.join(',') : ''}`);
    check(m.focus, `${tag}: focus on Done`);
  }
  await shot(pg, `profile-off-${tag}`);
  await pg.keyboard.press('Escape'); await sleep(300);
  check(!(await sheet(pg)), `${tag}: Escape closes it`);
  // ---- a member with everything on ----
  const seatPhoto = await pg.evaluate(uid => { const i = document.querySelector(`#seats .seat[data-uid="${uid}"] .av img:not([hidden])`); return !!i && /^blob:/.test(i.src); }, ids[3]);
  check(seatPhoto, `${tag}: "Show my photo" on: their seat shows the photo (fetched with the token)`);
  await tapSeat(pg, ids[3]);
  m = await sheet(pg);
  if(m){
    check(m.name === 'Test Player 03' && m.chips === '27,800 chips' && m.photo && /\baway\b/.test(m.dot), `${tag}: their photo in the sheet, the away dot, chips ${m.chips}`);
    check(m.seg === 'About*|Business' && /Area Leslieville/i.test(m.pane) && /Job title Designer/i.test(m.pane) && m.open, `${tag}: About | Business; About: area, job title, Open to Connect ("${m.pane}")`);
    check(m.send === 'Send Connection Request' && /linear-gradient/.test(m.sendBg) && m.foot === 'Only visible with member consent', `${tag}: the gold Send Connection Request with "Only visible with member consent"`);
    check(!m.taps.length && !m.wide.length && m.fits, `${tag}: about: nothing wider than the screen, every tap at least 44${m.taps.length ? ' — ' + JSON.stringify(m.taps) : ''}${m.wide.length ? ' wide: ' + m.wide.join(',') : ''}`);
  } else check(false, `${tag}: the sheet opens for Test Player 03`);
  await shot(pg, `profile-about-${tag}`);
  await pg.tap('#bProf [data-bpseg="biz"]'); await sleep(500);
  m = await sheet(pg);
  check(m && m.seg === 'About|Business*' && m.biz === 'Bluefin Studio', `${tag}: Business: their Exchange card (${m && m.biz})`);
  if(m) check(!m.taps.length && !m.wide.length && m.fits, `${tag}: business: nothing wider than the screen, every tap at least 44${m.taps.length ? ' — ' + JSON.stringify(m.taps) : ''}${m.wide.length ? ' wide: ' + m.wide.join(',') : ''}`);
  await shot(pg, `profile-business-${tag}`);
  if(w === 390){
    await pg.tap('#bProf [data-bpseg="about"]'); await sleep(300);
    await pg.tap('#bProf [data-bpsend]'); await sleep(900);
    m = await sheet(pg);
    check(m && /^Request sent/.test(m.state) && !m.send, `390: Send Connection Request: "${m && m.state}"`);
    await shot(pg, `profile-sent-${tag}`);
    await pg.tap('#bProf [data-bpwithdraw]'); await sleep(900);
    m = await sheet(pg);
    check(m && m.send === 'Send Connection Request' && !m.state, '390: Withdraw: the request is gone, the button is back');
  }
  await pg.tap('#bProf [data-bpclose]'); await sleep(300);
  check(!(await sheet(pg)), `${tag}: Done closes it`);
  // ---- a request that arrives during my turn waits for the turn to end ----
  S.table(true); await sleep(900);
  const myTurn = await pg.evaluate(() => !!document.getElementById('aFold'));
  await api('connSend', { uid: ids[1] }, sender.tok);
  await sleep(1500);
  const during = await pg.evaluate(() => { const n = document.getElementById('bConnNote'); return !!n && !n.hidden; });
  check(myTurn && !during, `${tag}: a request that arrives during my turn: no notice while I decide`);
  await shot(pg, `profile-turn-${tag}`);
  S.table(false); await sleep(1000);
  const after = await pg.evaluate(() => { const n = document.getElementById('bConnNote'); if(!n || n.hidden) return null; const r = n.getBoundingClientRect();
    return { text: n.querySelector('.b-cnote-t').textContent, small: [...n.querySelectorAll('button')].filter(b => b.getBoundingClientRect().height < 44 - .5).length, fits: r.left >= 0 && r.right <= innerWidth }; });
  check(after && after.text === `${sender.name} asked to connect with you` && !after.small && after.fits, `${tag}: the turn over, the notice shows: "${after && after.text}"`);
  await shot(pg, `profile-notice-${tag}`);
  if(after){
    await pg.tap('#bConnNote [data-cnview]'); await sleep(500);
    const list = await pg.evaluate(() => { const g = document.querySelector('#modalRoot .bp-conns'); if(!g) return null; return { text: g.textContent.replace(/\s+/g, ' ').trim(), btns: [...g.querySelectorAll('button')].map(b => Math.round(b.getBoundingClientRect().height)) }; });
    check(list && list.text.includes(sender.name) && list.btns.length === 2 && list.btns.every(x => x >= 44), `${tag}: View opens the requests: Accept and Decline (${list && list.btns.join(',')} tall)`);
    await shot(pg, `profile-requests-${tag}`);
    if(list) { await pg.tap('#modalRoot [data-v^="d:"]'); await sleep(700); }
  }
  if(w === 390){
    // a picture on Home (a new member's row) opens the same sheet
    await pg.evaluate(() => { document.getElementById('lobbyBtn').click(); }); await sleep(700);
    await pg.evaluate(() => { const b = document.querySelector('#tabs [data-tab="home"]'); if(b) b.click(); }); await sleep(800);
    const row = await pg.$('#lobbyBody [data-bprof]');
    if(row){ await row.tap(); await sleep(800); m = await sheet(pg); check(!!m && /^Test Player|^Test Director/.test(m.name) && !m.chips.includes('undefined'), `390: a picture on Home opens the sheet (${m && m.name})`); await shot(pg, 'profile-home-390x844'); }
    else check(false, '390: a member row with a picture on Home');
  }
  await ctx.close();
}

(async () => {
  for(let i = 0; i < 60; i++){ try{ if((await fetch(BASE + '/healthz')).ok) break; }catch(e){} await sleep(150); }
  await sleep(400);
  if(SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const tok = {}, ids = {};
  for(const n of [1, 2, 3, 4, 5, 6, 7]){ tok[n] = await login(n); }
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  // the fixture members: everyone's ids; a small real photo for Test Players 02 and 03 (made in the page: a gold square)
  { const ctx = await browser.newContext(), pg = await ctx.newPage(); await pg.goto(BASE + '/');
    const jpeg = await pg.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 96; const x = c.getContext('2d'); x.fillStyle = '#c9a25a'; x.fillRect(0, 0, 96, 96); x.fillStyle = '#1b2a4a'; x.beginPath(); x.arc(48, 40, 18, 0, 7); x.fill(); x.fillRect(22, 64, 52, 32); return c.toDataURL('image/jpeg', .8); });
    await ctx.close();
    for(const n of [2, 3]) await api('avatar', { kind: 'photo', data: jpeg }, tok[n]); }
  const view = await new Promise((res, rej) => { const WebSocket = require('ws'), ws = new WebSocket(BASE.replace('http', 'ws') + '/ws');
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', token: tok[1] }))); ws.on('message', m => { m = JSON.parse(m); if(m.t === 'club'){ ws.close(); res(m.club); } }); ws.on('error', rej); });
  for(const n of [1, 2, 3, 4, 5, 6, 7]) ids[n] = view.members.find(x => x.name === 'Test Player 0' + n).id;
  // Test Player 02: everything off (the default). 03: everything on. 01 (you): Open to Connect, so 04-07 can ask.
  await api('profilePrefs', { photo: true, table: true, connect: true, area: 'Leslieville', job: 'Designer' }, tok[3]);
  await api('profilePrefs', { connect: true }, tok[1]);
  const senders = [4, 5, 6, 7].map(n => ({ tok: tok[n], name: 'Test Player 0' + n }));
  for(const [i, s] of SIZES.entries()){ const [w, h] = s.split('x').map(Number); await size(browser, tok[1], ids, w, h, senders[i % senders.length]); }
  await browser.close();
  console.log(`\nt_profile_ui: ${oks} ok, ${fails.length} failed`);
  cleanup(); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); cleanup(); process.exit(1); });
