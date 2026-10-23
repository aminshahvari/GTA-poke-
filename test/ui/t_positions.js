// Dealer button, blinds, pot and the acting seat as drawn on the table (browser, phone emulation with touch).
// For a table state written into the page's own socket (as t_table_layout does) with the button on every seat of a
// 6-handed table (seats 0,1,3,4,6,7 like the demo), a 9-handed table and heads-up, at an upright and a sideways
// phone, it asserts:
//  - the seats are drawn clockwise in seat order (the next seat to act is the next one clockwise on the screen)
//  - the D button, the small blind's chips and the big blind's chips each sit nearest their own seat, so they read
//    as Dealer -> SB -> BB on consecutive seats clockwise (heads-up: the dealer posts the small blind)
//  - the seat whose turn it is shows no pill from its last action; other seats keep theirs
//  - the pot in the middle is the whole live pot: what's in the middle plus the bets in front of the seats
// Then the action buttons: a double tap sends one action, the buttons come back if nothing moves for 4 s, and the
// demo table (the real engine in the browser) deals the button and blinds to consecutive live seats each hand.
// PLAYWRIGHT=/path/to/playwright-core CHROMIUM=/path/to/chromium node test/ui/t_positions.js
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || process.env.PLAYWRIGHT_CORE || 'playwright');
const ROOT = process.env.ROOT || path.join(__dirname, '..', '..');
const PORT = 5600 + Math.floor(Math.random() * 80), BASE = 'http://localhost:' + PORT;
const DATA = require('os').tmpdir() + '/t_pos_' + process.pid + '.json';
let srvOut = '';
const srv = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '', STAGING: '1', DATABASE_URL: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
srv.stdout.on('data', b => { srvOut = (srvOut + b).slice(-2000); }); srv.stderr.on('data', b => { srvOut = (srvOut + b).slice(-2000); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const api = async (p, body) => { const j = await (await fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })).json(); if(j.error) throw new Error(p + ': ' + j.error); return j; };
const fails = []; let oks = 0;
const check = (cond, msg) => { if(cond) oks++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if(!cond) fails.push(msg); };
const SIZES = [[390, 844], [844, 390]];
const NAMES = ['Ana', 'Ben', 'Carla', 'Dev', 'Eli', 'Fay', 'Gus', 'Hal'];

// a table on `allowed` seats, you on seat `mine`, the button on seat `btn`; blinds posted, the next seat to act
// has a stale "Call" from an earlier street, and seat after it has one too (that one keeps its pill)
function tableFor(me, allowed, mine, btn, pot){
  const nx = s => allowed[(allowed.indexOf(s) + 1) % allowed.length];
  const hu = allowed.length === 2, sb = hu ? btn : nx(btn), bb = nx(sb), acting = nx(bb), after = nx(acting);
  let k = 0;
  const seats = Array(9).fill(null);
  for(const s of allowed) seats[s] = { uid: s === mine ? me.id : 'p' + s, name: s === mine ? me.name : NAMES[k++], stack: 20000, inHand: true,
    bet: s === sb ? 100 : s === bb ? 200 : 0, folded: false, allIn: false, act: s === sb ? 'SB' : s === bb ? 'BB' : (s === acting || s === after) && !hu ? 'Call' : '',
    lastAmt: 0, won: 0, shown: null, cat: '', away: false };
  return { t: { tid: 'tpos', n: 1, phase: 'hand', handNo: 10 + btn, street: 0, seats, size: allowed.length, allowed, cur: 200, board: [], pot, btn,
    blinds: [100, 200, 25], acting, actUid: seats[acting].uid, seq: 3, deadline: Date.now() + 60000, bank: 0, usingBank: false, extras: 3, legal: null, result: null, note: '' },
    sb, bb, acting, after: hu ? -1 : after };
}

