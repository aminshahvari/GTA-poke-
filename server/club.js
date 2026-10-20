// The tournament director. Runs every table on the server, keeps the clock,
// balances and breaks tables, and records results. Hole cards never leave the
// server except to the player who holds them.
const E = require('./engine');
const fair = require('./fair');
const crypto = require('crypto');
const rand = () => crypto.randomInt(0x100000000) / 0x100000000;
const store = require('./store');
const coach = require('./coach');
const players = require('./players');

const FAST = process.env.FAST === '1';
const SPEED = FAST ? 0.02 : 1;
const TIME_BANK = +(process.env.TIME_BANK_MS || (FAST ? 3000 : 30000));
const ACT_SECS = [10, 15, 20, 30];
const actMs = () => process.env.TIME_BANK_MS || FAST ? TIME_BANK : (ACT_SECS.includes((T() || {}).actSec) ? T().actSec : 20) * 1000;
// extra-time cards (+30s each, used by tapping): 3 for the tournament, then a fresh 5 once play is down to the final table
const EXTRAS = 3, FINAL_EXTRAS = 5, EXTRA_MS = 30000;
const atFinal = () => [...tables.values()].filter(tb => !tb.broken).length === 1;
const extrasKey = () => atFinal() ? 'extrasFinal' : 'extras';
const extrasLeft = uid => { const t = T(), n = t && t[extrasKey()] && t[extrasKey()][uid]; return n == null ? (atFinal() ? FINAL_EXTRAS : EXTRAS) : n; };
const AWAY_BANK = FAST ? 300 : 2500;
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Table extras: show or muck after an uncontested pot, a set pause between hands, rabbit hunt.
// Off unless the server runs with GAMEPLAY_OPTIONS=1 (or STAGING=1), and then only in a tournament the owner turned them on for.
const GP = () => process.env.GAMEPLAY_OPTIONS === '1' || process.env.STAGING === '1';
const PAUSES = [2, 3, 4, 5, 6];
function gpOpts(o, keep){
  if(!GP()) return {};
  const on = (v, was) => v === undefined ? !!was : v === true || v === 'on';
  const pause = o.handPause === undefined ? (keep && keep.handPause) || 0 : +o.handPause;
  return keep
    ? { showMuck: on(o.showMuck, keep.showMuck), rabbit: on(o.rabbit, keep.rabbit), handPause: PAUSES.includes(pause) ? pause : 0 }
    : { ...(on(o.showMuck) ? { showMuck: true } : {}), ...(on(o.rabbit) ? { rabbit: true } : {}), ...(PAUSES.includes(pause) ? { handPause: pause } : {}) };
}
const gpOn = k => { const t = T(); return GP() && !!t && t[k] === true; };
const pauseSec = () => { const t = T(); return GP() && t && PAUSES.includes(t.handPause) ? t.handPause : 0; };
const fmt = n => Math.round(n).toLocaleString('en-US');
// Tournament breaks: every 10 blind levels the whole tournament stops for a few minutes (3 to 5, set by the director, 5 unless
// set). The break starts on the clock; a hand already in play is finished first, and no table deals a new hand until the break
// ends, so every table resumes together. The break end is an absolute time kept with the tournament, so a reconnect or a
// server restart does not move it. BREAKS=0 on the server turns breaks off.
const BREAK_EVERY = 10, BREAK_MINS = [3, 4, 5];
const breaksOn = () => process.env.BREAKS !== '0';
const breakMinOf = (v, keep) => BREAK_MINS.includes(+v) ? +v : BREAK_MINS.includes(+keep) ? +keep : 5;
// tests (FAST=1 only) can shorten levels and breaks with LEVEL_MS and BREAK_MS
const breakMs = t => FAST && +process.env.BREAK_MS || breakMinOf(t.breakMin) * 60000;
const levelMs = t => FAST && +process.env.LEVEL_MS || t.levelMin * 60000;
const onBreak = (t = T()) => !!t && !!t.breakUntil && !t.paused && Date.now() < t.breakUntil;
// Sponsor spotlight: a published business from this club's Exchange the director picks for a tournament (see business.js).
// Shown for a few seconds when play starts and again during every break. Only its uid is kept here.
const SPONSOR_SECS = [5, 8, 10];
const sponsorOf = (v, keep) => v === undefined ? keep || null : typeof v === 'string' && /^u[0-9a-f]{12}$/.test(v) ? v : null;
const sponsorSecOf = (v, keep) => SPONSOR_SECS.includes(+v) ? +v : SPONSOR_SECS.includes(+keep) ? +keep : 8;

// Disconnect protection (Issue #9): when the player to act has no live connection, their decision gets 30 more seconds by
// itself, once per hand, without using an extra-time card or marking them away. Tests (FAST=1 only) can set DC_PROTECT_MS.
const DC_MS = FAST && +process.env.DC_PROTECT_MS || 30000;

let hooks = { onClub(){}, onTable(){}, onTableClosed(){}, onCoach(){}, onNotice(){}, isConnected: () => true,
  // halted(): a reason this club may not start tournaments right now (suspended or cancelled by Blindrise), or null
  halted(){ return null; } };
const tables = new Map();   // tid -> live table
const waiters = new Map();  // uid -> pending decision
let running = false, clockTimer = null;
let linker = () => null; // (uidA, uidB) -> reason they must not share a table, or null
function setLinker(f){ linker = f; }
const linkedAt = (tb, uid) => tb.g.seats.filter(q => q && q.uid !== uid && linker(uid, q.uid)).length;

const T = () => store.get('tourney') || null;
function saveT(patch){ return store.set('tourney', { ...(T() || {}), ...patch }); }
const userName = uid => (store.get('user:' + uid) || {}).name || 'Player';

