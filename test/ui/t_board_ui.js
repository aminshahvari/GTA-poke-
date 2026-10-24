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
const SIZES = (process.env.SIZES != null ? process.env.SIZES : '390x844,320x568,844x390').split(',').filter(Boolean);
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
    return { watch: (e => e && e.getClientRects().length ? e.textContent : '')(document.getElementById('bWatch')), top: r(top), card: r(card), cardText: card ? card.innerText.replace(/\s+/g, ' ').trim() : '', lobby: r(document.getElementById('lobbyBtn')), chat: r(document.getElementById('chatBtn')),
      inTop: document.getElementById('lobbyBtn').closest('#bTop') === top, popup: card && card.getAttribute('aria-haspopup'), label: card && card.getAttribute('aria-label'),
      oldHdr: shown('#game>.clock') || shown('#game>.stats'), field: r(document.getElementById('fieldBar')), side: r(document.getElementById('sidePanel')), sideText: document.getElementById('sidePanel').textContent,
      area: r(document.getElementById('tableArea')), ctl: r(document.getElementById('controls')), W: innerWidth, H: innerHeight, col: document.getElementById('game').classList.contains('b-col'), row1: document.getElementById('game').classList.contains('row1'),
      time: (e => e && getComputedStyle(e).color)(document.getElementById('bhTime')), gold: getComputedStyle(document.documentElement).getPropertyValue('--b-gold').trim(),
      sponsorWords: /Aurora Test Roasters/.test(words), seats: [...document.querySelectorAll('#seats .seat.b-seat:not(.hero) .plate, #seats .seat.b-seat:not(.hero) .av')].map(r).filter(Boolean),
      // (as sRGB: the ring is an oklab mix, which the browser reports as oklab())
      ring: [...document.querySelectorAll('#seats .seat.b-seat:not(.hero):not(.acting) .av.b-av')].map(a => [getComputedStyle(a).borderTopWidth, (c => { const x = document.createElement('canvas').getContext('2d'); x.fillStyle = c; x.fillRect(0, 0, 1, 1); const d = x.getImageData(0, 0, 1, 1).data; return `rgba(${d[0]}, ${d[1]}, ${d[2]}, ${d[3] / 255})`; })(getComputedStyle(a).borderTopColor)]),
      ringAct: [...document.querySelectorAll('#seats .seat.b-seat.acting .av.b-av')].map(a => [getComputedStyle(a).borderTopWidth, getComputedStyle(a).borderTopColor]) };
  });
  check(m.top && m.card && m.inTop && m.popup === 'dialog' && !m.oldHdr, `${tag} B3: the header is the board's: ${land ? 'one pill' : 'one card'} that opens the tournament sheet, the Lobby pill in the same row; today's clock and stats rows are not drawn`);
  check(!land ? Math.abs(m.card.h - (m.row1 ? 44 : 56)) <= 1 && m.lobby.l >= m.card.r && m.lobby.h >= (m.row1 ? 32 : 44) : Math.abs(m.card.h - 30) <= 1 && Math.abs(m.top.h - 35) <= 1, `${tag} B3: ${land ? 'the pill 30 tall, the header 35 (today\'s room: the table keeps its room)' : `the card ${m.row1 ? 44 : 56} tall (${Math.round(m.card.h)}), Lobby to its right, at least ${m.row1 ? '32 tall (its hit area 44: "N watching" under it, Issue #32 item 11)' : '44 tall'}`}`);
  check(/Level\s*3/.test(m.cardText) && /200\/400/.test(m.cardText) && /32\/48( players)?/.test(m.cardText) && /3rd/.test(m.cardText) && /\d+:\d\d/.test(m.cardText), `${tag} B3: the collapsed bar: level, blinds, the clock, players left and your rank: "${m.cardText}"`);
  check(!/leader|Avg|tables|Aurora/i.test(m.cardText), `${tag} B3: and nothing else of the HUD (players left, your rank and, owner's ruling of Issue #32 item 11, "N watching")`);
  check(land ? /12 watching/.test(m.cardText) : m.watch === '12 watching', `${tag} B3: "12 watching" ${land ? 'in the pill' : 'under Lobby'} (${land ? m.cardText : m.watch})`);
  check(/32 of 48 players left/.test(m.label) && /Your rank 3rd/.test(m.label), `${tag} B3: the card reads out what it shows: "${m.label}"`);
  // (owner, 2026-10-23: nothing said the card could be tapped) a quiet gold "›" at its right edge, whole inside it, past
  // the clock, hidden from screen readers (the card's label says it opens the tournament details)
  const go = await pg.evaluate(() => { const c = document.getElementById('bHud'), g = c && c.querySelector('.bh-go'); if(!g || !g.getClientRects().length) return null;
    const a = g.getBoundingClientRect(), b = c.getBoundingClientRect(), t = document.getElementById('bhTime').getBoundingClientRect(), cs = getComputedStyle(g);
    return { text: g.textContent, hidden: g.getAttribute('aria-hidden'), inside: a.left >= b.left && a.right <= b.right - 4 && a.top >= b.top && a.bottom <= b.bottom, past: a.left >= t.right - .5, color: cs.color,
      gold: getComputedStyle(document.documentElement).getPropertyValue('--b-gold').trim(), over: c.scrollWidth - c.clientWidth, label: c.getAttribute('aria-label') }; });
  check(go && go.text === '›' && go.hidden === 'true' && go.inside && go.past && go.over <= 1, `${tag} B3: a "›" at the card's right edge says it opens (inside ${go && go.inside}, past the clock ${go && go.past}, overflow ${go && go.over})`);
  check(go && /^rgb\(217, 166, 81\)$/.test(go.color.replace(/rgba\((\d+), (\d+), (\d+), 1\)/, 'rgb($1, $2, $3)')) && /Opens the tournament details\.$/.test(go.label), `${tag} B3: the "›" in --b-gold (${go && go.color}), the card's label ends "Opens the tournament details."`);
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