async function drawn(pg){
  return pg.evaluate(() => {
    const c = el => { const b = el.getBoundingClientRect(); return [(b.left + b.right) / 2, (b.top + b.bottom) / 2]; };
    const felt = c(document.querySelector('#tableArea .felt'));
    // where a seat is: its spot on the rail (the point the seat is drawn round); your own seat, drawn larger, by
    // the middle of its cards and name plate
    const box = el => el.getBoundingClientRect();
    const spot = s => { if(s.classList.contains('hero')){ const bs = [s.querySelector('.plate'), ...s.querySelectorAll('.hole .card')].filter(Boolean).map(box);
        return [(Math.min(...bs.map(b => b.left)) + Math.max(...bs.map(b => b.right))) / 2, (Math.min(...bs.map(b => b.top)) + Math.max(...bs.map(b => b.bottom))) / 2]; }
      const host = box(s.offsetParent); return [host.left + parseFloat(s.style.left) / 100 * host.width, host.top + parseFloat(s.style.top) / 100 * host.height]; };
    const seats = [...document.querySelectorAll('#seats .seat')].map(s => ({ uid: s.dataset.uid, at: spot(s), badge: (s.querySelector('.badge') || {}).textContent || (s.querySelector('.nm[data-act]') || { dataset: {} }).dataset.act || '' }));   // (data-act: the quiet design writes it in the name line)
    const bets = [...document.querySelectorAll('#seats .bet')].map(b => ({ amt: b.textContent.replace(/[^0-9]/g, ''), at: c(b) }));
    const d = document.querySelector('#seats .dealer');
    return { felt, seats, bets, dealer: d ? c(d) : null, pot: document.getElementById('pot').textContent.trim() };
  });
}
// the seat a chip or the button reads as belonging to: the nearest one, and clearly so (the next nearest at least 8%
// further away); a tie reads as nobody's
const nearest = (seats, p) => { const ds = seats.map(s => ({ uid: s.uid, d: Math.hypot(s.at[0] - p[0], s.at[1] - p[1]) })).sort((a, b) => a.d - b.d);
  return ds.length < 2 || ds[1].d >= ds[0].d * 1.08 ? ds[0].uid : null; };