// WSOP pays about 15% of the field. Weights follow the 2025 Main Event final table relative to 1st.
const PAY_W = [1, .60, .40, .30, .24, .19, .15, .125, .10];
function payoutPcts(n){
  const paid = Math.max(1, Math.ceil(n * 0.15));
  const w = Array.from({ length: paid }, (_, i) => i < PAY_W.length ? PAY_W[i] : Math.max(.035, .10 * Math.pow(.93, i - 8)));
  const s = w.reduce((a, b) => a + b, 0), out = w.map(x => Math.round(x / s * 1000) / 10);
  out[0] = Math.round((out[0] + 100 - out.reduce((a, b) => a + b, 0)) * 10) / 10;
  return out;
}
// Points reward winning: places in the money earn payout % × players ÷ 10 (min 2); everyone else gets 1 for playing.
function pointsFor(n, place){ const pct = payoutPcts(n)[place - 1]; return pct ? Math.max(2, Math.round(pct * n / 10)) : 1; }

// ---------- registration ----------
function create(o){
  const { name, stack: stack0, levelMin: levelMin0, startAt, repeat, anteMode, actSec, tableSize, lateLevels, helper } = o;
  let stack = stack0, levelMin = levelMin0;
  const t = T();
  if(t && (t.status === 'running')) throw new Error('A tournament is already running.');
  stack = [10000, 20000, 30000, 50000, 60000, 100000].includes(+stack) ? +stack : 30000;
  levelMin = Math.max(1, Math.min(60, Math.round(+levelMin || 20)));
  store.set('tourney', { id: 't' + Date.now(), status: 'registering', name: String(name || 'Club Tournament').slice(0, 60), stack, levelMin,
    startAt: startAt ? +startAt : null, repeat: ['daily', 'weekly'].includes(repeat) ? repeat : 'none', regs: [], createdAt: Date.now(),
    anteMode: anteMode === 'bb' ? 'bb' : 'each', actSec: ACT_SECS.includes(+actSec) ? +actSec : 20,
    tableSize: SIZES.includes(+tableSize) ? +tableSize : 9, lateLevels: LATE.includes(+lateLevels) ? +lateLevels : 0, helper: helper !== false && helper !== 'off', ...gpOpts(o),
    breakMin: breakMinOf(o.breakMin), sponsor: sponsorOf(o.sponsor), sponsorSec: sponsorSecOf(o.sponsorSec) });
  hooks.onClub();
  hooks.onNotice('open', T());
}
// change a tournament that is still taking sign-ups, keeping everyone who joined
function edit(o){
  const { name, stack, levelMin, startAt, repeat, anteMode, actSec, lateLevels, helper } = o;
  const t = T();
  if(!t || t.status !== 'registering') throw new Error('Only a tournament that has not started can be changed.');
  const at = startAt ? +startAt : null;
  saveT({ name: String(name || t.name).slice(0, 60), stack: [10000, 20000, 30000, 50000, 60000, 100000].includes(+stack) ? +stack : t.stack,
    levelMin: Math.max(1, Math.min(60, Math.round(+levelMin || t.levelMin))), startAt: at, repeat: at && ['daily', 'weekly'].includes(repeat) ? repeat : 'none',
    anteMode: anteMode === 'bb' ? 'bb' : 'each', actSec: ACT_SECS.includes(+actSec) ? +actSec : t.actSec, tableSize: 9,
    lateLevels: LATE.includes(+lateLevels) ? +lateLevels : t.lateLevels, helper: helper !== false && helper !== 'off',
    reminded: at === t.startAt ? t.reminded : false, ...gpOpts(o, t),
    breakMin: breakMinOf(o.breakMin, t.breakMin), sponsor: sponsorOf(o.sponsor, t.sponsor), sponsorSec: sponsorSecOf(o.sponsorSec, t.sponsorSec) });
  hooks.onClub();
}
function join(uid){
  const t = T();
  if(t && t.status === 'running') return lateJoin(uid);
  if(!t || t.status !== 'registering') throw new Error('Registration is closed.');
  if(!t.regs.includes(uid)) saveT({ regs: [...t.regs, uid] });
  hooks.onClub();
}
function leave(uid){
  const t = T(); if(!t || t.status !== 'registering') return;
  saveT({ regs: t.regs.filter(u => u !== uid) }); hooks.onClub();
}
function cancel(){
  stopAll();
  for(const tid of [...tables.keys()]) closeTable(tid);
  const t = T(); if(t) saveT({ status: 'cancelled', endedAt: Date.now() });
  store.del('live');
  hooks.onClub();
}