// ---------- the turn (the owner's iPhone, 2026-10-22): turning the phone mid-hand lays the table out anew ----------
// The page after a turn must match a fresh load at that size (within a few px): the header and the felt span the new
// width, the column beside the table at 740 px wide or more, nothing past the screen's edge. Also with the screen's
// size reported late, as iPhone Safari does: innerWidth and innerHeight keep the old shape after the page has turned.
const FRESH = {};
const shape = pg => pg.evaluate(() => {
  const r = e => { if(!e || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
  const W = document.documentElement.clientWidth, g = document.getElementById('game');
  const past = [...document.querySelectorAll('#game *')].filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden').map(e => [e, e.getBoundingClientRect()])
    .filter(([e, b]) => b.width && (b.right > W + 1 || b.left < -1)).map(([e]) => e.id || e.className).slice(0, 4);
  return { W, game: r(g), top: r(document.getElementById('bTop')), card: r(document.getElementById('bHud')), area: r(document.getElementById('tableArea')), felt: r(document.querySelector('#tableArea .felt')),
    dock: r(document.getElementById('dock')), land: g.classList.contains('land'), col: g.classList.contains('b-col'), past, scroll: document.documentElement.scrollWidth - W };
});
const near = (a, b, px = 3) => !!a && !!b && ['l', 't', 'r', 'b'].every(k => Math.abs(a[k] - b[k]) <= px);
const STALE = `(() => { const pw = Object.getOwnPropertyDescriptor(Window.prototype, 'innerWidth') || Object.getOwnPropertyDescriptor(window, 'innerWidth'), ph = Object.getOwnPropertyDescriptor(Window.prototype, 'innerHeight') || Object.getOwnPropertyDescriptor(window, 'innerHeight');
  window.__stale = [innerWidth, innerHeight];
  Object.defineProperty(window, 'innerWidth', { configurable: true, get(){ return window.__stale ? window.__stale[0] : pw.get.call(window); } });
  Object.defineProperty(window, 'innerHeight', { configurable: true, get(){ return window.__stale ? window.__stale[1] : ph.get.call(window); } }); })()`;
async function turn(pg, tag, w, h, late){
  if(late) await pg.evaluate(STALE);
  const t0 = Date.now(); await pg.setViewportSize({ width: w, height: h });
  // (the first frame after the turn comes promptly: no long layout work stalls the page)
  await pg.evaluate(() => new Promise(r => requestAnimationFrame(() => r()))); const frame = Date.now() - t0;
  await sleep(late ? 1500 : 1200);
  const m = await shape(pg), f = FRESH[`${w}x${h}`], name = `${tag} turned to ${w}x${h}${late ? ' (size reported late)' : ''}`;
  if(late) await pg.evaluate(() => { window.__stale = null; });
  check(frame < 1000, `${name}: the first frame after the turn within a second (${frame} ms)`);
  check(!m.past.length && m.scroll <= 0, `${name}: nothing past the screen's edge${m.past.length ? ': ' + m.past.join(', ') : ''}`);
  check(m.land === (w > h) && m.col === (w > h && w >= 740), `${name}: laid out ${w > h ? 'sideways' : 'upright'}${w > h && w >= 740 ? ', the column beside the table' : ''} (land ${m.land}, column ${m.col})`);
  check(m.game && Math.abs(m.game.l) <= 1 && Math.abs(m.game.r - w) <= 1 && m.top && Math.abs(m.top.r - m.top.l - w) <= 1, `${name}: the screen and the header span the whole width (${m.game && Math.round(m.game.r - m.game.l)}, ${m.top && Math.round(m.top.r - m.top.l)})`);
  if(f) check(near(m.top, f.top) && near(m.card, f.card) && near(m.area, f.area) && near(m.felt, f.felt) && near(m.dock, f.dock),
    `${name}: the header, the card, the table area, the felt and the dock as in a fresh load at that size (felt ${JSON.stringify(m.felt)} / ${JSON.stringify(f.felt)})`);
  if(SHOTS) await pg.screenshot({ path: path.join(SHOTS, `turn-${tag.replace(/ /g, '-')}-to-${w}x${h}${late ? '-late' : ''}.png`) });
  return m;
}

// ---------- the raise sizing on a short sideways iPhone (the owner's iPhone, 2026-10-22) ----------
// In a real tournament (bots that check or call), at 667x320, 700x330, 568x320 and 844x390 in an iPhone-like context:
// my turn, Raise opens the sizing, then +, −, the presets tapped quickly (twice, and double-tapped). Then: nothing scrolls
// sideways, the page is exactly the screen's width, every sizing control and the Raise / Back buttons whole on the
// screen, no zoom (visualViewport.scale 1), touch-action: manipulation on the controls (no double-tap zoom on iPhone
// Safari), no input under 16 px (iPhone Safari zooms into those on focus). Also the "⋯" menu on my turn there.
const RAISE_SIZES = (process.env.RAISE_SIZES || '667x320,700x330,568x320,844x390').split(',').filter(Boolean);
const RAISE_SHOTS = process.env.RAISE_SHOTS || SHOTS;
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
function wsBot(tok){
  const WebSocket = require(path.join(ROOT, 'node_modules', 'ws'));
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`), c = { ws, send: o => ws.send(JSON.stringify(o)) };
  ws.on('open', () => c.send({ t: 'hello', token: tok, device: 'bot' + Math.random() }));
  ws.on('message', raw => { const m = JSON.parse(raw);
    if(m.t === 'club'){ c.club = m.club; c.id = m.club.me.id; }
    if(m.t !== 'table') return; const tb = m.table;
    if(tb.actUid === c.id && tb.legal && c.last !== tb.tid + tb.seq){ c.last = tb.tid + tb.seq; const L = tb.legal; setTimeout(() => c.send({ t: 'act', tid: tb.tid, hand: tb.handNo, seq: tb.seq, a: L.canCheck ? { t: 'check' } : { t: 'call' } }), 30); } });
  return new Promise(r => { const t = setInterval(() => { if(c.club){ clearInterval(t); r(c); } }, 30); });
}
const raiseLook = pg => pg.evaluate(() => {
  const W = innerWidth, H = innerHeight, de = document.documentElement;
  const r = e => { const b = e.getBoundingClientRect(); return { id: e.id || e.dataset.to || e.className, l: b.left, t: b.top, r: b.right, b: b.bottom }; };
  const ctl = [...document.querySelectorAll('#controls .sz-presets button, #controls #minus, #controls #plus, #controls #raiseRange, #controls #szGo, #controls #szBack')].filter(e => e.getClientRects().length);
  const out = ctl.map(r).filter(b => b.l < -.5 || b.t < -.5 || b.r > W + .5 || b.b > H + .5);
  const ta = [...document.querySelectorAll('#game, #controls, #controls button, #controls input')].filter(e => e.getClientRects().length).map(e => [e.id || e.className, getComputedStyle(e).touchAction]).filter(([, t]) => !/manipulation|none|pan-x pan-y pinch-zoom/.test(t));
  const small = [...document.querySelectorAll('input, select, textarea')].filter(e => e.getClientRects().length && parseFloat(getComputedStyle(e).fontSize) < 16).map(e => (e.id || e.name || e.type) + ' ' + getComputedStyle(e).fontSize);
  const vv = window.visualViewport;
  return { W, H, docW: de.scrollWidth, cw: de.clientWidth, bodyW: document.body.scrollWidth, scrollX, scrollY, docH: de.scrollHeight, scale: vv ? vv.scale : 1, vvw: vv ? vv.width : W,
    n: ctl.length, sizing: !!document.querySelector('#controls .b-sizing'), out, ta, small, meta: (document.querySelector('meta[name=viewport]') || {}).content };
});
async function raiseCase(browser, tok, w, h, phase){
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, screen: { width: Math.max(w, h), height: Math.min(w, h) }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: IPHONE_UA });
  const pg = await ctx.newPage(), tag = `${w}x${h} real tournament`;
  await pg.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => r.abort());
  await pg.goto(BASE + '/'); await pg.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), tok); await pg.reload();
  // my turn with a raise open to me (the bots only check or call)
  const up = await pg.waitForFunction(() => { const b = document.querySelector('#game:not([hidden]) #aRaise'); return b && !b.disabled; }, null, { timeout: 90000 }).then(() => true, () => false);
  check(up, `${tag}: my turn comes, with Raise`);
  if(!up){ await ctx.close(); return; }
  await sleep(300);
  await pg.tap('#aRaise'); await sleep(250);
  // (in the column beside the table − and + give the slider their room: there the quick taps are on the presets only)
  const steps = await pg.isVisible('#plus');
  const T = async sel => { await pg.tap(sel); await sleep(60); };
  // quick taps: + + − −, every preset twice, then double clicks (a double tap)
  if(steps) for(const s of ['#plus', '#plus', '#minus', '#minus', '#plus']) await T(s);
  for(const b of await pg.$$('#controls .sz-presets button')){ await b.tap(); await sleep(40); await b.tap(); await sleep(40); }
  if(steps){ await pg.dblclick('#plus'); await pg.dblclick('#minus'); }
  await pg.dblclick('#controls .sz-presets button');
  await sleep(300);
  const m = await raiseLook(pg);
  if(RAISE_SHOTS) await pg.screenshot({ path: path.join(RAISE_SHOTS, `raise-${phase}-${w}x${h}.png`) });
  check(m.sizing && m.n >= 7, `${tag}: the sizing is open (${m.n} controls)`);
  check(m.docW === m.W && m.cw === m.W && m.bodyW <= m.W && m.scrollX === 0, `${tag}: no sideways scroll, the page exactly the screen's width (page ${m.docW}, body ${m.bodyW}, screen ${m.W}, scrolled ${m.scrollX})`);
  check(m.docH <= m.H && m.scrollY === 0, `${tag}: nothing below the screen (page ${m.docH} tall, screen ${m.H})`);
  check(!m.out.length, `${tag}: every sizing control, Raise and Back whole on the screen${m.out.length ? ': ' + m.out.map(o => `${o.id} ${Math.round(o.l)},${Math.round(o.t)}-${Math.round(o.r)},${Math.round(o.b)}`).join('; ') : ''}`);
  check(m.scale === 1 && Math.abs(m.vvw - m.W) <= .5, `${tag}: no zoom after the quick taps (visualViewport.scale ${m.scale}, width ${m.vvw})`);
  check(!m.ta.length, `${tag}: touch-action: manipulation on the table and its controls (no double-tap zoom)${m.ta.length ? ': ' + m.ta.map(x => x.join(' ')).join(', ') : ''}`);
  check(!m.small.length, `${tag}: no input under 16 px (iPhone Safari zooms into those)${m.small.length ? ': ' + m.small.join(', ') : ''}`);
  check(/width=device-width/.test(m.meta) && /initial-scale=1/.test(m.meta), `${tag}: the viewport meta "${m.meta}"`);
  // the "⋯" menu on my turn: Chat, Add 30 seconds, Hand helper, Hand history, Leave table, Close
  await pg.tap('#szBack'); await sleep(200);
  await pg.tap('[data-bmore]'); await sleep(450);
  const menu = await pg.evaluate(() => { const sh = document.getElementById('bSheet'); if(!sh || sh.hidden) return null;
    const H = innerHeight; return [...sh.querySelectorAll('[data-bm]')].map(b => { const r = b.getBoundingClientRect(); return { k: b.dataset.bm, inside: r.top >= -.5 && r.bottom <= H + .5 }; }); });
  check(menu && ['chat', 'time', 'helper', 'hands', 'leave', 'close'].every(k => menu.some(x => x.k === k)), `${tag}: "⋯" on my turn: ${menu ? menu.map(x => x.k).join(', ') : 'nothing'}`);
  check(menu && menu.every(x => x.inside), `${tag}: every menu row whole on the screen${menu ? ': ' + menu.filter(x => !x.inside).map(x => x.k).join(', ') : ''}`);
  if(RAISE_SHOTS) await pg.screenshot({ path: path.join(RAISE_SHOTS, `menu-${phase}-${w}x${h}.png`) });
  await pg.keyboard.press('Escape'); await sleep(150);
  // let play go on: fold (or check)
  await pg.evaluate(() => { const b = document.getElementById('aFold') || document.getElementById('aCall'); if(b) b.click(); });
  await sleep(300); await ctx.close();
}
async function raiseSuite(browser){
  if(!RAISE_SIZES.length) return;
  if(RAISE_SHOTS) fs.mkdirSync(RAISE_SHOTS, { recursive: true });
  const L = n => api('login', { name: 'Test Player 0' + n, pin: '1357' + String(n).repeat(2) });
  const dir = await api('login', { name: 'Test Director', pin: '246810' }), me = await L(1);
  const d = await wsBot(dir.token), bots = [d, await wsBot((await L(2)).token), await wsBot((await L(3)).token), await wsBot((await L(4)).token)];
  d.send({ t: 'create', name: 'Raise Night', stack: 30000, levelMin: 20, lateLevels: 0 });
  for(let i = 0; i < 50 && !(d.club.tourney && d.club.tourney.status === 'registering'); i++) await sleep(100);
  const mine = await wsBot(me.token); mine.send({ t: 'join' }); bots.forEach(b => b.send({ t: 'join' })); await sleep(600);
  d.send({ t: 'start' });
  for(let i = 0; i < 50 && d.club.tourney.status !== 'running'; i++) await sleep(100);
  check(d.club.tourney.status === 'running', 'raise: a real tournament is running (4 bots and me)');
  mine.ws.close();
  for(const s of RAISE_SIZES){ const [w, h] = s.split('x').map(Number); await raiseCase(browser, me.token, w, h, process.env.RAISE_PHASE || 'after'); }
  bots.forEach(b => b.ws.close());
}

// ---------- sideways under 740 wide (the owner's iPhone, 2026-10-23): the narrow column, your cards, the info line,
// the dock with the home-screen inset, the gold rings ----------
// A fixture table (fake data) with the sponsor: at 667x320 and 700x330 the narrow column right of the table holds the
// four tiles and the sponsor ("Presented by", the name, the logo or initials); at 568x320 no column (the nine seats need
// the width). Your two cards smaller and inside the rail. The info line centred. Every dock control whole on the screen,
// in Safari (no inset) and from the Home Screen (the bottom inset 21 px sideways, 34 px upright), the action row and the
// sizing; the inset counted once (the row no more than the inset and the dock's own 6-12 px above the screen's foot).
// The initials' ring at rest an opaque gold 2 px, at least 3:1 on the felt and the ground; the player to act 3 px --b-gold.
const NCOL = (process.env.NCOL_SIZES || '667x320,700x330,568x320').split(',').filter(Boolean);
const INSETS = [['844x390', 21], ['667x320', 21], ['700x330', 21], ['390x844', 34], ['667x320', 0], ['390x844', 0]];
async function fixturePage(browser, TOK, w, h, { sa = 0, sponsor = true, legal = true, helperOff = false, field = FIELD } = {}){
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: IPHONE_UA });
  const pg = await ctx.newPage();
  // (Chromium can't emulate the home-screen inset: the page's --sa-b, env(safe-area-inset-bottom) by default, is set)
  if(helperOff) await pg.addInitScript(() => { try{ localStorage.setItem('stacked:helper-board', 'off'); }catch(e){} });
  if(sa) await pg.addInitScript(b => { const put = () => { const st = document.createElement('style'); st.textContent = `:root{--sa-b:${b}px}`; document.body.appendChild(st); };
    if(document.readyState !== 'loading') put(); else document.addEventListener('DOMContentLoaded', put); }, sa);
  await pg.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => r.abort());
  let sock = null, me = null; const acts = [];
  await pg.routeWebSocket(/\/ws$/, ws => {
    const server = ws.connectToServer();
    ws.onMessage(m => { try{ const j = JSON.parse(m); if(j.t === 'act') acts.push(j); if(j.t === 'watch' || j.t === 'act') return; }catch(e){} server.send(m); });
    server.onMessage(m => { let j; try{ j = JSON.parse(m); }catch(e){ return ws.send(m); }
      if(j.t === 'table' || j.t === 'closed') return;
      if(j.t === 'club' && sock === 'table'){ me = j.club.me; j.club.tourney = { ...j.club.tourney, status: 'running', name: 'Friday Night', stack: 30000, anteMode: 'bb', regs: [me.id], level: 2, levelEndsAt: Date.now() + 600000, paused: false, places: [], lateOpen: false, helper: true,
          id: 'tnc', entrants: 48, remaining: 32, ...(sponsor ? { sponsor: { uid: 'u00000000005a', name: 'Aurora Test Roasters', categoryLabel: 'Food & drink', area: 'Toronto', logoV: null }, sponsorSec: 1, prize: 'Coffee for a month' } : {}) };
        j.club.myTable = 'bui'; j.club.tables = [{ tid: 'bui', n: 1, players: 9 }]; sock = ws; }
      ws.send(JSON.stringify(j)); });
  });
  await pg.goto(BASE + '/'); await pg.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), TOK);
  sock = 'table'; await pg.reload();
  for(let k = 0; k < 100 && (!sock || sock === 'table'); k++) await sleep(100);
  const t = tableFor(me); if(!legal) Object.assign(t, { acting: 2, actUid: 'p2', legal: null });
  sock.send(JSON.stringify({ t: 'table', table: { ...t, street: 1, board: ['Ts', 'Jh', 'Qc'] }, you: { hand: 3, cards: ['Ah', 'Qd'] }, ...(field ? { field } : {}) }));
  await pg.waitForFunction(() => document.getElementById('spn').hidden, null, { timeout: 8000 }).catch(() => {});
  await sleep(900);
  return { ctx, pg, sock, me, acts };
}
const dockIn = pg => pg.evaluate(() => {
  const H = innerHeight, W = innerWidth, sa = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sa-b')) || 0;
  const els = [...document.querySelectorAll('#dock button, #dock input')].filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
  const rs = els.map(e => { const b = e.getBoundingClientRect(); return { id: e.id || e.dataset.to || e.className, l: b.left, t: b.top, r: b.right, b: b.bottom }; });
  const row = rs.filter(r => /aFold|aCall|aRaise|szGo|szBack|b-more/.test(r.id));
  return { sa, H, out: rs.filter(r => r.l < -.5 || r.t < -.5 || r.r > W + .5 || r.b > H + .5), gap: row.length ? H - Math.max(...row.map(r => r.b)) : -1, n: rs.length,
    scroll: document.documentElement.scrollWidth - W, tall: document.documentElement.scrollHeight - H };
});
const RGB = `window.RGB = c => { const x = document.createElement('canvas').getContext('2d'); x.fillStyle = '#000'; x.fillStyle = c; x.fillRect(0, 0, 1, 1); const d = x.getImageData(0, 0, 1, 1).data; return 'rgb(' + d[0] + ', ' + d[1] + ', ' + d[2] + ')'; };`;
async function narrowSuite(browser, TOK){
  for(const s of NCOL){
    const [w, h] = s.split('x').map(Number), tag = `${s} narrow sideways`, want = w >= 600 && w < 740;
    for(const sponsor of [true, false]){
      const { ctx, pg } = await fixturePage(browser, TOK, w, h, { sponsor });
      const m = await pg.evaluate(() => {
        const r = e => { if(!e || !e.getClientRects().length || e.hidden) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
        const g = document.getElementById('game'), W = innerWidth, side = document.getElementById('sidePanel');
        const past = [...document.querySelectorAll('#game *')].filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden').map(e => [e, e.getBoundingClientRect()])
          .filter(([e, b]) => b.width && (b.right > W + 1 || b.left < -1)).map(([e]) => e.id || e.className).slice(0, 4);
        const felt = r(document.querySelector('#tableArea .felt')), cards = [...document.querySelectorAll('#seats .seat.hero .card.hero')].map(e => r(e) && { ...r(e), ow: e.offsetWidth }).filter(Boolean);
        const info = document.querySelector('#dock #helper:not([hidden]), #dock #playNote:not([hidden]), #dock .info-line');
        return { ncol: g.classList.contains('b-ncol'), col: g.classList.contains('b-col'), area: r(document.getElementById('tableArea')), field: r(document.getElementById('fieldBar')), side: r(side),
          sideText: side.hidden ? '' : side.textContent, logo: !!side.querySelector('[data-splogo] *'), tiles: [...document.querySelectorAll('#fieldBar .b-tile small')].map(e => e.textContent),
          past, W, H: innerHeight, dock: r(document.getElementById('dock')), felt, cards, info: info ? [getComputedStyle(info).textAlign, info.id || info.className] : null,
          seats: [...document.querySelectorAll('#seats .seat.b-seat .plate, #seats .seat.b-seat .av')].map(r).filter(Boolean) };
      });
      const st = sponsor ? '' : ' (no sponsor)';
      if(SHOTS) await pg.screenshot({ path: path.join(SHOTS, `ncol-${s}${sponsor ? '' : '-nosp'}.png`) });
      check(m.ncol === want && !m.col, `${tag}${st}: ${want ? 'the narrow column beside the table' : 'no column (under 600 wide, the nine seats keep the width)'} (b-ncol ${m.ncol})`);
      if(want){
        check(m.field && m.field.l >= m.area.r - 1 && m.field.r <= m.W + 1 && m.field.b <= m.dock.t + 1 && m.tiles.join('|') === 'Avg stack|Chip leader|Active tables|Spectators', `${tag}${st}: the four tiles in the column, right of the table, over the dock (${m.tiles.join(', ')})`);
        if(sponsor) check(m.side && m.side.l >= m.area.r - 1 && m.side.r <= m.W + 1 && m.side.t >= m.field.b - 1 && m.side.b <= m.dock.t + 1 && /Presented by/i.test(m.sideText) && /Aurora Test Roasters/.test(m.sideText) && m.logo,
          `${tag}: the sponsor in the column during play: the logo or initials, "Presented by", the name (${JSON.stringify(m.side)})`);
        else check(!m.side, `${tag}${st}: no sponsor and no prize: the column holds the tiles only`);
        check(m.seats.every(q => q.r <= m.area.r + 1 && q.l >= -1), `${tag}${st}: every seat stays left of the column`);
        check(m.dock && Math.abs(m.dock.l) <= 1 && Math.abs(m.dock.r - m.W) <= 1, `${tag}${st}: the action row full width under the table and the column`);
      }
      check(!m.past.length, `${tag}${st}: nothing past the screen's edge${m.past.length ? ': ' + m.past.join(', ') : ''}`);
      check(m.cards.length === 2 && m.felt && m.cards.every(c => c.b <= m.felt.b - 10 && c.ow <= m.felt.h * .17 + 2), `${tag}${st}: your two cards inside the rail, at most 0.17 of the felt's height wide (${m.cards.map(c => c.ow + 'x' + Math.round(c.h) + ' to ' + Math.round(c.b)).join(', ')}; felt ${m.felt && Math.round(m.felt.h)} to ${m.felt && Math.round(m.felt.b)})`);
      check(m.info && m.info[0] === 'center', `${tag}${st}: the info line centred (${m.info && m.info.join(' ')})`);
      await ctx.close();
    }
  }
  // the dock with the home-screen inset and without, the action row and the sizing
  for(const [s, sa] of INSETS){
    const [w, h] = s.split('x').map(Number), tag = `${s} ${sa ? 'Home Screen (inset ' + sa + ')' : 'Safari'}`;
    const { ctx, pg } = await fixturePage(browser, TOK, w, h, { sa });
    for(const view of ['row', 'sizing']){
      if(view === 'sizing'){ await pg.tap('#aRaise'); await sleep(300); }
      const d = await dockIn(pg);
      check(d.n >= 4 && !d.out.length && d.scroll <= 0 && d.tall <= 0, `${tag} ${view}: every dock control whole on the screen${d.out.length ? ': ' + d.out.map(o => `${o.id} ${Math.round(o.t)}-${Math.round(o.b)}`).join(', ') : ''}`);
      check(d.gap >= sa - .5 && d.gap <= sa + 16, `${tag} ${view}: the action row ${Math.round(d.gap)} px over the screen's foot (the inset ${sa} counted once)`);
      if(SHOTS) await pg.screenshot({ path: path.join(SHOTS, `dock-${s}-sa${sa}-${view}.png`) });
    }
    await ctx.close();
  }
  // the gold rings
  const { ctx, pg, sock, me } = await fixturePage(browser, TOK, 390, 844, { legal: false });
  const ring = await pg.evaluate(src => { eval(src);
    const cs = getComputedStyle(document.documentElement), v = k => RGB(cs.getPropertyValue(k).trim());
    const rest = [...document.querySelectorAll('#seats .seat.b-seat:not(.acting) .av.b-av')].map(a => [getComputedStyle(a).borderTopWidth, getComputedStyle(a).borderTopColor]);
    const act = [...document.querySelectorAll('#seats .seat.b-seat.acting .av.b-av')].map(a => [getComputedStyle(a).borderTopWidth, RGB(getComputedStyle(a).borderTopColor)]);
    const c = rest[0] && RGB(rest[0][1]), grounds = { felt: v('--b-felt'), 'felt edge': v('--b-felt-edge'), 'felt light': v('--b-felt-hi'), ground: v('--b-bg'), rail: v('--b-surface') };
    return { rest, act, alpha: rest[0] ? (/\/\s*[\d.]+%?\s*\)$/.test(rest[0][1]) || /^rgba\(/.test(rest[0][1]) ? 0 : 1) : 0, raw: rest[0] && rest[0][1], ratios: Object.fromEntries(Object.entries(grounds).map(([k, g]) => [k, c ? +R(c, g).toFixed(2) : 0])), gold: v('--b-gold') }; }, CONTRAST + RGB);
  check(ring.rest.length && ring.rest.every(([bw, c]) => bw === '2px' && c === ring.rest[0][1]) && ring.alpha === 1, `the initials' ring at rest: 2 px, opaque (${ring.raw})`);
  check(Object.values(ring.ratios).every(x => x >= 3), `the ring at rest at least 3:1 on the felt and the ground (${Object.entries(ring.ratios).map(([k, x]) => k + ' ' + x).join(', ')})`);
  check(ring.act.length === 1 && ring.act[0][0] === '3px' && ring.act[0][1] === ring.gold, `the player to act: 3 px --b-gold (${ring.act.map(a => a.join(' ')).join(', ')})`);
  if(SHOTS){ const a = await pg.$('#seats .seat.b-seat.acting'); if(a) await pg.screenshot({ path: path.join(SHOTS, 'rings-390x844.png'), clip: await pg.evaluate(() => { const b = document.querySelector('#seats .seat.b-seat.acting .av').getBoundingClientRect(); return { x: Math.max(0, b.left - 120), y: Math.max(0, b.top - 60), width: 300, height: 160 }; }) }); }
  await ctx.close();
}

// ---------- short upright phones (the owner's iPhone in an in-app browser, 2026-10-23, 390x650) ----------
// At a showdown the seat at 12 o'clock showed its cards face up and its avatar under the header card. At 390x650,
// 375x560, 390x667 and 320x568, a 6-max table and a 9-max one, in play and at the showdown (the top seat the winner,
// face up, its "Winner" plate): every seat's avatar, plate and cards under the header (by 1 px at least; laid out 2 px), the felt whole
// under it. Also: the sheet with no spectator count reads "0 watching", never a dash; and with "+30s" up (the helper
// off, so the free-play line shows), the line and the button never overlap and the line is never cut short.
const SHORT = (process.env.SHORT_SIZES || '390x650,375x560,390x667,320x568').split(',').filter(Boolean);
function sixFor(me, n, show){
  const names = [me.name, 'Ana', 'Ben', 'Carla', 'Dev', 'Eli', 'Fay', 'Gus', 'Hal'];
  const seats = Array.from({ length: n }, (_, s) => ({ uid: s ? 'p' + s : me.id, name: names[s], stack: 30000 - s * 1100, inHand: true, bet: 0, folded: false, allIn: false, act: '', lastAmt: 0, won: 0, shown: null, cat: '', away: false }));
  const t = { tid: 'bui', n: 1, phase: 'hand', handNo: 7 + n + (show ? 1 : 0), street: 3, seats, size: n, allowed: seats.map((p, s) => s), cur: 0, board: ['Ts', 'Jh', 'Qc', '2d', '7s'], pot: 0, btn: n - 1, blinds: [100, 200, 0],
    acting: 1, actUid: 'p1', seq: 40 + n + (show ? 1 : 0), deadline: Date.now() + 60000, bank: 60000, usingBank: false, extras: 3, legal: null, result: null, note: '' };
  if(show){ const top = Math.floor(n / 2);
    seats.forEach((p, s) => { if(s && s !== top){ p.shown = ['9h', '9c']; p.cat = 'Pair'; } });
    Object.assign(seats[top], { won: 42725, stack: 42725, shown: ['As', 'Kd'], cat: 'Straight' });
    Object.assign(t, { acting: -1, actUid: null, phase: 'result', result: { lines: ['Carla wins 12,725 with a Straight'], winCards: ['As', 'Kd', 'Ts', 'Jh', 'Qc'], showdown: true } }); }
  return t;
}
async function shortSuite(browser, TOK){
  for(const s of SHORT){
    const [w, h] = s.split('x').map(Number);
    const { ctx, pg, sock, me } = await fixturePage(browser, TOK, w, h, { legal: false, field: { ...FIELD, watchers: null } });
    for(const n of [6, 9]) for(const show of [false, true]){
      sock.send(JSON.stringify({ t: 'table', table: sixFor(me, n, show), you: { hand: 3, cards: ['Ah', 'Qd'] }, field: { ...FIELD, watchers: null } }));
      await sleep(1600);
      const m = await pg.evaluate(() => {
        const hdr = Math.max(...['bTop', 'bHud', 'lobbyBtn'].map(id => document.getElementById(id)).filter(e => e && e.getClientRects().length).map(e => e.getBoundingClientRect().bottom));
        const seats = [...document.querySelectorAll('#seats .seat.b-seat:not(.hero)')].map(q => { const els = [...q.querySelectorAll('.av, .hole .card, .plate, .badge')].filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
          return { name: (q.getAttribute('aria-label') || '').split(',')[0], top: Math.min(...els.map(e => e.getBoundingClientRect().top)), shown: !!q.querySelector('.hole.shown') }; });
        const felt = document.querySelector('#tableArea .felt').getBoundingClientRect();
        return { hdr, seats, felt: felt.top, n: seats.length, shown: seats.filter(q => q.shown).length };
      });
      const hi = m.seats.reduce((a, b) => a.top < b.top ? a : b, { top: 1e4 });
      const tag = `${s} ${n}-max ${show ? 'showdown' : 'in play'}`;
      check(m.n === n - 1 && (!show || m.shown === n - 1), `${tag}: the table drawn (${m.n} seats, ${m.shown} face up)`);
      check(hi.top >= m.hdr + 1 && m.felt >= m.hdr, `${tag}: every seat's avatar, plate and cards clear of the header (highest ${hi.name} at ${hi.top.toFixed(1)}, header to ${m.hdr.toFixed(1)})`);
      if(SHOTS) await pg.screenshot({ path: path.join(SHOTS, `short-${s}-n${n}${show ? '-show' : ''}.png`) });
    }
    // the sheet, no spectator count known
    await pg.click('#bHud'); await sleep(500);
    const wt = await pg.evaluate(() => { const t = document.querySelector('#bHudSheet:not([hidden]) .bt-watch'); return t ? { v: t.textContent.replace(/\s+/g, ' ').trim(), label: t.getAttribute('aria-label') } : null; });
    check(wt && /Spectators\s*0 watching/.test(wt.v) && !/[–—]/.test(wt.v) && wt.label === '0 watching', `${s}: no spectator count known: "${wt && wt.v}" (${wt && wt.label}), no dash`);
    await pg.keyboard.press('Escape'); await sleep(200);
    await ctx.close();
  }
  // "+30s" and the free-play line (the owner's game sideways, about 800x330 with the in-app browser's bars)
  for(const [s, field] of [['800x330', FIELD], ['800x330', null], ['844x390', FIELD], ['844x390', null], ['667x320', FIELD], ['390x650', FIELD], ['390x844', FIELD], ['320x568', FIELD]]){
    const [w, h] = s.split('x').map(Number), tag = `${s}${field ? '' : ' (no field)'} +30s`;
    const { ctx, pg } = await fixturePage(browser, TOK, w, h, { helperOff: true, field });
    await pg.evaluate(() => { const n = document.getElementById('playNote'); if(n && !n.hidden) n.click(); }); await sleep(300);
    const q = await pg.evaluate(() => {
      const x = document.querySelector('#dock .xtime'), pl = document.getElementById('playLine'); if(!x || !x.getClientRects().length || !pl || !pl.getClientRects().length) return null;
      const rg = document.createRange(); rg.selectNodeContents(pl); const lines = [...rg.getClientRects()].filter(r => r.width), b = x.getBoundingClientRect(), p = pl.getBoundingClientRect();
      const hit = lines.some(r => r.right > b.left + .5 && r.left < b.right - .5 && r.bottom > b.top + .5 && r.top < b.bottom - .5);
      return { hit, cut: pl.scrollWidth > pl.clientWidth + .5 || lines.some(r => r.right > p.right + .5 || r.left < p.left - .5 || r.top < p.top - .5 || r.bottom > p.bottom + .5), text: pl.textContent, n: new Set(lines.map(r => Math.round(r.top))).size };
    });
    check(q && !q.hit && !q.cut && /No real money$/.test(q.text), `${tag}: the free-play line and the button never overlap, the line whole (${q ? `${q.n} line${q.n > 1 ? 's' : ''}, overlap ${q.hit}, cut ${q.cut}` : 'not shown'})`);
    if(SHOTS) await pg.screenshot({ path: path.join(SHOTS, `xtime-${s}${field ? '' : '-nf'}.png`) });
    await ctx.close();
  }
}

// ---------- a short-handed table, sitting out (a second player's iPhone and the owner's, 2026-10-23) ----------
// 2 seated at a 9-max table, not my turn (the quick actions and the helper line in the dock): the board cards as large
// as at a full 6-max table at the same size (the empty seats are their "+" only). Sitting out: the words on the info
// line, "I'm back" and the free-play line all whole, none over another or over my plate.
function shortHanded(me, n, seated, away){
  const names = [me.name, 'Ana', 'Ben', 'Carla', 'Dev', 'Eli', 'Fay', 'Gus', 'Hal'], keep = new Set(seated);
  const seats = Array.from({ length: n }, (_, s) => keep.has(s) ? { uid: s ? 'p' + s : me.id, name: names[s], stack: 30000 - s * 1100, inHand: true, bet: 0, folded: false, allIn: false, act: '', lastAmt: 0, won: 0, shown: null, cat: '', away: false } : null);
  const other = seated.find(x => x);
  if(away) Object.assign(seats[0], { away: true, inHand: false, folded: true });
  return { tid: 'bui', n: 1, phase: 'hand', handNo: 50 + n + seated.length + (away ? 1 : 0), street: 1, seats, size: n, allowed: seats.map((p, s) => s), cur: 0, board: ['6s', 'Jh', '2c'], pot: 400, btn: other, blinds: [100, 200, 0],
    acting: other, actUid: 'p' + other, seq: 60 + n + seated.length + (away ? 1 : 0), deadline: Date.now() + 60000, bank: 60000, usingBank: false, extras: 3, legal: null, result: null, note: '' };
}
async function shortHandedSuite(browser, TOK){
  const cardW = pg => pg.evaluate(() => { const c = document.querySelector('#board .card'); return c ? c.offsetWidth : 0; });
  for(const s of ['390x730', '390x844', '390x650', '320x568', '844x390', '800x330', '667x320']){
    const [w, h] = s.split('x').map(Number), tag = `${s} 2 seated at 9`;
    const { ctx, pg, sock, me } = await fixturePage(browser, TOK, w, h, { legal: false });
    sock.send(JSON.stringify({ t: 'table', table: shortHanded(me, 6, [0, 1, 2, 3, 4, 5]), you: { hand: 3, cards: ['6h', 'Qd'] }, field: FIELD })); await sleep(1200);
    const full = await cardW(pg);
    sock.send(JSON.stringify({ t: 'table', table: shortHanded(me, 9, [0, 4]), you: { hand: 3, cards: ['6h', 'Qd'] }, field: FIELD })); await sleep(1200);
    const two = await cardW(pg), pre = await pg.evaluate(() => !!document.querySelector('#dock .preacts [data-pre]'));
    check(pre && full > 0 && two >= full, `${tag}: the board cards ${two} px wide with the quick actions up, at least as at a full 6-max table (${full})`);
    if(SHOTS) await pg.screenshot({ path: path.join(SHOTS, `shorthanded-${s}.png`) });
    await ctx.close();
  }
  for(const s of ['390x650', '375x560', '320x568', '390x844', '844x390', '800x330', '667x320', '568x320']){
    const [w, h] = s.split('x').map(Number), tag = `${s} sitting out`;
    const { ctx, pg, sock, me } = await fixturePage(browser, TOK, w, h, { legal: false });
    sock.send(JSON.stringify({ t: 'table', table: shortHanded(me, 6, [0, 1, 3, 5], true), you: null, field: FIELD })); await sleep(1200);
    const m = await pg.evaluate(() => {
      const R = b => ({ l: b.left, t: b.top, r: b.right, b: b.bottom }), hit = (a, b) => a.r > b.l + .5 && a.l < b.r - .5 && a.b > b.t + .5 && a.t < b.b - .5;
      const lines = e => { const rg = document.createRange(); rg.selectNodeContents(e); return [...rg.getClientRects()].filter(q => q.width).map(R); };
      const il = [...document.querySelectorAll('#dock .info-line')].find(e => e.getClientRects().length && /sitting out/.test(e.textContent)), back = document.getElementById('backBtn'), pl = document.getElementById('playLine');
      const plate = document.querySelector('#seats .seat.hero .plate'), badge = document.querySelector('#seats .seat.hero .badge');
      if(!il || !back || !pl || !back.getClientRects().length || !pl.getClientRects().length) return { missing: [!!il, !!back, !!pl] };
      const tx = lines(il), ib = R(il.getBoundingClientRect()), bb = R(back.getBoundingClientRect()), pt = lines(pl), pb = R(pl.getBoundingClientRect()), mine = [plate, badge].filter(Boolean).map(e => R(e.getBoundingClientRect()));
      const W = innerWidth, H = innerHeight, inside = (a, b) => a.l >= b.l - .5 && a.r <= b.r + .5 && a.t >= b.t - .5 && a.b <= b.b + .5;
      return { text: tx.every(q => inside(q, ib)) && !tx.some(q => mine.some(x => hit(q, x))), back: bb.l >= 0 && bb.r <= W && bb.b <= H && !pt.some(q => hit(q, bb)) && !tx.some(q => hit(q, bb)) && !mine.some(x => hit(bb, x)),
        line: pl.scrollWidth <= pl.clientWidth + .5 && pt.every(q => inside(q, pb)) && !pt.some(q => tx.some(x => hit(q, x)) || mine.some(x => hit(q, x))), words: il.textContent.trim(), label: back.textContent.trim() };
    });
    check(m && m.text && m.back && m.line && /fold automatically\.$/.test(m.words) && m.label === "I'm back", `${tag}: the words, "I'm back" and the free-play line all whole, none over another or over my plate (${m ? JSON.stringify(m) : ''})`);
    if(SHOTS) await pg.screenshot({ path: path.join(SHOTS, `away-${s}.png`) });
    await ctx.close();
  }
}

// ---------- the sizing sideways in an in-app browser (owner's iPhone, 2026-10-23, about 844x350) ----------
// Raise open: the free-play line never shows through the presets (it is hidden while the sizing is open), and the
// slider has a visible track: in the column beside the table at least 80 px.
async function sizingSuite(browser, TOK){
  for(const s of ['844x350', '844x390', '800x330', '667x320', '568x320', '390x700', '320x568']){
    const [w, h] = s.split('x').map(Number), tag = `${s} sizing`;
    const { ctx, pg } = await fixturePage(browser, TOK, w, h, { helperOff: true });
    await pg.evaluate(() => { const n = document.getElementById('playNote'); if(n && !n.hidden) n.click(); }); await sleep(200);
    await pg.tap('#aRaise'); await sleep(400);
    const m = await pg.evaluate(() => {
      const vis = e => e && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none';
      const pl = document.getElementById('playLine'), rr = document.getElementById('raiseRange'), mi = document.getElementById('minus'), pu = document.getElementById('plus');
      const r = rr && rr.getBoundingClientRect(), W = innerWidth, H = innerHeight;
      return { sizing: !!document.querySelector('#controls .b-sizing'), line: vis(pl), range: r ? [Math.round(r.width), Math.round(r.height)] : null,
        whole: !!r && r.left >= 0 && r.right <= W && r.bottom <= H, steps: [mi, pu].filter(vis).length, col: document.getElementById('game').classList.contains('b-col'),
        order: !!(mi && pu && r) && (!vis(mi) || mi.getBoundingClientRect().right <= r.left + .5 && r.right <= pu.getBoundingClientRect().left + .5) };
    });
    check(m.sizing && !m.line, `${tag}: the free-play line hidden while the sizing is open (shown ${m.line})`);
    // (sideways in the column beside the table, − and + give the slider their room; elsewhere they stay as they were,
    // not part of this fix: the track printed, not checked)
    const want = m.col ? 80 : 0;
    check(m.range && m.range[0] >= want && m.whole && m.steps === (m.col ? 0 : 2) && m.order, `${tag}: the slider's track ${m.range && m.range[0]} px${m.col ? ' (the column: no − and +)' : ' between − and +'}${want ? ` (${want} at least)` : ''}`);
    if(SHOTS) await pg.screenshot({ path: path.join(SHOTS, `sizing-${s}.png`) });
    await ctx.close();
  }
}

// ---------- heads-up at a 9-max table (owner's iPhone, 2026-10-23, 390x700 and 844x350) ----------
// The other player has the button and a bet of 100: the D and the bet sit by that seat (within 40 px of its avatar and
// plate), never in a column with the pot in the middle of the felt.
// And the tournament sheet, open while the field changes, follows it: its chip leader reads as the column's.
async function headsUpSuite(browser, TOK){
  for(const s of ['390x700', '390x844', '320x568', '844x350', '844x390', '667x320']){
    const [w, h] = s.split('x').map(Number), tag = `${s} heads-up at 9`;
    const { ctx, pg, sock, me } = await fixturePage(browser, TOK, w, h, { legal: false });
    const t = shortHanded(me, 9, [0, 4]); Object.assign(t, { street: 0, board: [], btn: 4, acting: 4, actUid: 'p4', cur: 200, pot: 350 }); t.seats[4].bet = 100; t.seats[0].bet = 200;
    sock.send(JSON.stringify({ t: 'table', table: t, you: { hand: 3, cards: ['6h', 'Qd'] }, field: FIELD })); await sleep(1200);
    const m = await pg.evaluate(() => {
      const r = e => e && e.getClientRects().length ? e.getBoundingClientRect() : null;
      const seat = document.querySelector('#seats .seat[data-uid="p4"]'), sb = [r(seat.querySelector('.av')), r(seat.querySelector('.plate'))].filter(Boolean);
      const box = { left: Math.min(...sb.map(x => x.left)), right: Math.max(...sb.map(x => x.right)), top: Math.min(...sb.map(x => x.top)), bottom: Math.max(...sb.map(x => x.bottom)) };
      const gap = (a, b) => a && b ? Math.round(Math.hypot(Math.max(0, b.left - a.right, a.left - b.right), Math.max(0, b.top - a.bottom, a.top - b.bottom))) : -1;
      const d = r(document.querySelector('#tableArea .dealer')), pot = r(document.querySelector('#tableArea .pot')),
        bet = [...document.querySelectorAll('#tableArea .bet')].filter(e => e.getClientRects().length && /100$/.test(e.textContent.trim())).map(r)[0];
      const cx = x => x ? (x.left + x.right) / 2 : 0;
      return { d: gap(d, box), bet: gap(bet, box), column: !!(d && bet && pot) && Math.abs(cx(d) - cx(pot)) < 24 && Math.abs(cx(bet) - cx(pot)) < 24 };
    });
    check(m.d >= 0 && m.d <= 40 && m.bet >= 0 && m.bet <= 40 && !m.column, `${tag}: the D (${m.d} px from the seat) and its bet (${m.bet} px) sit by the seat that has them, not in a column with the pot (40 px at most)`);
    if(SHOTS) await pg.screenshot({ path: path.join(SHOTS, `headsup-${s}.png`) });
    // the sheet, open, follows the field
    if(s === '844x390' || s === '390x700'){
      await pg.click('#bHud'); await sleep(500);
      sock.send(JSON.stringify({ t: 'table', table: { ...t, seq: t.seq + 1 }, you: { hand: 3, cards: ['6h', 'Qd'] }, field: { ...FIELD, leader: { name: 'Player 2', stack: 31350, table: 2 } } })); await sleep(700);
      const v = await pg.evaluate(() => { const g = e => e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; return { sheet: g(document.querySelector('#bHudSheet:not([hidden]) .bt-lead')), col: g(document.querySelector('#fieldBar .bt-lead')), colShown: !!document.querySelector('#fieldBar .bt-lead') && document.getElementById('fieldBar').getClientRects().length > 0 }; });
      check(/31,350/.test(v.sheet) && (!v.colShown || v.sheet === v.col), `${tag}: the open sheet's chip leader follows the field ("${v.sheet}"${v.colShown ? `, the column "${v.col}"` : ''})`);
      await pg.keyboard.press('Escape'); await sleep(200);
    }
    await ctx.close();
  }
}

// ---------- B4: navigation (§5): the top bar, the five tabs, and every one of today's lobby entry points a tap or two away ----------
// The club message is patched in the page (as the table fixtures are) so the cards that need a live event show:
// the Blindrise Open, a founder broadcast, a tournament open for registration with last week's results, a second club
// to switch to, and "Create your club".
const NAV_SIZES = [['390x844', 0], ['390x844', 34], ['390x700', 0], ['320x568', 0], ['844x390', 0], ['844x350', 0]];
async function navPage(browser, tok, w, h, sa){
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pg = await ctx.newPage();
  if(sa) await pg.addInitScript(b => { const put = () => { const st = document.createElement('style'); st.textContent = `:root{--sa-b:${b}px}`; document.body.appendChild(st); };
    if(document.readyState !== 'loading') put(); else document.addEventListener('DOMContentLoaded', put); }, sa);
  await pg.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => r.abort());
  await pg.routeWebSocket(/\/ws$/, ws => {
    const server = ws.connectToServer();
    ws.onMessage(m => server.send(m));
    server.onMessage(m => { let j; try{ j = JSON.parse(m); }catch(e){ return ws.send(m); }
      if(j.t === 'club'){ const c = j.club;
        c.bevent = { name: 'Blindrise Open Test', status: 'registering', startAt: Date.now() + 86400000, count: 3, stack: 30000, levelMin: 20, open: true, registered: false, playing: false };
        c.blindrise = [{ title: 'A note from the founder', body: 'Welcome to the board design.', kind: 'post' }];
        c.tourney = { id: 'tnav', name: 'Friday Night', status: 'registering', regs: [], stack: 30000, levelMin: 20, tableSize: 9, lateLevels: 4, repeat: 'none', startAt: null };
        c.history = [{ id: 'hnav', name: 'Last Friday', entrants: 2, endedAt: Date.now() - 86400000, results: [{ uid: 'x1', name: 'Test Player 02', place: 1, pts: 10 }, { uid: 'x2', name: 'Test Player 03', place: 2, pts: 5 }], payouts: [] }];
        // (an update carries only what changed since the last one: its own club comes in the first, whole view)
        if(c.club) ws.club0 = c.club;
        c.clubSwitching = true; c.clubs = [c.club || ws.club0, { id: 'cnav', name: 'Harbour Test Club' }];
        c.openClub = { rules: { v: 1, text: 'Rules' } }; }
      ws.send(JSON.stringify(j)); });
  });
  await pg.goto(BASE + '/'); await pg.evaluate(t => localStorage.setItem('stacked:token', JSON.stringify(t)), tok);
  await pg.reload(); await pg.waitForSelector('#lobby:not([hidden]) #tabs [data-tab="home"]', { timeout: 10000 }).catch(() => {}); await sleep(900);
  return { ctx, pg };
}
const navLook = pg => pg.evaluate(() => {
  const r = e => e && e.getClientRects().length ? e.getBoundingClientRect() : null, H = innerHeight, W = innerWidth;
  const sa = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sa-b')) || 0;
  const bar = r(document.getElementById('tabs')), btns = [...document.querySelectorAll('#tabs [data-tab]')].filter(b => !b.hidden);
  const sel = document.querySelector('#tabs [aria-selected="true"]'), cs = getComputedStyle(document.documentElement);
  const gold = cs.getPropertyValue('--b-gold').trim(), x = document.createElement('canvas').getContext('2d');
  const rgb = c => { x.fillStyle = '#000'; x.fillStyle = c; x.fillRect(0, 0, 1, 1); const d = x.getImageData(0, 0, 1, 1).data; return d.slice(0, 3).join(','); };
  const top = ['bBell', 'dirTab', 'meBtn'].map(id => { const e = document.getElementById(id), b = r(e); return { id, shown: !!b && !e.hidden, w: b ? b.width : 0, h: b ? b.height : 0 }; });
  const word = document.querySelector('#lobby .mini-logo .lx-word'), wb = r(word);
  return { sa, H, W, bar: bar && { h: bar.height, b: bar.bottom, t: bar.top }, tabs: btns.map(b => ({ k: b.dataset.tab, text: b.textContent.trim(), w: r(b) ? r(b).width : 0, h: r(b) ? r(b).height : 0 })),
    sel: sel && sel.dataset.tab, selColor: sel && getComputedStyle(sel).color, selBg: sel && getComputedStyle(sel).backgroundColor, gold, goldRgb: rgb(gold), selRgb: sel ? rgb(getComputedStyle(sel).color) : '',
    top, word: word ? { text: word.textContent, shown: !!wb && wb.right <= W } : null,
    scroll: Math.max(document.documentElement.scrollWidth - W, ...[...document.querySelectorAll('.screen:not([hidden])')].map(s => s.scrollWidth - s.clientWidth)) };
});
const tapTab = async (pg, k) => { await pg.tap(`#tabs [data-tab="${k}"]`); await sleep(500); };
const bodyHas = (pg, sel) => pg.evaluate(s => !!document.querySelector('#lobbyBody ' + s), sel);
const lit = pg => pg.evaluate(() => (document.querySelector('#tabs [aria-selected="true"]') || {}).dataset.tab);
const modalText = pg => pg.evaluate(() => { const m = document.querySelector('#modalRoot .modal'); return m ? m.textContent.replace(/\s+/g, ' ') : ''; });
const closeModal = async pg => { await pg.evaluate(() => { const b = document.querySelector('#modalRoot [data-i="0"]'); if(b) b.click(); }); await sleep(300); };

