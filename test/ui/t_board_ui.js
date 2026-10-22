// The board's UI checks (Issue #32, Step-0 spec §3.6 "t_board_ui"), run with UI_BOARD=1. Phase B1 has no visible
// table change, so this holds what B1 can show, at 390x844, 320x568 and 844x390, on the welcome screen, the lobby and
// a table with your turn up:
//  - the page is the board: html[data-ui="board"], board.css applied, quiet.css not loaded
//  - the §2 tokens are live in the computed styles, and the older --lx-* / --q-* names resolve to them
//  - the page ground and type: --b-bg behind the page, the system face, tabular numbers on stacks and the pot
//  - the Blindrise mark (the app shell) gives way once a screen shows
//  - reduced motion: no press scale, no slide
//  - nothing scrolls sideways
// The spec's later items (button colours and labels "Raise to N" / "Call N", presence dots and the disconnected
// label, the initials fallback, "+" seats not focusable, the ⋯ menu, label contrast in place) are listed at the end as
// PENDING B2+: B2 and later phases fill them in here.
// B3 (the header and the tournament sheet, §4): the card or the pill with Lobby (and Chat sideways), the collapsed bar
// carrying players left and your rank only, the sheet's four tiles with "watching", "Your place" and the sponsor, the
// sponsor intro over the card only, the column beside the table sideways (tiles, sponsor panel, the action row at its
// foot), and the avatar rings (2 px champagne gold at rest, 3 px --b-gold on the player to act).
// PLAYWRIGHT=/path/to/playwright-core CHROMIUM=/path/to/chromium node test/ui/t_board_ui.js   SHOTS=<dir> screenshots
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || process.env.PLAYWRIGHT_CORE || 'playwright');
const ROOT = process.env.ROOT || path.join(__dirname, '..', '..');
const PORT = 5560 + Math.floor(Math.random() * 80), BASE = 'http://localhost:' + PORT;
const DATA = require('os').tmpdir() + '/t_bui_' + process.pid + '.json';
const srv = spawn('node', ['server/index.js'], { cwd: ROOT, env: { ...process.env, UI_BOARD: '1', PORT, NO_BEACON: '1', NO_PUSH: '1', OWNER_CODE: 'secret', DATA_FILE: DATA, FAST: '', STAGING: '1', DATABASE_URL: '' }, stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SHOTS = process.env.SHOTS || '';
const SIZES = (process.env.SIZES || '390x844,320x568,844x390').split(',');
const api = async (p, body) => { const j = await (await fetch(BASE + '/api/' + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })).json(); if(j.error) throw new Error(p + ': ' + j.error); return j; };
const fails = [];
let oks = 0;
const check = (cond, msg) => { if(cond) oks++; console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if(!cond) fails.push(msg); };
// the tokens (the board's sampled values, t_board.js), as the browser reports a custom property's computed value
const TOKENS = { '--b-bg': '#00050c', '--b-surface': '#0b1620', '--b-surface-2': '#111f2b', '--b-felt': '#074c2a', '--b-text': '#f5f6f3', '--b-gold': '#d9a651', '--b-gold-text': '#ebe1b9',
  '--b-live': '#e5484d', '--b-online': '#3fcf6e', '--b-away': '#8a93a3', '--b-warn': '#f0a24a', '--b-fold-top': '#bc2c34', '--b-call-top': '#206ab6', '--b-raise-top': '#ca9a4d', '--b-raise-label': '#1a1206',
  '--b-r-btn': '12px', '--b-r-sheet': '16px', '--b-tap': '44px', '--b-act-h': '60px', '--b-sheet-ease': 'cubic-bezier(.32,.72,0,1)' }; // (--b-press-scale: checked with reduced motion below)
const MAPPED = { '--lx-ink': '#00050c', '--lx-navy': '#0b1620', '--lx-gold': '#d9a651', '--lx-ivory': '#f5f6f3', '--q-gold': '#d9a651', '--q-surface': '#0b1620' };

function tableFor(me){
  const n = 9, seats = Array.from({ length: n }, (_, s) => ({ uid: s ? 'p' + s : me.id, name: s ? 'Player ' + s : me.name, stack: 30000 - s * 1100, inHand: true, bet: s === 1 ? 200 : 0, folded: false, allIn: false, act: '', lastAmt: 0, won: 0, shown: null, cat: '', away: false }));
  // (B2: seat 3 away, seat 5 empty: its "+")
  seats[3].away = true; seats[5] = null;
  return { tid: 'bui', n: 1, phase: 'hand', handNo: 3, street: 0, seats, size: n, allowed: seats.map((p, s) => s), cur: 200, board: [], pot: 300, btn: n - 1, blinds: [100, 200, 0], acting: 0, actUid: me.id, seq: 5,
    deadline: Date.now() + 60000, bank: 60000, usingBank: false, extras: 3, legal: { canCheck: false, toCall: 200, canRaise: true, minTo: 400, maxTo: 30000, isBet: false, cur: 200, pot: 300, bb: 200 }, result: null, note: '' };
}
const look = pg => pg.evaluate(([TOKENS, MAPPED]) => {
  const cs = getComputedStyle(document.documentElement), v = k => cs.getPropertyValue(k).trim();
  const bad = Object.entries({ ...TOKENS, ...MAPPED }).filter(([k, want]) => v(k).toLowerCase() !== want).map(([k, want]) => `${k} ${v(k) || '(none)'} not ${want}`);
  const boot = document.getElementById('br-boot');
  const nums = [...document.querySelectorAll('#game .st, #game .pot, .num')].filter(e => e.getClientRects().length);
  return { ui: document.documentElement.dataset.ui, board: [...document.styleSheets].some(s => /\/board\.css$/.test(s.href || '')), quiet: [...document.styleSheets].some(s => /quiet\.css/.test(s.href || '')),
    bad, bg: getComputedStyle(document.body).backgroundColor, font: getComputedStyle(document.body).fontFamily,
    tab: nums.length ? nums.filter(e => !/tabular-nums/.test(getComputedStyle(e).fontVariantNumeric)).length : -1, nums: nums.length,
    boot: boot ? getComputedStyle(boot).visibility : 'none', press: v('--b-press-scale'), slide: v('--b-slide'),
    scroll: Math.max(document.documentElement.scrollWidth - innerWidth, ...[...document.querySelectorAll('.screen:not([hidden])')].map(s => s.scrollWidth - s.clientWidth)) };
}, [TOKENS, MAPPED]);

// ---------- B2: the table (§3.3-§3.5), in the page ----------
// WCAG contrast of a text colour on an opaque fill, both as the browser computes them
const CONTRAST = `window.P = c => (c.match(/[\\d.]+/g) || []).map(Number); window.L = c => { const v = P(c).slice(0, 3).map(x => { x /= 255; return x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; }); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; };
  window.R = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };`;
async function b2(pg, tag, sock, me, w, h){
  const m = await pg.evaluate(src => { eval(src);
    const btn = id => { const e = document.getElementById(id); if(!e) return null; const cs = getComputedStyle(e), stops = cs.backgroundImage.match(/rgba?\([^)]+\)/g) || [], r = e.getBoundingClientRect();
      return { text: e.textContent.replace(/\s+/g, ' ').trim(), img: cs.backgroundImage, color: cs.color, top: stops[0], ratio: stops[0] ? R(cs.color, stops[0]) : 0, w: r.width, h: r.height }; };
    const seats = [...document.querySelectorAll('#seats .seat.b-seat:not(.hero)')];
    const dots = seats.map(s => (s.querySelector('.b-dot') || {}).className || '');
    const pills = [...document.querySelectorAll('#seats .badge.b-st')].map(b => ({ text: b.textContent.trim(), cls: b.className, ratio: R(getComputedStyle(b).color, getComputedStyle(b).backgroundColor) }));
    const avs = [...document.querySelectorAll('#seats .av')], plus = [...document.querySelectorAll('#seats .empty-seat, #tableArea .empty-seat')];
    const dock = [...document.querySelectorAll('#game .dock button')].filter(b => b.getClientRects().length && !b.disabled).map(b => { const r = b.getBoundingClientRect(); return { id: b.id || b.className, w: r.width, h: r.height }; });
    const xt = document.querySelector('#game .dock .xtime:not(:disabled)');
    return { fold: btn('aFold'), call: btn('aCall'), raise: btn('aRaise'), dots, pills,
      initials: avs.length && avs.every(a => !a.querySelector('img') && !/url\(/.test(getComputedStyle(a).backgroundImage) && a.textContent.trim().length > 0), avs: avs.length,
      plus: plus.map(e => ({ text: e.textContent.trim(), hidden: e.getAttribute('aria-hidden'), tab: e.tabIndex, tag: e.tagName, pe: getComputedStyle(e).pointerEvents })),
      dock, xt: xt ? R(getComputedStyle(xt).color, getComputedStyle(xt).backgroundColor) : 0,
      helper: (h => h ? { ratio: R(getComputedStyle(h).color, getComputedStyle(document.body).backgroundColor) } : null)(document.querySelector('#helper:not([hidden])')) }; }, CONTRAST);
  const rgb = hex => `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
  check(m.fold && m.fold.img.includes(rgb('#bc2c34')) && m.call && m.call.img.includes(rgb('#206ab6')) && m.raise && m.raise.img.includes(rgb('#ca9a4d')) && m.raise.color === rgb('#1a1206'),
    `${tag} B2: Fold red (--b-fold), Call blue (--b-call), Raise gold (--b-raise) with its dark label`);
  check(m.fold && m.fold.text === 'Fold' && m.call && /^Call 200$/.test(m.call.text) && m.raise && /^Raise to [\d,]+$/.test(m.raise.text), `${tag} B2: the labels "${m.fold && m.fold.text}", "${m.call && m.call.text}", "${m.raise && m.raise.text}"`);
  for(const k of ['fold', 'call', 'raise']) if(m[k]) check(m[k].ratio >= 4.5, `${tag} B2: the ${k} label in place, ${m[k].ratio.toFixed(2)}:1 on its top stop (at least 4.5)`);
  check(m.dots.length === 7 && m.dots.filter(c => / away\b/.test(c)).length === 1 && m.dots.filter(c => c === 'b-dot').length === 6, `${tag} B2: a presence dot on every other seat, online (6) and away (1) (${m.dots.join(' / ')})`);
  check(m.pills.some(p => p.text === 'Away' && / away\b/.test(p.cls)), `${tag} B2: the away seat says "Away" in words under its plate`);
  check(m.pills.every(p => p.ratio >= 4.5), `${tag} B2: status labels at least 4.5:1 in place (${m.pills.map(p => p.text + ' ' + p.ratio.toFixed(2)).join(', ')})`);
  check(m.initials, `${tag} B2: every seat shows an initials disc, no photo ("Show my photo" off: Muse amendment 2; ${m.avs} discs)`);
  check(m.plus.length === 1 && m.plus.every(p => p.text === '+' && p.hidden === 'true' && p.tab < 0 && p.tag === 'DIV' && p.pe === 'none'), `${tag} B2: the empty seat is a "+", hidden from screen readers, not focusable, not tappable`);
  const small = m.dock.filter(b => b.w < 44 - .5 || b.h < 44 - .5);
  check(m.dock.length >= 4 && !small.length, `${tag} B2: every dock button at least 44x44 (${m.dock.length})${small.length ? ' — ' + small.map(b => `${b.id} ${Math.round(b.w)}x${Math.round(b.h)}`).join(', ') : ''}`);
  check(m.xt >= 4.5, `${tag} B2: "+30s" ${m.xt.toFixed(2)}:1 in place`);
  check(m.helper && m.helper.ratio >= 4.5, `${tag} B2: the info line (the hand helper) ${m.helper ? m.helper.ratio.toFixed(2) : '?'}:1 on the ground`);
  // ⋯: the table menu
  await pg.click('[data-bmore]'); await sleep(450);
  const menu = await pg.evaluate(() => { const sh = document.getElementById('bSheet'); if(!sh || sh.hidden) return null;
    return { rows: [...sh.querySelectorAll('[data-bm]')].map(b => ({ k: b.dataset.bm, text: b.querySelector('span').textContent, h: b.getBoundingClientRect().height })), dialog: !!sh.querySelector('[role=dialog][aria-modal=true]'), focus: document.activeElement && document.activeElement.dataset.bm }; });
  check(menu && ['chat', 'time', 'helper', 'hands', 'leave', 'close'].every(k => menu.rows.some(r => r.k === k)) && menu.dialog,
    `${tag} B2: "⋯" opens the table menu: ${menu ? menu.rows.map(r => r.text).join(', ') : 'nothing'}`);
  check(menu && menu.rows.every(r => r.h >= 44) && menu.focus === 'chat', `${tag} B2: its rows at least 44 tall, focus on the first`);
  await pg.keyboard.press('Escape'); await sleep(300);
  check(await pg.evaluate(() => { const sh = document.getElementById('bSheet'); return !!sh && sh.hidden && document.activeElement && document.activeElement.hasAttribute('data-bmore'); }), `${tag} B2: Escape closes it, focus back on "⋯"`);
  // someone else to act, disconnected in protection time: their status in words
  const t = tableFor(me); sock.send(JSON.stringify({ t: 'table', table: { ...t, acting: 4, actUid: 'p4', legal: null, dcProtect: true, seq: 9 }, you: { hand: 3, cards: ['Ah', 'Qd'] } }));
  await sleep(700);
  const dc = await pg.evaluate(() => { const s = document.querySelector('#seats .seat.b-seat[data-uid="p4"]'); return s && { pill: (s.querySelector('.badge.b-st.dc') || {}).textContent, dot: (s.querySelector('.b-dot') || {}).className, acting: s.classList.contains('acting'), label: s.getAttribute('aria-label') }; });
  check(dc && dc.pill === 'Disconnected' && / dc\b/.test(dc.dot) && dc.acting && /disconnected/.test(dc.label), `${tag} B2: a disconnected player to act says "Disconnected" in words, with the orange dot (Muse amendment 1)`);
  const idle = await pg.evaluate(() => { const r = document.querySelector('#game .dock .b-acts'), more = document.querySelector('[data-bmore]'); return { row: !!r, more: !!more && more.getBoundingClientRect().width >= 44 }; });
  check(idle.row && idle.more, `${tag} B2: not my turn, the row keeps "⋯"`);
}

// ---------- B3: the header and the tournament sheet (§4), the column sideways, the avatar rings (§3.3) ----------
const FIELD = { players: 32, tables: 4, leader: { name: 'Player 2', stack: 89200, table: 2 }, watchers: 12, rank: 3 };
// the sponsor intro at the table's first look (the start splash): over the header card only, never over the table
async function b3pre(pg, tag){
  // the sponsor intro over the card (the start splash): only over the card, never over the table
  const intro = await pg.evaluate(() => { const s = document.getElementById('spn'), c = document.getElementById('bHud'); if(!s || s.hidden || !c) return null;
    const a = s.getBoundingClientRect(), b = c.getBoundingClientRect(), t = document.getElementById('tableArea').getBoundingClientRect();
    return { text: s.textContent, inCard: a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1, offTable: a.bottom <= t.top + 1 }; });
  check(intro && /Aurora Test Roasters/.test(intro.text) && intro.inCard && intro.offTable, `${tag} B3: the sponsor intro shows at the start, over the header card only (${intro ? intro.inCard + '/' + intro.offTable : 'not shown'})`);
}
async function b3(pg, tag, sock, me, w, h){
  const land = w > h, wide = land && w >= 740, ps = w < 360;
  sock.send(JSON.stringify({ t: 'table', table: { ...tableFor(me), seq: 20 }, you: { hand: 3, cards: ['Ah', 'Qd'] }, field: FIELD }));
  await pg.waitForFunction(() => document.getElementById('spn').hidden, null, { timeout: 12000 }).catch(() => {});
  await sleep(900);
  const m = await pg.evaluate(() => {
    const r = e => { if(!e || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
    const shown = sel => [...document.querySelectorAll(sel)].some(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
    const top = document.getElementById('bTop'), card = document.getElementById('bHud');
    const vis = e => e && e.getClientRects().length > 0;
    const words = [...document.querySelectorAll('#game *')].filter(e => vis(e) && !e.children.length && getComputedStyle(e).visibility !== 'hidden').map(e => e.textContent).join(' ');
    return { top: r(top), card: r(card), cardText: card ? card.innerText.replace(/\s+/g, ' ').trim() : '', lobby: r(document.getElementById('lobbyBtn')), chat: r(document.getElementById('chatBtn')),
      inTop: document.getElementById('lobbyBtn').closest('#bTop') === top, popup: card && card.getAttribute('aria-haspopup'), label: card && card.getAttribute('aria-label'),
      oldHdr: shown('#game>.clock') || shown('#game>.stats'), field: r(document.getElementById('fieldBar')), side: r(document.getElementById('sidePanel')), sideText: document.getElementById('sidePanel').textContent,
      area: r(document.getElementById('tableArea')), ctl: r(document.getElementById('controls')), W: innerWidth, H: innerHeight, col: document.getElementById('game').classList.contains('b-col'), row1: document.getElementById('game').classList.contains('row1'),
      time: (e => e && getComputedStyle(e).color)(document.getElementById('bhTime')), gold: getComputedStyle(document.documentElement).getPropertyValue('--b-gold').trim(),
      sponsorWords: /Aurora Test Roasters/.test(words), seats: [...document.querySelectorAll('#seats .seat.b-seat:not(.hero) .plate, #seats .seat.b-seat:not(.hero) .av')].map(r).filter(Boolean),
      ring: [...document.querySelectorAll('#seats .seat.b-seat:not(.hero):not(.acting) .av.b-av')].map(a => [getComputedStyle(a).borderTopWidth, getComputedStyle(a).borderTopColor]),
      ringAct: [...document.querySelectorAll('#seats .seat.b-seat.acting .av.b-av')].map(a => [getComputedStyle(a).borderTopWidth, getComputedStyle(a).borderTopColor]) };
  });
  check(m.top && m.card && m.inTop && m.popup === 'dialog' && !m.oldHdr, `${tag} B3: the header is the board's: ${land ? 'one pill' : 'one card'} that opens the tournament sheet, the Lobby pill in the same row; today's clock and stats rows are not drawn`);
  check(!land ? Math.abs(m.card.h - (m.row1 ? 44 : 56)) <= 1 && m.lobby.l >= m.card.r && m.lobby.h >= 44 : Math.abs(m.card.h - 30) <= 1 && Math.abs(m.top.h - 35) <= 1, `${tag} B3: ${land ? 'the pill 30 tall, the header 35 (today\'s room: the table keeps its room)' : `the card ${m.row1 ? 44 : 56} tall (${Math.round(m.card.h)}), Lobby to its right, at least 44 tall`}`);
  check(/Level\s*3/.test(m.cardText) && /200\/400/.test(m.cardText) && /32\/48( players)?/.test(m.cardText) && /3rd/.test(m.cardText) && /\d+:\d\d/.test(m.cardText), `${tag} B3: the collapsed bar: level, blinds, the clock, players left and your rank: "${m.cardText}"`);
  check(!/leader|Avg|watching|tables|Aurora/i.test(m.cardText), `${tag} B3: and nothing else of the HUD (players left and your rank only: owner's GO)`);
  check(/32 of 48 players left/.test(m.label) && /Your rank 3rd/.test(m.label), `${tag} B3: the card reads out what it shows: "${m.label}"`);
  if(land){
    check(Math.abs((m.card.l + m.card.r) / 2 - (m.col ? (m.top.l + m.top.r) / 2 : m.W / 2)) <= 2 && m.chat && m.chat.r <= m.card.l && m.chat.l <= 16 && m.lobby.l >= m.card.r && m.lobby.r >= m.W - 16,
      `${tag} B3: sideways the pill is centred, Chat at the top left, Lobby at the top right`);
    check(m.time === `rgb(${[1, 3, 5].map(i => parseInt(m.gold.slice(i, i + 2), 16)).join(', ')})`, `${tag} B3: the clock in the pill is gold (${m.time})`);
  } else check(!m.chat, `${tag} B3: upright, Chat is in "⋯", not in the header`);
  if(wide){
    check(m.col && m.field && m.field.l >= m.area.r - 1 && m.field.r <= m.W + 1, `${tag} B3: sideways, the tournament tiles stand in the column beside the table`);
    check(m.side && m.side.l >= m.area.r - 1 && /Aurora Test Roasters/.test(m.sideText) && /Prize: Coffee for a month/.test(m.sideText), `${tag} B3: the sponsor panel and the prize under them (owner's requirement)`);
    check(m.ctl && m.ctl.l >= m.area.r - 1 && Math.abs(m.ctl.b - m.H) <= 2, `${tag} B3: the action row at the column's foot, on the screen's bottom edge`);
    check(m.seats.length && m.seats.every(s => s.r <= m.area.r + 1 && s.l >= -1), `${tag} B3: every seat stays left of the column`);
  } else if(!land) check(!m.sponsorWords && !m.field, `${tag} B3: during the hand no sponsor on the table screen and no HUD bar (the sponsor is in the sheet)`);
  // the avatar rings (§3.3): champagne gold at rest, 2 px; the player to act 3 px --b-gold
  check(m.ring.length && m.ring.every(([bw, c]) => bw === '2px' && (n => n.length >= 3 && n[0] + n[1] + n[2] > 1.2 && (n[3] == null || n[3] >= .5))((c.match(/[\d.]+/g) || []).map(Number).map((x, i, a) => /^rgb/.test(c) && i < 3 ? x / 255 : x))), `${tag} B3: every initials disc has its 2 px gold ring at rest (${m.ring[0] && m.ring[0][1]})`);
  // (my turn here: no other seat is acting; the ring of the acting player is checked in the B2 disconnected case above, sent again)
  // the sheet
  await pg.click('#bHud'); await sleep(600);
  const s = await pg.evaluate(() => { const sh = document.getElementById('bHudSheet'); if(!sh || sh.hidden) return null;
    const tiles = [...sh.querySelectorAll('.b-tile')].map(t => ({ k: t.querySelector('small').textContent, v: t.textContent.replace(/\s+/g, ' ').trim(), top: t.getBoundingClientRect().top }));
    return { tiles, dialog: !!sh.querySelector('[role=dialog][aria-modal=true]'), place: (sh.querySelector('.b-place') || {}).textContent || '', pres: (sh.querySelector('.b-pres') || {}).textContent || '',
      tap: !!sh.querySelector('.b-pres [data-spbiz]'), focus: document.activeElement && document.activeElement.hasAttribute('data-bhclose'), head: sh.querySelector('.bs-head').textContent.replace(/\s+/g, ' ') }; });
  check(s && s.dialog && s.tiles.map(t => t.k).join('|') === 'Avg stack|Chip leader|Active tables|Spectators', `${tag} B3: a tap opens the sheet with the board's four tiles: ${s ? s.tiles.map(t => t.k).join(', ') : 'no sheet'}`);
  check(s && /Player 2/.test(s.tiles[1].v) && /89,200/.test(s.tiles[1].v) && /4/.test(s.tiles[2].v) && /12 watching/.test(s.tiles[3].v), `${tag} B3: the chip leader with chips, the tables, and "12 watching" (${s ? s.tiles.map(t => t.v).join(' / ') : ''})`);
  check(s && (land ? new Set(s.tiles.map(t => Math.round(t.top))).size === 1 : new Set(s.tiles.map(t => Math.round(t.top))).size === 2), `${tag} B3: the tiles ${land ? 'four across' : 'two by two'}`);
  check(s && /Your place\s*3rd of 32/.test(s.place) && /(above|below|about) average/.test(s.place), `${tag} B3: then "Your place": ${s ? s.place.replace(/\s+/g, ' ') : ''}`);
  check(s && /Presented by\s*Aurora Test Roasters/.test(s.pres) && /Prize: Coffee for a month/.test(s.pres), `${tag} B3: then "Presented by" the sponsor, with the prize`);
  check(s && s.focus, `${tag} B3: focus on Done`);
  if(SHOTS) await pg.screenshot({ path: path.join(SHOTS, `b3-sheet-${tag.replace(/ /g, '-')}.png`) });
  await pg.keyboard.press('Escape'); await sleep(300);
  check(await pg.evaluate(() => document.getElementById('bHudSheet').hidden && document.activeElement && document.activeElement.id === 'bHud'), `${tag} B3: Escape closes it, focus back on the card`);
  // the player to act: a 3 px --b-gold ring
  sock.send(JSON.stringify({ t: 'table', table: { ...tableFor(me), acting: 2, actUid: 'p2', legal: null, seq: 21 }, you: { hand: 3, cards: ['Ah', 'Qd'] }, field: FIELD })); await sleep(600);
  const act = await pg.evaluate(() => [...document.querySelectorAll('#seats .seat.b-seat.acting .av.b-av')].map(a => [getComputedStyle(a).borderTopWidth, getComputedStyle(a).borderTopColor]));
  check(act.length === 1 && act[0][0] === '3px' && act[0][1] === 'rgb(217, 166, 81)', `${tag} B3: the player to act has the 3 px --b-gold ring (${act.map(a => a.join(' ')).join(', ')})`);
  // the break: the sponsor's spotlight on the felt, between hands
  if(SHOTS) await pg.screenshot({ path: path.join(SHOTS, `b3-table-${tag.replace(/ /g, '-')}.png`) });
}

(async () => {
  for(let i = 0; i < 60; i++){ try{ await fetch(BASE + '/health'); break; }catch(e){ await sleep(150); } }
  await sleep(400);
  const TOK = (await api('login', { name: 'Test Player 07', pin: '135777' })).token;
  if(SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  for(const size of SIZES){
    const [w, h] = size.split('x').map(Number);
    for(const motion of ['no-preference', 'reduce']){
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: motion });
      const pg = await ctx.newPage();
      await pg.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => r.abort());
      let sock = null, me = null;
      await pg.routeWebSocket(/\/ws$/, ws => {
        const server = ws.connectToServer();
        ws.onMessage(m => { try{ const j = JSON.parse(m); if(j.t === 'watch' || j.t === 'act') return; }catch(e){} server.send(m); });
        server.onMessage(m => { let j; try{ j = JSON.parse(m); }catch(e){ return ws.send(m); }
          if(j.t === 'table' || j.t === 'closed') return;
          if(j.t === 'club' && sock === 'table'){ me = j.club.me; j.club.tourney = { ...j.club.tourney, status: 'running', name: 'Friday Night', stack: 30000, anteMode: 'bb', regs: [me.id], entrants: 9, remaining: 9, level: 2, levelEndsAt: Date.now() + 600000, paused: false, places: [], lateOpen: false, helper: true,
            id: 'tbui', entrants: 48, remaining: 32, sponsor: { uid: 'u00000000005a', name: 'Aurora Test Roasters', categoryLabel: 'Food & drink', area: 'Toronto', logoV: null }, sponsorSec: 8, prize: 'Coffee for a month' };
            j.club.myTable = 'bui'; j.club.tables = [{ tid: 'bui', n: 1, players: 9 }]; sock = ws; }
          ws.send(JSON.stringify(j)); });
      });
      const tag = `${size}${motion === 'reduce' ? ' reduced motion' : ''}`;
      // signed out: the welcome screen
      await pg.goto(BASE + '/'); await pg.waitForSelector('.screen:not([hidden])', { timeout: 10000 }).catch(() => {}); await sleep(600);
      let L = await look(pg);
      check(L.ui === 'board' && L.board && !L.quiet, `${tag} welcome: html[data-ui="board"], board.css applied, no quiet.css`);
      check(!L.bad.length, `${tag} welcome: the §2 tokens and the mapped --lx-* / --q-* names are live in the computed styles${L.bad.length ? ' — ' + L.bad.join('; ') : ''}`);
      check(L.bg === 'rgb(0, 5, 12)' && /^-apple-system/.test(L.font), `${tag} welcome: --b-bg behind the page and the system face (${L.bg}; ${L.font.slice(0, 40)})`);
      check(L.boot === 'hidden', `${tag} welcome: the Blindrise mark has given way to the screen`);
      check(motion === 'reduce' ? L.press === '1' && L.slide === '0' : L.press === '.97' && L.slide === '1', `${tag}: press scale ${L.press}, slide ${L.slide}${motion === 'reduce' ? ' (no scale, no slide)' : ''}`);
      check(L.scroll <= 0, `${tag} welcome: nothing scrolls sideways (${L.scroll})`);
      if(SHOTS && motion !== 'reduce') await pg.screenshot({ path: path.join(SHOTS, `welcome-${size}.png`) });
      // signed in: the lobby
      await pg.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), TOK);
      await pg.reload(); await pg.waitForSelector('#lobby:not([hidden])', { timeout: 10000 }).catch(() => {}); await sleep(800);
      L = await look(pg);
      check(L.ui === 'board' && !L.bad.length && L.boot === 'hidden', `${tag} lobby: the board, tokens live, the mark gone${L.bad.length ? ' — ' + L.bad.join('; ') : ''}`);
      check(L.scroll <= 0, `${tag} lobby: nothing scrolls sideways (${L.scroll})`);
      if(SHOTS && motion !== 'reduce') await pg.screenshot({ path: path.join(SHOTS, `lobby-${size}.png`) });
      // a table, your turn
      sock = 'table'; await pg.reload();
      for(let k = 0; k < 100 && (!sock || sock === 'table'); k++) await sleep(100);
      if(sock && sock !== 'table'){ sock.send(JSON.stringify({ t: 'table', table: tableFor(me), you: { hand: 3, cards: ['Ah', 'Qd'] } }));
        await pg.waitForSelector('#aRaise', { timeout: 8000 }).catch(() => {}); await sleep(700); }
      L = await look(pg);
      check(await pg.evaluate(() => !!document.querySelector('#game:not([hidden]) #aRaise')), `${tag} table: the table is up with your turn`);
      check(L.nums > 0 && L.tab === 0, `${tag} table: tabular numbers on every stack and the pot (${L.nums} checked)`);
      check(L.scroll <= 0, `${tag} table: nothing scrolls sideways (${L.scroll})`);
      if(SHOTS && motion !== 'reduce') await pg.screenshot({ path: path.join(SHOTS, `table-${size}.png`) });
      if(motion !== 'reduce' && sock && sock !== 'table'){ await b3pre(pg, tag); await b2(pg, tag, sock, me, w, h); await b3(pg, tag, sock, me, w, h); }
      await ctx.close();
    }
  }
  await browser.close();
  for(const p of ['B8 reduced motion on the sheets and seats'])
    console.log(`PENDING B8 (not run) ${p}`);
  console.log(`\n${oks} ok, ${fails.length} failed`);
  srv.kill(); fs.rmSync(DATA, { force: true });
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e.stack || e); srv.kill(); fs.rmSync(DATA, { force: true }); process.exit(1); });