// ---------- start / resume ----------
function mkPlayer(uid, stack){ return { id: uid, uid, name: userName(uid), isHero: true, style: null, stack, away: false }; }
function spread(k){ const out = []; for(let i = 0; i < k; i++) out.push(Math.floor(i * 9 / k)); return out; }
// Table size: 9-handed (WSOP/WPT), 8-handed or 6-max. Seats live in a 9-slot ring; a smaller table uses an evenly spaced subset.
const SIZES = [6, 8, 9];
const size = () => { const t = T(); return t && SIZES.includes(t.tableSize) ? t.tableSize : 9; };
const allowedSeats = () => spread(size());
const LATE = [0, 2, 4, 6];
function lateOpen(){ const t = T(); return !!t && t.status === 'running' && !t.paused && (t.lateLevels || 0) > 0 && t.level < t.lateLevels && !hfh.on; }
function newTable(tid, n){
  const g = E.newGame({ players: [] }); g.seats = Array(9).fill(null); g.multi = true;
  const t = { tid, n, g, seq: 0, broken: false, inHand: false, acting: null, handStart: {}, note: '' };
  tables.set(tid, t); return t;
}
function start(){
  const t = T();
  const halt = hooks.halted(); if(halt) throw new Error(halt);
  if(!t || t.status !== 'registering') throw new Error('No tournament is open.');
  const regs = t.regs.filter(u => { const us = store.get('user:' + u); return us && !us.removed; });
  if(regs.length < 2) throw new Error('At least 2 players need to join.');
  for(let i = regs.length - 1; i > 0; i--){ const j = crypto.randomInt(i + 1); [regs[i], regs[j]] = [regs[j], regs[i]]; }
  const nT = Math.ceil(regs.length / size()), groups = Array.from({ length: nT }, () => []), cap = Math.ceil(regs.length / nT);
  // random seating, but players from the same household / internet / device go to different tables when possible
  const conflicts = (grp, u) => grp.filter(v => linker(u, v)).length;
  const order = regs.slice().sort((a, b) => regs.filter(v => linker(b, v)).length - regs.filter(v => linker(a, v)).length);
  order.forEach(u => {
    const best = groups.filter(gp => gp.length < cap).sort((a, b) => conflicts(a, u) - conflicts(b, u) || a.length - b.length)[0];
    best.push(u);
  });
  // repair pass: swap players between tables while that lowers the number of linked pairs sitting together
  const cost = grp => grp.reduce((a, u, i) => a + grp.slice(i + 1).filter(v => linker(u, v)).length, 0);
  for(let pass = 0, improved = true; improved && pass < 50; pass++){
    improved = false;
    for(let a = 0; a < groups.length; a++) for(let b = a + 1; b < groups.length; b++){
      for(let i = 0; i < groups[a].length; i++) for(let j = 0; j < groups[b].length; j++){
        const before = cost(groups[a]) + cost(groups[b]);
        [groups[a][i], groups[b][j]] = [groups[b][j], groups[a][i]];
        if(cost(groups[a]) + cost(groups[b]) < before) improved = true;
        else [groups[a][i], groups[b][j]] = [groups[b][j], groups[a][i]];
      }
    }
  }
  tables.clear();
  groups.forEach((grp, i) => {
    const tb = newTable(t.id + '-' + (i + 1), i + 1);
    const al = allowedSeats(); grp.forEach((u, k) => { const s = al[Math.floor(k * al.length / grp.length)]; const p = mkPlayer(u, t.stack); p.seat = s; tb.g.seats[s] = p; });
  });
  const { seed, seal } = fair.newSeed(); fair.prune();
  saveT({ fairSeed: seed, fairSeal: seal });
  saveT({ status: 'running', startedAt: Date.now(), level: 0, levelEndsAt: Date.now() + levelMs(t), paused: false, pausedLeft: 0, breakUntil: null, pausedBreakLeft: 0,
    entrants: regs.length, remaining: regs.length, places: [], regs });
  saveLive();
  go();
  hooks.onNotice('start', T());
}
function resume(){
  const t = T(), live = store.get('live');
  if(!t || t.status !== 'running' || !live) return false;
  if(!t.fairSeed){ const { seed, seal } = fair.newSeed(); saveT({ fairSeed: seed, fairSeal: seal }); }
  fair.voidLive(t.id); // deals cut off by the restart stay on record as void; their hands are replayed below
  tables.clear();
  for(const lt of live.tables){
    const tb = newTable(lt.tid, lt.n);
    lt.seats.forEach((s, i) => { if(s && s.stack > 0){ const p = mkPlayer(s.uid, s.stack); p.seat = i; tb.g.seats[i] = p; } });
    Object.assign(tb.g, { btn: lt.btn, sb: lt.sb, bb: lt.bb, handNo: lt.handNo || 0 });
    tb.note = 'The server restarted. Any hand in progress was replayed from its starting stacks.';
  }
  // the clock keeps the time that was left in the level; a break keeps its end time (a restart does not make it longer)
  if(!t.paused && t.breakUntil && t.breakUntil > Date.now()) saveT({ levelEndsAt: t.breakUntil + levelMs(t) });
  else if(!t.paused) saveT({ levelEndsAt: Date.now() + Math.max(5000, live.levelLeft || 0) });
  go();
  return true;
}
// Stacks as of the start of each table's current hand: a consistent snapshot to restart from.
function saveLive(){
  const t = T(); if(!t) return;
  store.set('live', {
    levelLeft: t.paused ? t.pausedLeft : Math.max(0, t.levelEndsAt - Date.now()),
    tables: [...tables.values()].filter(x => !x.broken).map(x => ({ tid: x.tid, n: x.n, btn: x.g.btn, sb: x.g.sb, bb: x.g.bb, handNo: x.g.handNo,
      seats: x.g.seats.map(p => p && { uid: p.uid, stack: x.inHand && x.handStart[p.uid] != null ? x.handStart[p.uid] : p.stack }) }))
  });
}

function go(){
  running = true;
  clearInterval(clockTimer);
  clockTimer = setInterval(tick, 1000);
  hooks.onClub();
  for(const tb of tables.values()) loop(tb);
}
function stopAll(){
  running = false; clearInterval(clockTimer);
  waiters.forEach(w => w.resolve(null)); waiters.clear();
}
function tick(){
  const t = T();
  if(!running || !t || t.status !== 'running' || t.paused) return;
  if(t.breakUntil && Date.now() >= t.breakUntil){ saveT({ breakUntil: null }); hooks.onClub(); return; }
  if(Date.now() >= t.levelEndsAt){
    const level = t.level + 1;
    // after every 10th level: the break, then the next level's full time
    if(breaksOn() && level % BREAK_EVERY === 0){
      const until = t.levelEndsAt + breakMs(t);
      saveT({ level, breakUntil: until, breakNo: level / BREAK_EVERY, levelEndsAt: until + levelMs(t) });
      hooks.onClub();
    } else { saveT({ level, levelEndsAt: t.levelEndsAt + levelMs(t) }); hooks.onClub(); }
  }
}
function pause(){
  const t = T(); if(!t || t.status !== 'running' || t.paused) return;
  saveT({ paused: true, pausedLeft: Math.max(0, t.levelEndsAt - Date.now()), pausedBreakLeft: onBreak(t) ? t.breakUntil - Date.now() : 0 }); saveLive(); hooks.onClub();
}
function unpause(){
  const t = T(); if(!t || !t.paused) return;
  saveT({ paused: false, levelEndsAt: Date.now() + t.pausedLeft, breakUntil: t.pausedBreakLeft > 0 ? Date.now() + t.pausedBreakLeft : null, pausedBreakLeft: 0 }); hooks.onClub();
}
async function waitUnpaused(){ while(running && T() && T().paused) await sleep(300); }
// a table waits here between hands while the tournament is on a break (or paused)
async function waitBreak(){ while(running && T() && (T().paused || onBreak())) await sleep(250); }