// one column on every tab, the page scrolling as one, and the end of each tab clear of the bar (owner, desktop Chrome)
const navEnd = pg => pg.evaluate(async () => {
  const r = e => e && e.getClientRects().length ? e.getBoundingClientRect() : null;
  const top = r(document.querySelector('#lobby .topbar')), body = r(document.getElementById('lobbyBody')), bar = r(document.getElementById('tabs'));
  const inner = [...document.querySelectorAll('#lobby, #lobby *')].filter(e => { const o = getComputedStyle(e).overflowY; return (o === 'auto' || o === 'scroll') && e.scrollHeight > e.clientHeight + 1 && e.getClientRects().length; })
    .map(e => e.id || e.className.toString().slice(0, 30));
  window.scrollTo(0, document.documentElement.scrollHeight); await new Promise(f => setTimeout(f, 250));
  const kids = [...document.getElementById('lobbyBody').children].filter(e => e.getClientRects().length && e.getBoundingClientRect().height > 0);
  const last = kids[kids.length - 1], lb = r(last), b2 = r(document.getElementById('tabs'));
  return { edges: [top, body, bar].map(x => x ? [Math.round(x.left), Math.round(x.right)] : null), inner,
    last: last ? (last.id || last.className.toString().slice(0, 30)) : '', lastB: lb ? Math.round(lb.bottom) : -1, lastT: lb ? Math.round(lb.top) : -1, barT: b2 ? Math.round(b2.top) : -1 };
});
const sameEdges = m => m.edges.every(e => e && Math.abs(e[0] - m.edges[0][0]) <= 1 && Math.abs(e[1] - m.edges[0][1]) <= 1);
async function navWideSuite(browser){
  const OWN = (await api('login', { name: 'Test Director', pin: '246810' })).token, MEM = (await api('login', { name: 'Test Player 01', pin: '135711' })).token;
  for(const s of ['1280x800', '1440x900', '1024x768']) for(const [who, tok] of [['owner', OWN], ['member', MEM]]){
    const [w, h] = s.split('x').map(Number), tag = `${s} ${who} B4 wide`;
    const { ctx, pg } = await navPage(browser, tok, w, h, 0);
    let width = null;
    for(const k of ['home', 'poker', 'biz', 'club', 'profile']){
      await pg.evaluate(() => window.scrollTo(0, 0)); await tapTab(pg, k); await sleep(k === 'biz' || k === 'home' || k === 'club' ? 900 : 300);
      if(SHOTS && s === '1280x800' && who === 'owner') await pg.screenshot({ path: path.join(SHOTS, `b4-owner-1280x800-${k}.png`) });
      const m = await navEnd(pg);
      check(sameEdges(m), `${tag} ${k}: the top bar, the content and the tab bar share one column (${m.edges.map(e => e && e.join('-')).join(', ')})`);
      if(width == null) width = m.edges[2]; else check(m.edges[2] && m.edges[2][0] === width[0] && m.edges[2][1] === width[1], `${tag} ${k}: the same column as Home (${m.edges[2]} vs ${width})`);
      check(!m.inner.length, `${tag} ${k}: no inner scroll box, the page scrolls as one${m.inner.length ? ': ' + m.inner.join(', ') : ''}`);
      check(m.lastB > 0 && m.lastB <= m.barT, `${tag} ${k}: scrolled to the end, the last item (${m.last}) ends above the bar (${m.lastB} vs ${m.barT})`);
    }
    await ctx.close();
  }
}
async function navSuite(browser){
  const OWN = (await api('login', { name: 'Test Director', pin: '246810' })).token, MEM = (await api('login', { name: 'Test Player 01', pin: '135711' })).token;
  // the frame at every size: the bar, the tabs, the top bar
  for(const [s, sa] of NAV_SIZES) for(const [who, tok] of [['owner', OWN], ['member', MEM]]){
    const [w, h] = s.split('x').map(Number), tag = `${s}${sa ? ' inset ' + sa : ''} ${who} B4`;
    const { ctx, pg } = await navPage(browser, tok, w, h, sa);
    let m = await navLook(pg);
    check(m.tabs.map(t => t.text).join('|') === 'Home|Poker|Exchange|Club|Profile' && m.sel === 'home', `${tag}: the five tabs, Home lit at the start (${m.tabs.map(t => t.text).join(', ')}; ${m.sel})`);
    check(m.bar && Math.abs(m.bar.h - (56 + sa)) <= 1 && Math.abs(m.bar.b - m.H) <= 1, `${tag}: the bar 56 tall plus the inset, counted once, at the foot (${m.bar && Math.round(m.bar.h)} px, foot ${m.bar && Math.round(m.bar.b)} of ${m.H})`);
    check(m.tabs.every(t => t.w >= 44 && t.h >= 44), `${tag}: every tab at least 44x44 (${m.tabs.map(t => Math.round(t.w) + 'x' + Math.round(t.h)).join(', ')})`);
    check(m.selRgb === m.goldRgb && /rgba?\(217, 166, 81, 0\.14\)/.test(m.selBg), `${tag}: the lit tab gold on a 14% gold pill (${m.selColor} on ${m.selBg})`);
    const [bell, dir, av] = m.top;
    check(bell.shown && av.shown && [bell, av].every(b => b.w >= 44 && b.h >= 44) && (who === 'owner' ? dir.shown && dir.w >= 44 && dir.h >= 44 : !dir.shown), `${tag}: the top bar: bell and avatar 44x44, Director ${who === 'owner' ? 'shown, 44x44' : 'never shown to a member'} (${m.top.map(t => t.id + ' ' + (t.shown ? Math.round(t.w) + 'x' + Math.round(t.h) : 'hidden')).join(', ')})`);
    check(m.word && m.word.shown && /BLIND\s*RISE/.test(m.word.text), `${tag}: the BLINDRISE wordmark on the left`);
    for(const k of ['poker', 'biz', 'club', 'profile', 'home']){ await tapTab(pg, k);
      const n = await navLook(pg); check(n.sel === k && n.scroll <= 0, `${tag}: ${k} lit after a tap, nothing scrolls sideways (${n.sel}, ${n.scroll})`);
      await sleep(k === 'biz' || k === 'club' ? 600 : 100); const e = await navEnd(pg);
      check(sameEdges(e) && !e.inner.length && e.lastB > 0 && e.lastB <= e.barT, `${tag}: ${k}: one column, no inner scroll box, the end (${e.last}) clear of the bar (${e.lastB} vs ${e.barT}${e.inner.length ? '; ' + e.inner.join(', ') : ''})`);
      await pg.evaluate(() => window.scrollTo(0, 0)); await sleep(100);
      if(SHOTS && !sa && (s === '390x844' || s === '844x390')) await pg.screenshot({ path: path.join(SHOTS, `b4-${who}-${s}-${k}.png`) }); }
    await ctx.close();
  }
  // every one of today's lobby entry points, by taps from the tabs (390x844)
  for(const [who, tok] of [['owner', OWN], ['member', MEM]]){
    const tag = `390x844 ${who} B4 reach`, owner = who === 'owner';
    const { ctx, pg } = await navPage(browser, tok, 390, 844, 0);
    await tapTab(pg, 'home');
    // (Issue #39 / spec §7: founder posts and the last result are rows in Home's Community Activity; the full results
    // table is a tap away, on Standings & prizes)
    check(await bodyHas(pg, '.b-feed [data-bpost]') && /A note from the founder/.test(await pg.textContent('#lobbyBody')), `${tag}: founder broadcasts on Home (Community Activity)`);
    check(await bodyHas(pg, '.hsec-biz'), `${tag}: the Exchange spotlight on Home`);
    check(/Last Friday/.test(await pg.textContent('#lobbyBody .b-feed')) && await bodyHas(pg, '.b-feed [data-bgo="board"]'), `${tag}: results (last tournament) on Home (Community Activity, opening Standings)`);
    check(!(await bodyHas(pg, '.lx-hello, .lx-door, .home-nav')), `${tag}: the Lounge greeting and its doors are gone from Home`);
    await tapTab(pg, 'poker');
    check(await bodyHas(pg, '.bo-card') && /Blindrise Open Test/.test(await pg.textContent('#lobbyBody')), `${tag}: the Blindrise Open card on Poker`);
    check(await bodyHas(pg, '.poker-hero #joinBtn') && /Friday Night/.test(await pg.textContent('#lobbyBody')), `${tag}: the club tournament card (Join) on Poker`);
    if(owner) check(await bodyHas(pg, '#againBtn') || await bodyHas(pg, '#startBtn'), `${tag}: the director's tournament controls on Poker`);
    else check(await bodyHas(pg, '[data-demo]'), `${tag}: the demo table on Poker`);
    await pg.tap('#lobbyBody [data-bgo="board"]'); await sleep(500);
    check(await bodyHas(pg, '[data-bseg="prizes"]') && await lit(pg) === 'poker' && await bodyHas(pg, '.b-back'), `${tag}: Poker → "Standings & prizes" opens today's leaderboard and prizes, Poker still lit, a way back`);
    await pg.tap('#lobbyBody .b-back'); await sleep(400);
    await pg.tap('#lobbyBody [data-bgo="learn"][data-seg="hands"]'); await sleep(600);
    check(await bodyHas(pg, '[data-seg="hands"][aria-pressed="true"]') && await lit(pg) === 'poker', `${tag}: Poker → "My hands" opens today's hand review`);
    await tapTab(pg, 'poker'); await pg.tap('#lobbyBody [data-bgo="learn"][data-seg="lessons"]'); await sleep(500);
    check(await bodyHas(pg, '[data-seg="lessons"][aria-pressed="true"]') && await bodyHas(pg, 'details.lesson'), `${tag}: Poker → "Learn" opens the lessons`);
    for(const k of ['rules', 'fair']){ await pg.tap(`#lobbyBody [data-seg="${k}"]`); await sleep(400); check(await bodyHas(pg, `[data-seg="${k}"][aria-pressed="true"]`), `${tag}: Learn → ${k === 'fair' ? 'Fair deal' : 'Rules'}`); }
    await tapTab(pg, 'biz');
    check(await bodyHas(pg, '.op-top') && await lit(pg) === 'biz', `${tag}: Exchange, today's page`);
    await tapTab(pg, 'club');
    check(owner ? (await pg.evaluate(() => { const r = document.querySelector('#lobbyBody .b-row'); return r && r.dataset.bgo === 'director'; })) : !(await bodyHas(pg, '[data-bgo="director"]')), `${tag}: Director ${owner ? 'the first row of Club' : 'not on Club for a member'}`);
    check(await bodyHas(pg, '.hsec-opp'), `${tag}: the Bulletin on Club`);
    await pg.waitForSelector('#lobbyBody .hsec-opp .hsec-link, #lobbyBody .hsec-opp button', { timeout: 5000 }).catch(() => {});
    const opp = await pg.$('#lobbyBody .hsec-opp .hsec-head button'); if(opp){ await opp.tap(); await sleep(700); }
    check(!!opp && await bodyHas(pg, '.op-top .op-seg [aria-selected="true"]') && /Opportunities/.test(await pg.textContent('#lobbyBody .op-seg [aria-selected="true"]')) && await lit(pg) === 'club', `${tag}: Club → the Bulletin's full page, Club still lit`);
    await tapTab(pg, 'club');
    await pg.tap('#lobbyBody [data-invite]'); await sleep(800);
    const inv = await modalText(pg);
    check(owner ? /Invite people/.test(inv) : /Your invite link/.test(inv), `${tag}: Club → "Invite friends" (${owner ? "the group or personal link" : "my own link"}: ${inv.slice(0, 80)})`);
    await closeModal(pg); await pg.evaluate(() => { const b = document.querySelector('#modalRoot button'); if(b) b.click(); }); await sleep(300);
    if(owner) check(await bodyHas(pg, '.qr-card'), `${tag}: Join QR on Club`);
    await pg.tap('#lobbyBody [data-bact="club"]'); await sleep(400);
    check(/Your clubs/.test(await modalText(pg)) && /Harbour Test Club/.test(await modalText(pg)), `${tag}: Club → "Switch club" (today's club picker)`);
    await pg.evaluate(() => { const b = [...document.querySelectorAll('#modalRoot button')].find(x => x.textContent === 'Close'); if(b) b.click(); }); await sleep(300);
    check(await bodyHas(pg, '#openClubBtn'), `${tag}: "Create your club" on Club`);
    await tapTab(pg, 'profile');
    check(/points/.test(await pg.textContent('#lobbyBody .b-me')) && /Test (Director|Player 01)/.test(await pg.textContent('#lobbyBody .b-me')), `${tag}: name and points on Profile`);
    await pg.tap('#lobbyBody [data-bact="profile"]'); await sleep(900);
    check(await pg.evaluate(() => !!document.querySelector('#modalRoot .prof')), `${tag}: Profile → "My profile and stats" (today's profile)`); await closeModal(pg);
    await pg.tap('#lobbyBody [data-bact="pic"]'); await sleep(500);
    check(/picture|photo|avatar/i.test(await modalText(pg)), `${tag}: Profile → "Change picture"`); await closeModal(pg);
    await pg.tap('#lobbyBody [data-bgo="mine"]'); await sleep(900);
    check(await lit(pg) === 'profile' && /business/i.test(await pg.textContent('#lobbyBody')) && await bodyHas(pg, '.bz-back'), `${tag}: Profile → "My business", Profile still lit`);
    await tapTab(pg, 'profile'); await pg.tap('#lobbyBody [data-bgo="scan"]'); await sleep(700);
    check(await bodyHas(pg, '[data-scan]'), `${tag}: Profile → "Business Card Scanner"`);
    await tapTab(pg, 'profile'); await pg.tap('#lobbyBody [data-bbell]'); await sleep(400);
    check(/notif/i.test(await modalText(pg)), `${tag}: Profile → "Notifications" (today's reminder switch)`); await closeModal(pg);
    await pg.tap('#bBell'); await sleep(400);
    check(/notif/i.test(await modalText(pg)), `${tag}: the bell opens the same`); await closeModal(pg);
    await pg.tap('#lobbyBody [data-bact="out"]'); await sleep(400);
    check(/Sign out\?/.test(await modalText(pg)), `${tag}: Profile → "Sign out" asks first`); await closeModal(pg);
    await tapTab(pg, 'home'); await pg.tap('#meBtn'); await sleep(400);
    check(await lit(pg) === 'profile', `${tag}: the avatar opens Profile`);
    if(owner){
      for(const k of ['home', 'poker', 'biz', 'club', 'profile']){ await tapTab(pg, k); await pg.tap('#dirTab'); await sleep(500);
        check(await bodyHas(pg, '.b-back') && await lit(pg) === 'club' && (await bodyHas(pg, '#newForm') || await bodyHas(pg, '[data-demo]')), `${tag}: Director one tap from ${k} (today's Director page)`); }
      if(SHOTS) await pg.screenshot({ path: path.join(SHOTS, 'b4-owner-director.png') });
      check(await bodyHas(pg, '[data-demo]'), `${tag}: the demo table in Director, as today`);
    }
    await ctx.close();
  }
}

