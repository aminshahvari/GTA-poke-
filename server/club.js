// The tournament director. Runs every table on the server, keeps the clock,
// balances and breaks tables, and records results. Hole cards never leave the
// server except to the player who holds them.
const E = require('./engine');
const store = require('./store');

const FAST = process.env.FAST === '1';
const SPEED = FAST ? 0.02 : 1;
const TIME_BANK = +(process.env.TIME_BANK_MS || (FAST ? 3000 : 30000));
const AWAY_BANK = FAST ? 300 : 2500;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmt = n => Math.round(n).toLocaleString('en-US');

let hooks = { onClub(){}, onTable(){}, onTableClosed(){} };
const tables = new Map();   // tid -> live table
const waiters = new Map();  // uid -> pending decision
let running = false, clockTimer = null;

const T = () => store.get('tourney') || null;
function saveT(patch){ return store.set('tourney', { ...(T() || {}), ...patch }); }
const userName = uid => (store.get('user:' + uid) || {}).name || 'Player';

function payoutPcts(n){
  if(n <= 3) return [100];
  if(n <= 6) return [65, 35];
  if(n <= 10) return [50, 30, 20];
  if(n <= 20) return [40, 25, 15, 12, 8];
  if(n <= 40) return [30, 20, 14, 10, 8, 6, 5, 4, 3];
  const paid = Math.round(n * 0.15), w = Array.from({ length: paid }, (_, i) => 1 / Math.pow(i + 1, 0.9)), s = w.reduce((a, b) => a + b, 0);
  return w.map(x => Math.round(x / s * 1000) / 10);
}
const pointsFor = (n, place) => n - place + 1 + (place === 1 ? 3 : 0);