// ---------- table loop ----------
function saveHand(uid, hand){
  // tilt, patience and calm: judged against this player's previous hands in the same tournament
  const prev = handsFor(uid).filter(x => x.tourney === hand.tourney && hand.ts - x.ts < 12 * 3600000).slice(0, 3);
  try{ hand.notes.push(...coach.mind(hand, prev)); }catch(e){ console.error('mind notes failed', e); }
  store.set(`hand:${uid}:${hand.id}`, hand);
  const t = T();
  if(!t || t.helper !== false) hooks.onCoach(uid, hand);
  try{ players.recordHand(uid, hand); }catch(e){ console.error('player stats failed', e); }
  const ks = store.keys(`hand:${uid}:`);
  if(ks.length > coach.KEEP) ks.map(k => [k, store.get(k).ts]).sort((a, b) => a[1] - b[1]).slice(0, ks.length - coach.KEEP).forEach(([k]) => store.del(k));
}
function handsFor(uid){ return store.values(`hand:${uid}:`).sort((a, b) => b.ts - a.ts); }
function tableIO(tb){
  if(!tb.record) tb.record = coach.recorder({
    tourneyInfo: () => { const t = T() || {}; return { left: seated().length, paid: payoutPcts(t.entrants || 0).length, name: t.name || '' }; },
    save: saveHand
  });
  return {
    rng: rand,
    async deck(handNo){ const t = T(); if(!t || !t.fairSeed) return null; const r = await fair.deckForHand(t, tb.tid, handNo); tb.fairRec = r.rec; return r.deck; },
    async event(type, data){
      try{ tb.record(type, tb.g, data); }catch(e){ console.error('hand record failed', e); }
      // commit the deal and each new street before anyone sees it (bounded wait: a slow db never stalls the table)
      if((type === 'deal' || type === 'board') && tb.fairRec && tb.g.hand && T()){
        try{ fair.saveDeal(T().id, tb.fairRec, tb.g.hand); }catch(e){ console.error('fair deal record failed', e); }
        await Promise.race([store.flush().catch(() => {}), sleep(1000)]);
      }
      if(!running) return;
      const h = tb.g.hand;
      if(type === 'showdown' && h && h.result) resultExtras(tb, h);
      publish(tb);
      // Pacing close to the big online rooms: quick between actions, a beat longer on an all-in run-out.
      const runout = h && h.players.filter(E.canAct).length < 2;
      const wait = { deal: 900, action: 250, collect: 300, board: runout ? 1100 : 650, showdown: h && h.result && h.result.showdown ? 4500 : 1800 }[type] || 0;
      if(type === 'showdown' && h && h.result && GP()) return resultWait(tb, h, wait);
      if(wait) await sleep(wait * SPEED);
    },
    async think(){},
    heroAction: (p, L) => ask(tb, p, L)
  };
}
// ---------- table extras, after the pot is pushed ----------
// The turn and river that were never dealt, drawn exactly as the table would have drawn them (burn, card), from this
// hand's committed deck. Only for a hand that ended on the flop or the turn; nothing is drawn from the deck that matters.
function rabbitCards(h){
  const n = h.board.length; if(n < 3 || n > 4) return null;
  const d = h.deck.slice(), out = [];
  for(let k = n; k < 5; k++){ d.pop(); out.push(d.pop()); }
  return out;
}
// Who may show after the hand: everyone dealt in whose cards are still face down (folded players, the winner of an
// uncontested pot). Hands already face up under the club's rules (showdown, all-in) have nothing left to show.
const canShow = p => p.cards.length === 2 && !(p.shown && !p.folded);
function resultExtras(tb, h){
  if(gpOn('rabbit') && !h.result.showdown){ const r = rabbitCards(h); if(r) h.rabbit = r; }
  if(gpOn('showMuck') && h.players.some(canShow)) tb.show = { hand: h.no, picks: {}, closed: new Set(), done: false, until: 0 };
}
// How long the result stays up. A set pause is the time from the pot being pushed to the next deal (the table always
// idles 1.2 s between hands); a showdown never gets less than today's 4.5 s so the hands can be read.
const resultMs = (x, showdown, offer, base) => {
  const ms = x ? (showdown ? Math.max(4500, x * 1000 - 1200) : Math.max(800, x * 1000 - 1200)) : base;
  return offer ? Math.max(ms, 2500) : ms; // players need a moment to decide
};
async function resultWait(tb, h, base){
  const s = tb.show && tb.show.hand === h.no ? tb.show : null, ms = resultMs(pauseSec(), h.result.showdown, !!s, base);
  if(!s){ if(ms) await sleep(ms * SPEED); return; }
  const end0 = Date.now() + ms * SPEED;
  // a show near the end of the window stays up long enough to be seen; not in hand-for-hand, where every table's
  // result wait follows the same fixed rule
  while(running && !tb.broken){ const left = Math.max(end0, hfh.on ? 0 : s.until) - Date.now(); if(left <= 0) break; await sleep(Math.min(left, 100)); }
  s.done = true;
}
// After the pot is awarded and before the next deal, a player shows one card, the other, or both, only their own and
// only by their own request. Shown cards stay shown; the winner of an uncontested pot may also muck (closes the offer).
function show(uid, msg){
  const tb = msg && tables.get(msg.tid), s = tb && tb.show, h = tb && tb.g.hand;
  if(!s || s.done || !tb.inHand || !h || !h.result || h.no !== msg.hand || s.hand !== h.no || s.closed.has(uid)) return false;
  const p = h.players.find(q => q.uid === uid);
  if(!p || !canShow(p)) return false;
  const pick = Array.isArray(msg.cards) ? msg.cards : null;
  const ok = pick && pick.length <= 2 && pick.every(i => i === 0 || i === 1) && new Set(pick).size === pick.length;
  if(!ok) return false;
  const had = s.picks[uid] || [], now = [...new Set(had.concat(pick))].sort();
  if(!pick.length || now.length === 2) s.closed.add(uid);
  if(now.length > had.length){ s.picks[uid] = now; s.until = Date.now() + 2000 * SPEED; }
  publish(tb);
  return true;
}
const shownByChoice = (tb, h, p) => { const s = tb.show, k = s && s.hand === h.no && h.result && s.picks[p.uid]; return k && k.length ? [0, 1].map(j => k.includes(j) ? E.cardStr(p.cards[j]) : null) : null; };