(async () => {
  for(let i = 0; i < 60; i++){ try{ await fetch(BASE + '/health'); break; }catch(e){ await sleep(150); } }
  await sleep(400);
  const TOK = (await api('login', { name: 'Test Player 07', pin: '135777' })).token;
  if(SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  // (NAV_ONLY=1: only the B4 navigation checks, for a quick run)
  for(const size of process.env.NAV_ONLY ? [] : SIZES){
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
      check(await pg.evaluate(() => !document.getElementById('tabs').getClientRects().length && !document.getElementById('meChip').getClientRects().length), `${tag} table: B4: no tab bar and no top bar at the table`);
      if(SHOTS && motion !== 'reduce') await pg.screenshot({ path: path.join(SHOTS, `table-${size}.png`) });
      // the free-play notice at the start of the game (§3.4): on the info line in the dock, not a box on the felt
      if(motion !== 'reduce' && sock && sock !== 'table'){
        const pn = await pg.evaluate(() => { const n = document.getElementById('playNote'), d = document.getElementById('dock'), a = document.getElementById('tableArea'), c = document.querySelector('#controls .b-acts, #controls .act-main');
          if(!n || n.hidden) return null; const r = n.getBoundingClientRect(), dr = d.getBoundingClientRect(), cr = c && c.getBoundingClientRect();
          return { inDock: n.parentNode === d, inside: r.top >= dr.top - 1 && r.bottom <= dr.bottom + 1 && r.left >= dr.left - 1 && r.right <= dr.right + 1, above: !cr || r.bottom <= cr.top + 1 || r.right <= cr.left + 1, h: r.height, text: n.textContent, x: getComputedStyle(n.querySelector('i')).display }; });
        check(pn && pn.inDock && pn.inside && pn.above && pn.h <= 50 && /Free social play/.test(pn.text) && pn.x === 'none', `${tag} table: the free-play notice on the info line, above the action row (sideways: beside it), no box and no × (${JSON.stringify(pn)})`);
      }
      if(motion !== 'reduce' && sock && sock !== 'table'){ await b3pre(pg, tag); await b2(pg, tag, sock, me, w, h); await b3(pg, tag, sock, me, w, h);
        check(await pg.evaluate(() => document.getElementById('playNote').hidden), `${tag}: the free-play notice has gone after its 4 seconds`);
        FRESH[size] = await shape(pg);
        // turning the phone mid-hand (and back), as the owner did: from sideways upright and back, then the same with
        // the size reported late, and to the larger sideways phone
        if(w > h && FRESH['390x844']){
          await turn(pg, tag, 390, 844); await turn(pg, tag, w, h);
          await turn(pg, tag, 390, 844, true); await turn(pg, tag, w, h, true);
          await turn(pg, tag, 932, 430); await turn(pg, tag, w, h);
        } }
      await ctx.close();
    }
  }
  if(!process.env.NAV_ONLY) await narrowSuite(browser, TOK);
  if(!process.env.NAV_ONLY) await shortSuite(browser, TOK);
  if(!process.env.NAV_ONLY) await shortHandedSuite(browser, TOK);
  if(!process.env.NAV_ONLY) await sizingSuite(browser, TOK);
  if(!process.env.NAV_ONLY) await headsUpSuite(browser, TOK);
  if(!process.env.NAV_ONLY) await raiseSuite(browser);
  await navSuite(browser);
  await navWideSuite(browser);
  await browser.close();
  for(const p of ['B8 reduced motion on the sheets and seats'])
    console.log(`PENDING B8 (not run) ${p}`);
  console.log(`\n${oks} ok, ${fails.length} failed`);
  srv.kill(); fs.rmSync(DATA, { force: true });
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e.stack || e); srv.kill(); fs.rmSync(DATA, { force: true }); process.exit(1); });