// ---------- registration ----------
function create({ name, stack, levelMin, startAt, repeat }){
  const t = T();
  if(t && (t.status === 'running')) throw new Error('A tournament is already running.');
  stack = [10000, 20000, 30000, 50000, 100000].includes(+stack) ? +stack : 30000;
  levelMin = Math.max(1, Math.min(60, Math.round(+levelMin || 20)));
  store.set('tourney', { id: 't' + Date.now(), status: 'registering', name: String(name || 'Club Tournament').slice(0, 60), stack, levelMin,
    startAt: startAt ? +startAt : null, repeat: ['daily', 'weekly'].includes(repeat) ? repeat : 'none', regs: [], createdAt: Date.now() });
  hooks.onClub();
}
function join(uid){
  const t = T(); if(!t || t.status !== 'registering') throw new Error('Registration is closed.');
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
function newTable(tid, n){
  const g = E.newGame({ players: [] }); g.seats = Array(9).fill(null); g.multi = true;
  const t = { tid, n, g, seq: 0, broken: false, inHand: false, acting: null, handStart: {}, note: '' };
  tables.set(tid, t); return t;
}
function start(){
  const t = T();
  if(!t || t.status !== 'registering') throw new Error('No tournament is open.');
  const regs = t.regs.filter(u => { const us = store.get('user:' + u); return us && !us.removed; });
  if(regs.length < 2) throw new Error('At least 2 players need to join.');
  for(let i = regs.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [regs[i], regs[j]] = [regs[j], regs[i]]; }
  const nT = Math.ceil(regs.length / 9), groups = Array.from({ length: nT }, () => []);
  regs.forEach((u, i) => groups[i % nT].push(u));
  tables.clear();
  groups.forEach((grp, i) => {
    const tb = newTable(t.id + '-' + (i + 1), i + 1);
    spread(grp.length).forEach((s, k) => { const p = mkPlayer(grp[k], t.stack); p.seat = s; tb.g.seats[s] = p; });
  });
  saveT({ status: 'running', startedAt: Date.now(), level: 0, levelEndsAt: Date.now() + t.levelMin * 60000, paused: false, pausedLeft: 0,
    entrants: regs.length, remaining: regs.length, places: [], regs });
  saveLive();
  go();
}
function resume(){
  const t = T(), live = store.get('live');
  if(!t || t.status !== 'running' || !live) return false;
  tables.clear();
  for(const lt of live.tables){
    const tb = newTable(lt.tid, lt.n);
    lt.seats.forEach((s, i) => { if(s && s.stack > 0){ const p = mkPlayer(s.uid, s.stack); p.seat = i; tb.g.seats[i] = p; } });
    Object.assign(tb.g, { btn: lt.btn, sb: lt.sb, bb: lt.bb, handNo: lt.handNo || 0 });
    tb.note = 'The server restarted. Any hand in progress was replayed from its starting stacks.';
  }
  // the clock keeps the time that was left in the level
  if(!t.paused) saveT({ levelEndsAt: Date.now() + Math.max(5000, live.levelLeft || 0) });
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
  if(Date.now() >= t.levelEndsAt){ saveT({ level: t.level + 1, levelEndsAt: t.levelEndsAt + t.levelMin * 60000 }); hooks.onClub(); }
}
function pause(){ const t = T(); if(!t || t.status !== 'running' || t.paused) return; saveT({ paused: true, pausedLeft: Math.max(0, t.levelEndsAt - Date.now()) }); saveLive(); hooks.onClub(); }
function unpause(){ const t = T(); if(!t || !t.paused) return; saveT({ paused: false, levelEndsAt: Date.now() + t.pausedLeft }); hooks.onClub(); }
async function waitUnpaused(){ while(running && T() && T().paused) await sleep(300); }

// ---------- table loop ----------
function tableIO(tb){
  return {
    rng: Math.random,
    async event(type){
      if(!running) return;
      publish(tb);
      const h = tb.g.hand;
      const wait = { deal: 1300, action: 350, collect: 450, board: 1000, showdown: h && h.result && h.result.showdown ? 4500 : 1700 }[type] || 0;
      if(wait) await sleep(wait * SPEED);
    },
    async think(){},
    heroAction: (p, L) => ask(tb, p, L)
  };
}
async function ask(tb, p, L){
  await waitUnpaused();
  if(!running) return { t: 'fold' };
  tb.seq++;
  const h = tb.g.hand;
  tb.acting = { seat: p.seat, uid: p.uid, seq: tb.seq, deadline: Date.now() + (p.away ? AWAY_BANK : TIME_BANK),
    legal: { ...L, pot: E.potTotal(h), cur: h.currentBet, bb: h.bbAmt } };
  publish(tb);
  const a = await new Promise(resolve => {
    const w = { tid: tb.tid, hand: h.no, seq: tb.seq, resolve: null };
    const timer = setInterval(() => {
      if(T() && T().paused){ tb.acting.deadline += 250; return; }
      if(Date.now() > tb.acting.deadline){ done(null, true); }
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
function act(uid, msg){
  const w = waiters.get(uid);
  if(!w || msg.tid !== w.tid || msg.hand !== w.hand || msg.seq !== w.seq) return false;
  const a = msg.a || {};
  if(!['fold', 'check', 'call', 'raise'].includes(a.t)) return false;
  w.resolve({ t: a.t, to: Number(a.to) || 0 });
  return true;
}
function back(uid){
  for(const tb of tables.values()){ const p = tb.g.seats.find(x => x && x.uid === uid); if(p && p.away){ p.away = false; publish(tb); } }
}

async function loop(tb){
  const g = tb.g;
  while(running && !tb.broken && T() && T().status === 'running'){
    await waitUnpaused();
    if(!running || tb.broken) return;
    const live = g.seats.filter(p => p && p.stack > 0);
    if(live.length < 2){ publish(tb); await sleep(1000 * Math.max(SPEED, .2)); continue; }
    g.level = T().level; g.levelMsLeft = 1;
    tb.handStart = Object.fromEntries(live.map(p => [p.uid, p.stack]));
    tb.inHand = true;
    let out;
    try{ out = await E.playHand(g, tableIO(tb)); }
    catch(e){ console.error('hand failed', tb.tid, e); tb.inHand = false; await sleep(1000); continue; }
    tb.inHand = false; tb.note = '';
    if(!running) return;
    afterHand(tb, out || []);
    if(!T() || T().status !== 'running') return;
    await sleep(2300 * SPEED);
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
  out.forEach((p, k) => places.push({ uid: p.uid, place: base - k }));
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
function seatInto(dest, p){
  const free = dest.g.seats.map((x, i) => x ? -1 : i).filter(i => i >= 0);
  const s = free[Math.floor(Math.random() * free.length)];
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
    const dest = active().filter(t => count(t) < 9).sort((a, b) => count(a) - count(b))[0];
    if(dest) seatInto(dest, p);
  }
  closeTable(x.tid);
}
// TDA-style balancing: break the shortest table when the field fits in fewer
// tables, otherwise move players so no table has 2+ more than another.
function balance(tb){
  let act = active();
  if(act.length <= 1) return;
  if(tb.toBreak){ breakTable(tb); return; }
  const need = Math.ceil(seated().length / 9);
  if(act.length > need){
    const smallest = act.slice().sort((a, b) => count(a) - count(b) || (a === tb ? -1 : 1))[0];
    if(smallest === tb || !smallest.inHand) breakTable(smallest); else smallest.toBreak = true;
    if(smallest === tb) return;
  }
  const others = active().filter(x => x !== tb && !x.toBreak);
  if(!others.length) return;
  const shortest = others.sort((a, b) => count(a) - count(b))[0];
  while(count(tb) - count(shortest) >= 2){
    const s = E.nextLive(tb.g, tb.g.bb), p = tb.g.seats[s];
    if(!p) break;
    tb.g.seats[s] = null; seatInto(shortest, p);
  }
}
function finish(){
  stopAll();
  const t = T();
  const places = (t.places || []).slice().sort((a, b) => a.place - b.place);
  const n = t.entrants;
  const results = places.map(r => ({ uid: r.uid, name: userName(r.uid), place: r.place, pts: pointsFor(n, r.place) }));
  store.set('history:' + t.id, { id: t.id, name: t.name, startedAt: t.startedAt, endedAt: Date.now(), entrants: n, results, payouts: payoutPcts(n) });
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
    create({ name: t.name, stack: t.stack, levelMin: t.levelMin, startAt: next, repeat: t.repeat });
  }, FAST ? 50 : 15000);
}
// Starts a scheduled tournament on time.
setInterval(() => {
  const t = T();
  if(!t || t.status !== 'registering' || !t.startAt || Date.now() < t.startAt) return;
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
        shown: inHand && p.shown && !p.folded ? p.cards.map(E.cardStr) : null, cat: inHand && res && res.showdown && !p.folded ? E.CAT[E.category(p.val)] : '', away: !!p.away };
    }),
    board: live ? h.board.map(E.cardStr) : [], pot: live ? E.potTotal(h) - h.players.reduce((s, p) => s + p.bet, 0) : 0,
    btn: g.btn, blinds: E.levelAt(t.level || 0),
    acting: live && tb.acting ? tb.acting.seat : -1, actUid: live && tb.acting ? tb.acting.uid : null, seq: tb.acting ? tb.acting.seq : tb.seq,
    deadline: tb.acting ? tb.acting.deadline : 0, bank: TIME_BANK, legal: tb.acting ? tb.acting.legal : null,
    result: res ? { lines: resultLines(g, h), winCards: winP && winP.best ? winP.best.map(E.cardStr) : [], showdown: !!res.showdown } : null,
    note: tb.note || ''
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

module.exports = { setHooks: h => { hooks = { ...hooks, ...h }; }, T, create, join, leave, cancel, start, resume, pause, unpause, act, back,
  snapshot, cardsFor, tableOf, tablesSummary, stacks, tables, payoutPcts, totalChips, isRunning: () => running, TIME_BANK };