async function ask(tb, p, L){
  await waitUnpaused();
  if(!running) return { t: 'fold' };
  if(p.away){ await sleep(400 * SPEED); return { t: 'fold', dead: true }; } // TDA 32 / WSOP 82: an absent player's hand is dead
  tb.seq++;
  const h = tb.g.hand;
  const ms = p.away ? AWAY_BANK : actMs();
  tb.acting = { seat: p.seat, uid: p.uid, seq: tb.seq, deadline: Date.now() + ms, ms, usingBank: false, dc: false,
    legal: { ...L, pot: E.potTotal(h), cur: h.currentBet, bb: h.bbAmt } };
  dcCheck(tb, h, false); // a decision that starts while they are offline gets the protection from the start
  publish(tb);
  const a = await new Promise(resolve => {
    const w = { tid: tb.tid, hand: h.no, seq: tb.seq, resolve: null };
    const timer = setInterval(() => {
      if(T() && T().paused){ tb.acting.deadline += 250; return; }
      dcCheck(tb, h, true);
      if(Date.now() > tb.acting.deadline) done(null, true);
    }, 250);
    const done = (v, timedOut) => { clearInterval(timer); if(waiters.get(p.uid) === w) waiters.delete(p.uid); if(timedOut){ p.away = true; } resolve(v); };
    w.resolve = v => done(v, false);
    waiters.set(p.uid, w);
  });
  tb.acting = null;
  if(!a) return L.canCheck ? { t: 'check' } : { t: 'fold' };
  p.away = false;
  return a;
}
// Gives the acting player their disconnect protection when they are offline and have not had it this hand; clears the
// table's "disconnected" mark when they come back (the time they were given stays on the clock).
function dcCheck(tb, h, pub){
  const a = tb.acting; if(!a) return;
  const off = !hooks.isConnected(a.uid);
  if(off && !a.dc){
    if(!tb.dcUsed || tb.dcUsed.hand !== h.no) tb.dcUsed = { hand: h.no, uids: new Set() };
    if(tb.dcUsed.uids.has(a.uid)) return;
    tb.dcUsed.uids.add(a.uid); a.dc = true; a.deadline = Math.max(a.deadline, Date.now()) + DC_MS; a.ms = a.deadline - Date.now();
    if(pub) publish(tb);
  } else if(!off && a.dc){ a.dc = false; if(pub) publish(tb); }
}
// a socket of this player just closed: if it is their turn and they have no other connection, protect them at once
function offline(uid){ const w = waiters.get(uid), tb = w && tables.get(w.tid); if(tb && tb.acting && tb.acting.uid === uid && tb.g.hand) dcCheck(tb, tb.g.hand, true); }
function act(uid, msg){
  const w = waiters.get(uid);
  if(!w || msg.tid !== w.tid || msg.hand !== w.hand || msg.seq !== w.seq) return false;
  const a = msg.a || {};
  if(!['fold', 'check', 'call', 'raise'].includes(a.t)) return false;
  w.resolve({ t: a.t, to: Number(a.to) || 0 });
  return true;
}
// the acting player spends one of their extra-time cards: 30 more seconds on this decision
function extend(uid){
  const w = waiters.get(uid), tb = w && tables.get(w.tid);
  if(!tb || !tb.acting || tb.acting.uid !== uid) return false;
  const left = extrasLeft(uid); if(left < 1) return false;
  const k = extrasKey(); saveT({ [k]: { ...(T()[k] || {}), [uid]: left - 1 } });
  const a = tb.acting; a.deadline = Math.max(a.deadline, Date.now()) + EXTRA_MS; a.ms = a.deadline - Date.now(); a.usingBank = true;
  publish(tb);
  return true;
}
function back(uid){
  for(const tb of tables.values()){ const p = tb.g.seats.find(x => x && x.uid === uid); if(p && p.away){ p.away = false; publish(tb); } }
}