(async () => {
  // the server is ready when it answers (bounded wait, with its output if it never does)
  const t0 = Date.now();
  for(;;){ try{ const r = await fetch(BASE + '/'); if(r.ok) break; }catch(e){} if(Date.now() - t0 > 20000){ console.error(`server not ready on port ${PORT} after 20 s\n${srvOut}`); srv.kill(); process.exit(1); } await sleep(150); }
  const TOK = (await api('login', { name: 'Test Player 07', pin: '135777' })).token;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const open = async (vp, tok) => {
    const pg = await browser.newPage({ viewport: { width: vp[0], height: vp[1] }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const S = { sock: null, me: null, acts: [] };
    await pg.routeWebSocket(/\/ws$/, ws => {
      const server = ws.connectToServer();
      ws.onMessage(m => { try{ const j = JSON.parse(m); if(j.t === 'act'){ S.acts.push(j); return; } if(j.t === 'watch') return; }catch(e){} server.send(m); });
      server.onMessage(m => {
        let j; try{ j = JSON.parse(m); }catch(e){ return ws.send(m); }
        if(tok !== TOK) return ws.send(m);
        if(j.t === 'table' || j.t === 'closed') return;
        if(j.t !== 'club') return ws.send(m);
        S.me = j.club.me;
        j.club.tourney = { ...j.club.tourney, status: 'running', name: 'Friday Night', stack: 30000, anteMode: 'bb', regs: [S.me.id], entrants: 9, remaining: 9, level: 2,
          levelEndsAt: Date.now() + 600000, paused: false, places: [], lateOpen: false, helper: false };
        j.club.myTable = 'tpos'; j.club.tables = [{ tid: 'tpos', n: 1, players: 9 }];
        ws.send(JSON.stringify(j)); S.sock = ws;
      });
    });
    await pg.goto(BASE + '/'); await pg.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), tok);
    await pg.reload(); await pg.evaluate(() => document.fonts.ready);
    for(let k = 0; k < 100 && !(S.sock && S.me); k++) await sleep(100);
    return { pg, S };
  };

  for(const vp of SIZES){
    const { pg, S } = await open(vp, TOK);
    const tag0 = vp.join('x');
    for(const [label, allowed, mine] of [['6-handed', [0, 1, 3, 4, 6, 7], 0], ['6-handed, you on seat 4', [0, 1, 3, 4, 6, 7], 4], ['9-handed', [0, 1, 2, 3, 4, 5, 6, 7, 8], 0], ['heads-up', [0, 4], 0]]){
      for(const btn of allowed){
        const pot = allowed.length * 25;
        const T = tableFor(S.me, allowed, mine, btn, pot);
        S.sock.send(JSON.stringify({ t: 'table', table: T.t, you: { hand: T.t.handNo, cards: ['Ah', 'Qd'] } }));
        await pg.waitForFunction(h => { const s = document.querySelectorAll('#seats .seat'); return s.length > 0 && document.querySelector('#seats .dealer'); }, T.t.handNo, { timeout: 8000 }).catch(() => {});
        // the D button glides to its new seat over half a second, and a busy machine can lay out late: measure once
        // two readings in a row agree
        await sleep(600);
        for(let k = 0, prev = ''; k < 20; k++){ const cur = JSON.stringify(await drawn(pg)); if(cur === prev) break; prev = cur; await sleep(150); }
        const m = await drawn(pg), tag = `${tag0} ${label}, button on seat ${btn}`;
        const uidOf = s => T.t.seats[s].uid;
        // clockwise in seat order, starting from your seat at the bottom
        const ang = s => { const q = m.seats.find(x => x.uid === uidOf(s)); return q ? Math.atan2(q.at[1] - m.felt[1], q.at[0] - m.felt[0]) : NaN; };
        const order = allowed.map((_, i) => allowed[(allowed.indexOf(mine) + i) % allowed.length]);
        const a0 = ang(mine), rel = order.map(s => ((ang(s) - a0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI));
        check(rel.every((v, i) => i === 0 || v > rel[i - 1]), `${tag}: seats drawn clockwise in seat order`);
        const sbChip = m.bets.find(b => b.amt === '100'), bbChip = m.bets.find(b => b.amt === '200');
        check(m.dealer && nearest(m.seats, m.dealer) === uidOf(btn), `${tag}: the D button sits nearest the dealer's seat`);
        check(sbChip && nearest(m.seats, sbChip.at) === uidOf(T.sb), `${tag}: the small blind's chips sit nearest the small blind's seat (seat ${T.sb})`);
        check(bbChip && nearest(m.seats, bbChip.at) === uidOf(T.bb), `${tag}: the big blind's chips sit nearest the big blind's seat (seat ${T.bb})`);
        // if it ever fails, print where everything was drawn so the cause can be read off the log
        if(bbChip && nearest(m.seats, bbChip.at) !== uidOf(T.bb)) console.log('  where:', JSON.stringify({ bb: bbChip, seats: m.seats.map(q => [q.uid, q.at.map(Math.round), Math.round(Math.hypot(q.at[0]-bbChip.at[0], q.at[1]-bbChip.at[1]))]), felt: m.felt }));
        const actSeat = m.seats.find(x => x.uid === uidOf(T.acting));
        check(actSeat && !actSeat.badge, `${tag}: the seat whose turn it is shows no old action pill${actSeat && actSeat.badge ? ` ("${actSeat.badge}")` : ''}`);
        if(T.after >= 0 && T.after !== T.sb && T.after !== T.bb && T.after !== btn){ const q = m.seats.find(x => x.uid === uidOf(T.after)); check(q && /Call/.test(q.badge), `${tag}: a seat that isn't acting keeps its pill`); }
        const want = pot + 300;
        check(m.pot.replace(/[^0-9]/g, '') === String(want), `${tag}: the pot reads the whole live pot (${want}, shows "${m.pot}")`);
      }
    }
    // after the bets are swept in (a new street, no bets in front of anyone), the pot doesn't count them twice
    const T = tableFor(S.me, [0, 1, 3, 4, 6, 7], 0, 0, 1350);
    T.t.street = 1; T.t.board = ['2c', '7d', 'Ks']; T.t.cur = 0; T.t.handNo = 99; T.t.seats.forEach(p => { if(p){ p.bet = 0; p.act = ''; } });
    S.sock.send(JSON.stringify({ t: 'table', table: T.t, you: { hand: 99, cards: ['Ah', 'Qd'] } }));
    await sleep(500);
    check((await drawn(pg)).pot.replace(/[^0-9]/g, '') === '1350', `${tag0}: after the bets are swept in the pot is counted once (1350)`);

    // a double tap on Call sends one action; with nothing moving for 4 s the buttons come back
    if(vp[1] > vp[0]){
      const A = tableFor(S.me, [0, 1, 3, 4, 6, 7], 0, 6, 150);
      Object.assign(A.t, { handNo: 120, seq: 7, acting: 0, actUid: S.me.id, legal: { canCheck: false, toCall: 200, canRaise: true, minTo: 400, maxTo: 20000, isBet: false, cur: 200, pot: 450, bb: 200 } });
      S.sock.send(JSON.stringify({ t: 'table', table: A.t, you: { hand: 120, cards: ['Ah', 'Qd'] } }));
      await pg.waitForSelector('#aCall', { timeout: 8000 }).catch(() => {});
      S.acts.length = 0;
      await pg.evaluate(() => { const b = document.getElementById('aCall'); b.click(); b.click(); b.click(); });
      await sleep(300);
      check(S.acts.length === 1, `${tag0}: a triple tap on Call sends one action (${S.acts.length})`);
      await pg.tap('#controls').catch(() => {});
      check(!(await pg.$('#aCall')), `${tag0}: while it's sending, the Call button is gone`);
      await sleep(4200);
      check(!!(await pg.$('#aCall')), `${tag0}: nothing moved for 4 s: the buttons are back to send again`);
      await pg.click('#aCall'); await sleep(200);
      check(S.acts.length === 2 && S.acts[1].seq === 7, `${tag0}: sending again uses the same turn (the server takes only the first)`);
      // the table moves on: the next turn's buttons work as usual
      Object.assign(A.t, { seq: 9 }); S.sock.send(JSON.stringify({ t: 'table', table: A.t, you: { hand: 120, cards: ['Ah', 'Qd'] } }));
      await pg.waitForSelector('#aFold', { timeout: 5000 }).catch(() => {});
      await pg.click('#aFold'); await sleep(200);
      check(S.acts.length === 3 && S.acts[2].seq === 9 && S.acts[2].a.t === 'fold', `${tag0}: the next turn sends its own action`);
    }
    await pg.close();
  }

  // the demo table: the browser runs the real engine; each hand the button, SB and BB are consecutive live seats
  // clockwise, drawn nearest their seats, and the pot is the whole live pot
  {
    const dir = (await api('login', { name: 'Test Director', pin: '246810' })).token;
    const pg = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await pg.goto(BASE + '/'); await pg.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), dir);
    await pg.reload(); await pg.evaluate(() => document.fonts.ready); await sleep(500);
    await pg.click('[data-tab=director]'); await sleep(300);   // (the tab, or under UI_BOARD the top bar's Director button)
    await pg.click('[data-demo]'); await sleep(500);
    // the page's state is private, so this reads the table as drawn: the seats with their SB / BB pills before the
    // blinds act again, the D button and the chips
    const seenD = new Set(); let hands = 0, lastKey = '';
    const until = Date.now() + 150000;
    while(Date.now() < until && seenD.size < 6){
      if(await pg.$('#aFold')) await pg.click('#aFold').catch(() => {}); else if(await pg.$('#aCall')) await pg.click('#aCall').catch(() => {});
      const m = await drawn(pg);
      const sbS = m.seats.find(x => x.badge === 'SB'), bbS = m.seats.find(x => x.badge === 'BB'), hu = m.seats.length === 2;
      if(m.dealer && bbS && (sbS || hu)){
        const dUid = nearest(m.seats, m.dealer), key = dUid + ':' + m.seats.map(x => x.uid).join(',');
        if(key !== lastKey && !seenD.has(dUid)){
          lastKey = key; seenD.add(dUid); hands++;
          // the seats in clockwise order on the screen, from the dealer
          const ang = q => Math.atan2(q.at[1] - m.felt[1], q.at[0] - m.felt[0]);
          const ring = m.seats.slice().sort((p, q) => ang(p) - ang(q)), i = ring.findIndex(q => q.uid === dUid), nx = k => ring[(i + k) % ring.length].uid;
          const tag = `demo 844x390, ${m.seats.length} players, D at ${dUid}`;
          if(hu) check(bbS.uid === nx(1), `${tag}: heads-up, the big blind is the seat after the dealer`);
          else { check(sbS.uid === nx(1), `${tag}: the small blind is the next seat clockwise from the D button`); check(bbS.uid === nx(2), `${tag}: the big blind is the seat after that`); }
          const sbChip = m.bets.find(x => x.amt === '100'), bbChip = m.bets.find(x => x.amt === '200');
          if(sbS && sbChip) check(nearest(m.seats, sbChip.at) === sbS.uid, `${tag}: the small blind's chips sit nearest the small blind`);
          if(bbChip) check(nearest(m.seats, bbChip.at) === bbS.uid, `${tag}: the big blind's chips sit nearest the big blind`);
          const nt = (await pg.textContent('#cNext').catch(() => '')) || '', ante = /^Ante/.test(nt) ? +nt.replace(/[^0-9]/g, '') : NaN;
          const want = ante * m.seats.length + m.bets.reduce((t, x) => t + (+x.amt || 0), 0);
          if(ante === ante) check(m.pot.replace(/[^0-9]/g, '') === String(want), `${tag}: the pot reads the whole live pot (antes ${ante} x ${m.seats.length} + the chips in front = ${want}, shows "${m.pot}")`);
        }
      }
      await sleep(120);
    }
    check(hands >= 4, `demo: checked ${hands} hands with the D button on ${seenD.size} different seats`);
    await pg.close();
  }
  await browser.close();
  console.log(`\n${oks} ok, ${fails.length} failed`);
  srv.kill(); fs.rmSync(DATA, { force: true });
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e.stack || e, '\n' + srvOut); srv.kill(); fs.rmSync(DATA, { force: true }); process.exit(1); });