// ---------- hand-for-hand (WSOP 126, TDA RP-8) ----------
// When one elimination from the money with 2+ tables, every table plays one hand and waits for the others.
// Players busted in the same hand-for-hand round at different tables tie and share those places.
const hfh = { on: false, round: 0, done: new Set() };
function hfhNeeded(){ const t = T(); return !!t && t.status === 'running' && active().length > 1 && seated().length === payoutPcts(t.entrants).length + 1; }
function hfhCheck(){
  if(!hfh.on) return;
  const playing = active().filter(x => count(x) >= 2);
  if(!playing.every(x => hfh.done.has(x.tid))) return;
  const t = T(), places = [...(t.places || [])], mine = places.filter(r => r.hfh === hfh.round);
  if(new Set(mine.map(r => r.tid)).size > 1) mine.forEach(r => r.tie = 'h' + t.id + '-' + hfh.round);
  saveT({ places });
  hfh.round++; hfh.done.clear();
  if(!hfhNeeded()){ hfh.on = false; active().forEach(x => { x.note = ''; publish(x); }); }
}
async function loop(tb){
  const g = tb.g;
  while(running && !tb.broken && T() && T().status === 'running'){
    await waitBreak();
    if(!running || tb.broken) return;
    if(hfhNeeded() && !hfh.on){ hfh.on = true; hfh.round = 1; hfh.done.clear(); }
    if(hfh.on){
      if(!hfhNeeded()){ hfh.on = false; }
      else {
        tb.note = 'Hand-for-hand: one elimination from the money. Each table plays one hand at a time.';
        while(running && !tb.broken && hfh.on && hfh.done.has(tb.tid)) await sleep(150);
        if(!running || tb.broken) return;
      }
    }
    const live = g.seats.filter(p => p && p.stack > 0);
    if(live.length < 2){ if(hfh.on){ hfh.done.add(tb.tid); hfhCheck(); } publish(tb); await sleep(1000 * Math.max(SPEED, .2)); continue; }
    g.level = T().level; g.levelMsLeft = 1; g.anteMode = T().anteMode;
    tb.handStart = Object.fromEntries(live.map(p => [p.uid, p.stack]));
    tb.inHand = true; tb.show = null;
    let out;
    try{ out = await E.playHand(g, tableIO(tb)); }
    catch(e){ console.error('hand failed', tb.tid, e); tb.inHand = false; await sleep(1000); continue; }
    if(tb.fairRec && g.hand && T()){ try{ fair.saveHand(T().id, tb.fairRec, g.hand); }catch(e){ console.error('fair record failed', e); } tb.fairRec = null; }
    tb.inHand = false; if(!hfh.on) tb.note = '';
    if(!running) return;
    const inRound = hfh.on;
    afterHand(tb, out || []);
    if(inRound && hfh.on){ hfh.done.add(tb.tid); hfhCheck(); }
    if(!T() || T().status !== 'running') return;
    await sleep(1200 * SPEED);
  }
}
const active = () => [...tables.values()].filter(x => !x.broken);
const seated = () => active().flatMap(x => x.g.seats.filter(Boolean));
const count = tb => tb.g.seats.filter(Boolean).length;

function afterHand(tb, out){
  const t = T();
  const remainingAfter = seated().length;
  const places = [...(t.places || [])];
  const base = remainingAfter + out.length;
  out.forEach((p, k) => {
    const eqPrev = k > 0 && out[k - 1].eff === p.eff, eqNext = k < out.length - 1 && out[k + 1].eff === p.eff;
    const tie = eqPrev || eqNext ? `s${tb.tid}-${p.hand}-${p.eff}` : null;
    places.push({ uid: p.uid, place: base - k, tie, hfh: hfh.on ? hfh.round : null, tid: tb.tid });
  });
  saveT({ places, remaining: remainingAfter });
  if(remainingAfter <= 1){
    const w = seated()[0];
    if(w) places.push({ uid: w.uid, place: 1 });
    saveT({ places });
    publish(tb);
    return finish();
  }
  balance(tb);
  publish(tb);
  saveLive();
  hooks.onClub();
}
function seatInto(dest, p, mode){
  const g = dest.g, free = allowedSeats().filter(i => !g.seats[i]);
  // TDA 9 / WSOP 14: never seat a player between the small blind and the button (they'd skip the blinds)
  const inGap = s => { if(g.btn < 0 || g.sb < 0 || g.sb === g.btn) return false; for(let k = 1; k < 9; k++){ const j = (g.btn + k) % 9; if(j === g.sb) return false; if(j === s) return true; } return false; };
  let cands = free.filter(s => !inGap(s)); if(!cands.length) cands = free;
  // TDA 12-A / WSOP 67: a player moved to balance tables takes the worst position, the seat that posts the big blind soonest
  const s = mode === 'balance' && g.bb >= 0 ? cands.slice().sort((a, b) => ((a - g.bb + 9) % 9) - ((b - g.bb + 9) % 9))[0] : cands[crypto.randomInt(cands.length)];
  Object.assign(p, { seat: s, cards: [], bet: 0, total: 0, folded: false, allIn: false, act: '' });
  dest.g.seats[s] = p;
  publish(dest);
}
function closeTable(tid){
  const tb = tables.get(tid); if(!tb) return;
  tb.broken = true; tables.delete(tid); hooks.onTableClosed(tid);
}
function breakTable(x){
  x.broken = true;
  const movers = x.g.seats.filter(Boolean);
  x.g.seats = Array(9).fill(null);
  for(const p of movers){
    const open = active().filter(t => count(t) < size() && !t.toBreak), low = Math.min(...open.map(count));
    // fewest players first; among those (and the next size up), avoid tables with a linked player
    let dest = open.filter(t => count(t) <= low + 1).sort((a, b) => (linkedAt(a, p.uid) > 0) - (linkedAt(b, p.uid) > 0) || count(a) - count(b))[0];
    // never drop a player: fall back to any table with a free seat, or open a new one
    if(!dest) dest = active().filter(t => t !== x && count(t) < size()).sort((a, b) => count(a) - count(b))[0];
    if(!dest){ const n = Math.max(0, ...[...tables.values()].map(t => t.n)) + 1; dest = newTable(T().id + '-' + n, n); if(running) loop(dest); console.error('breakTable: no room, opened table', n); }
    seatInto(dest, p);
  }
  closeTable(x.tid);
}
// TDA-style balancing: break the shortest table when the field fits in fewer
// tables, otherwise move players so no table has 2+ more than another.
function balance(tb){
  let act = active();
  if(act.length <= 1) return;
  if(tb.toBreak){ breakTable(tb); return; }
  const need = Math.ceil(seated().length / size());
  // only one table is set to break at a time; a second one could leave the movers with nowhere to sit
  if(act.filter(x => !x.toBreak).length > need && !act.some(x => x.toBreak && x !== tb)){
    const smallest = act.slice().sort((a, b) => count(a) - count(b) || (a === tb ? -1 : 1))[0];
    if(smallest === tb || !smallest.inHand) breakTable(smallest); else smallest.toBreak = true;
    if(smallest === tb) return;
  }
  const others = active().filter(x => x !== tb && !x.toBreak);
  if(!others.length) return;
  const shortest = others.sort((a, b) => count(a) - count(b))[0];
  while(count(tb) - count(shortest) >= 2){
    // TDA: move the player who will be big blind next; skip anyone linked to a player at the destination
    let s = E.nextLive(tb.g, tb.g.bb);
    for(let k = 0, c = s; k < 9; k++, c = E.nextLive(tb.g, c)){ const q = tb.g.seats[c]; if(q && !linkedAt(shortest, q.uid)){ s = c; break; } }
    const p = tb.g.seats[s];
    if(!p) break;
    tb.g.seats[s] = null; seatInto(shortest, p, 'balance');
  }
}
// Late registration: a new player gets a starting stack and a seat at the emptiest table, or a new table when all are full.
function lateJoin(uid){
  const t = T();
  if(!lateOpen()) throw new Error('Late registration is closed for this tournament.');
  if((t.regs || []).includes(uid) || (t.places || []).some(r => r.uid === uid)) throw new Error("You're already in this tournament.");
  const us = store.get('user:' + uid); if(!us || us.removed) throw new Error('Unknown player.');
  const p = mkPlayer(uid, t.stack);
  const open = active().filter(x => count(x) < size() && !x.toBreak);
  let dest = open.sort((a, b) => (linkedAt(a, uid) > 0) - (linkedAt(b, uid) > 0) || count(a) - count(b))[0];
  let fresh = false;
  if(!dest){ const n = Math.max(0, ...[...tables.values()].map(x => x.n)) + 1; dest = newTable(t.id + '-' + n, n); fresh = true; }
  // everyone already knocked out now finishes one place lower
  saveT({ regs: [...t.regs, uid], entrants: t.entrants + 1, remaining: (t.remaining || 0) + 1, places: (t.places || []).map(r => ({ ...r, place: r.place + 1 })) });
  seatInto(dest, p, 'late');
  if(fresh && running) loop(dest);
  saveLive();
  hooks.onClub();
}
function finish(){
  stopAll();
  const t = T();
  const places = (t.places || []).slice().sort((a, b) => a.place - b.place);
  const n = t.entrants;
  // tied players (same-hand busts at different tables during hand-for-hand, or equal stacks) share the places they occupy
  const groups = new Map(); places.forEach(r => { if(r.tie){ if(!groups.has(r.tie)) groups.set(r.tie, []); groups.get(r.tie).push(r); } });
  const results = places.map(r => {
    const grp = r.tie && groups.get(r.tie).length > 1 ? groups.get(r.tie) : null;
    if(!grp) return { uid: r.uid, name: userName(r.uid), place: r.place, pts: pointsFor(n, r.place) };
    const ps = grp.map(x => x.place), pts = Math.round(ps.reduce((a, pl) => a + pointsFor(n, pl), 0) / ps.length);
    return { uid: r.uid, name: userName(r.uid), place: Math.min(...ps), pts, tie: ps.length };
  });
  store.set('history:' + t.id, { id: t.id, name: t.name, startedAt: t.startedAt, endedAt: Date.now(), entrants: n, results, payouts: payoutPcts(n), fairSeal: t.fairSeal, fairSeed: t.fairSeed });
  saveT({ status: 'finished', endedAt: Date.now() });
  store.del('live');
  for(const tid of [...tables.keys()]) closeTable(tid);
  scheduleNext(t);
  hooks.onClub();
}
function scheduleNext(t){
  if(!t.repeat || t.repeat === 'none' || !t.startAt) return;
  const step = t.repeat === 'daily' ? 864e5 : 7 * 864e5;
  let next = t.startAt + step; while(next < Date.now()) next += step;
  setTimeout(() => {
    const cur = T(); if(cur && (cur.status === 'running' || cur.status === 'registering')) return;
    create({ name: t.name, stack: t.stack, levelMin: t.levelMin, startAt: next, repeat: t.repeat, anteMode: t.anteMode, actSec: t.actSec, tableSize: t.tableSize, lateLevels: t.lateLevels, helper: t.helper, showMuck: t.showMuck === true, rabbit: t.rabbit === true, handPause: t.handPause || 0,
      breakMin: t.breakMin, sponsor: t.sponsor, sponsorSec: t.sponsorSec });
  }, FAST ? 50 : 15000);
}
// Starts a scheduled tournament on time.
setInterval(() => {
  const t = T();
  if(!t || t.status !== 'registering' || !t.startAt) return;
  if(hooks.halted()) return; // suspended: no reminder, no start, nothing cancelled; it waits as it is
  // a reminder 15 minutes before a scheduled start
  if(!t.reminded && t.startAt - Date.now() <= 15 * 60000 && t.startAt - Date.now() > 60000){ saveT({ reminded: true }); hooks.onNotice('soon', T()); }
  if(Date.now() < t.startAt) return;
  if(t.regs.length >= 2){ try{ start(); }catch(e){ console.error(e); } }
  else { saveT({ status: 'cancelled', endedAt: Date.now(), note: 'Not enough players joined.' }); scheduleNext(t); hooks.onClub(); }
}, 5000);

// ---------- public views ----------
function snapshot(tb){
  const g = tb.g, h = g.hand, live = !!(tb.inHand && h), res = live && h.result;
  const winSeat = res && res.showdown && res.pots.length ? res.pots[0].winners[0] : -1;
  const winP = winSeat >= 0 ? g.seats[winSeat] : null;
  const t = T() || {};
  return {
    tid: tb.tid, n: tb.n, phase: live ? 'hand' : 'idle', handNo: live ? h.no : g.handNo, street: live ? h.street : 0,
    seats: g.seats.map(p => {
      if(!p) return null;
      const inHand = live && h.players.includes(p);
      return { uid: p.uid, name: p.name, stack: p.stack, inHand, bet: inHand ? p.bet : 0, folded: inHand && p.folded, allIn: inHand && p.allIn,
        act: inHand ? p.act : '', lastAmt: inHand ? (p.lastAmt || 0) : 0, won: inHand && res ? (p.won || 0) : 0,
        shown: inHand && p.shown && !p.folded ? p.cards.map(E.cardStr) : inHand && res && tb.show ? shownByChoice(tb, h, p) : null, cat: inHand && res && res.showdown && !p.folded && p.shown ? E.CAT[E.category(p.val)] : '', away: !!p.away };
    }),
    size: size(), allowed: allowedSeats(), cur: live ? h.currentBet : 0, board: live ? h.board.map(E.cardStr) : [], pot: live ? E.potTotal(h) - h.players.reduce((s, p) => s + p.bet, 0) : 0,
    btn: g.btn, blinds: E.levelFor(t.level || 0, t.anteMode),
    acting: live && tb.acting ? tb.acting.seat : -1, actUid: live && tb.acting ? tb.acting.uid : null, seq: tb.acting ? tb.acting.seq : tb.seq,
    deadline: tb.acting ? tb.acting.deadline : 0, bank: tb.acting ? tb.acting.ms : actMs(), usingBank: !!(tb.acting && tb.acting.usingBank), extras: tb.acting ? extrasLeft(tb.acting.uid) : 0, legal: tb.acting ? tb.acting.legal : null,
    result: res ? { lines: resultLines(g, h), winCards: winP && winP.best ? winP.best.map(E.cardStr) : [], showdown: !!res.showdown } : null,
    note: tb.note || '',
    ...(tb.acting && tb.acting.dc ? { dcProtect: true } : {}), // the player to act is offline, on protection time
    ...(res && h.rabbit ? { rabbit: h.rabbit.map(E.cardStr) } : {}),
    ...(res && tb.show && tb.show.hand === h.no ? { showOffer: { done: !!tb.show.done, can: tb.show.done ? [] : h.players.filter(p => canShow(p) && !tb.show.closed.has(p.uid)).map(p => p.uid) } } : {})
  };
}
function cardsFor(tid, uid){
  const tb = tables.get(tid); if(!tb || !tb.inHand || !tb.g.hand) return null;
  const p = tb.g.hand.players.find(q => q.uid === uid);
  return p ? { hand: tb.g.hand.no, cards: p.cards.map(E.cardStr) } : null;
}
function resultLines(g, h){
  const res = h.result, name = s => g.seats[s] ? g.seats[s].name : '';
  if(!res.showdown){ const w = res.pots[0].winners[0]; return [`${name(w)} wins ${fmt(res.pots[0].amt)}`]; }
  const contested = res.pots.filter(q => q.elig.length > 1);
  const ret = res.pots.filter(q => q.elig.length === 1).map(q => `${fmt(q.amt)} uncalled, returned to ${name(q.winners[0])}`);
  if(contested.length > 1 && contested.every(q => q.winners.join() === contested[0].winners.join())){
    const ws = contested[0].winners.map(name), amt = contested.reduce((a, q) => a + q.amt, 0);
    return [`${ws.join(' & ')} ${ws.length > 1 ? 'split' : 'wins'} ${fmt(amt)} · ${E.describe(g.seats[contested[0].winners[0]].val)}`, ...ret];
  }
  return contested.map((p, i) => {
    const ws = p.winners.map(name), label = contested.length > 1 ? (i === 0 ? 'Main pot: ' : `Side pot ${i}: `) : '';
    return `${label}${ws.join(' & ')} ${ws.length > 1 ? 'split' : 'wins'} ${fmt(p.amt)} · ${E.describe(g.seats[p.winners[0]].val)}`;
  }).concat(ret);
}
const publish = tb => { if(!tb.broken) hooks.onTable(tb.tid); };
function tableOf(uid){ for(const tb of active()) if(tb.g.seats.some(p => p && p.uid === uid)) return tb.tid; return null; }
function tablesSummary(){ return active().map(tb => ({ tid: tb.tid, n: tb.n, players: count(tb) })).sort((a, b) => a.n - b.n); }
function stacks(){ return seated().map(p => ({ uid: p.uid, stack: p.stack + (p.total && tables.get(tableOf(p.uid))?.inHand ? 0 : 0) })); }

// chip conservation check, used by tests
function totalChips(){
  let sum = 0;
  for(const tb of active()){
    const h = tb.g.hand, inH = tb.inHand && h;
    tb.g.seats.forEach(p => { if(!p) return; sum += inH && h.players.includes(p) ? p.start : p.stack; });
    if(inH) h.players.forEach(p => { if(!tb.g.seats.includes(p)) sum += p.start; });
  }
  return sum;
}

module.exports = { setHooks: h => { hooks = { ...hooks, ...h }; }, T, lateOpen, create, edit, join, leave, cancel, start, resume, pause, unpause, act, extend, back, offline,
  snapshot, cardsFor, show, gp: GP, onBreak, breaksOn, BREAK_EVERY, _extras: { resultMs, rabbitCards, resultExtras }, tableOf, handsFor, setLinker, hfhState: () => ({ on: hfh.on, round: hfh.round }), tablesSummary, stacks, tables, payoutPcts, totalChips, isRunning: () => running, stopAll, TIME_BANK, DC_MS };
